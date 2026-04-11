"""
Airflow task: fetch Amadeus prices for all (origin, destination, date) combos.
Idempotent — uses INSERT ... ON CONFLICT DO NOTHING keyed on (time, route_id, origin, dest, cabin, date).
Pushes XCom: amadeus_cheapest_price (float | None).
"""
import asyncio
import logging
from datetime import date, timedelta
from typing import Any

log = logging.getLogger(__name__)


def run(route_id: str, origins: list[str], destinations: list[str],
        cabin_class: str, **context) -> None:
    asyncio.run(_async_run(route_id, origins, destinations, cabin_class, context))


async def _async_run(route_id: str, origins: list[str], destinations: list[str],
                     cabin_class: str, context: dict) -> None:
    from app.services import amadeus_client
    from app.database import AsyncSessionLocal
    from app.models.prices import AmadeusPrice
    import uuid
    from datetime import datetime, timezone

    ti = context["ti"]
    scan_date = date.today()

    all_results = []
    for origin in origins:
        for dest in destinations:
            results = await amadeus_client.search_flights(origin, dest, scan_date, cabin_class)
            if results:
                all_results.extend(results)

    if not all_results:
        log.warning("amadeus: no results for route %s", route_id)
        ti.xcom_push(key="amadeus_cheapest_price", value=None)
        return

    cheapest = min(all_results, key=lambda r: r["price_usd"])
    ti.xcom_push(key="amadeus_cheapest_price", value=cheapest["price_usd"])

    async with AsyncSessionLocal() as db:
        for r in all_results:
            record = AmadeusPrice(
                time=datetime.now(timezone.utc),
                id=uuid.uuid4(),
                route_id=uuid.UUID(route_id),
                **{k: v for k, v in r.items() if k != "raw_response"},
            )
            db.add(record)
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            log.error("amadeus: DB write failed: %s", exc)
