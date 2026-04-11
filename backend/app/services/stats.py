"""
Rolling statistics helper — reads from the price_daily_stats continuous aggregate.
Used by the scoring engine and the price history API endpoint.
"""
import structlog
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)


async def get_daily_stats(
    db: AsyncSession,
    route_id: UUID,
    origin: str,
    destination: str,
    cabin_class: str,
    lookback_days: int = 90,
) -> dict[str, Any] | None:
    """
    Returns the most-recent aggregated row from price_daily_stats
    covering the last `lookback_days` for this (route, od, cabin) combo.
    Returns None when there's insufficient data (<7 samples).
    """
    try:
        result = await db.execute(
            text("""
                SELECT
                    AVG(avg_price)    AS avg_price,
                    MIN(min_price)    AS min_price,
                    MAX(max_price)    AS max_price,
                    AVG(stddev_price) AS stddev_price,
                    MIN(p5)           AS p5,
                    MIN(p10)          AS p10,
                    MIN(p20)          AS p20,
                    MIN(p25)          AS p25,
                    MIN(p30)          AS p30,
                    AVG(p50)          AS p50,
                    MAX(p75)          AS p75,
                    MAX(p90)          AS p90,
                    SUM(sample_count) AS total_samples
                FROM price_daily_stats
                WHERE route_id    = :route_id
                  AND origin      = :origin
                  AND destination = :destination
                  AND cabin_class = :cabin_class
                  AND bucket >= NOW() - make_interval(days => :days)
            """),
            {
                "route_id":    str(route_id),
                "origin":      origin,
                "destination": destination,
                "cabin_class": cabin_class,
                "days":        lookback_days,
            },
        )
        row = result.mappings().first()
        if not row or not row["total_samples"] or row["total_samples"] < 7:
            return None
        return dict(row)
    except Exception as exc:
        logger.warning("stats_fetch_failed", error=str(exc))
        return None


async def get_price_slope_7d(
    db: AsyncSession,
    route_id: UUID,
    origin: str,
    destination: str,
    cabin_class: str,
) -> float | None:
    """
    Returns the 7-day price trend slope ($/day).
    Negative = prices falling (good). Positive = prices rising.
    Returns None if insufficient data.
    """
    try:
        result = await db.execute(
            text("""
                SELECT regr_slope(avg_price, EXTRACT(EPOCH FROM bucket)) AS slope
                FROM price_daily_stats
                WHERE route_id    = :route_id
                  AND origin      = :origin
                  AND destination = :destination
                  AND cabin_class = :cabin_class
                  AND bucket >= NOW() - INTERVAL '7 days'
                HAVING COUNT(*) >= 3
            """),
            {"route_id": str(route_id), "origin": origin,
             "destination": destination, "cabin_class": cabin_class},
        )
        row = result.first()
        return float(row[0]) if row and row[0] is not None else None
    except Exception:
        return None


async def get_data_age_days(
    db: AsyncSession,
    route_id: UUID,
    origin: str,
    destination: str,
    cabin_class: str,
) -> int:
    """Returns how many days of data we have for cold-start detection."""
    try:
        result = await db.execute(
            text("""
                SELECT EXTRACT(DAY FROM NOW() - MIN(bucket))::int AS age_days
                FROM price_daily_stats
                WHERE route_id    = :route_id
                  AND origin      = :origin
                  AND destination = :destination
                  AND cabin_class = :cabin_class
            """),
            {"route_id": str(route_id), "origin": origin,
             "destination": destination, "cabin_class": cabin_class},
        )
        row = result.first()
        return int(row[0]) if row and row[0] else 0
    except Exception:
        return 0
