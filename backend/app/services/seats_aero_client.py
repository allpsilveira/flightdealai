"""
Seats.aero client — Tier 3 on-demand award availability.
ONLY called when a cash deal is detected to check miles alternatives.
Rate limit: 1,000 calls/day. Cost: $10/month flat.
"""
import structlog
import httpx
from app.core.api_tracker import track_api_call
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
    return {
        "Partner-Authorization": settings.seats_aero_api_key,
        "accept": "application/json",
    }


async def ping() -> dict:
    """
    Quick connectivity check — fetches the /routes list.
    Used by the diagnostic endpoint to confirm the API key works.
    """
    if not settings.seats_aero_api_key:
        return {"ok": False, "error": "SEATS_AERO_API_KEY not set in environment"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{BASE_URL}/routes", headers=_headers())
        return {
            "ok": resp.status_code == 200,
            "status": resp.status_code,
            "body_preview": resp.text[:400],
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


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
        logger.error("seats_aero_no_key", hint="Set SEATS_AERO_API_KEY in EasyPanel environment")
        return None

    params = {
        "origin_airport":      origin,
        "destination_airport": destination,
        "start_date":          departure_date.isoformat(),
        "end_date":            departure_date.isoformat(),
        "cabin":               CABIN_MAP.get(cabin_class, "business"),
        "order_by":            "mileage",
        "take":                10,   # Seats.aero uses 'take', not 'limit'
    }

    try:
        async with track_api_call("seats_aero", endpoint="search") as _t:
            async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
                resp = await client.get(
                    f"{BASE_URL}/search",
                    params=params,
                    headers=_headers(),
                )
            _t.set_status(resp.status_code)
            if resp.status_code != 200:
                logger.error(
                    "seats_aero_http_error",
                    status=resp.status_code,
                    body=resp.text[:300],
                    origin=origin, destination=destination,
                )
                return None
            data = resp.json()
            items = data.get("data", [])
            _t.set_metadata({"results": len(items)})
        logger.info("seats_aero_search_ok", origin=origin, destination=destination,
                    cabin=cabin_class, results=len(items))
        return [_normalize(item, origin, destination, departure_date, cabin_class)
                for item in items]
    except Exception as exc:
        logger.error("seats_aero_search_failed", origin=origin, destination=destination,
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
