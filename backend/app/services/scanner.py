"""
Scanner — main scan pipeline.

Sources:
  SerpApi (Google Flights) — scheduled every 4h (quick) and 3x/day (full)
  Duffel + Seats.aero      — daily enrichment at 7 AM and on-demand "Scan Now"
                             (handled by deal_pipeline, not here)

Per scan, SerpApi returns:
  - best overall price → stored to GooglePrice table
  - all offers by (airline, stops) → returned in all_offers for pipeline to store as FlightOffers
"""
import asyncio
import json
import math
import structlog
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import serpapi_client
from app.services.ingestion import store_google_price

logger = structlog.get_logger(__name__)

# ── Nearby airport expansion ───────────────────────────────────────────────────

_AIRPORTS: list[dict] | None = None

def _load_airports() -> list[dict]:
    global _AIRPORTS
    if _AIRPORTS is None:
        airports_path = Path(__file__).parent.parent / "data" / "airports.json"
        with open(airports_path, encoding="utf-8") as f:
            _AIRPORTS = json.load(f)
    return _AIRPORTS


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def expand_origins_by_drive(
    origins: list[str],
    max_drive_hours: float | None,
    max_nearby_per_origin: int = 3,
    max_total: int = 8,
) -> list[str]:
    """
    Return origins expanded with nearby airports reachable within max_drive_hours.
    Drive time formula: km * 1.3 (road factor) / 80 km/h.
    So max straight-line km = max_drive_hours * 80 / 1.3.

    Caps:
      max_nearby_per_origin — max additional airports added per selected origin (default 3).
      max_total             — hard cap on total expanded origins (default 8).
    These prevent quota explosions when many airports exist within a large drive radius.
    Nearby airports are sorted by distance so the closest ones are prioritised.
    """
    if not max_drive_hours or max_drive_hours <= 0:
        return origins

    airports = _load_airports()
    airport_map = {a["iata"]: a for a in airports}
    max_km = max_drive_hours * 80 / 1.3

    expanded = list(origins)
    seen = set(origins)

    for origin_code in origins:
        if len(expanded) >= max_total:
            break

        origin = airport_map.get(origin_code)
        if not origin or not origin.get("lat") or not origin.get("lon"):
            continue

        # Find all nearby airports, sorted by distance (closest first)
        nearby: list[tuple[float, dict]] = []
        for ap in airports:
            if ap["iata"] in seen or not ap.get("lat") or not ap.get("lon"):
                continue
            dist = _haversine_km(origin["lat"], origin["lon"], ap["lat"], ap["lon"])
            if dist <= max_km:
                nearby.append((dist, ap))

        nearby.sort(key=lambda x: x[0])

        added = 0
        for dist, ap in nearby:
            if added >= max_nearby_per_origin or len(expanded) >= max_total:
                break
            expanded.append(ap["iata"])
            seen.add(ap["iata"])
            added += 1
            logger.info(
                "nearby_airport_added",
                origin=origin_code,
                nearby=ap["iata"],
                dist_km=round(dist),
                drive_h=round(dist * 1.3 / 80, 1),
            )

    return expanded


# Hard cap: max SerpApi calls per scan to protect the monthly quota.
# Starter plan = 1,000 searches/month. At 20/scan you can run 50 scans/month.
MAX_CALLS_PER_SCAN = 20


