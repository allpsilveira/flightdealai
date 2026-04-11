"""
Cheapest date scan DAG — runs daily at 6 AM.
Uses Amadeus Flight Dates endpoint to find the cheapest day in the next 30 days per route.
"""
import asyncio
import logging
from datetime import datetime, timedelta, date

from airflow import DAG
from airflow.operators.python import PythonOperator

log = logging.getLogger(__name__)

DEFAULT_ARGS = {
    "owner":   "flightdeal",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}


def scan_cheapest_dates(**context):
    asyncio.run(_async_run())


async def _async_run():
    from app.services.amadeus_client import get_cheapest_dates
    from app.database import AsyncSessionLocal
    from app.models.route import Route
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Route).where(Route.is_active.is_(True)))
        routes = result.scalars().all()

    for route in routes:
        for origin in route.origins:
            for dest in route.destinations:
                dates = await get_cheapest_dates(origin, dest, date.today())
                if dates:
                    log.info("cheapest dates %s→%s: %s entries", origin, dest, len(dates))


with DAG(
    dag_id="cheapest_date_scan",
    default_args=DEFAULT_ARGS,
    schedule_interval="0 6 * * *",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["amadeus", "calendar"],
) as dag:
    PythonOperator(
        task_id="scan_cheapest_dates",
        python_callable=scan_cheapest_dates,
    )
