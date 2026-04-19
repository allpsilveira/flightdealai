"""
DAG factory — dynamically generates one DAG per active (route, cabin_class) pair.
Reads active routes from the FlightDeal DB at import time (every Airflow scheduler cycle).

Sources: SerpApi (scheduled) → Duffel + Seats.aero (on-demand when score ≥ 5.0)

DAG ID format: scan_{route_id_short}_{cabin_class_lower}
"""
import logging
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import BranchPythonOperator, PythonOperator
from airflow.utils.trigger_rule import TriggerRule

from dags.tasks import (
    fetch_serpapi,
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
    "owner":                     "flightdeal",
    "retries":                   3,
    "retry_delay":               timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "depends_on_past":           False,
    "email_on_failure":          False,
}


def _get_active_routes() -> list[dict]:
    """Reads active routes from the DB. Returns [] on connection failure."""
    try:
        import psycopg2, os
        url = os.environ["DATABASE_URL"].replace("+asyncpg", "").replace("+psycopg2", "")
        conn = psycopg2.connect(url)
        cur  = conn.cursor()
        cur.execute("""
            SELECT id::text, name, origins, destinations, cabin_classes,
                   date_from, date_to, priority_tier
            FROM routes WHERE is_active = true
        """)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        cur.close(); conn.close()
        return rows
    except Exception as exc:
        log.warning("Could not load routes from DB: %s", exc)
        return []


def _schedule_for_tier(tier: str) -> str:
    """HOT = every 2h, WARM = every 4h, COLD = every 8h."""
    return {"HOT": "0 */2 * * *", "WARM": "0 */4 * * *", "COLD": "0 */8 * * *"}.get(tier, "0 */4 * * *")


def _make_dag(route: dict, cabin_class: str) -> DAG:
    route_id     = route["id"]
    short_id     = route_id.replace("-", "")[:8]
    dag_id       = f"scan_{short_id}_{cabin_class.lower()}"
    schedule     = _schedule_for_tier(route.get("priority_tier", "WARM"))
    origins      = route["origins"]
    destinations = route["destinations"]

    with DAG(
        dag_id=dag_id,
        default_args=DEFAULT_ARGS,
        schedule_interval=schedule,
        start_date=datetime(2026, 1, 1),
        catchup=False,
        tags=["scan", cabin_class.lower(), route.get("priority_tier", "WARM").lower()],
        doc_md=f"Scan DAG for route '{route['name']}' — {cabin_class}",
    ) as dag:

        # ── SerpApi fetch (Google Flights) ─────────────────────────────────
        t_serpapi = PythonOperator(
            task_id="fetch_serpapi",
            python_callable=fetch_serpapi.run,
            op_kwargs={
                "route_id":    route_id,
                "origins":     origins,
                "destinations": destinations,
                "cabin_class": cabin_class,
                "deep":        True,
            },
            sla=timedelta(minutes=5),
        )

        # ── Cross-reference (single source for now) ────────────────────────
        t_xref = PythonOperator(
            task_id="cross_reference",
            python_callable=cross_reference.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
        )

        # ── Score ──────────────────────────────────────────────────────────
        t_score = PythonOperator(
            task_id="score_deal",
            python_callable=score_deal.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
        )

        # ── Branch: score ≥ 3.0 → AI analysis, else skip ───────────────────
        def _branch_score(**ctx):
            score = ctx["ti"].xcom_pull(task_ids="score_deal", key="score_total") or 0
            return "ai_analysis" if float(score) >= 3.0 else "log_skip"

        t_branch = BranchPythonOperator(
            task_id="branch_score",
            python_callable=_branch_score,
        )
        t_log_skip = PythonOperator(
            task_id="log_skip",
            python_callable=lambda **_: log.info("Score < 3.0, skipping"),
        )

        # ── AI analysis ────────────────────────────────────────────────────
        t_ai = PythonOperator(
            task_id="ai_analysis",
            python_callable=ai_analysis.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
        )

        # ── Branch: BUY/GEM → enrich with Duffel + Awards ─────────────────
        def _branch_action(**ctx):
            action = ctx["ti"].xcom_pull(task_ids="score_deal", key="action") or "SKIP"
            is_gem = ctx["ti"].xcom_pull(task_ids="score_deal", key="is_gem") or False
            if action in ("STRONG_BUY", "BUY") or is_gem:
                return "enrich_duffel"
            return "update_dashboard"

        t_branch2 = BranchPythonOperator(
            task_id="branch_action",
            python_callable=_branch_action,
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
            python_callable=lambda **_: log.info("Dashboard updated via DB"),
            trigger_rule=TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS,
        )
        t_priority = PythonOperator(
            task_id="update_priority",
            python_callable=update_priority.run,
            op_kwargs={"route_id": route_id},
            trigger_rule=TriggerRule.ALL_DONE,
        )

        # ── Wire ───────────────────────────────────────────────────────────
        t_serpapi >> t_xref >> t_score >> t_branch
        t_branch >> [t_ai, t_log_skip]
        t_ai >> t_branch2
        t_branch2 >> [t_duffel, t_dashboard]
        t_duffel >> t_awards >> t_alerts
        [t_alerts, t_dashboard, t_log_skip] >> t_priority

    return dag


# ── Generate DAGs at import time ──────────────────────────────────────────────
for _route in _get_active_routes():
    for _cabin in _route.get("cabin_classes", []):
        _dag = _make_dag(_route, _cabin)
        globals()[_dag.dag_id] = _dag
