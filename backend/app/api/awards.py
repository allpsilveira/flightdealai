import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.prices import AwardPrice
from app.models.user import User

router = APIRouter()


class AwardResponse(BaseModel):
    id: uuid.UUID
    time: datetime
    route_id: uuid.UUID
    origin: str
    destination: str
    departure_date: str
    cabin_class: str
    loyalty_program: str
    miles_cost: int
    cash_taxes_usd: float
    seats_available: int
    operating_airline: str | None
    cpp_value: float | None

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[AwardResponse])
async def list_awards(
    route_id: uuid.UUID | None = Query(default=None),
    cabin_class: str | None = Query(default=None),
    origin: str | None = Query(default=None),
    destination: str | None = Query(default=None),
    min_seats: int = Query(default=1, ge=1),
    limit: int = Query(default=50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the most recent award availability results, newest first."""
    stmt = (
        select(AwardPrice)
        .order_by(desc(AwardPrice.time))
        .limit(limit)
    )
    if route_id:
        stmt = stmt.where(AwardPrice.route_id == route_id)
    if cabin_class:
        stmt = stmt.where(AwardPrice.cabin_class == cabin_class)
    if origin:
        stmt = stmt.where(AwardPrice.origin == origin)
    if destination:
        stmt = stmt.where(AwardPrice.destination == destination)
    if min_seats > 1:
        stmt = stmt.where(AwardPrice.seats_available >= min_seats)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    # Convert date to string for Pydantic
    return [
        AwardResponse(
            **{c.key: getattr(r, c.key) for c in AwardPrice.__table__.columns
               if c.key != "departure_date"},
            departure_date=r.departure_date.isoformat(),
        )
        for r in rows
    ]


@router.get("/best/{route_id}", response_model=list[AwardResponse])
async def best_awards_for_route(
    route_id: uuid.UUID,
    cabin_class: str = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the best (lowest miles) award options for a route, one per loyalty program."""
    # Subquery: min miles per program for this route/cabin in last 48h
    result = await db.execute(
        select(AwardPrice)
        .where(AwardPrice.route_id == route_id)
        .where(AwardPrice.cabin_class == cabin_class)
        .where(AwardPrice.time >= (
            select(AwardPrice.time)
            .where(AwardPrice.route_id == route_id)
            .where(AwardPrice.cabin_class == cabin_class)
            .order_by(desc(AwardPrice.time))
            .limit(1)
            .scalar_subquery()
        ) - 172800)  # within 48h of the latest scan
        .where(AwardPrice.seats_available >= 1)
        .order_by(AwardPrice.loyalty_program, AwardPrice.miles_cost)
    )
    rows = result.scalars().all()

    # Deduplicate: one row per loyalty_program (already sorted cheapest first)
    seen_programs: set[str] = set()
    deduped = []
    for r in rows:
        if r.loyalty_program not in seen_programs:
            seen_programs.add(r.loyalty_program)
            deduped.append(
                AwardResponse(
                    **{c.key: getattr(r, c.key) for c in AwardPrice.__table__.columns
                       if c.key != "departure_date"},
                    departure_date=r.departure_date.isoformat(),
                )
            )
    return sorted(deduped, key=lambda x: x.miles_cost)
