"""
Airflow task: score the deal and write a DealAnalysis row.
Pushes XCom: score_total, action, is_gem (read by downstream branch operators).
"""
import asyncio
import logging
import uuid
from datetime import date, datetime, timezone

log = logging.getLogger(__name__)


def run(route_id: str, cabin_class: str, **context) -> None:
    asyncio.run(_async_run(route_id, cabin_class, context))


async def _async_run(route_id: str, cabin_class: str, context: dict) -> None:
    from app.services.scoring import score_deal
    from app.services.stats import get_daily_stats
    from app.database import AsyncSessionLocal
    from app.models.deal import DealAnalysis

    ti    = context["ti"]
    xref  = ti.xcom_pull(task_ids="cross_reference", key="xref_summary") or {}
    google = ti.xcom_pull(task_ids="fetch_searchapi",  key="google_result")

    if not xref.get("best_price_usd"):
        log.warning("score_deal: no price to score")
        ti.xcom_push(key="score_total", value=0)
        ti.xcom_push(key="action",      value="SKIP")
        ti.xcom_push(key="is_gem",      value=False)
        return

    async with AsyncSessionLocal() as db:
        stats = await get_daily_stats(
            db,
            uuid.UUID(route_id),
            xref.get("origin", ""),
            xref.get("destination", ""),
            cabin_class,
        )

    result = score_deal(xref, google, stats, duffel_result=None, award_results=None)

    # Persist DealAnalysis row
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        record = DealAnalysis(
            time=now,
            id=uuid.uuid4(),
            route_id=uuid.UUID(route_id),
            origin=xref.get("origin", ""),
            destination=xref.get("destination", ""),
            departure_date=date.today(),
            cabin_class=cabin_class,
            best_price_usd=xref["best_price_usd"],
            best_source=xref.get("best_source", ""),
            airline_code=(xref.get("airline_codes") or [None])[0],
            sources_confirmed=xref.get("sources_confirmed", []),
            **{k: v for k, v in result.items()
               if k not in ("fare_brand_name",)},  # filled after Duffel in Phase 3
        )
        db.add(record)
        try:
            await db.commit()
            log.info("deal scored: %.0f action=%s gem=%s",
                     result["score_total"], result["action"], result["is_gem"])
        except Exception as exc:
            await db.rollback()
            log.error("score_deal: DB write failed: %s", exc)

    # Push small XCom values for downstream branching
    ti.xcom_push(key="score_total", value=result["score_total"])
    ti.xcom_push(key="action",      value=result["action"])
    ti.xcom_push(key="is_gem",      value=result["is_gem"])
    ti.xcom_push(key="deal_id",     value=str(record.id))
