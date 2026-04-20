"""
Outcome tracker — Phase 6.5.1
Labels historical DealAnalysis rows with what actually happened in the days that followed.
Used as ground-truth labels for the weight-learner ML model.

Algorithm:
  For each unlabeled deal D with deal_time T and price P:
    - Look at all subsequent prices for the same (route_id, departure_date, cabin_class)
      in the window [T+1d, T+horizon_days]
    - Compute: did_drop_5/10/20pct, max_drop_pct, days_to_min, final_min_price
    - Insert one DealOutcome row, marked as labeled.

Idempotent: skips deals that already have an outcome row.
"""
import structlog
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deal import DealAnalysis
from app.models.intelligence import DealOutcome
from app.models.prices import GooglePrice

logger = structlog.get_logger(__name__)


async def label_pending_deals(
    db: AsyncSession,
    horizon_days: int = 14,
    max_age_days: int = 60,
    batch_size: int = 500,
) -> int:
    """
    Find deals older than `horizon_days` (so we have full forward data)
    but newer than `max_age_days`, that don't yet have a DealOutcome row.
    Label each one. Returns the count labeled.
    """
    now = datetime.now(timezone.utc)
    upper = now - timedelta(days=horizon_days)        # deal_time must be at most this old
    lower = now - timedelta(days=max_age_days)        # don't bother with very old deals

    # Subquery: deal_analysis IDs that already have outcomes
    labeled_subq = select(DealOutcome.deal_analysis_id)

    stmt = (
        select(DealAnalysis)
        .where(and_(
            DealAnalysis.time <= upper,
            DealAnalysis.time >= lower,
            DealAnalysis.id.notin_(labeled_subq),
        ))
        .order_by(DealAnalysis.time)
        .limit(batch_size)
    )
    deals = (await db.execute(stmt)).scalars().all()

    labeled = 0
    for deal in deals:
        outcome = await _label_one(db, deal, horizon_days)
        if outcome is not None:
            db.add(outcome)
            labeled += 1

    if labeled:
        await db.flush()
        logger.info("outcome_tracker_batch", labeled=labeled, horizon_days=horizon_days)
    return labeled


async def _label_one(db: AsyncSession, deal: DealAnalysis, horizon_days: int) -> DealOutcome | None:
    """Compute forward-looking labels for a single deal."""
    deal_time   = deal.time
    deal_price  = float(deal.best_price_usd or 0)
    if deal_price <= 0:
        return None

    window_end  = deal_time + timedelta(days=horizon_days)

    # Get all subsequent prices for the same route+date+cabin
    stmt = (
        select(GooglePrice.time, func.min(GooglePrice.price_usd).label("min_price"))
        .where(and_(
            GooglePrice.route_id      == deal.route_id,
            GooglePrice.departure_date == deal.departure_date,
            GooglePrice.cabin_class    == deal.cabin_class,
            GooglePrice.time          >  deal_time,
            GooglePrice.time          <= window_end,
            GooglePrice.price_usd     >  0,
        ))
        .group_by(GooglePrice.time)
        .order_by(GooglePrice.time)
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        # Insert an outcome row with NULL labels so we don't keep retrying
        return DealOutcome(
            deal_analysis_id=deal.id,
            deal_time=deal_time,
            horizon_days=horizon_days,
        )

    prices       = [(r.time, float(r.min_price)) for r in rows]
    min_time, min_price = min(prices, key=lambda x: x[1])
    days_to_min  = max(0, (min_time - deal_time).days)
    max_drop_pct = (deal_price - min_price) / deal_price * 100.0 if deal_price > 0 else 0.0

    return DealOutcome(
        deal_analysis_id=deal.id,
        deal_time=deal_time,
        horizon_days=horizon_days,
        did_drop_5pct  = max_drop_pct >= 5.0,
        did_drop_10pct = max_drop_pct >= 10.0,
        did_drop_20pct = max_drop_pct >= 20.0,
        max_drop_pct   = round(max_drop_pct, 2),
        days_to_min    = days_to_min,
        final_min_price= round(min_price, 2),
    )
