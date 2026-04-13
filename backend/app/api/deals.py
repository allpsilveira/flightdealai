import uuid
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.deal import DealAnalysis
from app.models.prices import FlightOffer, DuffelPrice, AwardPrice
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
    price_prev_usd: float | None = None

    model_config = {"from_attributes": True}


class FlightOfferResponse(BaseModel):
    id: uuid.UUID
    deal_analysis_id: uuid.UUID | None
    primary_airline: str | None
    airline_codes: list[str]
    price_usd: float
    stops: int
    duration_minutes: int | None
    is_direct: bool
    departure_date: date | None = None
    origin: str | None = None
    destination: str | None = None

    model_config = {"from_attributes": True}


class DuffelEnrichment(BaseModel):
    price_usd: float
    fare_brand_name: str | None
    is_refundable: bool | None
    change_fee_usd: float | None
    baggage_included: bool
    expires_at: datetime | None
    airline_codes: list[str]
    scanned_at: datetime

    model_config = {"from_attributes": True}


class AwardOption(BaseModel):
    loyalty_program: str
    miles_cost: int
    cash_taxes_usd: float
    seats_available: int
    cpp_value: float | None
    operating_airline: str | None

    model_config = {"from_attributes": True}


class EnrichmentResponse(BaseModel):
    duffel: DuffelEnrichment | None
    awards: list[AwardOption]


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
    """
    Returns the latest scored deal per unique (origin, destination, cabin_class, departure_date).
    No duplicates — one card per unique flight combo, always the most recent scan.
    Includes price_prev_usd for delta display ("↓ $200 vs last scan").
    """
    # ── Subquery: latest scan time per (origin, dest, cabin, departure_date) ──
    latest_sq = (
        select(
            DealAnalysis.origin,
            DealAnalysis.destination,
            DealAnalysis.cabin_class,
            DealAnalysis.departure_date,
            func.max(DealAnalysis.time).label("latest_time"),
        )
        .where(DealAnalysis.score_total >= min_score)
        .group_by(
            DealAnalysis.origin,
            DealAnalysis.destination,
            DealAnalysis.cabin_class,
            DealAnalysis.departure_date,
        )
        .subquery()
    )

    # ── Subquery: previous price for delta display ─────────────────────────────
    from sqlalchemy.orm import aliased
    prev = aliased(DealAnalysis, flat=True)
    prev_price_sq = (
        select(prev.best_price_usd)
        .where(
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

    # ── Main query: join to get the full latest row per combo ─────────────────
    stmt = (
        select(DealAnalysis, prev_price_sq.label("price_prev_usd"))
        .join(
            latest_sq,
            and_(
                DealAnalysis.origin == latest_sq.c.origin,
                DealAnalysis.destination == latest_sq.c.destination,
                DealAnalysis.cabin_class == latest_sq.c.cabin_class,
                DealAnalysis.departure_date == latest_sq.c.departure_date,
                DealAnalysis.time == latest_sq.c.latest_time,
            ),
        )
        .order_by(desc(DealAnalysis.score_total))
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


@router.get("/offers/route/{route_id}", response_model=list[FlightOfferResponse])
async def get_route_offers(
    route_id: uuid.UUID,
    cabin_class: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the cheapest FlightOffer per airline across ALL deals for this route.
    Spans the full date range — not just one scan. Powers the AirlineLeaderboard.
    Includes deal_analysis_id so the frontend can open the correct deal panel per airline.
    """
    # Subquery: minimum price per (primary_airline, stops) combo for this route
    min_price_sq = (
        select(
            FlightOffer.primary_airline,
            FlightOffer.stops,
            func.min(FlightOffer.price_usd).label("min_price"),
        )
        .where(FlightOffer.route_id == route_id)
        .where(FlightOffer.primary_airline.isnot(None))
    )
    if cabin_class:
        min_price_sq = min_price_sq.where(FlightOffer.cabin_class == cabin_class)
    min_price_sq = min_price_sq.group_by(FlightOffer.primary_airline, FlightOffer.stops).subquery()

    # Main query: join to get the full offer row for each (airline, stops) cheapest price
    stmt = (
        select(FlightOffer)
        .join(
            min_price_sq,
            and_(
                FlightOffer.primary_airline == min_price_sq.c.primary_airline,
                FlightOffer.stops == min_price_sq.c.stops,
                FlightOffer.price_usd == min_price_sq.c.min_price,
            ),
        )
        .where(FlightOffer.route_id == route_id)
        .order_by(FlightOffer.price_usd.asc())
    )
    if cabin_class:
        stmt = stmt.where(FlightOffer.cabin_class == cabin_class)

    result = await db.execute(stmt)
    # Deduplicate (multiple rows can match at the same min price for an airline+stops combo)
    seen: set[str] = set()
    offers = []
    for offer in result.scalars().all():
        key = f"{offer.primary_airline or '??'}|{offer.stops}"
        if key not in seen:
            seen.add(key)
            offers.append(offer)
    return offers


@router.get("/{deal_id}/offers", response_model=list[FlightOfferResponse])
async def get_deal_offers(
    deal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the individual flight offers linked to this deal (by airline + stops).
    Sorted by price ascending. Powers the "Flight Options" breakdown in the modal.
    """
    result = await db.execute(
        select(FlightOffer)
        .where(FlightOffer.deal_analysis_id == deal_id)
        .order_by(FlightOffer.price_usd.asc())
    )
    return result.scalars().all()


@router.get("/{deal_id}/enrichment", response_model=EnrichmentResponse)
async def get_deal_enrichment(
    deal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the most recent Duffel (direct airline price) and Seats.aero (award)
    data for this deal's route combo. Used to populate the Price Sources panel.
    Looks back up to 48h to find the latest enrichment scan.
    """
    deal_result = await db.execute(
        select(DealAnalysis).where(DealAnalysis.id == deal_id)
    )
    deal = deal_result.scalar_one_or_none()
    if not deal:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Deal not found")

    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)

    # Latest Duffel price for this route combo
    duffel_result = await db.execute(
        select(DuffelPrice)
        .where(
            DuffelPrice.origin == deal.origin,
            DuffelPrice.destination == deal.destination,
            DuffelPrice.cabin_class == deal.cabin_class,
            DuffelPrice.departure_date == deal.departure_date,
            DuffelPrice.time >= cutoff,
        )
        .order_by(desc(DuffelPrice.time))
        .limit(1)
    )
    duffel = duffel_result.scalar_one_or_none()

    # Award options for this route combo (up to 5 best)
    awards_result = await db.execute(
        select(AwardPrice)
        .where(
            AwardPrice.origin == deal.origin,
            AwardPrice.destination == deal.destination,
            AwardPrice.cabin_class == deal.cabin_class,
            AwardPrice.departure_date == deal.departure_date,
            AwardPrice.time >= cutoff,
        )
        .order_by(AwardPrice.miles_cost.asc())
        .limit(5)
    )
    awards = awards_result.scalars().all()

    duffel_resp = None
    if duffel:
        duffel_resp = DuffelEnrichment(
            price_usd=duffel.price_usd,
            fare_brand_name=duffel.fare_brand_name,
            is_refundable=duffel.is_refundable,
            change_fee_usd=duffel.change_fee_usd,
            baggage_included=duffel.baggage_included,
            expires_at=duffel.expires_at,
            airline_codes=duffel.airline_codes,
            scanned_at=duffel.time,
        )

    return EnrichmentResponse(
        duffel=duffel_resp,
        awards=[
            AwardOption(
                loyalty_program=a.loyalty_program,
                miles_cost=a.miles_cost,
                cash_taxes_usd=a.cash_taxes_usd,
                seats_available=a.seats_available,
                cpp_value=a.cpp_value,
                operating_airline=a.operating_airline,
            )
            for a in awards
        ],
    )
