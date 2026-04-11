"""
Amadeus Self-Service API client — Tier 1 Tripwire scanner.
Runs every 2 hours. Returns normalized price records; never raises on API failure.
"""
import structlog
from datetime import date
from typing import Any

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

# Lazy init — amadeus SDK is only imported when the key is configured
_client = None


def _get_client():
    global _client
    if _client is None:
        from amadeus import Client, ResponseError  # noqa: F401
        _client = Client(
            client_id=settings.amadeus_client_id,
            client_secret=settings.amadeus_client_secret,
        )
    return _client


CABIN_MAP = {
    "BUSINESS":        "BUSINESS",
    "FIRST":           "FIRST",
    "PREMIUM_ECONOMY": "PREMIUM_ECONOMY",
}


async def search_flights(
    origin: str,
    destination: str,
    departure_date: date,
    cabin_class: str,
    max_results: int = 20,
) -> list[dict[str, Any]] | None:
    """
    Calls Amadeus Flight Offers Search.
    Returns a list of normalized price dicts, or None on failure.
    """
    try:
        client = _get_client()
        response = client.shopping.flight_offers_search.get(
            originLocationCode=origin,
            destinationLocationCode=destination,
            departureDate=departure_date.isoformat(),
            adults=1,
            travelClass=CABIN_MAP.get(cabin_class, "BUSINESS"),
            nonStop=False,
            max=max_results,
            currencyCode="USD",
        )
        return [_normalize(offer, origin, destination, departure_date, cabin_class)
                for offer in response.data]
    except Exception as exc:
        logger.warning("amadeus_search_failed", origin=origin, destination=destination,
                       date=str(departure_date), cabin=cabin_class, error=str(exc))
        return None


async def get_cheapest_dates(
    origin: str,
    destination: str,
    departure_date: date,
) -> list[dict[str, Any]] | None:
    """
    Calls Amadeus Flight Dates (cheapest per day).
    Returns [{date, price}] or None on failure.
    """
    try:
        client = _get_client()
        response = client.shopping.flight_dates.get(
            origin=origin,
            destination=destination,
            departureDate=departure_date.isoformat(),
            currencyCode="USD",
        )
        return [
            {"date": item["departureDate"], "price_usd": float(item["price"]["total"])}
            for item in response.data
        ]
    except Exception as exc:
        logger.warning("amadeus_cheapest_dates_failed", origin=origin, destination=destination,
                       error=str(exc))
        return None


def _normalize(offer: dict, origin: str, destination: str,
               departure_date: date, cabin_class: str) -> dict[str, Any]:
    """Flatten a raw Amadeus offer into our standard shape."""
    itinerary = offer.get("itineraries", [{}])[0]
    segments = itinerary.get("segments", [])
    first_seg = segments[0] if segments else {}

    traveler_pricing = offer.get("travelerPricings", [{}])[0]
    fare_detail = traveler_pricing.get("fareDetailsBySegment", [{}])[0]

    airlines = list({seg.get("carrierCode") for seg in segments if seg.get("carrierCode")})
    duration_str = itinerary.get("duration", "")  # e.g. "PT14H30M"
    duration_minutes = _parse_iso_duration(duration_str)

    return {
        "origin": first_seg.get("departure", {}).get("iataCode", origin),
        "destination": segments[-1].get("arrival", {}).get("iataCode", destination) if segments else destination,
        "departure_date": departure_date,
        "cabin_class": cabin_class,
        "price_usd": float(offer.get("price", {}).get("total", 0)),
        "seats_remaining": offer.get("numberOfBookableSeats"),
        "booking_class": fare_detail.get("class"),
        "branded_fare": fare_detail.get("brandedFare"),
        "airline_codes": airlines,
        "is_direct": len(segments) == 1,
        "duration_minutes": duration_minutes,
        "raw_response": offer,
    }


def _parse_iso_duration(duration: str) -> int | None:
    """Parse 'PT14H30M' → 870 minutes."""
    if not duration:
        return None
    import re
    hours = int(m.group(1)) if (m := re.search(r"(\d+)H", duration)) else 0
    mins  = int(m.group(1)) if (m := re.search(r"(\d+)M", duration)) else 0
    return hours * 60 + mins
