"""
Airflow task: Seats.aero on-demand award availability (Tier 3).
Pushes XCom: award_summary (dict with best_miles, best_program, best_cpp).
"""
import asyncio
import logging
from datetime import date
import uuid
from datetime import datetime, timezone

log = logging.getLogger(__name__)


def run(route_id: str, cabin_class: str, **context) -> None:
    asyncio.run(_async_run(route_id, cabin_class, context))


async def _async_run(route_id: str, cabin_class: str, context: dict) -> None:
    from app.services import seats_aero_client, award_analyzer
    from app.database import AsyncSessionLocal
    from app.models.prices import AwardPrice

    ti = context["ti"]
    xref = ti.xcom_pull(task_ids="cross_reference", key="xref_summary") or {}
    origin = xref.get("origin")
    dest   = xref.get("destination")
    cash_price = xref.get("best_price_usd") or 0.0

    if not origin or not dest:
        ti.xcom_push(key="award_summary", value=None)
        return

    raw_awards = await seats_aero_client.search_award_availability(
        origin, dest, date.today(), cabin_class
    )

    if not raw_awards:
        ti.xcom_push(key="award_summary", value=None)
        return

    enriched = award_analyzer.enrich_awards(cash_price, raw_awards)
    summary  = award_analyzer.best_award_summary(enriched)
    ti.xcom_push(key="award_summary", value=summary)

    async with AsyncSessionLocal() as db:
        for award in raw_awards:
            record = AwardPrice(
                time=datetime.now(timezone.utc),
                id=uuid.uuid4(),
                route_id=uuid.UUID(route_id),
                **{k: v for k, v in award.items() if k != "raw_response"},
            )
            db.add(record)
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            log.error("awards: DB write failed: %s", exc)
