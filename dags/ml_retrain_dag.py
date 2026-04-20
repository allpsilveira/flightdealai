"""
ML retrain DAG — Phase 4.

Schedule: weekly (Sunday 03:00 UTC). Re-fits:
  - per (route, cabin) AutoARIMA forecaster
  - per (route, cabin) IsolationForest anomaly detector
  - global LightGBM expected-price model

All artifacts written to MODEL_STORE (./ml_models/). Tasks tolerate missing
data — if a route has < N observations, it's silently skipped.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

log = logging.getLogger(__name__)

DEFAULT_ARGS = {
    "owner": "flightdeal",
    "retries": 1,
    "retry_delay": timedelta(minutes=15),
}


# ── Data loaders ──────────────────────────────────────────────────────────────
async def _load_route_series(db, route_id, cabin):
    """Daily-min price series for one (route, cabin) over last 180 days."""
    from sqlalchemy import text
    sql = text("""
        SELECT date_trunc('day', timestamp)::date AS d,
               MIN(price_usd)                     AS p
          FROM google_prices
         WHERE route_id = :rid
           AND cabin_class = :cab
           AND timestamp > NOW() - INTERVAL '180 days'
         GROUP BY 1
         ORDER BY 1
    """)
    res = await db.execute(sql, {"rid": str(route_id), "cab": cabin})
    return [{"date": row.d, "price": float(row.p)} for row in res]


async def _load_anomaly_rows(db, route_id, cabin):
    """Per-scan rows with engineered features for the anomaly detector."""
    from sqlalchemy import text
    sql = text("""
        SELECT timestamp, price_usd, departure_date
          FROM google_prices
         WHERE route_id = :rid
           AND cabin_class = :cab
           AND timestamp > NOW() - INTERVAL '180 days'
    """)
    res = await db.execute(sql, {"rid": str(route_id), "cab": cabin})
    rows = []
    for r in res:
        ts = r.timestamp
        dep = r.departure_date
        days_out = (dep - ts.date()).days if dep else 0
        rows.append({
            "price": float(r.price_usd),
            "dow": ts.weekday(),
            "days_out": max(days_out, 0),
            "month": ts.month,
        })
    return rows


async def _load_global_rows(db):
    """Global training set for expected-price LightGBM."""
    from sqlalchemy import text
    sql = text("""
        SELECT g.route_id, g.cabin_class, g.airline_code,
               g.timestamp, g.price_usd, g.departure_date,
               r.origins, r.destinations
          FROM google_prices g
          JOIN routes r ON r.id = g.route_id
         WHERE g.timestamp > NOW() - INTERVAL '180 days'
    """)
    res = await db.execute(sql)
    rows = []
    for r in res:
        ts = r.timestamp
        dep = r.departure_date
        rows.append({
            "origin": (r.origins or [None])[0],
            "destination": (r.destinations or [None])[0],
            "cabin_class": r.cabin_class,
            "airline_code": r.airline_code or "_unk",
            "days_out": max((dep - ts.date()).days, 0) if dep else 0,
            "dow": ts.weekday(),
            "month": ts.month,
            "price": float(r.price_usd),
        })
    return rows


# ── Tasks ─────────────────────────────────────────────────────────────────────
def retrain_forecasters(**_):
    asyncio.run(_retrain_forecasters())


async def _retrain_forecasters():
    from app.database import AsyncSessionLocal
    from app.services.ml import forecaster
    from sqlalchemy import select
    from app.models.route import Route

    fitted, skipped = 0, 0
    async with AsyncSessionLocal() as db:
        routes = (await db.execute(select(Route).where(Route.is_active.is_(True)))).scalars().all()
        for route in routes:
            for cabin in route.cabin_classes or []:
                series = await _load_route_series(db, route.id, cabin)
                model = forecaster.fit_route(series)
                if model:
                    forecaster.save(str(route.id), cabin, model)
                    fitted += 1
                else:
                    skipped += 1
    log.info("forecaster retrain done — fitted=%s skipped=%s", fitted, skipped)


def retrain_anomaly(**_):
    asyncio.run(_retrain_anomaly())


async def _retrain_anomaly():
    from app.database import AsyncSessionLocal
    from app.services.ml import anomaly
    from sqlalchemy import select
    from app.models.route import Route

    fitted, skipped = 0, 0
    async with AsyncSessionLocal() as db:
        routes = (await db.execute(select(Route).where(Route.is_active.is_(True)))).scalars().all()
        for route in routes:
            for cabin in route.cabin_classes or []:
                rows = await _load_anomaly_rows(db, route.id, cabin)
                model = anomaly.fit(rows)
                if model:
                    anomaly.save(str(route.id), cabin, model)
                    fitted += 1
                else:
                    skipped += 1
    log.info("anomaly retrain done — fitted=%s skipped=%s", fitted, skipped)


def retrain_expected_price(**_):
    asyncio.run(_retrain_expected_price())


async def _retrain_expected_price():
    from app.database import AsyncSessionLocal
    from app.services.ml import expected_price

    async with AsyncSessionLocal() as db:
        rows = await _load_global_rows(db)

    model = expected_price.fit(rows)
    if model:
        expected_price.save(model)
        log.info("expected_price retrain done — n=%s", model["n_observations"])
    else:
        log.info("expected_price retrain skipped — insufficient rows (%s)", len(rows))


# ── DAG ───────────────────────────────────────────────────────────────────────
with DAG(
    dag_id="ml_retrain",
    description="Weekly retrain: forecasters, anomaly detectors, expected-price",
    default_args=DEFAULT_ARGS,
    schedule_interval="0 3 * * 0",   # Sunday 03:00 UTC
    start_date=datetime(2026, 4, 1),
    catchup=False,
    max_active_runs=1,
    tags=["ml", "weekly"],
) as dag:

    t_forecast = PythonOperator(
        task_id="retrain_forecasters",
        python_callable=retrain_forecasters,
    )
    t_anom = PythonOperator(
        task_id="retrain_anomaly",
        python_callable=retrain_anomaly,
    )
    t_expected = PythonOperator(
        task_id="retrain_expected_price",
        python_callable=retrain_expected_price,
    )

    # Independent — run in parallel
    [t_forecast, t_anom, t_expected]
