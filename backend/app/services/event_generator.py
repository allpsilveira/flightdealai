"""
Event generator — detects significant changes between deal scans and writes
RouteEvent rows that power the Zillow-style activity timeline.

Called from deal_pipeline after each DealAnalysis is stored. Compares the new
deal to the previous deal for the same (origin, dest, cabin, date) and emits
0..N events depending on what changed.

Dedup rule: skip event if an identical (route_id, event_type, severity) exists
within the last 2 hours (prevents spam from repeated 4h scans showing same low).
"""
import structlog
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.route_event import RouteEvent

logger = structlog.get_logger(__name__)


# Thresholds for event detection
PRICE_DROP_PCT = 5.0       # min % drop to fire price_drop event
PRICE_RISE_PCT = 10.0      # min % rise to fire price_rise event
DEDUP_WINDOW_HOURS = 2     # skip identical events within this window


async def _exists_recent(
    db: AsyncSession,
    route_id: UUID,
    event_type: str,
    severity: str,
) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=DEDUP_WINDOW_HOURS)
    stmt = select(RouteEvent.id).where(
        and_(
            RouteEvent.route_id == route_id,
            RouteEvent.event_type == event_type,
            RouteEvent.severity == severity,
            RouteEvent.timestamp >= cutoff,
        )
    ).limit(1)
    result = await db.execute(stmt)
    return result.scalar() is not None


def _severity_for_drop_pct(pct: float) -> str:
    if pct >= 25:
        return "high"
    if pct >= 15:
        return "medium"
    return "low"


def _severity_for_rise_pct(pct: float) -> str:
    if pct >= 30:
        return "medium"
    return "low"


