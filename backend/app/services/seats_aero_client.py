"""
Seats.aero client — Tier 3 on-demand award availability.
ONLY called when a cash deal is detected to check miles alternatives.
Rate limit: 1,000 calls/day. Cost: $10/month flat.
"""
import structlog
import httpx
from datetime import date
from typing import Any

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

BASE_URL = "https://seats.aero/partnerapi"

CABIN_MAP = {
    "BUSINESS":        "business",
    "FIRST":           "first",
    "PREMIUM_ECONOMY": "premium",
    "ECONOMY":         "economy",
}


def _headers() -> dict:
    return {"Partner-Authorization": settings.seats_aero_api_key}


async def search_award_availability(
    origin: str,
    destination: str,
    departure_date: date,
    cabin_class: str,
) -> list[dict[str, Any]] | None:
    """
    Searches Seats.aero cached availability for award space.
    Returns list of normalized award options or None on failure.
    """
    if not settings.seats_aero_api_key:
        logger.warning("seats_aero_no_key")
        return None

    params = {
        "origin_airport":      origin,
        "destination_airport": destination,
        "start_date":          departure_date.isoformat(),
        "end_date":            departure_date.isoformat(),
        "cabin":               CABIN_MAP.get(cabin_class, "business"),
        "order_by":            "mileage",
        "limit":               10,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{BASE_URL}/search",
                params=params,
                headers=_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
        return [_normalize(item, origin, destination, departure_date, cabin_class)
                for item in data.get("data", [])]
    except Exception as exc:
        logger.warning("seats_aero_search_failed", origin=origin, destination=destination,
                       date=str(departure_date), cabin=cabin_class, error=str(exc))
        return None


def _normalize(item: dict, origin: str, destination: str,
               departure_date: date, cabin_class: str) -> dict[str, Any]:
    return {
        "origin":           origin,
        "destination":      destination,
        "departure_date":   departure_date,
        "cabin_class":      cabin_class,
        "loyalty_program":  item.get("source"),
        "miles_cost":       int(item.get("mileage", 0)),
        "cash_taxes_usd":   float(item.get("totalTax", 0) or 0) / 100,
        "seats_available":  int(item.get("available", 1)),
        "operating_airline": item.get("airlines", [None])[0] if item.get("airlines") else None,
        "cpp_value":        None,   # calculated by award_analyzer after cash price is known
        "raw_response":     item,
    }
