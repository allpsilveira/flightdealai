"""
Duffel client — Tier 3 on-demand fare brand enrichment.
ONLY called when a deal is detected (score ≥ 5.0 or GEM flag).
Cost: $0.005/search. Rate limit: 120 req/60s.
"""
import structlog
from datetime import date
from typing import Any

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

CABIN_MAP = {
    "BUSINESS":        "business",
    "FIRST":           "first",
    "PREMIUM_ECONOMY": "premium_economy",
    "ECONOMY":         "economy",
}


async def enrich_offer(
    origin: str,
    destination: str,
    departure_date: date,
    cabin_class: str,
) -> dict[str, Any] | None:
    """
    Creates a Duffel offer request and returns the best normalized offer.
    Returns None on failure — pipeline continues without Duffel data.
    """
    if not settings.duffel_api_key:
        logger.warning("duffel_no_key")
        return None

    try:
        from duffel_api import Duffel
        from app.core.api_tracker import track_api_call
        client = Duffel(access_token=settings.duffel_api_key)

        async with track_api_call("duffel", endpoint="offer_requests") as _t:
            offer_request = client.offer_requests.create(
                {
                    "slices": [
                        {
                            "origin":         origin,
                            "destination":    destination,
                            "departure_date": departure_date.isoformat(),
                        }
                    ],
                    "passengers":    [{"type": "adult"}],
                    "cabin_class":   CABIN_MAP.get(cabin_class, "business"),
                    "max_connections": 1,
                }
            )

            offers = list(offer_request.offers)
            _t.set_status(200 if offers else 204)
            _t.set_metadata({"offers": len(offers)})
            if not offers:
                return None

            # Pick cheapest offer
            best = min(offers, key=lambda o: float(o.total_amount))
            return _normalize(best, origin, destination, departure_date, cabin_class)

    except Exception as exc:
        logger.error("duffel_enrich_failed", origin=origin, destination=destination,
                     date=str(departure_date), cabin=cabin_class, error=str(exc))
        return None


def _normalize(offer: Any, origin: str, destination: str,
               departure_date: date, cabin_class: str) -> dict[str, Any]:
    slice_  = offer.slices[0] if offer.slices else None
    segment = slice_.segments[0] if slice_ and slice_.segments else None
    cabin_  = segment.passengers[0] if segment and segment.passengers else None

    conditions = getattr(offer, "conditions", None) or {}

    # Refundability
    refund_cond  = getattr(conditions, "refund_before_departure", None)
    is_refundable = None
    if refund_cond is not None:
        is_refundable = getattr(refund_cond, "allowed", None)

    # Change fee — Duffel returns penalty as amount + currency
    change_cond  = getattr(conditions, "change_before_departure", None)
    change_fee   = None
    if change_cond is not None:
        penalty = getattr(change_cond, "penalty_amount", None)
        if penalty:
            try:
                change_fee = float(penalty)
            except (TypeError, ValueError):
                pass

    # Cancellation penalty
    cancel_cond  = getattr(conditions, "refund_before_departure", None)
    cancel_fee   = None
    if cancel_cond is not None:
        penalty = getattr(cancel_cond, "penalty_amount", None)
        if penalty:
            try:
                cancel_fee = float(penalty)
            except (TypeError, ValueError):
                pass

    # Baggage — check available_services for checked bag inclusion
    services  = getattr(offer, "available_services", []) or []
    has_bag   = any(
        getattr(s, "type", "") == "baggage" and getattr(s, "total_amount", "0") == "0"
        for s in services
    )

    # Booking class letter — first char of fare_basis_code (e.g. "ZBRAIN1" → "Z")
    fare_basis  = getattr(cabin_, "fare_basis_code", None)
    booking_cls = fare_basis[0].upper() if fare_basis else None

    # Airline IATA code
    carrier = getattr(segment, "marketing_carrier", None) if segment else None
    airline = getattr(carrier, "iata_code", None) if carrier else None

    return {
        "origin":                    origin,
        "destination":               destination,
        "departure_date":            departure_date,
        "cabin_class":               cabin_class,
        "price_usd":                 float(offer.total_amount),
        "fare_brand_name":           getattr(cabin_, "fare_brand_name", None),
        "fare_basis_code":           fare_basis,
        "booking_class":             booking_cls,
        "expires_at":                getattr(offer, "expires_at", None),
        "is_refundable":             is_refundable,
        "change_fee_usd":            change_fee,
        "cancellation_penalty_usd":  cancel_fee,
        "baggage_included":          has_bag,
        "airline_codes":             [airline] if airline else [],
        "raw_response":              {"offer_id": offer.id, "total": offer.total_amount},
    }
