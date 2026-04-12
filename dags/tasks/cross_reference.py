"""
Airflow task: cross-reference prices from all sources and produce a unified summary.
Pushes XCom: xref_summary (dict).
"""
import logging

log = logging.getLogger(__name__)


def run(route_id: str, cabin_class: str, **context) -> None:
    from app.services.cross_reference import cross_reference

    ti = context["ti"]

    google_result = ti.xcom_pull(task_ids="fetch_serpapi", key="google_result")

    summary = cross_reference(google_result, duffel_result=None, award_results=None)

    # Attach the best origin/dest from google_result if available
    if google_result:
        summary["origin"]      = google_result.get("origin")
        summary["destination"] = google_result.get("destination")

    ti.xcom_push(key="xref_summary", value=summary)
    log.info("xref complete: best=%.0f source=%s gem=%s",
             summary.get("best_price_usd") or 0,
             summary.get("best_source"),
             summary.get("is_gem"))
