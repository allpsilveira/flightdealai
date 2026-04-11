"""
Manual scan API — admin-only endpoint to trigger a scan on demand.
Used for testing and for on-demand re-scans from the UI.
"""
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_superuser
from app.database import get_db
from app.models.route import Route
from app.models.user import User
from app.services.scanner import scan_route

router = APIRouter()


class ManualScanRequest(BaseModel):
    origins:      list[str]
    destinations: list[str]
    cabin_classes: list[str]
    date_from:    date
    date_to:      date
    include_searchapi: bool = True

    @field_validator("cabin_classes")
    @classmethod
    def validate_cabins(cls, v):
        valid = {"BUSINESS", "FIRST", "PREMIUM_ECONOMY", "ECONOMY"}
        for c in v:
            if c not in valid:
                raise ValueError(f"Invalid cabin class: {c}")
        return v


class ScanResponse(BaseModel):
    route_id:      str
    origins:       list[str]
    destinations:  list[str]
    cabin_classes: list[str]
    dates_scanned: list[str]
    sources:       dict[str, int]
    best_prices:   list[dict]


@router.post("/manual", response_model=ScanResponse)
async def manual_scan(
    req: ManualScanRequest,
    user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger an ad-hoc scan with custom parameters.
    Admin only. Creates a temporary route_id for storage purposes.
    Results are stored to hypertables and returned immediately.
    """
    temp_route_id = uuid.uuid4()

    result = await scan_route(
        route_id=temp_route_id,
        origins=req.origins,
        destinations=req.destinations,
        cabin_classes=req.cabin_classes,
        date_from=req.date_from,
        date_to=req.date_to,
        db=db,
        include_searchapi=req.include_searchapi,
    )
    return result


@router.post("/route/{route_id}", response_model=ScanResponse)
async def scan_saved_route(
    route_id: uuid.UUID,
    include_searchapi: bool = True,
    user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger a scan for an existing saved route by ID.
    Admin only. Uses the route's configured origins, destinations, and date range.
    """
    result = await db.execute(select(Route).where(Route.id == route_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    scan_result = await scan_route(
        route_id=route.id,
        origins=route.origins,
        destinations=route.destinations,
        cabin_classes=route.cabin_classes,
        date_from=route.date_from,
        date_to=route.date_to,
        db=db,
        include_searchapi=include_searchapi,
    )
    return scan_result
