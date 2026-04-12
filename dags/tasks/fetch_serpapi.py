"""
Airflow task: fetch SerpApi (Google Flights) data.
Replaces both fetch_amadeus and fetch_searchapi in the new 3-source stack.
Pushes XCom: google_result (dict | None).
"""
import asyncio
import logging
from datetime import date, datetime, timezone
import uuid

log = logging.getLogger(__name__)


def run(route_id: str, origins: list[str], destinations: list[str],
        cabin_class: str, deep: bool = True, **context) -> None:
    asyncio.run(_async_run(route_id, origins, destinations, cabin_class, deep, context))


async def _async_run(route_id: str, origins: list[str], destinations: list[str],
                     cabin_class: str, deep: bool, context: dict) -> None:
    from app.services import serpapi_client
    from app.services.ingestion import store_google_price
    from app.database import AsyncSessionLocal

    ti = context["ti"]
    scan_date = date.today()
    best_result = None

    async with AsyncSessionLocal() as db:
        for origin in origins:
            for dest in destinations:
                result = await serpapi_client.search_flights(
                    origin, dest, scan_date, cabin_class, deep=deep
                )
                if not result or not result.get("price_usd"):
                    continue
                if best_result is None or result["price_usd"] < best_result["price_usd"]:
                    best_result = result
                await store_google_price(uuid.UUID(route_id), result, db)

    if best_result:
        ti.xcom_push(key="google_result", value={
            "price_usd":          best_result["price_usd"],
            "price_level":        best_result.get("price_level"),
            "typical_price_low":  best_result.get("typical_price_low"),
            "typical_price_high": best_result.get("typical_price_high"),
            "price_history":      best_result.get("price_history"),
            "airline_codes":      best_result.get("airline_codes", []),
            "origin":             best_result["origin"],
            "destination":        best_result["destination"],
        })
    else:
        ti.xcom_push(key="google_result", value=None)
        log.warning("serpapi: no results for route %s", route_id)
