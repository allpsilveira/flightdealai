import uuid
from datetime import date, datetime
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import aliased
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
    departure_date: date
    cabin_class: str
    best_price_usd: float
    best_source: str
    airline_code: str | None
    is_direct: bool
    typical_price_low: float | None
    typical_price_high: float | None
    score_total: float
    score_percentile: float
    score_zscore: float
    score_trend_alignment: float
    score_trend_direction: float
    score_cross_source: float
    score_arbitrage: float
    score_fare_brand: float
    score_scarcity: float
    score_award: float
    action: str
    is_gem: bool
    is_error_fare: bool
    sources_confirmed: list[str]
    percentile_position: float | None
    zscore: float | None
    google_price_level: str | None
    seats_remaining: int | None
    fare_brand_name: str | None
    best_award_miles: int | None
    best_award_program: str | None
    best_cpp: float | None
    ai_recommendation_en: str | None
    ai_recommendation_pt: str | None
    price_prev_usd: float | None = None   # previous scan price for same combo

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[DealResponse])
async def list_deals(
    min_score: float = Query(default=0, ge=0),
    cabin_class: str | None = Query(default=None),
    action: str | None = Query(default=None),
    gems_only: bool = Query(default=False),
    route_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns scored deals. Supports route_id filter and includes price_prev_usd for delta display."""
    # Subquery: previous price for same (route, origin, dest, cabin, date)
    prev = aliased(DealAnalysis, flat=True)
    prev_price_sq = (
        select(prev.best_price_usd)
        .where(
            prev.route_id == DealAnalysis.route_id,
            prev.origin == DealAnalysis.origin,
            prev.destination == DealAnalysis.destination,
            prev.cabin_class == DealAnalysis.cabin_class,
            prev.departure_date == DealAnalysis.departure_date,
            prev.time < DealAnalysis.time,
        )
        .order_by(desc(prev.time))
        .limit(1)
        .correlate(DealAnalysis)
        .scalar_subquery()
    )

    stmt = (
        select(DealAnalysis, prev_price_sq.label("price_prev_usd"))
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
    if route_id:
        stmt = stmt.where(DealAnalysis.route_id == route_id)

    rows = await db.execute(stmt)
    results = []
    for deal, price_prev in rows:
        d = DealResponse.model_validate(deal)
        d.price_prev_usd = price_prev
        results.append(d)
    return results


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
