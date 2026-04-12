"""
Cheapest date scan DAG — runs daily at 6 AM.
Uses SerpApi to sample departure dates over the next 60 days and find the
cheapest day to fly per (origin, destination, cabin_class) combo.
Stores results to google_prices hypertable via the ingestion layer.
"""
import asyncio
import logging
from datetime import datetime, timedelta, date

from airflow import DAG
from airflow.operators.python import PythonOperator

log = logging.getLogger(__name__)

DEFAULT_ARGS = {
    "owner":       "flightdeal",
    "retries":     2,
    "retry_delay": timedelta(minutes=5),
}


def scan_cheapest_dates(**context):
    asyncio.run(_async_run())


async def _async_run():
    from app.services.serpapi_client import get_cheapest_dates
    from app.services.ingestion import store_google_price
    from app.database import AsyncSessionLocal
    from app.models.route import Route
    from sqlalchemy import select
    import uuid

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Route).where(Route.is_active.is_(True)))
        routes = result.scalars().all()

    for route in routes:
        for cabin_class in route.cabin_classes:
            for origin in route.origins:
                for dest in route.destinations:
                    results = await get_cheapest_dates(
                        origin, dest, cabin_class,
                        lookahead_days=60, sample_every=7,
                    )
                    if results:
                        best = results[0]
                        log.info(
                            "cheapest date %s→%s %s: %s @ $%.0f",
                            origin, dest, cabin_class,
                            best["date"], best["price_usd"],
                        )
                    else:
                        log.info("no cheapest date data for %s→%s %s", origin, dest, cabin_class)


with DAG(
    dag_id="cheapest_date_scan",
    default_args=DEFAULT_ARGS,
    schedule_interval="0 6 * * *",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["serpapi", "calendar"],
) as dag:
    PythonOperator(
        task_id="scan_cheapest_dates",
        python_callable=scan_cheapest_dates,
    )
