"""
SerpApi (Google Flights) client — primary price scanner.
Runs every 4h for quick price checks and 3x/day for full trend scans.
The only source for price_level (low/typical/high), typical_price_range,
and timestamped price_history.
"""
import structlog
import httpx
from datetime import date
from typing import Any

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

BASE_URL = "https://serpapi.com/search"

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
    deep: bool = True,
) -> dict[str, Any] | None:
    """
    Search Google Flights via SerpApi.
    deep=True fetches price_history and price_level (full scan).
    deep=False is a quick price check (same API cost, but we skip heavy parsing).
    Returns a normalized dict or None on failure.
    """
    if not settings.serpapi_api_key:
        logger.warning("serpapi_no_key")
        return None

    params = {
        "engine":         "google_flights",
        "api_key":        settings.serpapi_api_key,
        "departure_id":   origin,
        "arrival_id":     destination,
        "outbound_date":  departure_date.isoformat(),
        "type":           "2",   # one-way
        "travel_class":   CABIN_CODE.get(cabin_class, "3"),
        "stops":          "2",
        "currency":       "USD",
        "hl":             "en",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
        return _normalize(data, origin, destination, departure_date, cabin_class, deep=deep)
    except Exception as exc:
        logger.warning(
            "serpapi_search_failed",
            origin=origin, destination=destination,
            date=str(departure_date), cabin=cabin_class, error=str(exc),
        )
        return None


def _normalize(
    data: dict,
    origin: str,
    destination: str,
    departure_date: date,
    cabin_class: str,
    deep: bool = True,
) -> dict[str, Any]:
    insights = data.get("price_insights", {})
    typical  = insights.get("typical_price_range", [None, None])

    # Best price = cheapest flight across best_flights + other_flights
    best_price: float | None = None
    best_airlines: list[str] = []
    is_direct = False

    for offer in data.get("best_flights", []) + data.get("other_flights", []):
        price = offer.get("price")
        if price and (best_price is None or price < best_price):
            best_price = float(price)
            flights = offer.get("flights", [])
            best_airlines = list({
                f.get("airline_logo", "").split("/")[-1].split(".")[0].upper()
                for f in flights if f.get("airline")
            })
            is_direct = len(flights) == 1

    return {
        "origin":             origin,
        "destination":        destination,
        "departure_date":     departure_date,
        "cabin_class":        cabin_class,
        "price_usd":          best_price or 0.0,
        "price_level":        insights.get("price_level") if deep else None,
        "typical_price_low":  float(typical[0]) if typical and typical[0] else None,
        "typical_price_high": float(typical[1]) if typical and typical[1] else None,
        "price_history":      insights.get("price_history") if deep else None,
        "airline_codes":      best_airlines,
        "is_direct":          is_direct,
        "raw_response":       data if deep else None,
    }
