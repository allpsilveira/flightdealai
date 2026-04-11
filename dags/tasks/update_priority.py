"""
Airflow task: update route.priority_tier based on recent scoring activity.
HOT  → had STRONG_BUY or GEM in last 24h
WARM → had BUY or WATCH in last 48h
COLD → nothing notable in last 7 days
"""
import asyncio
import logging
import uuid

log = logging.getLogger(__name__)


def run(route_id: str, **context) -> None:
    asyncio.run(_async_run(route_id))


async def _async_run(route_id: str) -> None:
    from app.database import AsyncSessionLocal
    from app.models.route import Route
    from app.models.deal import DealAnalysis
    from sqlalchemy import select, func

    async with AsyncSessionLocal() as db:
        # Count recent strong signals
        hot_count = await db.scalar(
            select(func.count()).select_from(DealAnalysis).where(
                DealAnalysis.route_id == uuid.UUID(route_id),
                DealAnalysis.action.in_(["STRONG_BUY"]),
                DealAnalysis.time >= func.now() - func.make_interval(days=1),
            )
        )
        warm_count = await db.scalar(
            select(func.count()).select_from(DealAnalysis).where(
                DealAnalysis.route_id == uuid.UUID(route_id),
                DealAnalysis.action.in_(["BUY", "WATCH"]),
                DealAnalysis.time >= func.now() - func.make_interval(days=2),
            )
        )

        tier = "HOT" if hot_count else ("WARM" if warm_count else "COLD")

        result = await db.execute(select(Route).where(Route.id == uuid.UUID(route_id)))
        route = result.scalar_one_or_none()
        if route and route.priority_tier != tier:
            route.priority_tier = tier
            try:
                await db.commit()
                log.info("route %s priority → %s", route_id, tier)
            except Exception as exc:
                await db.rollback()
                log.error("update_priority: failed: %s", exc)
