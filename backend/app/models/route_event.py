"""
Route events table — Zillow-style activity timeline.
Regular table (NOT hypertable) — events are sparse and deletion is FK-cascaded with routes.
"""
import uuid
from datetime import datetime
from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# Event type catalog (also used by event_generator.py)
EVENT_TYPES = {
    "price_drop",
    "price_rise",
    "error_fare",
    "award_opened",
    "award_closed",
    "airport_arbitrage",
    "trend_reversal",
    "new_low",
    "stable",
    "monitoring_started",
    "fare_brand_detected",
    "scarcity_alert",
    "ai_insight",
    "correlation_alert",  # Phase 6.5
    "price_target_hit",  # Phase 8
}

SEVERITY_LEVELS = {"critical", "high", "medium", "low", "info"}


class RouteEvent(Base):
    __tablename__ = "route_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("routes.id", ondelete="CASCADE"), nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="info")
    headline: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    subtext: Mapped[str | None] = mapped_column(Text, nullable=True)
    airline: Mapped[str | None] = mapped_column(String(50), nullable=True)
    price_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    previous_price_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Reference to deal_analysis.id (UUID). Not enforced FK because deal_analysis is a hypertable.
    deal_analysis_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    event_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    __table_args__ = (
        Index("ix_route_events_route_time", "route_id", "timestamp"),
        Index("ix_route_events_event_type", "event_type"),
        Index("ix_route_events_severity", "severity"),
    )
