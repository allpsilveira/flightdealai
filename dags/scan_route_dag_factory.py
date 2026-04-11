"""
DAG factory — dynamically generates one DAG per active (route, cabin_class) pair.
Reads active routes from the FlightDeal DB at import time (every Airflow scheduler cycle).

DAG ID format: scan_{route_id_short}_{cabin_class_lower}
e.g.:  scan_a1b2c3d4_business
"""
import hashlib
import logging
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import BranchPythonOperator, PythonOperator
from airflow.utils.trigger_rule import TriggerRule

from dags.tasks import (
    fetch_amadeus,
    fetch_searchapi,
    fetch_kiwi,
    fetch_duffel,
    fetch_awards,
    cross_reference,
    score_deal,
    ai_analysis,
    dispatch_alerts,
    update_priority,
)

log = logging.getLogger(__name__)

DEFAULT_ARGS = {
    "owner":            "flightdeal",
    "retries":          3,
    "retry_delay":      timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "depends_on_past":  False,
    "email_on_failure": False,
}


def _get_active_routes() -> list[dict]:
    """Reads active routes from the DB. Returns [] on connection failure."""
    try:
        import psycopg2
        import os
        conn = psycopg2.connect(os.environ["DATABASE_URL"].replace("+asyncpg", "").replace("+psycopg2", ""))
        cur = conn.cursor()
        cur.execute("""
            SELECT id::text, name, origins, destinations, cabin_classes,
                   date_from, date_to, priority_tier
            FROM routes
            WHERE is_active = true
        """)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        cur.close()
        conn.close()
        return rows
    except Exception as exc:
        log.warning("Could not load routes from DB: %s", exc)
        return []


def _schedule_for_tier(tier: str) -> str:
    """HOT routes scan every 2h, WARM every 4h, COLD every 8h."""
    return {"HOT": "0 */2 * * *", "WARM": "0 */4 * * *", "COLD": "0 */8 * * *"}.get(tier, "0 */4 * * *")


def _make_dag(route: dict, cabin_class: str) -> DAG:
    route_id    = route["id"]
    short_id    = route_id.replace("-", "")[:8]
    dag_id      = f"scan_{short_id}_{cabin_class.lower()}"
    schedule    = _schedule_for_tier(route.get("priority_tier", "WARM"))
    origins     = route["origins"]
    destinations = route["destinations"]

    with DAG(
        dag_id=dag_id,
        default_args=DEFAULT_ARGS,
        schedule_interval=schedule,
        start_date=datetime(2026, 1, 1),
        catchup=False,
        tags=["scan", cabin_class.lower(), route.get("priority_tier", "WARM").lower()],
        doc_md=f"Auto-generated scan DAG for route '{route['name']}' — {cabin_class}",
        sla_miss_callback=None,
    ) as dag:

        # ── Tier 1 + 2 fetches (parallel) ─────────────────────────────────
        t_amadeus = PythonOperator(
            task_id="fetch_amadeus",
            python_callable=fetch_amadeus.run,
            op_kwargs={"route_id": route_id, "origins": origins,
                       "destinations": destinations, "cabin_class": cabin_class},
            sla=timedelta(minutes=5),
        )
        t_searchapi = PythonOperator(
            task_id="fetch_searchapi",
            python_callable=fetch_searchapi.run,
            op_kwargs={"route_id": route_id, "origins": origins,
                       "destinations": destinations, "cabin_class": cabin_class},
            sla=timedelta(minutes=5),
        )
        t_kiwi = PythonOperator(
            task_id="fetch_kiwi",
            python_callable=fetch_kiwi.run,
            op_kwargs={"route_id": route_id, "origins": origins,
                       "destinations": destinations, "cabin_class": cabin_class},
            sla=timedelta(minutes=5),
        )

        # ── Cross-reference (waits for all 3, continues if any succeed) ───
        t_xref = PythonOperator(
            task_id="cross_reference",
            python_callable=cross_reference.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
            trigger_rule=TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS,
        )

        # ── Score ──────────────────────────────────────────────────────────
        t_score = PythonOperator(
            task_id="score_deal",
            python_callable=score_deal.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
        )

        # ── Branch: score ≥ 50 → continue, else log_skip ──────────────────
        def _branch_on_score(**ctx):
            score = ctx["ti"].xcom_pull(task_ids="score_deal", key="score_total") or 0
            return "ai_analysis" if float(score) >= 50 else "log_skip"

        t_branch = BranchPythonOperator(
            task_id="branch_score",
            python_callable=_branch_on_score,
        )

        t_log_skip = PythonOperator(
            task_id="log_skip",
            python_callable=lambda **_: log.info("Score below 50, skipping enrichment"),
        )

        t_ai = PythonOperator(
            task_id="ai_analysis",
            python_callable=ai_analysis.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
        )

        # ── Branch: score ≥ 80 or GEM → enrich, else update dashboard ─────
        def _branch_on_action(**ctx):
            action  = ctx["ti"].xcom_pull(task_ids="score_deal", key="action") or "SKIP"
            is_gem  = ctx["ti"].xcom_pull(task_ids="score_deal", key="is_gem") or False
            if action in ("STRONG_BUY", "BUY") or is_gem:
                return "enrich_duffel"
            return "update_dashboard"

        t_branch2 = BranchPythonOperator(
            task_id="branch_action",
            python_callable=_branch_on_action,
            trigger_rule=TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS,
        )

        t_duffel = PythonOperator(
            task_id="enrich_duffel",
            python_callable=fetch_duffel.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
        )
        t_awards = PythonOperator(
            task_id="enrich_awards",
            python_callable=fetch_awards.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
            trigger_rule=TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS,
        )
        t_alerts = PythonOperator(
            task_id="dispatch_alerts",
            python_callable=dispatch_alerts.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
            trigger_rule=TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS,
        )
        t_dashboard = PythonOperator(
            task_id="update_dashboard",
            python_callable=lambda **_: log.info("Dashboard updated via DB write in score_deal"),
            trigger_rule=TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS,
        )
        t_priority = PythonOperator(
            task_id="update_priority",
            python_callable=update_priority.run,
            op_kwargs={"route_id": route_id},
            trigger_rule=TriggerRule.ALL_DONE,
        )

        # ── Wire up ────────────────────────────────────────────────────────
        [t_amadeus, t_searchapi, t_kiwi] >> t_xref >> t_score >> t_branch
        t_branch >> [t_ai, t_log_skip]
        t_ai >> t_branch2
        t_branch2 >> [t_duffel, t_dashboard]
        t_duffel >> t_awards >> t_alerts
        [t_alerts, t_dashboard, t_log_skip] >> t_priority

    return dag


# ── Generate all DAGs at import time ──────────────────────────────────────────
for _route in _get_active_routes():
    for _cabin in _route.get("cabin_classes", []):
        _dag = _make_dag(_route, _cabin)
        globals()[_dag.dag_id] = _dag
