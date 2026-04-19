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
