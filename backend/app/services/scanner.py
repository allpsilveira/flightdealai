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
import structlog
import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import serpapi_client
from app.services.ingestion import store_google_price

logger = structlog.get_logger(__name__)


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

    Returns:
      best_prices: list of cheapest overall per (origin, dest, cabin, date)
      all_offers:  dict keyed by (origin, dest, cabin, date_str) →
                   list of individual offers per airline+stops
    """
    scan_dates = _date_range(date_from, date_to, max_dates=5)

    results: dict[str, Any] = {
        "route_id":      str(route_id),
        "origins":       origins,
        "destinations":  destinations,
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
        for origin in origins
        for dest in destinations
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
