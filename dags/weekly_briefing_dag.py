"""
Weekly briefing DAG — runs every Monday at 7 AM.
Generates a Claude AI market summary and sends it via WhatsApp to all active users.
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


def generate_and_send(**context):
    asyncio.run(_async_run())


async def _async_run():
    from app.services.claude_advisor import generate_weekly_briefing
    from app.services.whatsapp import send_weekly_briefing
    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.models.deal import DealAnalysis
    from sqlalchemy import select, desc

    async with AsyncSessionLocal() as db:
        # Summarize top deals from the past week
        result = await db.execute(
            select(DealAnalysis)
            .where(DealAnalysis.time >= datetime.utcnow() - timedelta(days=7))
            .where(DealAnalysis.action.in_(["STRONG_BUY", "BUY"]))
            .order_by(desc(DealAnalysis.score_total))
            .limit(10)
        )
        deals = result.scalars().all()

        users_result = await db.execute(
            select(User).where(User.is_active.is_(True)).where(User.whatsapp_number.isnot(None))
        )
        users = users_result.scalars().all()

    summaries = [
        {
            "route": f"{d.origin}→{d.destination}",
            "cabin": d.cabin_class,
            "price": d.best_price_usd,
            "score": d.score_total,
            "action": d.action,
        }
        for d in deals
    ]

    for user in users:
        briefing = await generate_weekly_briefing(summaries, language=user.language or "en")
        if briefing:
            await send_weekly_briefing(user.whatsapp_number, briefing)


with DAG(
    dag_id="weekly_briefing",
    default_args=DEFAULT_ARGS,
    schedule_interval="0 7 * * 1",   # Every Monday at 7 AM
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["briefing", "weekly"],
) as dag:
    PythonOperator(
        task_id="generate_and_send",
        python_callable=generate_and_send,
    )
