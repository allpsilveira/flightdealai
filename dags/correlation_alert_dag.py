"""
Correlation Alert DAG — Phase 6.5.6
Every 2h. Scans recent (last 2h) significant price_drop events and dispatches
informational cascade events on routes that are historically correlated
(|Pearson r| >= 0.7 over 60d daily series).

Dedup: skips routes that already received a cascade event for this source
within the last 24h.
"""
import asyncio
import logging
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

log = logging.getLogger(__name__)

DEFAULT_ARGS = {
    "owner":   "flightdeal",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}


def dispatch_cascades(**context):
    asyncio.run(_async_run())


async def _async_run():
    from app.database import AsyncSessionLocal
    from app.services.correlation_alerts import dispatch_correlation_alerts

    async with AsyncSessionLocal() as db:
        created = await dispatch_correlation_alerts(db)
        await db.commit()
        log.info("correlation_alert_dag_dispatched", extra={"cascades": created})


with DAG(
    dag_id="correlation_alerts",
    description="Cascade price_drop events to historically correlated routes",
    default_args=DEFAULT_ARGS,
    start_date=datetime(2026, 4, 1),
    schedule_interval="0 */2 * * *",   # Every 2 hours
    catchup=False,
    max_active_runs=1,
    tags=["intelligence", "alerts"],
) as dag:
    PythonOperator(
        task_id="dispatch_cascades",
        python_callable=dispatch_cascades,
    )
