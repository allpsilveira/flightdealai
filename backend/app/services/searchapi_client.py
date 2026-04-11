"""
SearchApi.io (Google Flights) client — Tier 2 Deep Scan.
The only source for Google price_level, typical_price_range, and price_history.
Runs 3× per day and on-demand when Tier 1 detects a >5% price drop.
"""
import structlog
import httpx
from datetime import date
from typing import Any

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

BASE_URL = "https://www.searchapi.io/api/v1/search"

# Google Flights travel_class codes
CABIN_CODE = {
    "ECONOMY":         "1",
    "PREMIUM_ECONOMY": "2",
    "BUSINESS":        "3",
    "FIRST":           "4",
}


async def search_flights(
    origin: str,
    destination: str,
    departure_date: date,
    cabin_class: str,
) -> dict[str, Any] | None:
    """
    Returns a normalized dict with price, price_insights, and best_offer.
    Returns None on any failure.
    """
    if not settings.searchapi_api_key:
        logger.warning("searchapi_no_key")
        return None

    params = {
        "engine":        "google_flights",
        "api_key":       settings.searchapi_api_key,
        "departure_id":  origin,
        "arrival_id":    destination,
        "outbound_date": departure_date.isoformat(),
        "type":          "2",   # one-way
        "travel_class":  CABIN_CODE.get(cabin_class, "3"),
        "stops":         "2",
        "currency":      "USD",
        "deep_search":   "true",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
        return _normalize(data, origin, destination, departure_date, cabin_class)
    except Exception as exc:
        logger.warning("searchapi_search_failed", origin=origin, destination=destination,
                       date=str(departure_date), cabin=cabin_class, error=str(exc))
        return None


def _normalize(data: dict, origin: str, destination: str,
               departure_date: date, cabin_class: str) -> dict[str, Any]:
    insights = data.get("price_insights", {})
    typical  = insights.get("typical_price_range", [None, None])

    # Best offer = cheapest booking option
    best_price = None
    best_airlines: list[str] = []
    for offer in data.get("best_flights", []) + data.get("other_flights", []):
        price = offer.get("price")
        if price and (best_price is None or price < best_price):
            best_price = price
            best_airlines = [
                leg.get("airline_logo", "").split("/")[-1].split(".")[0].upper()
                for leg in offer.get("flights", [])
                if leg.get("airline")
            ]

    return {
        "origin":             origin,
        "destination":        destination,
        "departure_date":     departure_date,
        "cabin_class":        cabin_class,
        "price_usd":          float(best_price) if best_price else 0.0,
        "price_level":        insights.get("price_level"),           # low | typical | high
        "typical_price_low":  float(typical[0]) if typical[0] else None,
        "typical_price_high": float(typical[1]) if typical[1] else None,
        "price_history":      insights.get("price_history"),
        "airline_codes":      best_airlines,
        "is_direct":          False,
        "raw_response":       data,
    }
