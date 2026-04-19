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


class AirportComparePoint(BaseModel):
    origin: str
    destination: str
    cabin_class: str
    current_price: float | None
    avg_30d: float | None
    avg_90d: float | None
    min_90d: float | None
    sample_count: int


@router.get("/compare/{route_id}", response_model=list[AirportComparePoint])
async def compare_airports(
    route_id: uuid.UUID,
    cabin_class: str = Query(...),
    days: int = Query(default=90, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregates per-origin stats for a route — powers the Airport Comparison page."""
    result = await db.execute(
        text("""
            SELECT
                origin,
                destination,
                cabin_class,
                AVG(avg_price) FILTER (WHERE bucket >= NOW() - INTERVAL '30 days') AS avg_30d,
                AVG(avg_price) FILTER (WHERE bucket >= NOW() - INTERVAL '90 days') AS avg_90d,
                MIN(min_price) FILTER (WHERE bucket >= NOW() - INTERVAL '90 days') AS min_90d,
                (
                    SELECT avg_price
                    FROM price_daily_stats sub
                    WHERE sub.route_id = pds.route_id
                      AND sub.origin = pds.origin
                      AND sub.destination = pds.destination
                      AND sub.cabin_class = pds.cabin_class
                    ORDER BY bucket DESC LIMIT 1
                ) AS current_price,
                COUNT(*) AS sample_count
            FROM price_daily_stats pds
            WHERE route_id = :route_id
              AND cabin_class = :cabin_class
              AND bucket >= NOW() - make_interval(days => :days)
            GROUP BY route_id, origin, destination, cabin_class
            ORDER BY avg_90d ASC NULLS LAST
        """),
        {"route_id": str(route_id), "cabin_class": cabin_class, "days": days},
    )
    return [dict(row._mapping) for row in result]


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


@router.get("/cheapest-dates/{route_id}")
async def cheapest_dates(
    route_id: uuid.UUID,
    cabin_class: str = Query(...),
    days_ahead: int = Query(60, le=180),
    origin: str | None = Query(None),
    destination: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Cheapest known price per departure_date in next N days.
    Color level: cheap (≤ p25), normal, expensive (≥ p75). Powers CheapestDateStrip.
    """
    where_extras = []
    params: dict = {
        "route_id": str(route_id),
        "cabin": cabin_class,
        "days": days_ahead,
    }
    if origin:
        where_extras.append("AND origin = :origin")
        params["origin"] = origin
    if destination:
        where_extras.append("AND destination = :destination")
        params["destination"] = destination
    extras = " ".join(where_extras)

    result = await db.execute(
        text(f"""
            SELECT
                departure_date::text AS date,
                MIN(best_price_usd)::float AS price,
                COUNT(*) AS samples
            FROM deal_analysis
            WHERE route_id = :route_id
              AND cabin_class = :cabin
              AND departure_date >= CURRENT_DATE
              AND departure_date <= CURRENT_DATE + make_interval(days => :days)
              AND time >= NOW() - INTERVAL '14 days'
              {extras}
            GROUP BY departure_date
            ORDER BY departure_date
        """),
        params,
    )
    rows = result.mappings().all()
    if not rows:
        return {"dates": [], "p25": None, "p75": None}

    prices_sorted = sorted(float(r["price"]) for r in rows)
    n = len(prices_sorted)
    p25 = prices_sorted[max(0, n // 4 - 1)] if n >= 4 else prices_sorted[0]
    p75 = prices_sorted[min(n - 1, (3 * n) // 4)] if n >= 4 else prices_sorted[-1]

    def level(p: float) -> str:
        if p <= p25:
            return "cheap"
        if p >= p75:
            return "expensive"
        return "normal"

    return {
        "dates": [
            {
                "date": r["date"],
                "price": float(r["price"]),
                "samples": int(r["samples"]),
                "level": level(float(r["price"])),
            }
            for r in rows
        ],
        "p25": p25,
        "p75": p75,
    }
