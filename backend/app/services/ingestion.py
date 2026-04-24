"""
Ingestion service — persists normalized price data from all active sources to TimescaleDB.
All functions are idempotent: duplicate rows are skipped via ON CONFLICT DO NOTHING.

Active sources: SerpApi (GooglePrice + FlightOffer), Duffel (DuffelPrice), Seats.aero (AwardPrice)
Dead sources (do not add): Amadeus, Kiwi
"""
import uuid
import structlog
import json
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.models.prices import GooglePrice, FlightOffer, DuffelPrice, AwardPrice

logger = structlog.get_logger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Cabin-quality enrichment (in-memory lookup from data/cabin_quality.json)
_CABIN_QUALITY_DATA: list[dict] | None = None


def _load_cabin_quality() -> list[dict]:
    global _CABIN_QUALITY_DATA
    if _CABIN_QUALITY_DATA is not None:
        return _CABIN_QUALITY_DATA
    p = Path(__file__).resolve().parents[1] / "data" / "cabin_quality.json"
    try:
        with open(p, "r", encoding="utf-8") as fh:
            _CABIN_QUALITY_DATA = json.load(fh)
    except Exception as exc:  # pragma: no cover - best-effort enrichment
        logger.warning("cabin_quality_load_failed", path=str(p), error=str(exc))
        _CABIN_QUALITY_DATA = []
    return _CABIN_QUALITY_DATA


def _parse_aircraft_iata(aircraft_name: str | None) -> str | None:
    if not aircraft_name:
        return None
    s = aircraft_name.lower()
    # Prefer explicit Axxx/Bxxx tokens
    m = re.search(r"\b([AaBb]\d{3})\b", aircraft_name)
    if m:
        return m.group(1).upper()
    # Common patterns: 'Airbus A350' or 'Boeing 787'
    if "airbus" in s:
        m = re.search(r"(\d{3})", s)
        if m:
            return f"A{m.group(1)}"
    if "boeing" in s:
        m = re.search(r"(\d{3})", s)
        if m:
            return f"B{m.group(1)}"
    # Last resort: find any 3-digit model and guess family
    m = re.search(r"(\d{3})", s)
    if m:
        num = m.group(1)
        if num.startswith("7"):
            return f"B{num}"
        return f"A{num}"
    return None


def _enrich_cabin(primary_airline: str | None, aircraft_name: str | None) -> dict:
    data = _load_cabin_quality()
    if not data:
        return {}
    aircraft_iata = _parse_aircraft_iata(aircraft_name)
    code = (primary_airline or "").upper() if primary_airline else None

    # 1) Exact match airline + aircraft
    if code and aircraft_iata:
        for entry in data:
            if entry.get("airline_code") == code and entry.get("aircraft_type") == aircraft_iata:
                return {
                    "aircraft_iata": aircraft_iata,
                    "cabin_quality_score": entry.get("quality_score"),
                    "cabin_product_name": entry.get("product_name"),
                    "cabin_seat_type": entry.get("seat_type"),
                    "cabin_has_door": entry.get("has_door"),
                    "cabin_lie_flat": entry.get("lie_flat"),
                }

    # 2) Best match by airline
    if code:
        best = None
        for entry in data:
            if entry.get("airline_code") == code:
                if best is None or (entry.get("quality_score", 0) > best.get("quality_score", 0)):
                    best = entry
        if best:
            return {
                "aircraft_iata": aircraft_iata,
                "cabin_quality_score": best.get("quality_score"),
                "cabin_product_name": best.get("product_name"),
                "cabin_seat_type": best.get("seat_type"),
                "cabin_has_door": best.get("has_door"),
                "cabin_lie_flat": best.get("lie_flat"),
            }

    # 3) Match by aircraft type across all airlines
    if aircraft_iata:
        for entry in data:
            if entry.get("aircraft_type") == aircraft_iata:
                return {
                    "aircraft_iata": aircraft_iata,
                    "cabin_quality_score": entry.get("quality_score"),
                    "cabin_product_name": entry.get("product_name"),
                    "cabin_seat_type": entry.get("seat_type"),
                    "cabin_has_door": entry.get("has_door"),
                    "cabin_lie_flat": entry.get("lie_flat"),
                }

    # 4) Fallback to the highest-scoring known product
    best = max(data, key=lambda e: e.get("quality_score", 0)) if data else None
    if best:
        return {
            "aircraft_iata": aircraft_iata,
            "cabin_quality_score": best.get("quality_score"),
            "cabin_product_name": best.get("product_name"),
            "cabin_seat_type": best.get("seat_type"),
            "cabin_has_door": best.get("has_door"),
            "cabin_lie_flat": best.get("lie_flat"),
        }
    return {}


async def store_google_price(
    route_id: uuid.UUID,
    record: dict[str, Any],
    db: AsyncSession,
) -> bool:
    """Insert the overall best price from a SerpApi scan. Returns True on success."""
    if not record:
        return False

    row = {
        "time":               _now(),
        "id":                 uuid.uuid4(),
        "route_id":           route_id,
        "origin":             record["origin"],
        "destination":        record["destination"],
        "departure_date":     record["departure_date"],
        "cabin_class":        record["cabin_class"],
        "price_usd":          record["price_usd"],
        "price_level":        record.get("price_level"),
        "typical_price_low":  record.get("typical_price_low"),
        "typical_price_high": record.get("typical_price_high"),
        "price_history":      record.get("price_history"),
        "airline_codes":      record.get("airline_codes", []),
        "is_direct":          record.get("is_direct", False),
        "raw_response":       record.get("raw_response"),
    }

    stmt = insert(GooglePrice).values([row]).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()
    logger.info("ingested_google", route_id=str(route_id))
    return True


async def store_flight_offers(
    route_id: uuid.UUID,
    offers: list[dict[str, Any]],
    deal_analysis_id: uuid.UUID,
    db: AsyncSession,
) -> int:
    """
    Bulk-insert individual flight offers from SerpApi.
    Each offer is the cheapest for a (primary_airline, stops) group.
    Linked to the DealAnalysis row via deal_analysis_id.
    Returns count stored.
    """
    if not offers:
        return 0

    now = _now()
    rows = []
    for o in offers:
        # Enrich cabin metadata from local dataset (best-effort)
        primary = o.get("primary_airline") or (o.get("airline_codes") or [None])[0]
        aircraft_name = o.get("aircraft_name") or o.get("airplane")
        cabin_info = _enrich_cabin(primary, aircraft_name)

        rows.append({
            "time":                 now,
            "id":                   uuid.uuid4(),
            "deal_analysis_id":     deal_analysis_id,
            "route_id":             route_id,
            "origin":               o["origin"],
            "destination":          o["destination"],
            "departure_date":       o["departure_date"],
            "cabin_class":          o["cabin_class"],
            "price_usd":            o["price_usd"],
            "primary_airline":      primary,
            "airline_codes":        o.get("airline_codes", []),
            "stops":                o.get("stops", 0),
            "duration_minutes":     o.get("duration_minutes"),
            "is_direct":            o.get("is_direct", False),
            # richer fields
            "legroom_inches":       o.get("legroom_inches"),
            "amenities":            o.get("amenities", []),
            "carbon_grams":         o.get("carbon_grams"),
            "carbon_typical_grams": o.get("carbon_typical_grams"),
            "layovers":             o.get("layovers"),
            "also_sold_by":         o.get("also_sold_by", []),
            "booking_token":        o.get("booking_token"),
            "booking_options":      o.get("booking_options"),
            "aircraft_iata":        cabin_info.get("aircraft_iata") or o.get("aircraft_iata"),
            "cabin_quality_score":  cabin_info.get("cabin_quality_score"),
            "cabin_product_name":   cabin_info.get("cabin_product_name"),
            "cabin_seat_type":      cabin_info.get("cabin_seat_type"),
            "cabin_has_door":       cabin_info.get("cabin_has_door"),
            "cabin_lie_flat":       cabin_info.get("cabin_lie_flat"),
        })

    stmt = insert(FlightOffer).values(rows).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()
    logger.info("ingested_flight_offers", route_id=str(route_id),
                deal_analysis_id=str(deal_analysis_id), count=len(rows))
    return len(rows)


async def store_duffel_price(
    route_id: uuid.UUID,
    record: dict[str, Any],
    db: AsyncSession,
) -> bool:
    """Insert a single Duffel normalized record. Returns True on success."""
    if not record:
        return False

    row = {
        "time":                       _now(),
        "id":                         uuid.uuid4(),
        "route_id":                   route_id,
        "origin":                     record["origin"],
        "destination":                record["destination"],
        "departure_date":             record["departure_date"],
        "cabin_class":                record["cabin_class"],
        "price_usd":                  record["price_usd"],
        "fare_brand_name":            record.get("fare_brand_name"),
        "fare_basis_code":            record.get("fare_basis_code"),
        "expires_at":                 record.get("expires_at"),
        "is_refundable":              record.get("is_refundable"),
        "change_fee_usd":             record.get("change_fee_usd"),
        "cancellation_penalty_usd":   record.get("cancellation_penalty_usd"),
        "baggage_included":           record.get("baggage_included", False),
        "airline_codes":              record.get("airline_codes", []),
        "raw_response":               record.get("raw_response"),
    }

    stmt = insert(DuffelPrice).values([row]).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()
    logger.info("ingested_duffel", route_id=str(route_id))
    return True


async def store_award_prices(
    route_id: uuid.UUID,
    records: list[dict[str, Any]],
    db: AsyncSession,
) -> int:
    """Bulk-insert Seats.aero normalized records. Returns count stored."""
    if not records:
        return 0

    now = _now()
    rows = []
    for r in records:
        rows.append({
            "time":             now,
            "id":               uuid.uuid4(),
            "route_id":         route_id,
            "origin":           r["origin"],
            "destination":      r["destination"],
            "departure_date":   r["departure_date"],
            "cabin_class":      r["cabin_class"],
            "loyalty_program":  r["loyalty_program"],
            "miles_cost":       r["miles_cost"],
            "cash_taxes_usd":   r.get("cash_taxes_usd", 0.0),
            "seats_available":  r.get("seats_available", 1),
            "operating_airline": r.get("operating_airline"),
            "cpp_value":        r.get("cpp_value"),
            "raw_response":     r.get("raw_response"),
        })

    stmt = insert(AwardPrice).values(rows).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()
    logger.info("ingested_awards", route_id=str(route_id), count=len(rows))
    return len(rows)