async def generate_events(
    db: AsyncSession,
    route_id: UUID,
    deal: dict[str, Any],
    previous_deal: dict[str, Any] | None,
    stats: dict[str, Any] | None,
    previous_slope: float | None = None,
    new_slope: float | None = None,
    is_first_scan: bool = False,
) -> list[RouteEvent]:
    """
    Detect events and persist them. Returns the list of events created.

    deal/previous_deal: dicts with at least best_price_usd, airline_code,
                        seats_remaining, is_error_fare, is_gem, action,
                        best_award_miles, fare_brand_name, departure_date, etc.
    """
    events: list[RouteEvent] = []
    now = datetime.now(timezone.utc)

    origin = deal.get("origin", "")
    dest = deal.get("destination", "")
    cabin = deal.get("cabin_class", "")
    deal_id = deal.get("id")
    if isinstance(deal_id, str):
        try:
            deal_id = UUID(deal_id)
        except ValueError:
            deal_id = None

    price = deal.get("best_price_usd")
    airline = deal.get("airline_code") or (deal.get("airline_codes") or [None])[0]
    base_route = f"{origin}→{dest} {cabin.title()}"

    # ── First-ever scan event ──────────────────────────────────────────────
    if is_first_scan:
        events.append(RouteEvent(
            route_id=route_id,
            timestamp=now,
            event_type="monitoring_started",
            severity="info",
            headline=f"Monitoring started for {base_route}",
            detail=f"First scan complete. Best price found: ${price:,.0f}" if price else "First scan complete.",
            airline=airline,
            price_usd=price,
            deal_analysis_id=deal_id,
        ))

    # ── Price change events ────────────────────────────────────────────────
    if previous_deal and price and previous_deal.get("best_price_usd"):
        prev = previous_deal["best_price_usd"]
        delta = price - prev
        pct = (delta / prev) * 100.0 if prev else 0.0

        if pct <= -PRICE_DROP_PCT:
            severity = _severity_for_drop_pct(abs(pct))
            if not await _exists_recent(db, route_id, "price_drop", severity):
                events.append(RouteEvent(
                    route_id=route_id,
                    timestamp=now,
                    event_type="price_drop",
                    severity=severity,
                    headline=f"Price dropped {abs(pct):.0f}% on {base_route}",
                    detail=f"${prev:,.0f} → ${price:,.0f} (saved ${abs(delta):,.0f})",
                    subtext=f"on {airline}" if airline else None,
                    airline=airline,
                    price_usd=price,
                    previous_price_usd=prev,
                    deal_analysis_id=deal_id,
                ))
        elif pct >= PRICE_RISE_PCT:
            severity = _severity_for_rise_pct(pct)
            if not await _exists_recent(db, route_id, "price_rise", severity):
                events.append(RouteEvent(
                    route_id=route_id,
                    timestamp=now,
                    event_type="price_rise",
                    severity=severity,
                    headline=f"Price rose {pct:.0f}% on {base_route}",
                    detail=f"${prev:,.0f} → ${price:,.0f}",
                    airline=airline,
                    price_usd=price,
                    previous_price_usd=prev,
                    deal_analysis_id=deal_id,
                ))

    # ── New 90-day low ─────────────────────────────────────────────────────
    if stats and price and stats.get("min_price"):
        if price < float(stats["min_price"]) and (price / float(stats["min_price"])) < 0.99:
            if not await _exists_recent(db, route_id, "new_low", "high"):
                events.append(RouteEvent(
                    route_id=route_id,
                    timestamp=now,
                    event_type="new_low",
                    severity="high",
                    headline=f"New 90-day low: ${price:,.0f} on {base_route}",
                    detail=f"Previous 90-day low was ${float(stats['min_price']):,.0f}",
                    airline=airline,
                    price_usd=price,
                    previous_price_usd=float(stats["min_price"]),
                    deal_analysis_id=deal_id,
                ))

    # ── Error fare detection ───────────────────────────────────────────────
    if deal.get("is_error_fare"):
        if not await _exists_recent(db, route_id, "error_fare", "critical"):
            events.append(RouteEvent(
                route_id=route_id,
                timestamp=now,
                event_type="error_fare",
                severity="critical",
                headline=f"⚠️ Possible error fare: ${price:,.0f} on {base_route}",
                detail="Price is statistically anomalous (z-score > 2.5σ). Book within hours if real.",
                subtext=f"on {airline}" if airline else None,
                airline=airline,
                price_usd=price,
                deal_analysis_id=deal_id,
            ))

    # ── Award availability ────────────────────────────────────────────────
    award_miles = deal.get("best_award_miles")
    prev_award = previous_deal.get("best_award_miles") if previous_deal else None

    if award_miles and not prev_award:
        program = deal.get("best_award_program") or "Unknown"
        if not await _exists_recent(db, route_id, "award_opened", "high"):
            events.append(RouteEvent(
                route_id=route_id,
                timestamp=now,
                event_type="award_opened",
                severity="high",
                headline=f"Award seats opened on {base_route}",
                detail=f"{award_miles:,} miles via {program}" + (
                    f" · {deal['best_cpp']:.1f}¢/pt" if deal.get("best_cpp") else ""
                ),
                airline=airline,
                price_usd=price,
                deal_analysis_id=deal_id,
                event_metadata={"miles": award_miles, "program": program},
            ))
    elif prev_award and not award_miles:
        if not await _exists_recent(db, route_id, "award_closed", "medium"):
            events.append(RouteEvent(
                route_id=route_id,
                timestamp=now,
                event_type="award_closed",
                severity="medium",
                headline=f"Award seats closed on {base_route}",
                detail=f"Was {prev_award:,} miles · cash only now",
                airline=airline,
                price_usd=price,
                deal_analysis_id=deal_id,
            ))

    # ── Trend reversal ────────────────────────────────────────────────────
    if previous_slope is not None and new_slope is not None:
        # Sign flipped meaningfully (not micro-noise)
        if previous_slope * new_slope < 0 and abs(new_slope - previous_slope) > 10:
            direction = "now falling" if new_slope < 0 else "now rising"
            severity = "medium" if new_slope < 0 else "low"
            if not await _exists_recent(db, route_id, "trend_reversal", severity):
                events.append(RouteEvent(
                    route_id=route_id,
                    timestamp=now,
                    event_type="trend_reversal",
                    severity=severity,
                    headline=f"Trend reversal on {base_route} — {direction}",
                    detail=f"7-day slope changed from ${previous_slope:+.0f}/day to ${new_slope:+.0f}/day",
                    price_usd=price,
                    deal_analysis_id=deal_id,
                ))

    # ── Scarcity alert ────────────────────────────────────────────────────
    seats = deal.get("seats_remaining")
    if seats and seats <= 3:
        if not await _exists_recent(db, route_id, "scarcity_alert", "medium"):
            events.append(RouteEvent(
                route_id=route_id,
                timestamp=now,
                event_type="scarcity_alert",
                severity="medium",
                headline=f"Only {seats} seat{'s' if seats > 1 else ''} left on {base_route}",
                detail=f"${price:,.0f} on {airline or 'this fare'}",
                airline=airline,
                price_usd=price,
                deal_analysis_id=deal_id,
            ))

    # ── Fare brand detected ───────────────────────────────────────────────
    fare_brand = deal.get("fare_brand_name")
    prev_brand = previous_deal.get("fare_brand_name") if previous_deal else None
    if fare_brand and fare_brand != prev_brand:
        if not await _exists_recent(db, route_id, "fare_brand_detected", "low"):
            events.append(RouteEvent(
                route_id=route_id,
                timestamp=now,
                event_type="fare_brand_detected",
                severity="low",
                headline=f"Fare brand: {fare_brand}",
                detail=f"on {base_route} via {airline or 'airline'}",
                airline=airline,
                price_usd=price,
                deal_analysis_id=deal_id,
            ))

    # ── AI insight (when AI recommendation generated) ─────────────────────
    if deal.get("ai_recommendation_en"):
        if not await _exists_recent(db, route_id, "ai_insight", "info"):
            snippet = deal["ai_recommendation_en"][:160]
            if len(deal["ai_recommendation_en"]) > 160:
                snippet += "…"
            events.append(RouteEvent(
                route_id=route_id,
                timestamp=now,
                event_type="ai_insight",
                severity="info",
                headline=f"AI analysis for {base_route}",
                detail=snippet,
                price_usd=price,
                deal_analysis_id=deal_id,
            ))

    # ── Stable (only fire once per day if literally nothing else fired) ───
    if not events and previous_deal:
        # Check if a stable event already exists today
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        stmt = select(RouteEvent.id).where(
            and_(
                RouteEvent.route_id == route_id,
                RouteEvent.event_type == "stable",
                RouteEvent.timestamp >= cutoff,
            )
        ).limit(1)
        existing = await db.execute(stmt)
        if existing.scalar() is None:
            events.append(RouteEvent(
                route_id=route_id,
                timestamp=now,
                event_type="stable",
                severity="info",
                headline=f"Prices stable on {base_route}",
                detail=f"Holding around ${price:,.0f}" if price else "No significant change",
                price_usd=price,
                deal_analysis_id=deal_id,
            ))

    # Persist
    if events:
        for e in events:
            db.add(e)
        try:
            await db.commit()
            logger.info(
                "events_generated",
                route_id=str(route_id),
                count=len(events),
                types=[e.event_type for e in events],
            )
        except Exception as exc:
            await db.rollback()
            logger.error("events_persist_failed", error=str(exc))
            return []

    return events
