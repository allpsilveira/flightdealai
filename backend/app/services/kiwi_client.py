"""
Kiwi.com Tequila client — Tier 1 Creative Routing scanner.
Finds virtual interlining routes nobody else shows.
Runs every 8 hours. Multiple origins/destinations in a single call.
"""
import structlog
import httpx
from datetime import date, timedelta
from typing import Any

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

BASE_URL = "https://tequila-api.kiwi.com/v2/search"

# Kiwi cabin codes
CABIN_CODE = {
    "ECONOMY":         "M",
    "PREMIUM_ECONOMY": "W",
    "BUSINESS":        "C",
    "FIRST":           "F",
}


async def search_flights(
    origins: list[str],
    destinations: list[str],
    date_from: date,
    date_to: date,
    cabin_class: str,
    max_results: int = 20,
) -> list[dict[str, Any]] | None:
    """
    Searches Kiwi with multiple origins + destinations in one call.
    Returns normalized list or None on failure.
    """
    if not settings.kiwi_api_key:
        logger.warning("kiwi_no_key")
        return None

    params = {
        "fly_from":        ",".join(origins),
        "fly_to":          ",".join(destinations),
        "date_from":       date_from.strftime("%d/%m/%Y"),
        "date_to":         date_to.strftime("%d/%m/%Y"),
        "flight_type":     "oneway",
        "selected_cabins": CABIN_CODE.get(cabin_class, "C"),
        "max_stopovers":   2,
        "curr":            "USD",
        "sort":            "price",
        "limit":           max_results,
    }

    headers = {"apikey": settings.kiwi_api_key}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(BASE_URL, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        return [_normalize(item, cabin_class) for item in data.get("data", [])]
    except Exception as exc:
        logger.warning("kiwi_search_failed", origins=origins, destinations=destinations,
                       cabin=cabin_class, error=str(exc))
        return None


def _normalize(item: dict, cabin_class: str) -> dict[str, Any]:
    routes = item.get("route", [])
    airlines = list({r.get("airline") for r in routes if r.get("airline")})
    departure_date = date.fromisoformat(item["local_departure"][:10]) if item.get("local_departure") else None

    return {
        "origin":                 item.get("flyFrom"),
        "destination":            item.get("flyTo"),
        "departure_date":         departure_date,
        "cabin_class":            cabin_class,
        "price_usd":              float(item.get("price", 0)),
        "is_virtual_interlining": item.get("virtual_interlining", False),
        "has_airport_change":     item.get("has_airport_change", False),
        "technical_stops":        len(item.get("technical_stops", [])),
        "deep_link":              item.get("deep_link"),
        "airline_codes":          airlines,
        "duration_minutes":       item.get("duration", {}).get("total", 0) // 60,
        "raw_response":           item,
    }
