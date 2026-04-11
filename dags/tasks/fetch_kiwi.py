"""
Airflow task: fetch Kiwi Tequila creative routing results.
Pushes XCom: kiwi_cheapest_price (float | None).
"""
import asyncio
import logging
from datetime import date, timedelta
import uuid
from datetime import datetime, timezone

log = logging.getLogger(__name__)


def run(route_id: str, origins: list[str], destinations: list[str],
        cabin_class: str, **context) -> None:
    asyncio.run(_async_run(route_id, origins, destinations, cabin_class, context))


async def _async_run(route_id: str, origins: list[str], destinations: list[str],
                     cabin_class: str, context: dict) -> None:
    from app.services import kiwi_client
    from app.database import AsyncSessionLocal
    from app.models.prices import KiwiPrice

    ti = context["ti"]
    date_from = date.today()
    date_to   = date_from + timedelta(days=90)

    results = await kiwi_client.search_flights(
        origins, destinations, date_from, date_to, cabin_class
    )

    if not results:
        ti.xcom_push(key="kiwi_cheapest_price", value=None)
        return

    cheapest = min(results, key=lambda r: r["price_usd"])
    ti.xcom_push(key="kiwi_cheapest_price", value=cheapest["price_usd"])

    async with AsyncSessionLocal() as db:
        for r in results:
            record = KiwiPrice(
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
            log.error("kiwi: DB write failed: %s", exc)
