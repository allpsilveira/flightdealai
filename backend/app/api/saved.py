"""
Saved items + share links API.

Endpoints:
  GET    /api/saved                 — list my saved items
  POST   /api/saved                 — save an item {item_type, item_id, label?}
  DELETE /api/saved/{id}            — unsave

  POST   /api/share                 — create a share link {item_type, item_id, ttl_hours?}
                                      Returns {token, url, expires_at}
  GET    /api/share/{token}         — public read-only resolve (no auth)
"""
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.saved import SavedItem, ShareLink
from app.models.deal import DealAnalysis
from app.models.route import Route
from app.models.route_event import RouteEvent

router = APIRouter()
share_router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────
class SaveRequest(BaseModel):
    item_type: str  # 'event' | 'deal' | 'route'
    item_id: str
    label: str | None = None


class ShareRequest(BaseModel):
    item_type: str
    item_id: str
    ttl_hours: int | None = 168  # default 7 days


# ── Helpers ───────────────────────────────────────────────────────────────────
async def _build_snapshot(item_type: str, item_id: str, db: AsyncSession) -> dict:
    """Cache the current state of the item — survives source-row rotation."""
    if item_type == "deal":
        r = await db.execute(select(DealAnalysis).where(DealAnalysis.id == uuid.UUID(item_id)))
        deal = r.scalar_one_or_none()
        if not deal:
            raise HTTPException(status_code=404, detail="Deal not found")
        return {
            "origin": deal.origin, "destination": deal.destination,
            "departure_date": deal.departure_date.isoformat() if deal.departure_date else None,
            "cabin_class": deal.cabin_class, "airline_code": deal.airline_code,
            "best_price_usd": deal.best_price_usd, "score_total": deal.score_total,
            "action": deal.action, "is_gem": deal.is_gem, "is_error_fare": deal.is_error_fare,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }
    if item_type == "event":
        r = await db.execute(select(RouteEvent).where(RouteEvent.id == int(item_id)))
        evt = r.scalar_one_or_none()
        if not evt:
            raise HTTPException(status_code=404, detail="Event not found")
        return {
            "event_type": evt.event_type, "severity": evt.severity,
            "headline": evt.headline, "detail": evt.detail, "subtext": evt.subtext,
            "airline": evt.airline, "price_usd": evt.price_usd,
            "previous_price_usd": evt.previous_price_usd,
            "timestamp": evt.timestamp.isoformat() if evt.timestamp else None,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }
    if item_type == "route":
        r = await db.execute(select(Route).where(Route.id == uuid.UUID(item_id)))
        route = r.scalar_one_or_none()
        if not route:
            raise HTTPException(status_code=404, detail="Route not found")
        return {
            "origins": route.origins, "destinations": route.destinations,
            "cabin_classes": route.cabin_classes,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }
    raise HTTPException(status_code=400, detail=f"Unknown item_type: {item_type}")


# ── Saved items ───────────────────────────────────────────────────────────────
@router.get("")
async def list_saved(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(SavedItem).where(SavedItem.user_id == user.id).order_by(SavedItem.created_at.desc())
    )
    items = res.scalars().all()
    return [
        {
            "id": s.id, "item_type": s.item_type, "item_id": s.item_id,
            "label": s.label, "snapshot": s.snapshot,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in items
    ]


@router.post("")
async def save_item(
    body: SaveRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.item_type not in ("event", "deal", "route"):
        raise HTTPException(status_code=400, detail="item_type must be event|deal|route")

    # Idempotent — return existing if already saved
    existing = await db.execute(
        select(SavedItem).where(
            SavedItem.user_id == user.id,
            SavedItem.item_type == body.item_type,
            SavedItem.item_id == body.item_id,
        )
    )
    found = existing.scalar_one_or_none()
    if found:
        return {"id": found.id, "already_saved": True}

    snapshot = await _build_snapshot(body.item_type, body.item_id, db)
    row = SavedItem(
        user_id=user.id,
        item_type=body.item_type,
        item_id=body.item_id,
        label=body.label,
        snapshot=snapshot,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "already_saved": False}


@router.delete("/{saved_id}")
async def delete_saved(
    saved_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(SavedItem).where(SavedItem.id == saved_id, SavedItem.user_id == user.id)
    )
    row = res.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Saved item not found")
    await db.delete(row)
    await db.commit()
    return {"deleted": True}


# ── Share links ───────────────────────────────────────────────────────────────
@share_router.post("")
async def create_share(
    body: ShareRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.item_type not in ("event", "deal", "route"):
        raise HTTPException(status_code=400, detail="item_type must be event|deal|route")

    snapshot = await _build_snapshot(body.item_type, body.item_id, db)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(hours=body.ttl_hours)
        if body.ttl_hours and body.ttl_hours > 0 else None
    )
    link = ShareLink(
        token=ShareLink.new_token(),
        user_id=user.id,
        item_type=body.item_type,
        item_id=body.item_id,
        snapshot=snapshot,
        expires_at=expires_at,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    # Build absolute URL based on incoming request
    base = str(request.base_url).rstrip("/")
    # Strip trailing /api if present (frontend lives at root)
    if base.endswith("/api"):
        base = base[:-4]
    url = f"{base}/share/{link.token}"

    return {
        "token": link.token,
        "url": url,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
    }


@share_router.get("/{token}")
async def resolve_share(token: str, db: AsyncSession = Depends(get_db)):
    """Public — no auth. Returns the cached snapshot."""
    res = await db.execute(select(ShareLink).where(ShareLink.token == token))
    link = res.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")
    if link.expires_at and link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Share link expired")

    link.view_count = (link.view_count or 0) + 1
    await db.commit()

    return {
        "item_type": link.item_type,
        "item_id": link.item_id,
        "snapshot": link.snapshot,
        "view_count": link.view_count,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
    }
