"""
Daily route scanner — APScheduler-based.

Runs once at 7 AM UTC every day for all active routes.
force_enrich=True: calls SerpApi + Duffel + Seats.aero for every route.

All heavy imports are inside functions so a missing apscheduler package
never prevents the app from starting.
"""
import uuid
import structlog
from datetime import datetime, timezone

logger = structlog.get_logger(__name__)


async def scan_all_active_routes(db_url: str) -> None:
    """
    Fetches all active routes from DB and runs the full pipeline (force_enrich=True)
    for each one. Called daily at 7 AM by APScheduler.
    """
    # Imports inside function — safe even if packages are partially installed
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
    from app.models.route import Route

    engine = create_async_engine(db_url, pool_pre_ping=True)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as db:
            result = await db.execute(select(Route).where(Route.is_active.is_(True)))
            routes = result.scalars().all()

        logger.info("daily_scan_start", route_count=len(routes))

        for route in routes:
            try:
                await _scan_one_route(route, db_url)
            except Exception as exc:
                logger.error("daily_scan_route_failed", route_id=str(route.id),
                             route_name=route.name, error=str(exc))

        logger.info("daily_scan_complete", route_count=len(routes))

    finally:
        await engine.dispose()


async def _scan_one_route(route, db_url: str) -> None:
    """Run the full pipeline for a single route with a fresh DB session."""
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
    from app.models.scan_history import ScanHistory
    from app.services.scanner import scan_route
    from app.services.deal_pipeline import run_pipeline_batch

    engine = create_async_engine(db_url, pool_pre_ping=True)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as db:
            logger.info("daily_scan_route", route_id=str(route.id), name=route.name)

            scan_result = await scan_route(
                route_id=route.id,
                origins=route.origins,
                destinations=route.destinations,
                cabin_classes=route.cabin_classes,
                date_from=route.date_from,
                date_to=route.date_to,
                db=db,
                deep=True,
            )

            deals = await run_pipeline_batch(
                route_id=route.id,
                scan_results=scan_result,
                db=db,
                force_enrich=True,
            )

            best = scan_result["best_prices"][0] if scan_result["best_prices"] else None
            history = ScanHistory(
                id=uuid.uuid4(),
                route_id=route.id,
                triggered_at=datetime.now(timezone.utc),
                trigger_type="scheduled",
                origins=",".join(route.origins),
                destinations=",".join(route.destinations),
                cabin_classes=",".join(route.cabin_classes),
                prices_collected=scan_result["sources"].get("serpapi", 0),
                deals_scored=len(deals),
                best_price_usd=best["price_usd"] if best else None,
                best_origin=best["origin"] if best else None,
                best_destination=best["destination"] if best else None,
                best_cabin=best["cabin_class"] if best else None,
                status="ok",
            )
            db.add(history)
            await db.commit()

            logger.info(
                "daily_scan_route_done",
                route_id=str(route.id),
                deals_scored=len(deals),
                best_price=best["price_usd"] if best else None,
            )

    except Exception as exc:
        logger.error("daily_scan_route_error", route_id=str(route.id), error=str(exc))
        raise
    finally:
        await engine.dispose()


def create_scheduler(db_url: str):
    """
    Creates and configures the APScheduler instance.
    Import is deferred here so a missing package just raises ImportError
    caught by main.py's try/except.
    """
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        scan_all_active_routes,
        CronTrigger(hour=7, minute=0, timezone="UTC"),
        args=[db_url],
        id="daily_full_scan",
        name="Daily full scan — all active routes",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )

    logger.info("scheduler_configured", job="daily_full_scan", cron="07:00 UTC")
    return scheduler
