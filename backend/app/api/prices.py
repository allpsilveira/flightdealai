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
    """
    Daily price series for the route chart.

    Reads directly from deal_analysis (not the continuous aggregate) so a fresh
    scan shows up immediately, even with only 1 sample.

    For each scan-day we keep the *latest* scan per departure_date — so a manual
    "Scan Now" issued after the scheduled scan supersedes it for that day. Then
    we aggregate across departure_dates within the scan-day for chart stats.
    """
    result = await db.execute(
        text("""
            WITH latest_per_day_per_dep AS (
                SELECT DISTINCT ON (date_trunc('day', time), departure_date)
                    date_trunc('day', time) AS scan_day,
                    departure_date,
                    best_price_usd
                FROM deal_analysis
                WHERE route_id = :route_id
                  AND origin = :origin
                  AND destination = :destination
                  AND cabin_class = :cabin_class
                  AND time >= NOW() - make_interval(days => :days)
                ORDER BY date_trunc('day', time), departure_date, time DESC
            )
            SELECT
                scan_day::text                              AS bucket,
                MIN(best_price_usd)::float                  AS min_price,
                AVG(best_price_usd)::float                  AS avg_price,
                MAX(best_price_usd)::float                  AS max_price,
                percentile_cont(0.10) WITHIN GROUP (ORDER BY best_price_usd)::float AS p10,
                percentile_cont(0.50) WITHIN GROUP (ORDER BY best_price_usd)::float AS p50,
                percentile_cont(0.90) WITHIN GROUP (ORDER BY best_price_usd)::float AS p90,
                COUNT(*)::int                               AS sample_count
            FROM latest_per_day_per_dep
            GROUP BY scan_day
            ORDER BY scan_day ASC
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
