"""
Airflow task: generate Claude AI deal recommendations (EN + PT).
Updates the DealAnalysis row with ai_recommendation_en/pt.
"""
import asyncio
import logging
import uuid

log = logging.getLogger(__name__)


def run(route_id: str, cabin_class: str, **context) -> None:
    asyncio.run(_async_run(route_id, cabin_class, context))


async def _async_run(route_id: str, cabin_class: str, context: dict) -> None:
    from app.services.claude_advisor import generate_recommendation
    from app.database import AsyncSessionLocal
    from app.models.deal import DealAnalysis
    from sqlalchemy import select, update

    ti      = context["ti"]
    deal_id = ti.xcom_pull(task_ids="score_deal", key="deal_id")
    xref    = ti.xcom_pull(task_ids="cross_reference", key="xref_summary") or {}
    score   = ti.xcom_pull(task_ids="score_deal", key="score_total") or 0
    action  = ti.xcom_pull(task_ids="score_deal", key="action") or "NORMAL"
    is_gem  = ti.xcom_pull(task_ids="score_deal", key="is_gem") or False
    google  = ti.xcom_pull(task_ids="fetch_serpapi", key="google_result") or {}

    deal_ctx = {
        "origin":          xref.get("origin"),
        "destination":     xref.get("destination"),
        "cabin_class":     cabin_class,
        "best_price_usd":  xref.get("best_price_usd"),
        "score_total":     score,
        "action":          action,
        "is_gem":          is_gem,
        "sources_confirmed": xref.get("sources_confirmed", []),
        "google_price_level": google.get("price_level"),
    }

    rec_en, rec_pt = await asyncio.gather(
        generate_recommendation(deal_ctx, language="en"),
        generate_recommendation(deal_ctx, language="pt"),
    )

    if not deal_id:
        return

    async with AsyncSessionLocal() as db:
        await db.execute(
            update(DealAnalysis)
            .where(DealAnalysis.id == uuid.UUID(deal_id))
            .values(ai_recommendation_en=rec_en, ai_recommendation_pt=rec_pt)
        )
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            log.error("ai_analysis: update failed: %s", exc)
