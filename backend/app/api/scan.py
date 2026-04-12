"""
Manual scan API — triggers a full scan + scoring pipeline on demand.
Stores raw prices, runs deal_pipeline, logs scan history, returns results.
"""
import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.route import Route
from app.models.scan_history import ScanHistory
from app.models.user import User
from app.services.scanner import scan_route
from app.services.deal_pipeline import run_pipeline_batch

router = APIRouter()


class ManualScanRequest(BaseModel):
    origins:       list[str]
    destinations:  list[str]
    cabin_classes: list[str]
    date_from:     date
    date_to:       date
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
    route_id:         str
    origins:          list[str]
    destinations:     list[str]
    cabin_classes:    list[str]
    dates_scanned:    list[str]
    sources:          dict[str, int]
    best_prices:      list[dict]
    deals_scored:     int
    scan_history_id:  str


class ScanHistoryResponse(BaseModel):
    id: uuid.UUID
    route_id: uuid.UUID | None
    triggered_at: datetime
    trigger_type: str
    origins: str
    destinations: str
    cabin_classes: str
    prices_collected: int
    deals_scored: int
    best_price_usd: float | None
    best_origin: str | None
    best_destination: str | None
    best_cabin: str | None
    status: str

    model_config = {"from_attributes": True}


async def _run_and_log(
    route_id: uuid.UUID,
    origins: list[str],
    destinations: list[str],
    cabin_classes: list[str],
    date_from: date,
    date_to: date,
    deep: bool,
    db: AsyncSession,
    trigger_type: str = "manual",
) -> ScanResponse:
    # ── 1. Collect raw prices via SerpApi ─────────────────────────────────────
    scan_result = await scan_route(
        route_id=route_id,
        origins=origins,
        destinations=destinations,
        cabin_classes=cabin_classes,
        date_from=date_from,
        date_to=date_to,
        db=db,
        deep=deep,
    )

    # ── 2. Run full scoring pipeline → writes DealAnalysis rows ───────────────
    deals = []
    try:
        deals = await run_pipeline_batch(
            route_id=route_id,
            scan_results=scan_result,
            db=db,
        )
    except Exception as exc:
        import structlog
        structlog.get_logger(__name__).warning("pipeline_batch_failed", error=str(exc))

    # ── 3. Log scan history ────────────────────────────────────────────────────
    best = scan_result["best_prices"][0] if scan_result["best_prices"] else None
    history = ScanHistory(
        id=uuid.uuid4(),
        route_id=route_id if route_id != uuid.UUID(int=0) else None,
        triggered_at=datetime.now(timezone.utc),
        trigger_type=trigger_type,
        origins=",".join(origins),
        destinations=",".join(destinations),
        cabin_classes=",".join(cabin_classes),
        prices_collected=scan_result["sources"].get("serpapi", 0),
        deals_scored=len(deals),
        best_price_usd=best["price_usd"] if best else None,
        best_origin=best["origin"] if best else None,
        best_destination=best["destination"] if best else None,
        best_cabin=best["cabin_class"] if best else None,
        status="ok",
    )
    db.add(history)
    await db.commit()

    return ScanResponse(
        **scan_result,
        deals_scored=len(deals),
        scan_history_id=str(history.id),
    )


@router.post("/manual", response_model=ScanResponse)
async def manual_scan(
    req: ManualScanRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger an ad-hoc scan with custom parameters."""
    return await _run_and_log(
        route_id=uuid.uuid4(),
        origins=req.origins,
        destinations=req.destinations,
        cabin_classes=req.cabin_classes,
        date_from=req.date_from,
        date_to=req.date_to,
        deep=req.include_searchapi,
        db=db,
    )


@router.post("/route/{route_id}", response_model=ScanResponse)
async def scan_saved_route(
    route_id: uuid.UUID,
    include_searchapi: bool = True,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a scan for an existing saved route by ID."""
    result = await db.execute(select(Route).where(Route.id == route_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    return await _run_and_log(
        route_id=route.id,
        origins=route.origins,
        destinations=route.destinations,
        cabin_classes=route.cabin_classes,
        date_from=route.date_from,
        date_to=route.date_to,
        deep=include_searchapi,
        db=db,
    )


@router.get("/history", response_model=list[ScanHistoryResponse])
async def scan_history(
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns recent scan history, newest first."""
    result = await db.execute(
        select(ScanHistory)
        .order_by(desc(ScanHistory.triggered_at))
        .limit(limit)
    )
    return result.scalars().all()
