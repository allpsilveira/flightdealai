"""
Airflow task: cross-reference prices from all sources and produce a unified summary.
Pushes XCom: xref_summary (dict).
"""
import logging

log = logging.getLogger(__name__)


def run(route_id: str, cabin_class: str, **context) -> None:
    from app.services.cross_reference import cross_reference

    ti = context["ti"]

    amadeus_price = ti.xcom_pull(task_ids="fetch_amadeus",  key="amadeus_cheapest_price")
    google_result = ti.xcom_pull(task_ids="fetch_searchapi", key="google_result")
    kiwi_price    = ti.xcom_pull(task_ids="fetch_kiwi",     key="kiwi_cheapest_price")

    # Reconstruct minimal list shapes expected by cross_reference()
    amadeus_results = [{"price_usd": amadeus_price}] if amadeus_price else None
    kiwi_results    = [{"price_usd": kiwi_price}]    if kiwi_price    else None

    summary = cross_reference(amadeus_results, google_result, kiwi_results)

    # Attach the best origin/dest from google_result if available
    if google_result:
        summary["origin"]      = google_result.get("origin")
        summary["destination"] = google_result.get("destination")

    ti.xcom_push(key="xref_summary", value=summary)
    log.info("xref complete: best=%.0f source=%s gem=%s",
             summary.get("best_price_usd") or 0,
             summary.get("best_source"),
             summary.get("is_gem"))
