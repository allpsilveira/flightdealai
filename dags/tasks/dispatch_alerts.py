"""
Airflow task: dispatch WhatsApp + web push alerts to all users monitoring this route.
Marks alert_sent=True on the DealAnalysis row. Idempotent — checks flag before sending.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

log = logging.getLogger(__name__)


def run(route_id: str, cabin_class: str, **context) -> None:
    asyncio.run(_async_run(route_id, cabin_class, context))


async def _async_run(route_id: str, cabin_class: str, context: dict) -> None:
    from app.services.whatsapp import send_deal_alert
    from app.database import AsyncSessionLocal
    from app.models.deal import DealAnalysis
    from app.models.alert_rule import AlertRule
    from app.models.user import User
    from sqlalchemy import select, update

    ti      = context["ti"]
    deal_id = ti.xcom_pull(task_ids="score_deal",      key="deal_id")
    action  = ti.xcom_pull(task_ids="score_deal",      key="action") or "SKIP"
    is_gem  = ti.xcom_pull(task_ids="score_deal",      key="is_gem") or False
    score   = ti.xcom_pull(task_ids="score_deal",      key="score_total") or 0
    xref    = ti.xcom_pull(task_ids="cross_reference", key="xref_summary") or {}

    if not deal_id:
        return

    async with AsyncSessionLocal() as db:
        # Check idempotency
        result = await db.execute(
            select(DealAnalysis).where(DealAnalysis.id == uuid.UUID(deal_id))
        )
        deal_row = result.scalar_one_or_none()
        if not deal_row or deal_row.alert_sent:
            return

        # Fetch alert rules for this route
        rules_result = await db.execute(
            select(AlertRule, User)
            .join(User, AlertRule.user_id == User.id)
            .where(
                (AlertRule.route_id == uuid.UUID(route_id)) |
                (AlertRule.route_id.is_(None))
            )
            .where(User.is_active.is_(True))
        )
        rules_users = rules_result.all()

    deal_dict = {
        "origin":         xref.get("origin"),
        "destination":    xref.get("destination"),
        "cabin_class":    cabin_class,
        "best_price_usd": xref.get("best_price_usd"),
        "action":         action,
        "score_total":    score,
        "is_gem":         is_gem,
        "seats_remaining": xref.get("seats_remaining"),
    }

    for rule, user in rules_users:
        should_alert = (
            (float(score) >= rule.score_threshold) or
            (is_gem and rule.gem_alerts) or
            (action in ("STRONG_BUY", "BUY") and rule.score_threshold <= 80)
        )
        if not should_alert:
            continue

        rec_en = deal_row.ai_recommendation_en if deal_row else None
        language = user.language or "en"
        rec = deal_row.ai_recommendation_pt if (language == "pt" and deal_row) else rec_en

        if rule.whatsapp_enabled and user.whatsapp_number:
            await send_deal_alert(user.whatsapp_number, deal_dict, rec, language)

    # Mark as sent
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(DealAnalysis)
            .where(DealAnalysis.id == uuid.UUID(deal_id))
            .values(alert_sent=True, alert_sent_at=datetime.now(timezone.utc))
        )
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            log.error("dispatch_alerts: update failed: %s", exc)
