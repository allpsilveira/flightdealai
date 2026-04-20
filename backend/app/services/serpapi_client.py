"""
SerpApi (Google Flights) client — primary price scanner.

Every scan returns:
  - The overall best price (for stats/scoring in GooglePrice table)
  - A list of individual offers, one per (primary_airline, stops) group,
    cheapest within each group (for FlightOffer table / deal detail breakdown)

Runs every 4h for quick price checks and 3x/day for full trend scans.
"""
import asyncio
import random
import structlog
import httpx
from app.core.api_tracker import track_api_call
from datetime import date
from typing import Any

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

# Limit concurrent SerpApi requests to avoid 429 rate limiting.
# SerpApi allows ~5 req/s on the Starter plan; 3 concurrent is safe.
_SEMAPHORE = asyncio.Semaphore(3)

BASE_URL = "https://serpapi.com/search"

CABIN_CODE = {
    "ECONOMY":         "1",
    "PREMIUM_ECONOMY": "2",
    "BUSINESS":        "3",
    "FIRST":           "4",
}


def _extract_iata(airline_logo_url: str) -> str | None:
    """Extract IATA code from SerpApi airline_logo URL, e.g. '.../AA.png' → 'AA'."""
    try:
        return airline_logo_url.rstrip("/").split("/")[-1].split(".")[0].upper() or None
    except Exception:
        return None


async def search_flights(
    origin: str,
    destination: str,
    departure_date: date,
    cabin_class: str,
    deep: bool = True,
    trip_type: str = "ONE_WAY",
    return_date: date | None = None,
) -> dict[str, Any] | None:
    """
    Search Google Flights via SerpApi.
    deep=True fetches price_history and price_level (full scan, 3x/day).
    deep=False is a quick price check (every 4h tripwire).

    Returns a normalized dict with:
      - best overall price fields (for GooglePrice storage + scoring)
      - offers: list of {primary_airline, stops, price_usd, ...} (for FlightOffer storage)
    Returns None on failure.
    """
    if not settings.serpapi_api_key:
        logger.warning("serpapi_no_key")
        return None

    is_round_trip = trip_type == "ROUND_TRIP" and return_date is not None

    params = {
        "engine":         "google_flights",
        "api_key":        settings.serpapi_api_key,
        "departure_id":   origin,
        "arrival_id":     destination,
        "outbound_date":  departure_date.isoformat(),
        "type":           "1" if is_round_trip else "2",
        "travel_class":   CABIN_CODE.get(cabin_class, "3"),
        "stops":          "2",
        "currency":       "USD",
        "hl":             "en",
    }
    if is_round_trip:
        params["return_date"] = return_date.isoformat()

    for attempt in range(3):
        try:
            async with _SEMAPHORE:
                async with track_api_call("serpapi", endpoint="google_flights") as _t:
                    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
                        resp = await client.get(BASE_URL, params=params)
                    _t.set_status(resp.status_code)
                    status_code = resp.status_code
                    resp_text = resp.text if resp.status_code != 200 else None
                    data = resp.json() if resp.status_code == 200 else None
            # --- semaphore released before any sleep ---
            if status_code == 429:
                wait = (2 ** attempt) + random.uniform(0, 1)  # jitter to avoid thundering herd
                logger.warning("serpapi_rate_limited", attempt=attempt + 1,
                               wait_s=wait, origin=origin, destination=destination)
                await asyncio.sleep(wait)
                continue              # retry
            if status_code != 200:
                logger.error(
                    "serpapi_http_error",
                    status=status_code,
                    body=(resp_text or "")[:500],
                    origin=origin, destination=destination,
                    date=str(departure_date), cabin=cabin_class,
                )
                return None
            # SerpApi returns error field instead of HTTP error for some failures
            if "error" in data:
                logger.error(
                    "serpapi_api_error",
                    error=data["error"],
                    origin=origin, destination=destination,
                    date=str(departure_date), cabin=cabin_class,
                )
                return None
            return _normalize(data, origin, destination, departure_date,
                              cabin_class, deep=deep, trip_type=trip_type)
        except Exception as exc:
            logger.error(
                "serpapi_search_failed",
                origin=origin, destination=destination,
                date=str(departure_date), cabin=cabin_class, error=str(exc),
            )
            return None
    logger.warning("serpapi_all_retries_failed", origin=origin, destination=destination,
                   date=str(departure_date), cabin=cabin_class)
    return None


