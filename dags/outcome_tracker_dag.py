"""
Outcome Tracker DAG — Phase 6.5.6
Daily 4 AM. Labels old DealAnalysis rows with their actual forward outcomes
(did_drop_5/10/20pct, days_to_min, max_drop_pct).

Looks back over deals 14-60 days old (so we have full forward window).
Idempotent: only labels deals not yet in deal_outcomes.
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
    "retry_delay": timedelta(minutes=10),
}


def label_outcomes(**context):
    asyncio.run(_async_run())


async def _async_run():
    from app.database import AsyncSessionLocal
    from app.services.outcome_tracker import label_pending_deals

    async with AsyncSessionLocal() as db:
        labeled = await label_pending_deals(db, horizon_days=14, max_age_days=60)
        await db.commit()
        log.info("outcome_tracker_dag_labeled", extra={"count": labeled})


with DAG(
    dag_id="outcome_tracker",
    description="Daily forward-outcome labeling for ML weight training",
    default_args=DEFAULT_ARGS,
    start_date=datetime(2026, 4, 1),
    schedule_interval="0 4 * * *",   # Daily 4 AM UTC
    catchup=False,
    max_active_runs=1,
    tags=["intelligence", "ml"],
) as dag:
    PythonOperator(
        task_id="label_outcomes",
        python_callable=label_outcomes,
    )
