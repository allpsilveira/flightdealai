import uuid
from datetime import date
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User

router = APIRouter()


class PriceHistoryPoint(BaseModel):
    bucket: str
    min_price: float
    avg_price: float
    max_price: float
    p10: float | None
    p50: float | None
    p90: float | None
    sample_count: int


@router.get("/history/{route_id}", response_model=list[PriceHistoryPoint])
async def price_history(
    route_id: uuid.UUID,
    origin: str = Query(...),
    destination: str = Query(...),
    cabin_class: str = Query(...),
    days: int = Query(default=90, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns daily price stats from the continuous aggregate view."""
    result = await db.execute(
        text("""
            SELECT
                bucket::text,
                min_price, avg_price, max_price,
                p10, p50, p90,
                sample_count
            FROM price_daily_stats
            WHERE route_id = :route_id
              AND origin = :origin
              AND destination = :destination
              AND cabin_class = :cabin_class
              AND bucket >= NOW() - make_interval(days => :days)
            ORDER BY bucket ASC
        """),
        {
            "route_id": str(route_id),
            "origin": origin,
            "destination": destination,
            "cabin_class": cabin_class,
            "days": days,
        },
    )
    return [dict(row._mapping) for row in result]
