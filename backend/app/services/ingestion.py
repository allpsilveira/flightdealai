"""
Ingestion service — persists normalized price data from all 5 sources to TimescaleDB hypertables.
All functions are idempotent: duplicate rows are skipped via ON CONFLICT DO NOTHING.
"""
import uuid
import structlog
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.models.prices import AmadeusPrice, GooglePrice, KiwiPrice, DuffelPrice, AwardPrice

logger = structlog.get_logger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def store_amadeus_prices(
    route_id: uuid.UUID,
    records: list[dict[str, Any]],
    db: AsyncSession,
) -> int:
    """Bulk-insert Amadeus normalized records. Returns count stored."""
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
            "price_usd":        r["price_usd"],
            "seats_remaining":  r.get("seats_remaining"),
            "booking_class":    r.get("booking_class"),
            "branded_fare":     r.get("branded_fare"),
            "airline_codes":    r.get("airline_codes", []),
            "is_direct":        r.get("is_direct", False),
            "duration_minutes": r.get("duration_minutes"),
            "raw_response":     r.get("raw_response"),
        })

    stmt = insert(AmadeusPrice).values(rows).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()
    logger.info("ingested_amadeus", route_id=str(route_id), count=len(rows))
    return len(rows)


async def store_google_price(
    route_id: uuid.UUID,
    record: dict[str, Any],
    db: AsyncSession,
) -> bool:
    """Insert a single SearchApi/Google normalized record. Returns True on success."""
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


async def store_kiwi_prices(
    route_id: uuid.UUID,
    records: list[dict[str, Any]],
    db: AsyncSession,
) -> int:
    """Bulk-insert Kiwi normalized records. Returns count stored."""
    if not records:
        return 0

    now = _now()
    rows = []
    for r in records:
        rows.append({
            "time":                   now,
            "id":                     uuid.uuid4(),
            "route_id":               route_id,
            "origin":                 r["origin"],
            "destination":            r["destination"],
            "departure_date":         r["departure_date"],
            "cabin_class":            r["cabin_class"],
            "price_usd":              r["price_usd"],
            "is_virtual_interlining": r.get("is_virtual_interlining", False),
            "has_airport_change":     r.get("has_airport_change", False),
            "technical_stops":        r.get("technical_stops", 0),
            "deep_link":              r.get("deep_link"),
            "airline_codes":          r.get("airline_codes", []),
            "duration_minutes":       r.get("duration_minutes"),
            "raw_response":           r.get("raw_response"),
        })

    stmt = insert(KiwiPrice).values(rows).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()
    logger.info("ingested_kiwi", route_id=str(route_id), count=len(rows))
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
