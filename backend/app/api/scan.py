"""
Manual scan API — triggers a full scan + scoring pipeline on demand.

force_enrich=True  → Scan Now button: calls SerpApi + Duffel + Seats.aero
force_enrich=False → 4h background tripwire: SerpApi only, no enrichment
"""
import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.route import Route
from app.models.scan_history import ScanHistory
from app.models.user import User
from app.services.scanner import scan_route, expand_origins_by_drive
from app.services.deal_pipeline import run_pipeline_batch
from app.services import seats_aero_client
from app.config import get_settings

router = APIRouter()


class ManualScanRequest(BaseModel):
    origins:         list[str]
    destinations:    list[str]
    cabin_classes:   list[str]
    date_from:       date
    date_to:         date
    force_enrich:    bool = True   # True = also call Duffel + Seats.aero

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
    enriched:         bool


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
    force_enrich: bool = True,
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

    # ── 2. Run full scoring pipeline → writes DealAnalysis + FlightOffer rows ─
    deals = []
    try:
        deals = await run_pipeline_batch(
            route_id=route_id,
            scan_results=scan_result,
            db=db,
            force_enrich=force_enrich,
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
        **{k: v for k, v in scan_result.items() if k != "all_offers"},
        deals_scored=len(deals),
        scan_history_id=str(history.id),
        enriched=force_enrich,
    )


@router.post("/manual", response_model=ScanResponse)
async def manual_scan(
    req: ManualScanRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger an ad-hoc scan. force_enrich=True (default) calls Duffel + Seats.aero
    for the full price comparison panel. Set false for a quick SerpApi-only check.
    """
    return await _run_and_log(
        route_id=uuid.uuid4(),
        origins=req.origins,
        destinations=req.destinations,
        cabin_classes=req.cabin_classes,
        date_from=req.date_from,
        date_to=req.date_to,
        deep=True,
        db=db,
        force_enrich=req.force_enrich,
    )


@router.post("/route/{route_id}", response_model=ScanResponse)
async def scan_saved_route(
    route_id: uuid.UUID,
    force_enrich: bool = True,
    trigger_type: str = Query(default="manual"),  # manual | scheduled | airflow
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger a scan for a saved route. This is the "Scan Now" button endpoint.
    force_enrich=True (default) — calls all three sources.
    force_enrich=False — used by the 4h background scheduler (SerpApi only).
    trigger_type — "manual" (user-initiated) | "scheduled" (Airflow/cron).
    """
    result = await db.execute(select(Route).where(Route.id == route_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    # Expand origins with nearby airports the user is willing to drive to
    effective_origins = expand_origins_by_drive(route.origins, route.max_drive_hours)

    return await _run_and_log(
        route_id=route.id,
        origins=effective_origins,
        destinations=route.destinations,
        cabin_classes=route.cabin_classes,
        date_from=route.date_from,
        date_to=route.date_to,
        deep=True,
        db=db,
        trigger_type=trigger_type,
        force_enrich=force_enrich,
    )


@router.get("/history", response_model=list[ScanHistoryResponse])
async def scan_history(
    route_id: uuid.UUID | None = Query(default=None),
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns recent scan history, newest first. Optionally filtered by route_id."""
    stmt = (
        select(ScanHistory)
        .order_by(desc(ScanHistory.triggered_at))
        .limit(limit)
    )
    if route_id:
        stmt = stmt.where(ScanHistory.route_id == route_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/diagnostics")
async def diagnostics(
    user: User = Depends(get_current_user),
):
    """
    Checks API key configuration for all data sources.
    Visit /docs → GET /scan/diagnostics to verify connectivity without running a full scan.
    """
    cfg = get_settings()
    seats = await seats_aero_client.ping()
    return {
        "serpapi":    {"key_set": bool(cfg.serpapi_api_key),   "key_preview": cfg.serpapi_api_key[:8] + "…" if cfg.serpapi_api_key else "NOT SET"},
        "duffel":     {"key_set": bool(cfg.duffel_api_key),    "key_preview": cfg.duffel_api_key[:12] + "…" if cfg.duffel_api_key else "NOT SET"},
        "seats_aero": {
            "key_set":     bool(cfg.seats_aero_api_key),
            "key_preview": cfg.seats_aero_api_key[:10] + "…" if cfg.seats_aero_api_key else "NOT SET",
            "ping":        seats,
        },
        "anthropic":  {"key_set": bool(cfg.anthropic_api_key), "key_preview": cfg.anthropic_api_key[:10] + "…" if cfg.anthropic_api_key else "NOT SET"},
    }
