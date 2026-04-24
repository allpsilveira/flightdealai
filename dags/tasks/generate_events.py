"""
Airflow task: generate route events after scoring.

Reads the DealAnalysis row just written by score_deal, compares it to the
previous deal for the same (route, origin, dest, cabin, departure_date), and
calls event_generator.generate_events() to create any triggered RouteEvent rows.

XCom in:  deal_id (str UUID) from score_deal
XCom out: event_count (int) — number of events created this cycle
"""
import asyncio
import logging
import uuid

log = logging.getLogger(__name__)


def run(route_id: str, cabin_class: str, **context) -> None:
    asyncio.run(_async_run(route_id, cabin_class, context))


async def _async_run(route_id: str, cabin_class: str, context: dict) -> None:
    from sqlalchemy import select, desc
    from app.database import AsyncSessionLocal
    from app.models.deal import DealAnalysis
    from app.services.event_generator import generate_events
    from app.services.stats import get_daily_stats

    ti = context["ti"]
    deal_id_str = ti.xcom_pull(task_ids="score_deal", key="deal_id")
    if not deal_id_str:
        log.warning("generate_events: no deal_id in XCom — skipping")
        ti.xcom_push(key="event_count", value=0)
        return

    try:
        deal_id = uuid.UUID(deal_id_str)
    except ValueError:
        log.error("generate_events: invalid deal_id '%s'", deal_id_str)
        ti.xcom_push(key="event_count", value=0)
        return

    async with AsyncSessionLocal() as db:
        # Load the current deal
        result = await db.execute(
            select(DealAnalysis).where(DealAnalysis.id == deal_id)
        )
        deal_row = result.scalar_one_or_none()
        if not deal_row:
            log.warning("generate_events: deal %s not found in DB", deal_id_str)
            ti.xcom_push(key="event_count", value=0)
            return

        deal = {c.key: getattr(deal_row, c.key) for c in DealAnalysis.__table__.columns}

        # Load the previous deal for the same (route, od-pair, cabin, departure_date)
        prev_result = await db.execute(
            select(DealAnalysis)
            .where(
                DealAnalysis.route_id    == deal_row.route_id,
                DealAnalysis.origin      == deal_row.origin,
                DealAnalysis.destination == deal_row.destination,
                DealAnalysis.cabin_class == deal_row.cabin_class,
                DealAnalysis.departure_date == deal_row.departure_date,
                DealAnalysis.id          != deal_id,
            )
            .order_by(desc(DealAnalysis.time))
            .limit(1)
        )
        prev_row = prev_result.scalar_one_or_none()
        previous_deal = (
            {c.key: getattr(prev_row, c.key) for c in DealAnalysis.__table__.columns}
            if prev_row else None
        )

        is_first_scan = previous_deal is None

        # Load daily stats for new_low detection
        stats = await get_daily_stats(
            db,
            deal_row.route_id,
            deal_row.origin,
            deal_row.destination,
            deal_row.cabin_class,
        )

        events = await generate_events(
            db=db,
            route_id=deal_row.route_id,
            deal=deal,
            previous_deal=previous_deal,
            stats=stats,
            is_first_scan=is_first_scan,
        )

        n = len(events)
        log.info("generate_events: %d event(s) created for deal %s", n, deal_id_str)
        ti.xcom_push(key="event_count", value=n)
