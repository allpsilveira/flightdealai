"""
Airflow task: fetch SearchApi.io (Google Flights) data.
Pushes XCom: google_result (dict | None) for the best (origin, dest) pair.
"""
import asyncio
import logging
from datetime import date
import uuid
from datetime import datetime, timezone

log = logging.getLogger(__name__)


def run(route_id: str, origins: list[str], destinations: list[str],
        cabin_class: str, **context) -> None:
    asyncio.run(_async_run(route_id, origins, destinations, cabin_class, context))


async def _async_run(route_id: str, origins: list[str], destinations: list[str],
                     cabin_class: str, context: dict) -> None:
    from app.services import searchapi_client
    from app.database import AsyncSessionLocal
    from app.models.prices import GooglePrice

    ti = context["ti"]
    scan_date = date.today()
    best_result = None

    async with AsyncSessionLocal() as db:
        for origin in origins:
            for dest in destinations:
                result = await searchapi_client.search_flights(origin, dest, scan_date, cabin_class)
                if not result:
                    continue
                if best_result is None or result["price_usd"] < best_result["price_usd"]:
                    best_result = result
                record = GooglePrice(
                    time=datetime.now(timezone.utc),
                    id=uuid.uuid4(),
                    route_id=uuid.UUID(route_id),
                    **{k: v for k, v in result.items() if k != "raw_response"},
                )
                db.add(record)
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            log.error("searchapi: DB write failed: %s", exc)

    # Push minimal XCom payload (not the full raw response)
    if best_result:
        ti.xcom_push(key="google_result", value={
            "price_usd":          best_result["price_usd"],
            "price_level":        best_result.get("price_level"),
            "typical_price_low":  best_result.get("typical_price_low"),
            "typical_price_high": best_result.get("typical_price_high"),
            "origin":             best_result["origin"],
            "destination":        best_result["destination"],
        })
    else:
        ti.xcom_push(key="google_result", value=None)
        log.warning("searchapi: no results for route %s", route_id)
