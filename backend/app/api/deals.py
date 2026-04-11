import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.deal import DealAnalysis
from app.models.user import User

router = APIRouter()


class DealResponse(BaseModel):
    id: uuid.UUID
    time: datetime
    route_id: uuid.UUID
    origin: str
    destination: str
    cabin_class: str
    best_price_usd: float
    best_source: str
    score_total: float
    action: str
    is_gem: bool
    is_error_fare: bool
    sources_confirmed: list[str]
    google_price_level: str | None
    seats_remaining: int | None
    fare_brand_name: str | None
    best_award_miles: int | None
    best_award_program: str | None
    best_cpp: float | None
    ai_recommendation_en: str | None
    ai_recommendation_pt: str | None

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[DealResponse])
async def list_deals(
    min_score: float = Query(default=0, ge=0),
    cabin_class: str | None = Query(default=None),
    action: str | None = Query(default=None),
    gems_only: bool = Query(default=False),
    limit: int = Query(default=50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the most recent deal analysis snapshot per (route, origin, dest, cabin, date)."""
    stmt = (
        select(DealAnalysis)
        .where(DealAnalysis.score_total >= min_score)
        .order_by(desc(DealAnalysis.time))
        .limit(limit)
    )
    if cabin_class:
        stmt = stmt.where(DealAnalysis.cabin_class == cabin_class)
    if action:
        stmt = stmt.where(DealAnalysis.action == action)
    if gems_only:
        stmt = stmt.where(DealAnalysis.is_gem.is_(True))

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{deal_id}", response_model=DealResponse)
async def get_deal(
    deal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(DealAnalysis).where(DealAnalysis.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal
