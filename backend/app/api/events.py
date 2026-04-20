"""Events API — powers the Zillow-style activity timeline on Route Detail."""
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.route import Route
from app.models.route_event import RouteEvent
from app.models.deal import DealAnalysis
from app.models.prices import FlightOffer, GooglePrice

router = APIRouter()


class EventResponse(BaseModel):
    id: int
    timestamp: str
    event_type: str
    severity: str
    headline: str
    detail: str | None
    subtext: str | None
    airline: str | None
    price_usd: float | None
    previous_price_usd: float | None
    deal_analysis_id: str | None
    metadata: dict | None


def _to_response(e: RouteEvent) -> EventResponse:
    return EventResponse(
        id=e.id,
        timestamp=e.timestamp.isoformat(),
        event_type=e.event_type,
        severity=e.severity,
        headline=e.headline,
        detail=e.detail,
        subtext=e.subtext,
        airline=e.airline,
        price_usd=e.price_usd,
        previous_price_usd=e.previous_price_usd,
        deal_analysis_id=str(e.deal_analysis_id) if e.deal_analysis_id else None,
        metadata=e.event_metadata,
    )


async def _ensure_owns_route(db: AsyncSession, route_id: uuid.UUID, user: User) -> None:
    res = await db.execute(select(Route).where(Route.id == route_id, Route.user_id == user.id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Route not found")


@router.get("/route/{route_id}", response_model=list[EventResponse])
async def list_route_events(
    route_id: uuid.UUID,
    event_type: str | None = Query(None),
    severity: str | None = Query(None),
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_owns_route(db, route_id, user)
    stmt = select(RouteEvent).where(RouteEvent.route_id == route_id)
    if event_type:
        stmt = stmt.where(RouteEvent.event_type == event_type)
    if severity:
        stmt = stmt.where(RouteEvent.severity == severity)
    stmt = stmt.order_by(RouteEvent.timestamp.desc()).limit(limit)
    result = await db.execute(stmt)
    return [_to_response(e) for e in result.scalars().all()]


@router.get("/route/{route_id}/summary")
async def event_summary(
    route_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Last 24h event counts grouped by type + severity. Used for route card preview."""
    await _ensure_owns_route(db, route_id, user)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    stmt = (
        select(RouteEvent.event_type, RouteEvent.severity, func.count(RouteEvent.id))
        .where(and_(RouteEvent.route_id == route_id, RouteEvent.timestamp >= cutoff))
        .group_by(RouteEvent.event_type, RouteEvent.severity)
    )
    result = await db.execute(stmt)
    counts = {}
    for event_type, severity, count in result.all():
        counts.setdefault(event_type, {})[severity] = count

    # Latest event for preview
    latest_stmt = (
        select(RouteEvent)
        .where(RouteEvent.route_id == route_id)
        .order_by(RouteEvent.timestamp.desc())
        .limit(1)
    )
    latest_res = await db.execute(latest_stmt)
    latest = latest_res.scalar_one_or_none()

    return {
        "by_type": counts,
        "total_24h": sum(sum(s.values()) for s in counts.values()),
        "latest": _to_response(latest).model_dump() if latest else None,
    }


# ---------------------------------------------------------------------------
# Event detail snapshot — powers EventDetailDrawer.
# Returns the event + the scan context (offers + 14d price window) that
# produced it so the user can see what happened, before vs. after, and what
# every airline looked like at that moment.
# ---------------------------------------------------------------------------
@router.get("/{event_id}/snapshot")
async def event_snapshot(
    event_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 1) Load event + verify ownership
    res = await db.execute(select(RouteEvent).where(RouteEvent.id == event_id))
    event = res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    await _ensure_owns_route(db, event.route_id, user)

    # 2) Linked deal_analysis (may be missing for monitoring_started / ai_insight events)
    deal = None
    offers: list[FlightOffer] = []
    if event.deal_analysis_id:
        deal_res = await db.execute(
            select(DealAnalysis).where(DealAnalysis.id == event.deal_analysis_id)
        )
        deal = deal_res.scalar_one_or_none()
        if deal:
            offer_res = await db.execute(
                select(FlightOffer)
                .where(FlightOffer.deal_analysis_id == deal.id)
                .order_by(FlightOffer.price_usd.asc())
            )
            offers = list(offer_res.scalars().all())

    # 3) 14-day price window centered on the event timestamp (7 before, 7 after)
    window_start = event.timestamp - timedelta(days=7)
    window_end   = event.timestamp + timedelta(days=7)
    price_stmt = (
        select(GooglePrice.time, GooglePrice.price_usd)
        .where(GooglePrice.route_id == event.route_id)
        .where(GooglePrice.time >= window_start)
        .where(GooglePrice.time <= window_end)
        .order_by(GooglePrice.time.asc())
    )
    price_res = await db.execute(price_stmt)
    sparkline = [
        {"t": t.isoformat(), "price": float(p)}
        for t, p in price_res.all()
    ]

    # 4) Plain-English headline + reason if not already on the event
    headline = event.headline
    reason   = event.detail
    delta    = None
    if event.price_usd and event.previous_price_usd:
        delta = float(event.price_usd) - float(event.previous_price_usd)

    return {
        "event": _to_response(event).model_dump(),
        "deal": {
            "id":              str(deal.id) if deal else None,
            "origin":          deal.origin if deal else None,
            "destination":     deal.destination if deal else None,
            "departure_date":  deal.departure_date.isoformat() if deal and deal.departure_date else None,
            "cabin_class":     deal.cabin_class if deal else None,
            "best_price_usd":  float(deal.best_price_usd) if deal and deal.best_price_usd else None,
            "score_total":     float(deal.score_total) if deal and deal.score_total else None,
            "is_gem":          bool(deal.is_gem) if deal else None,
        } if deal else None,
        "offers": [
            {
                "primary_airline":   o.primary_airline,
                "stops":             o.stops,
                "price_usd":         float(o.price_usd),
                "duration_minutes":  o.duration_minutes,
                "departure_date":    o.departure_date.isoformat() if o.departure_date else None,
                "is_direct":         o.is_direct,
            }
            for o in offers
        ],
        "delta_usd": delta,
        "sparkline": sparkline,
        "headline":  headline,
        "reason":    reason,
    }
