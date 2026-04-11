"""
Duffel client — Tier 3 on-demand fare brand enrichment.
ONLY called when a deal is detected (score ≥ 80 or GEM flag).
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
        client = Duffel(access_token=settings.duffel_api_key)

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
        if not offers:
            return None

        # Pick cheapest offer
        best = min(offers, key=lambda o: float(o.total_amount))
        return _normalize(best, origin, destination, departure_date, cabin_class)

    except Exception as exc:
        logger.warning("duffel_enrich_failed", origin=origin, destination=destination,
                       date=str(departure_date), cabin=cabin_class, error=str(exc))
        return None


def _normalize(offer: Any, origin: str, destination: str,
               departure_date: date, cabin_class: str) -> dict[str, Any]:
    slice_  = offer.slices[0] if offer.slices else None
    segment = slice_.segments[0] if slice_ and slice_.segments else None
    cabin_  = segment.passengers[0] if segment and segment.passengers else None

    conditions = getattr(offer, "conditions", None) or {}
    refundable = getattr(conditions, "refund_before_departure", None)

    return {
        "origin":                    origin,
        "destination":               destination,
        "departure_date":            departure_date,
        "cabin_class":               cabin_class,
        "price_usd":                 float(offer.total_amount),
        "fare_brand_name":           getattr(cabin_, "fare_brand_name", None),
        "fare_basis_code":           getattr(cabin_, "fare_basis_code", None),
        "expires_at":                getattr(offer, "expires_at", None),
        "is_refundable":             bool(refundable) if refundable is not None else None,
        "change_fee_usd":            None,   # extracted from conditions in Phase 3
        "cancellation_penalty_usd":  None,
        "baggage_included":          False,  # Phase 3 — parse available_services
        "airline_codes":             [getattr(segment, "marketing_carrier", {}).get("iata_code")]
                                     if segment else [],
        "raw_response":              {"offer_id": offer.id, "total": offer.total_amount},
    }
