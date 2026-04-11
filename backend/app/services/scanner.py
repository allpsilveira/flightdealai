"""
Scanner — main scan pipeline for Phase 2.
Calls Tier 1 (Amadeus + Kiwi) and Tier 2 (SearchApi) clients,
stores results to TimescaleDB, and returns a scan summary.
"""
import asyncio
import structlog
import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import amadeus_client, searchapi_client, kiwi_client
from app.services.ingestion import (
    store_amadeus_prices,
    store_google_price,
    store_kiwi_prices,
)

logger = structlog.get_logger(__name__)


async def scan_route(
    route_id: uuid.UUID,
    origins: list[str],
    destinations: list[str],
    cabin_classes: list[str],
    date_from: date,
    date_to: date,
    db: AsyncSession,
    include_searchapi: bool = True,
) -> dict[str, Any]:
    """
    Full Tier 1 + Tier 2 scan for a route.
    Runs all API calls concurrently, stores results, returns summary.
    """
    scan_dates = _date_range(date_from, date_to, max_dates=5)
    results: dict[str, Any] = {
        "route_id":    str(route_id),
        "origins":     origins,
        "destinations": destinations,
        "cabin_classes": cabin_classes,
        "dates_scanned": [d.isoformat() for d in scan_dates],
        "sources":     {},
        "best_prices": [],
    }

    tasks = []

    # ── Tier 1: Amadeus (one call per origin×dest×cabin×date) ─────────────────
    for origin in origins:
        for dest in destinations:
            for cabin in cabin_classes:
                for dep_date in scan_dates:
                    tasks.append(
                        _run_amadeus(route_id, origin, dest, dep_date, cabin, db)
                    )

    # ── Tier 1: Kiwi (one call per cabin×date covers all origins+dests) ───────
    for cabin in cabin_classes:
        for dep_date in scan_dates:
            tasks.append(
                _run_kiwi(route_id, origins, destinations, dep_date, dep_date, cabin, db)
            )

    # ── Tier 2: SearchApi (one call per origin×dest×cabin) ───────────────────
    if include_searchapi:
        for origin in origins:
            for dest in destinations:
                for cabin in cabin_classes:
                    tasks.append(
                        _run_searchapi(route_id, origin, dest, scan_dates[0], cabin, db)
                    )

    # Run all concurrently
    task_results = await asyncio.gather(*tasks, return_exceptions=True)

    # Aggregate results
    amadeus_prices, kiwi_prices, google_prices = [], [], []
    for res in task_results:
        if isinstance(res, Exception):
            logger.warning("scan_task_error", error=str(res))
            continue
        if res and res.get("source") == "amadeus":
            amadeus_prices.extend(res.get("prices", []))
        elif res and res.get("source") == "kiwi":
            kiwi_prices.extend(res.get("prices", []))
        elif res and res.get("source") == "google":
            google_prices.append(res.get("price"))

    results["sources"]["amadeus"] = len(amadeus_prices)
    results["sources"]["kiwi"]    = len(kiwi_prices)
    results["sources"]["google"]  = len([p for p in google_prices if p])

    # Compute best prices per (origin, dest, cabin, date)
    results["best_prices"] = _compute_best_prices(amadeus_prices, kiwi_prices, google_prices)

    logger.info(
        "scan_complete",
        route_id=str(route_id),
        amadeus=results["sources"]["amadeus"],
        kiwi=results["sources"]["kiwi"],
        google=results["sources"]["google"],
        best_count=len(results["best_prices"]),
    )
    return results


# ── Internal task runners ──────────────────────────────────────────────────────

async def _run_amadeus(
    route_id, origin, dest, dep_date, cabin, db
) -> dict | None:
    prices = await amadeus_client.search_flights(origin, dest, dep_date, cabin)
    if prices:
        await store_amadeus_prices(route_id, prices, db)
    return {"source": "amadeus", "prices": prices or []}


async def _run_kiwi(
    route_id, origins, dests, date_from, date_to, cabin, db
) -> dict | None:
    prices = await kiwi_client.search_flights(origins, dests, date_from, date_to, cabin)
    if prices:
        await store_kiwi_prices(route_id, prices, db)
    return {"source": "kiwi", "prices": prices or []}


async def _run_searchapi(
    route_id, origin, dest, dep_date, cabin, db
) -> dict | None:
    price = await searchapi_client.search_flights(origin, dest, dep_date, cabin)
    if price:
        await store_google_price(route_id, price, db)
    return {"source": "google", "price": price}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _date_range(date_from: date, date_to: date, max_dates: int = 5) -> list[date]:
    """Returns up to max_dates evenly-spaced dates between date_from and date_to."""
    delta = (date_to - date_from).days
    if delta <= 0:
        return [date_from]
    step = max(1, delta // (max_dates - 1)) if max_dates > 1 else delta
    dates = []
    current = date_from
    while current <= date_to and len(dates) < max_dates:
        dates.append(current)
        current += timedelta(days=step)
    return dates


def _compute_best_prices(
    amadeus: list[dict],
    kiwi: list[dict],
    google: list[dict | None],
) -> list[dict]:
    """Find the best (lowest) price per (origin, dest, cabin, date) across all sources."""
    best: dict[tuple, dict] = {}

    def _update(key, price_usd, source, record):
        if price_usd and price_usd > 0:
            if key not in best or price_usd < best[key]["price_usd"]:
                best[key] = {
                    "origin":         key[0],
                    "destination":    key[1],
                    "cabin_class":    key[2],
                    "departure_date": key[3],
                    "price_usd":      price_usd,
                    "source":         source,
                    "airline_codes":  record.get("airline_codes", []),
                }

    for r in amadeus:
        key = (r["origin"], r["destination"], r["cabin_class"], str(r["departure_date"]))
        _update(key, r.get("price_usd"), "amadeus", r)

    for r in kiwi:
        key = (r["origin"], r["destination"], r["cabin_class"], str(r["departure_date"]))
        _update(key, r.get("price_usd"), "kiwi", r)

    for r in google:
        if r:
            key = (r["origin"], r["destination"], r["cabin_class"], str(r["departure_date"]))
            _update(key, r.get("price_usd"), "google", r)

    return sorted(best.values(), key=lambda x: x["price_usd"])
