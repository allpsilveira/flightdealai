"""
Stats refresh DAG — triggered by new price data.
Manually refreshes the continuous aggregate views when needed (TimescaleDB auto-refreshes,
but this DAG provides an on-demand refresh path for the cold-start period).
"""
import asyncio
import logging
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

log = logging.getLogger(__name__)

DEFAULT_ARGS = {
    "owner":   "flightdeal",
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}


def refresh_continuous_aggregates(**context):
    asyncio.run(_async_run())


async def _async_run():
    from app.database import AsyncSessionLocal
    from sqlalchemy import text

    views = [
        "amadeus_price_hourly",
        "google_price_hourly",
        "kiwi_price_hourly",
        "price_daily_stats",
    ]

    async with AsyncSessionLocal() as db:
        for view in views:
            try:
                await db.execute(
                    text(f"CALL refresh_continuous_aggregate('{view}', NULL, NULL);")
                )
                await db.commit()
                log.info("refreshed: %s", view)
            except Exception as exc:
                log.warning("refresh failed for %s: %s", view, exc)


with DAG(
    dag_id="stats_refresh",
    default_args=DEFAULT_ARGS,
    schedule_interval="0 */6 * * *",   # Every 6h as backup; primary is TimescaleDB policy
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["stats", "timescaledb"],
) as dag:
    PythonOperator(
        task_id="refresh_continuous_aggregates",
        python_callable=refresh_continuous_aggregates,
    )
