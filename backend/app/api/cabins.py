from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.cabin_quality import CabinQuality
from app.models.user import User

router = APIRouter()


@router.get("/")
async def list_cabins(
    airline: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CabinQuality).order_by(CabinQuality.quality_score.desc())
    if airline:
        stmt = stmt.where(CabinQuality.airline_code == airline.upper())
    result = await db.execute(stmt)
    return result.scalars().all()
