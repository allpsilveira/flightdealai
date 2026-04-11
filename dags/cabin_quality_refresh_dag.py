"""
Cabin quality refresh DAG — runs monthly.
Uses Claude AI to review and suggest updates to the cabin_quality DB entries.
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
    "retry_delay": timedelta(minutes=30),
}


def review_cabin_quality(**context):
    asyncio.run(_async_run())


async def _async_run():
    """
    Phase 3: Claude reviews cabin_quality entries for staleness and suggests updates.
    For now, logs the current state.
    """
    from app.database import AsyncSessionLocal
    from app.models.cabin_quality import CabinQuality
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(CabinQuality).order_by(CabinQuality.quality_score.desc()))
        cabins = result.scalars().all()
        log.info("cabin_quality: %d entries in DB", len(cabins))


with DAG(
    dag_id="cabin_quality_refresh",
    default_args=DEFAULT_ARGS,
    schedule_interval="0 9 1 * *",   # 1st of every month at 9 AM
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["cabin", "monthly"],
) as dag:
    PythonOperator(
        task_id="review_cabin_quality",
        python_callable=review_cabin_quality,
    )