async def scan_route(
    route_id: uuid.UUID,
    origins: list[str],
    destinations: list[str],
    cabin_classes: list[str],
    date_from: date,
    date_to: date,
    db: AsyncSession,
    deep: bool = True,
    trip_type: str = "ONE_WAY",
    return_date_offset_days: int | None = None,
) -> dict[str, Any]:
    """
    Scan a route via SerpApi (Google Flights).
    deep=True → full scan with price_level + price_history (3x/day)
    deep=False → quick price check only (every 4h tripwire)

    Total SerpApi calls = origins × destinations × cabins × dates, capped at
    MAX_CALLS_PER_SCAN to protect the monthly quota. When over cap, dates are
    reduced to 1 first, then (origin, destination) pairs are trimmed keeping
    the first origin (user's primary airport) as priority.

    Returns:
      best_prices: list of cheapest overall per (origin, dest, cabin, date)
      all_offers:  dict keyed by (origin, dest, cabin, date_str) →
                   list of individual offers per airline+stops
    """
    scan_dates = _date_range(date_from, date_to, max_dates=3)

    # ── Quota protection: cap total API calls ────────────────────────────────
    all_od_pairs = [(o, d) for o in origins for d in destinations]
    total = len(all_od_pairs) * len(cabin_classes) * len(scan_dates)

    if total > MAX_CALLS_PER_SCAN:
        # Step 1: reduce to 1 date (midpoint)
        scan_dates = [scan_dates[len(scan_dates) // 2]]
        total = len(all_od_pairs) * len(cabin_classes) * len(scan_dates)

    if total > MAX_CALLS_PER_SCAN:
        # Step 2: trim origin-dest pairs — first origin (primary airport) gets priority
        max_pairs = max(1, MAX_CALLS_PER_SCAN // len(cabin_classes))
        all_od_pairs = all_od_pairs[:max_pairs]
        total = len(all_od_pairs) * len(cabin_classes) * len(scan_dates)

    effective_origins = list(dict.fromkeys(o for o, d in all_od_pairs))
    effective_dests   = list(dict.fromkeys(d for o, d in all_od_pairs))

    if total < len(origins) * len(destinations) * len(cabin_classes) * 3:
        logger.warning(
            "scan_capped",
            route_id=str(route_id),
            original_combos=len(origins) * len(destinations) * len(cabin_classes) * 3,
            capped_to=total,
            dates=[d.isoformat() for d in scan_dates],
            od_pairs=len(all_od_pairs),
        )

    results: dict[str, Any] = {
        "route_id":      str(route_id),
        "origins":       effective_origins,
        "destinations":  effective_dests,
        "cabin_classes": cabin_classes,
        "dates_scanned": [d.isoformat() for d in scan_dates],
        "scan_type":     "full" if deep else "quick",
        "sources":       {"serpapi": 0},
        "best_prices":   [],
        "all_offers":    {},   # keyed by (origin, dest, cabin, date_str)
    }

    tasks = [
        _run_serpapi(
            route_id, origin, dest, dep_date, cabin, db,
            deep=deep,
            trip_type=trip_type,
            return_date_offset_days=return_date_offset_days,
        )
        for origin, dest in all_od_pairs
        for cabin in cabin_classes
        for dep_date in scan_dates
    ]

    task_results = await asyncio.gather(*tasks, return_exceptions=True)

    google_prices: list[dict] = []
    all_offers: dict[tuple, list[dict]] = {}

    for res in task_results:
        if isinstance(res, Exception):
            logger.warning("scan_task_error", error=str(res))
            continue
        if not res:
            continue
        price = res.get("price")
        if price and price.get("price_usd", 0) > 0:
            google_prices.append(price)
            key = (price["origin"], price["destination"], price["cabin_class"], str(price["departure_date"]))
            all_offers[key] = price.get("offers", [])

    results["sources"]["serpapi"] = len(google_prices)
    results["best_prices"] = _compute_best_prices(google_prices)
    # Serialise tuple keys to strings for JSON-safe passing to pipeline
    results["all_offers"] = {
        f"{o}|{d}|{c}|{dt}": offers
        for (o, d, c, dt), offers in all_offers.items()
    }

    logger.info(
        "scan_complete",
        route_id=str(route_id),
        type="full" if deep else "quick",
        prices_found=len(google_prices),
        best_count=len(results["best_prices"]),
        offer_groups=sum(len(v) for v in all_offers.values()),
    )
    return results


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _run_serpapi(
    route_id: uuid.UUID,
    origin: str,
    dest: str,
    dep_date: date,
    cabin: str,
    db: AsyncSession,
    deep: bool = True,
    trip_type: str = "ONE_WAY",
    return_date_offset_days: int | None = None,
) -> dict | None:
    return_date = (dep_date + timedelta(days=return_date_offset_days)) if (
        trip_type == "ROUND_TRIP" and return_date_offset_days
    ) else None

    price = await serpapi_client.search_flights(
        origin, dest, dep_date, cabin,
        deep=deep, trip_type=trip_type, return_date=return_date,
    )
    if price and price.get("price_usd", 0) > 0:
        # Store best price without the offers list (not a GooglePrice column)
        price_row = {k: v for k, v in price.items() if k != "offers"}
        await store_google_price(route_id, price_row, db)
    return {"price": price}


def _date_range(date_from: date, date_to: date, max_dates: int = 5) -> list[date]:
    """Returns up to max_dates evenly-spaced dates within the range."""
    delta = (date_to - date_from).days
    if delta <= 0:
        return [date_from]
    step = max(1, delta // (max_dates - 1)) if max_dates > 1 else delta
    dates, current = [], date_from
    while current <= date_to and len(dates) < max_dates:
        dates.append(current)
        current += timedelta(days=step)
    return dates


def _compute_best_prices(prices: list[dict]) -> list[dict]:
    """Return the best (lowest) price per (origin, dest, cabin, date)."""
    best: dict[tuple, dict] = {}
    for r in prices:
        if not r or not r.get("price_usd"):
            continue
        key = (r["origin"], r["destination"], r["cabin_class"], str(r["departure_date"]))
        if key not in best or r["price_usd"] < best[key]["price_usd"]:
            best[key] = {
                "origin":              r["origin"],
                "destination":         r["destination"],
                "cabin_class":         r["cabin_class"],
                "departure_date":      str(r["departure_date"]),
                "price_usd":           r["price_usd"],
                "price_level":         r.get("price_level"),
                "typical_price_low":   r.get("typical_price_low"),
                "typical_price_high":  r.get("typical_price_high"),
                "airline_codes":       r.get("airline_codes", []),
                "is_direct":           r.get("is_direct", False),
                "source":              "serpapi",
            }
    return sorted(best.values(), key=lambda x: x["price_usd"])
