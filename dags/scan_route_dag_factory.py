"""
DAG factory — dynamically generates one DAG per active (route, cabin_class) pair.
Reads active routes from the FlightDeal DB at import time (every Airflow scheduler cycle).
Routes are cached for 60s to avoid blocking I/O on every scheduler heartbeat.

Sources: SerpApi (scheduled) → Duffel + Seats.aero (on-demand when score ≥ 5.0)

DAG ID format: scan_{route_id_short}_{cabin_class_lower}
"""
import logging
import time
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
    generate_events,
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

# ── Route caching (avoid blocking DB read on every scheduler heartbeat) ──────
_ROUTES_CACHE: dict = {"data": [], "timestamp": 0}
_ROUTES_CACHE_TTL = 60  # seconds


def _get_active_routes() -> list[dict]:
    """Reads active routes from the DB. Cached for 60s to avoid blocking scheduler."""
    now = time.time()
    if _ROUTES_CACHE["data"] and (now - _ROUTES_CACHE["timestamp"]) < _ROUTES_CACHE_TTL:
        return _ROUTES_CACHE["data"]

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
        _ROUTES_CACHE["data"] = rows
        _ROUTES_CACHE["timestamp"] = now
        return rows
    except Exception as exc:
        log.warning("Could not load routes from DB: %s", exc)
        return _ROUTES_CACHE.get("data", [])


def _schedule_for_mode(scan_mode: str, tier: str) -> str:
    """3-tier scan strategy (Plan v3 P0.3):
       quick — every 4h tripwire (3 cheapest dates only)
       full  — 3x/day full sweep (all dates, deep)
       daily — once daily 7am UTC (full + force enrich Duffel + Seats.aero)
       Tier still nudges cadence: HOT routes get a quicker tripwire.
    """
    if scan_mode == "quick":
        return {"HOT": "0 */2 * * *", "WARM": "0 */4 * * *", "COLD": "0 */6 * * *"}.get(tier, "0 */4 * * *")
    if scan_mode == "full":
        return "0 6,14,22 * * *"
    if scan_mode == "daily":
        return "0 7 * * *"
    return "0 */4 * * *"


def _make_dag(route: dict, cabin_class: str, scan_mode: str = "full") -> DAG:
    route_id     = route["id"]
    short_id     = route_id.replace("-", "")[:8]
    dag_id       = f"scan_{short_id}_{cabin_class.lower()}_{scan_mode}"
    schedule     = _schedule_for_mode(scan_mode, route.get("priority_tier", "WARM"))
    origins      = route["origins"]
    destinations = route["destinations"]
    deep         = scan_mode != "quick"

    with DAG(
        dag_id=dag_id,
        default_args=DEFAULT_ARGS,
        schedule_interval=schedule,
        start_date=datetime(2026, 1, 1),
        catchup=False,
        concurrency=4,         # max 4 tasks running in parallel for this DAG
        max_active_runs=1,     # only 1 active run of this exact DAG at a time
        tags=["scan", cabin_class.lower(), scan_mode, route.get("priority_tier", "WARM").lower()],
        doc_md=f"Scan DAG ({scan_mode}) for route '{route['name']}' — {cabin_class}",
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
                "deep":        deep,
                "scan_mode":   scan_mode,
            },
            sla=timedelta(minutes=5),
            execution_timeout=timedelta(minutes=10),
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

        # ── Generate route events (always runs after score) ─────────────────
        t_events = PythonOperator(
            task_id="generate_events",
            python_callable=generate_events.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
            trigger_rule=TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS,
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

        # ── Branch: enrich with Duffel + Awards for daily/on-demand or BUY/GEM
        # Spec: Duffel + Seats.aero run daily at 7 AM and on Scan Now — NOT score-gated.
        def _branch_action(**ctx):
            trigger_type = ctx["dag_run"].conf.get("trigger_type", "") if ctx.get("dag_run") else ""
            force_enrich = ctx["ti"].xcom_pull(task_ids="fetch_serpapi", key="force_enrich") or False
            action = ctx["ti"].xcom_pull(task_ids="score_deal", key="action") or "SKIP"
            is_gem  = ctx["ti"].xcom_pull(task_ids="score_deal", key="is_gem") or False
            always_enrich = bool(force_enrich) or trigger_type in ("daily_7am", "scan_now")
            if always_enrich or action in ("STRONG_BUY", "BUY") or is_gem:
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
            execution_timeout=timedelta(minutes=3),
        )
        t_awards = PythonOperator(
            task_id="enrich_awards",
            python_callable=fetch_awards.run,
            op_kwargs={"route_id": route_id, "cabin_class": cabin_class},
            execution_timeout=timedelta(minutes=3),
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
        t_serpapi >> t_xref >> t_score >> t_events >> t_branch
        t_branch >> [t_ai, t_log_skip]
        t_ai >> t_branch2
        t_branch2 >> [t_duffel, t_dashboard]
        t_duffel >> t_awards >> t_alerts
        [t_alerts, t_dashboard, t_log_skip] >> t_priority

    return dag


# ── Generate DAGs at import time ──────────────────────────────────────────────
# 3 DAGs per (route, cabin): quick / full / daily — see _schedule_for_mode().
for _route in _get_active_routes():
    for _cabin in _route.get("cabin_classes", []):
        for _mode in ("quick", "full", "daily"):
            _dag = _make_dag(_route, _cabin, scan_mode=_mode)
            globals()[_dag.dag_id] = _dag
