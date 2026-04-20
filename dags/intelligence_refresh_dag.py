"""
Intelligence Refresh DAG — Phase 6.5.6
Every 6h. Recomputes the data-science intelligence layer (price regime, cycle
detection, forecast, KNN pattern matching, cross-route correlations, DOW
patterns, lead-time analysis, verdict) for every active route × cabin × first
upcoming departure date.

Independent of scans — keeps intelligence fresh even if a route is in WARM tier
and only scans every 4h. Persists results to price_predictions, price_regimes.
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


def refresh_intelligence(**context):
    asyncio.run(_async_run())


async def _async_run():
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.route import Route
    from app.services.intelligence import run_intelligence

    async with AsyncSessionLocal() as db:
        routes = (await db.execute(
            select(Route).where(Route.is_active == True)  # noqa: E712
        )).scalars().all()

        refreshed = 0
        for route in routes:
            origins      = route.origins or []
            destinations = route.destinations or []
            cabins       = route.cabin_classes or []
            if not (origins and destinations and cabins):
                continue
            origin = origins[0]
            dest   = destinations[0]
            cabin  = cabins[0]
            try:
                await run_intelligence(
                    db, route.id, origin, dest, cabin,
                    user_id=route.user_id, persist=True,
                )
                refreshed += 1
            except Exception as exc:
                log.warning(
                    "intelligence_refresh_route_failed",
                    extra={"route_id": str(route.id), "error": str(exc)},
                )

        await db.commit()
        log.info("intelligence_refresh_dag_done", extra={"routes": refreshed})


with DAG(
    dag_id="intelligence_refresh",
    description="Recompute price regime/cycle/forecast/correlation per route every 6h",
    default_args=DEFAULT_ARGS,
    start_date=datetime(2026, 4, 1),
    schedule_interval="0 */6 * * *",   # Every 6 hours
    catchup=False,
    max_active_runs=1,
    tags=["intelligence"],
) as dag:
    PythonOperator(
        task_id="refresh_intelligence",
        python_callable=refresh_intelligence,
    )
