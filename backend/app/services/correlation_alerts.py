"""
Correlation alerts — Phase 6.5.4
When a route has a significant price drop, find historically correlated routes
and emit informational events on those routes ("Related route XYZ dropped 18%").

Correlation source: route_correlations table populated by
  intelligence.compute_route_correlations() (Phase 2.7).
"""
import structlog
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.route_event import RouteEvent
from app.models.route import Route
from app.services.intelligence import compute_route_correlations

logger = structlog.get_logger(__name__)

# Recent window where we look for drop events to amplify
LOOKBACK_HOURS         = 2
# Correlation threshold (absolute Pearson r) to consider a route "related"
MIN_CORRELATION        = 0.7
# Don't emit duplicate cascade events within this window
DEDUP_WINDOW_HOURS     = 24


async def dispatch_correlation_alerts(db: AsyncSession) -> int:
    """
    Scan recent significant price_drop events. For each, look up correlated
    routes and emit an informational event on each correlated route.
    Returns count of cascade events created.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)

    # Find recent significant drop events that haven't been cascaded yet
    stmt = (
        select(RouteEvent)
        .where(and_(
            RouteEvent.timestamp        >= cutoff,
            RouteEvent.event_type       == "price_drop",
            RouteEvent.severity.in_(["high", "critical"]),
        ))
        .order_by(RouteEvent.timestamp.desc())
    )
    drop_events = (await db.execute(stmt)).scalars().all()

    if not drop_events:
        return 0

    cascades = 0
    for ev in drop_events:
        cascades += await _cascade_one(db, ev)

    if cascades:
        await db.flush()
        logger.info("correlation_cascades_dispatched", count=cascades)
    return cascades


async def _cascade_one(db: AsyncSession, source_event: RouteEvent) -> int:
    """Emit cascade events on routes correlated with source_event.route_id."""
    src_route = (await db.execute(
        select(Route).where(Route.id == source_event.route_id)
    )).scalar_one_or_none()
    if not src_route:
        return 0

    # Compute correlations on-the-fly across this user's routes.
    # Cheap: in-memory Pearson over a 60-day daily series.
    correlations = await compute_route_correlations(
        db, source_event.route_id, src_route.user_id
    )
    pairs = [
        (c["route_id"], c["correlation"])
        for c in correlations
        if abs(c["correlation"]) >= MIN_CORRELATION
    ]

    if not pairs:
        return 0

    src_label = f"{src_route.origins[0]}→{src_route.destinations[0]}" if src_route.origins and src_route.destinations else "related route"
    drop_pct = None
    if source_event.previous_price_usd and source_event.price_usd:
        try:
            drop_pct = round(
                (float(source_event.previous_price_usd) - float(source_event.price_usd))
                / float(source_event.previous_price_usd) * 100.0, 1
            )
        except (TypeError, ZeroDivisionError):
            drop_pct = None

    dedup_cutoff = datetime.now(timezone.utc) - timedelta(hours=DEDUP_WINDOW_HOURS)
    created = 0

    for other_id, corr in pairs:
        # Dedup: skip if we already created a cascade event for this pair recently
        existing = await db.execute(
            select(RouteEvent).where(and_(
                RouteEvent.route_id   == other_id,
                RouteEvent.event_type == "correlated_drop",
                RouteEvent.timestamp  >= dedup_cutoff,
                RouteEvent.event_metadata["source_route_id"].astext == str(source_event.route_id),
            )).limit(1)
        )
        if existing.scalar_one_or_none() is not None:
            continue

        direction = "dropped" if corr > 0 else "diverged from"
        headline = f"{src_label} {direction} — historically correlated (r={corr:+.2f})"
        detail = (
            f"Source route {src_label} dropped"
            + (f" {drop_pct}%" if drop_pct else "")
            + f". Routes have {abs(corr):.0%} historical price correlation"
            + (" — yours often follows within ~3 days." if corr > 0 else " — inverse pattern, prices often diverge.")
        )

        event = RouteEvent(
            route_id      = other_id,
            event_type    = "correlated_drop",
            severity      = "medium",
            headline      = headline,
            detail        = detail,
            event_metadata    = {
                "source_route_id":   str(source_event.route_id),
                "source_event_id":   source_event.id,
                "correlation":       round(corr, 3),
                "source_drop_pct":   drop_pct,
            },
        )
        db.add(event)
        created += 1

    return created
