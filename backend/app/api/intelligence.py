"""Intelligence API — exposes data science insights + API usage tracking."""
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.route import Route
from app.models.intelligence import ApiUsageLog
from app.services.intelligence import run_intelligence

router = APIRouter()


# ---------------------------------------------------------------------------
# Static path declared first so it never collides with /{route_id}.
# ---------------------------------------------------------------------------
@router.get("/usage")
async def api_usage(
    days: int = Query(30, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Per-source API usage + cost breakdown."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    stmt = (
        select(
            ApiUsageLog.source,
            func.count(ApiUsageLog.id).label("calls"),
            func.coalesce(func.sum(ApiUsageLog.cost_estimate_usd), 0).label("cost_usd"),
            func.avg(ApiUsageLog.latency_ms).label("avg_latency_ms"),
        )
        .where(ApiUsageLog.timestamp >= cutoff)
        .group_by(ApiUsageLog.source)
    )
    result = await db.execute(stmt)
    by_source = []
    for source, calls, cost_usd, avg_latency in result.all():
        by_source.append({
            "source": source,
            "calls": int(calls),
            "cost_usd": float(cost_usd or 0),
            "avg_latency_ms": float(avg_latency) if avg_latency else None,
        })

    daily_stmt = await db.execute(
        text("""
            SELECT
                DATE(timestamp) AS day,
                source,
                COUNT(*) AS calls,
                COALESCE(SUM(cost_estimate_usd), 0) AS cost_usd
            FROM api_usage_log
            WHERE timestamp >= :cutoff
            GROUP BY day, source
            ORDER BY day, source
        """),
        {"cutoff": cutoff},
    )
    timeseries = [
        {"day": str(r.day), "source": r.source, "calls": int(r.calls), "cost_usd": float(r.cost_usd)}
        for r in daily_stmt.all()
    ]

    today_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    today_stmt = (
        select(ApiUsageLog.source, func.count(ApiUsageLog.id))
        .where(ApiUsageLog.timestamp >= today_cutoff)
        .group_by(ApiUsageLog.source)
    )
    today_res = await db.execute(today_stmt)
    today_by_source = {source: int(count) for source, count in today_res.all()}

    quotas = {
        "serpapi":    {"limit": 1000, "period": "month"},
        "duffel":     {"limit": None, "period": None},
        "seats_aero": {"limit": 1000, "period": "day"},
        "anthropic":  {"limit": None, "period": None},
    }

    return {
        "period_days":     days,
        "by_source":       by_source,
        "today_by_source": today_by_source,
        "timeseries":      timeseries,
        "quotas":          quotas,
        "computed_at":     datetime.now(timezone.utc).isoformat(),
    }


async def _resolve_route_combo(db: AsyncSession, route_id: uuid.UUID, user: User):
    res = await db.execute(select(Route).where(Route.id == route_id, Route.user_id == user.id))
    route = res.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return route


# NOTE: static paths (e.g. /usage) MUST be declared before dynamic /{route_id}
# or FastAPI will try to parse them as a UUID and 422.
@router.get("/{route_id}")
async def get_intelligence(
    route_id: uuid.UUID,
    origin: str | None = Query(None),
    destination: str | None = Query(None),
    cabin_class: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Run all intelligence functions for a (route, od, cabin) combo.
    If origin/dest/cabin omitted, uses the route's primary combo.
    """
    route = await _resolve_route_combo(db, route_id, user)
    o = origin or route.origins[0]
    d = destination or route.destinations[0]
    c = cabin_class or route.cabin_classes[0]
    result = await run_intelligence(db, route_id, o, d, c, user_id=user.id, persist=False)
    return result


@router.get("/{route_id}/forecast")
async def get_forecast(
    route_id: uuid.UUID,
    origin: str | None = Query(None),
    destination: str | None = Query(None),
    cabin_class: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Just the forecast (chart-friendly format)."""
    route = await _resolve_route_combo(db, route_id, user)
    o = origin or route.origins[0]
    d = destination or route.destinations[0]
    c = cabin_class or route.cabin_classes[0]
    full = await run_intelligence(db, route_id, o, d, c, user_id=None, persist=False)
    return {"forecast": full.get("forecast"), "verdict": full.get("verdict")}
