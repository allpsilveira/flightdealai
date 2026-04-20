"""
Weight Learning DAG — Phase 6.5.6
Weekly Sundays 2 AM. Trains a Random Forest classifier on (deal sub-scores
→ did_drop_10pct) using the last 90 days of labeled outcomes.

If model AUC >= 0.6, deactivates prior active weights and activates the new ones.
Otherwise leaves the prior model in place (graceful degradation).
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
    "retry_delay": timedelta(minutes=15),
}


def train_weights(**context):
    asyncio.run(_async_run())


async def _async_run():
    from app.database import AsyncSessionLocal
    from app.services.weight_learner import train_and_store_weights

    async with AsyncSessionLocal() as db:
        result = await train_and_store_weights(db)
        await db.commit()
        log.info("weight_learning_dag_result", extra={"result": result})


with DAG(
    dag_id="weight_learning",
    description="Weekly retrain of scoring engine weights from forward outcomes",
    default_args=DEFAULT_ARGS,
    start_date=datetime(2026, 4, 1),
    schedule_interval="0 2 * * 0",   # Sundays 2 AM UTC
    catchup=False,
    max_active_runs=1,
    tags=["intelligence", "ml"],
) as dag:
    PythonOperator(
        task_id="train_weights",
        python_callable=train_weights,
    )