def _normalize(
    data: dict,
    origin: str,
    destination: str,
    departure_date: date,
    cabin_class: str,
    deep: bool = True,
    trip_type: str = "ONE_WAY",
) -> dict[str, Any]:
    insights = data.get("price_insights", {})
    typical  = insights.get("typical_price_range", [None, None])

    # ── Parse every offer from best_flights + other_flights ───────────────────
    raw_offers: list[dict] = []

    for offer in data.get("best_flights", []) + data.get("other_flights", []):
        price = offer.get("price")
        if not price:
            continue

        flights = offer.get("flights", [])
        stops = max(0, len(flights) - 1)

        # Extract IATA codes for all airlines in this itinerary
        airline_codes: list[str] = []
        for f in flights:
            logo = f.get("airline_logo", "")
            iata = _extract_iata(logo)
            if iata and iata not in airline_codes:
                airline_codes.append(iata)

        primary = airline_codes[0] if airline_codes else None
        duration = offer.get("total_duration")

        raw_offers.append({
            "price_usd":       float(price),
            "primary_airline": primary,
            "airline_codes":   airline_codes,
            "stops":           stops,
            "duration_minutes": duration,
            "is_direct":       stops == 0,
            "origin":          origin,
            "destination":     destination,
            "departure_date":  departure_date,
            "cabin_class":     cabin_class,
        })

    # ── Deduplicate: cheapest per (primary_airline, stops) group ──────────────
    best_per_group: dict[tuple, dict] = {}
    for o in raw_offers:
        key = (o["primary_airline"], o["stops"])
        if key not in best_per_group or o["price_usd"] < best_per_group[key]["price_usd"]:
            best_per_group[key] = o
    offers = sorted(best_per_group.values(), key=lambda x: x["price_usd"])

    # ── Overall best (for GooglePrice row + scoring) ──────────────────────────
    best_price: float | None = None
    best_airlines: list[str] = []
    is_direct = False

    if offers:
        cheapest = offers[0]
        best_price = cheapest["price_usd"]
        best_airlines = cheapest["airline_codes"]
        is_direct = cheapest["is_direct"]

    return {
        # ── GooglePrice fields ────────────────────────────────────────────────
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
        "trip_type":          trip_type,
        "raw_response":       data if deep else None,
        # ── Individual offers (for FlightOffer table) ─────────────────────────
        "offers":             offers,
    }


async def get_cheapest_dates(
    origin: str,
    destination: str,
    cabin_class: str,
    lookahead_days: int = 60,
    sample_every: int = 7,
) -> list[dict[str, Any]]:
    """
    Scans departure dates over the next `lookahead_days` days (sampled every
    `sample_every` days) and returns a list of {date, price_usd} sorted by price.
    """
    import asyncio
    from datetime import timedelta

    today = date.today()
    scan_dates = [
        today + timedelta(days=d)
        for d in range(7, lookahead_days + 1, sample_every)
    ]

    async def _fetch(d: date) -> dict | None:
        result = await search_flights(origin, destination, d, cabin_class, deep=False)
        if result and result.get("price_usd"):
            return {"date": d.isoformat(), "price_usd": result["price_usd"]}
        return None

    results = await asyncio.gather(*[_fetch(d) for d in scan_dates])
    return sorted(
        [r for r in results if r],
        key=lambda x: x["price_usd"],
    )


# ── Airport autocomplete (Phase 6.5.5) ────────────────────────────────────────

# In-process cache: {query_lower: (timestamp, results)}
# Avoids hammering SerpApi for repeated queries during a session.
_AUTOCOMPLETE_CACHE: dict[str, tuple[float, list[dict]]] = {}
_AUTOCOMPLETE_TTL_SEC = 86400  # 24h


async def autocomplete_airports(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """
    Look up airports/cities via Google Flights autocomplete.
    Used as a fallback when local airports.json doesn't match.

    Returns list of {iata, name, city, country} dicts (best-effort field mapping).
    Returns [] on failure or if no API key.
    """
    if not settings.serpapi_api_key or not query or len(query) < 2:
        return []

    import time
    q = query.strip().lower()
    now = time.time()
    cached = _AUTOCOMPLETE_CACHE.get(q)
    if cached and now - cached[0] < _AUTOCOMPLETE_TTL_SEC:
        return cached[1][:limit]

    params = {
        "engine":  "google_flights_autocomplete",
        "api_key": settings.serpapi_api_key,
        "q":       query,
        "hl":      "en",
    }
    try:
        async with _SEMAPHORE:
            async with track_api_call("serpapi", endpoint="autocomplete") as _t:
                async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0)) as client:
                    resp = await client.get(BASE_URL, params=params)
                    _t.set_status(resp.status_code)
                    if resp.status_code != 200:
                        logger.warning("serpapi_autocomplete_http", status=resp.status_code, q=query)
                        return []
                    data = resp.json()
    except Exception as exc:
        logger.warning("serpapi_autocomplete_error", error=str(exc), q=query)
        return []

    # SerpApi returns "airports" or "places" depending on response shape
    raw = data.get("airports") or data.get("places") or []
    out: list[dict[str, Any]] = []
    for item in raw:
        # Best-effort field mapping — SerpApi schema varies
        iata = item.get("iata") or item.get("code") or item.get("id")
        if not iata or len(iata) != 3:
            continue
        out.append({
            "iata":    iata.upper(),
            "name":    item.get("name") or item.get("airport_name") or "",
            "city":    item.get("city") or item.get("address", {}).get("city") if isinstance(item.get("address"), dict) else item.get("city", ""),
            "country": item.get("country") or item.get("country_name") or "",
        })

    _AUTOCOMPLETE_CACHE[q] = (now, out)
    # Light cleanup: drop cache entries older than TTL when cache > 500 entries
    if len(_AUTOCOMPLETE_CACHE) > 500:
        cutoff = now - _AUTOCOMPLETE_TTL_SEC
        for k in list(_AUTOCOMPLETE_CACHE.keys()):
            if _AUTOCOMPLETE_CACHE[k][0] < cutoff:
                del _AUTOCOMPLETE_CACHE[k]

    return out[:limit]
