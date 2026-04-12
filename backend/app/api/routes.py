import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.route import Route
from app.models.user import User

router = APIRouter()


class RouteCreate(BaseModel):
    name: str
    origins: list[str]
    destinations: list[str]
    cabin_classes: list[str]
    date_from: date
    date_to: date
    trip_type: str = "ONE_WAY"
    return_date_offset_days: int | None = None
    max_drive_hours: float | None = None


class RouteResponse(BaseModel):
    id: uuid.UUID
    name: str
    origins: list[str]
    destinations: list[str]
    cabin_classes: list[str]
    date_from: date
    date_to: date
    trip_type: str
    return_date_offset_days: int | None
    max_drive_hours: float | None
    is_active: bool
    priority_tier: str

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[RouteResponse])
async def list_routes(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Route).where(Route.user_id == user.id))
    return result.scalars().all()


@router.post("/", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
async def create_route(
    body: RouteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    route = Route(id=uuid.uuid4(), user_id=user.id, **body.model_dump())
    db.add(route)
    await db.flush()
    return route


@router.patch("/{route_id}", response_model=RouteResponse)
async def update_route(
    route_id: uuid.UUID,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Route).where(Route.id == route_id, Route.user_id == user.id)
    )
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    allowed = {"name", "origins", "destinations", "cabin_classes", "date_from", "date_to", "is_active"}
    for key, value in body.items():
        if key in allowed:
            setattr(route, key, value)
    await db.flush()
    return route


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route(
    route_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Route).where(Route.id == route_id, Route.user_id == user.id)
    )
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    await db.delete(route)
