"""
TimescaleDB hypertable for deal analysis results — the output of the scoring engine.
Each row is one scored deal snapshot.
"""
import uuid
from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DealAnalysis(Base):
    __tablename__ = "deal_analysis"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, primary_key=True)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    best_price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    best_source: Mapped[str] = mapped_column(String(20), nullable=False)  # google|duffel (amadeus/kiwi historical)
    airline_code: Mapped[str | None] = mapped_column(String(3), nullable=True)

    # ── Score breakdown ────────────────────────────────────────────────────────
    score_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    score_percentile: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    score_zscore: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    score_trend_alignment: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    score_trend_direction: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    score_cross_source: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    score_arbitrage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    score_fare_brand: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    score_scarcity: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    score_award: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── Action + flags ─────────────────────────────────────────────────────────
    # STRONG_BUY | BUY | WATCH | NORMAL | SKIP
    action: Mapped[str] = mapped_column(String(15), nullable=False, default="NORMAL")
    is_gem: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_error_fare: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sources_confirmed: Mapped[list[str]] = mapped_column(ARRAY(String(20)), nullable=False, default=list)

    # ── Context ────────────────────────────────────────────────────────────────
    percentile_position: Mapped[float | None] = mapped_column(Float, nullable=True)
    zscore: Mapped[float | None] = mapped_column(Float, nullable=True)
    google_price_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    typical_price_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    typical_price_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_direct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    seats_remaining: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fare_brand_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    best_award_miles: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_award_program: Mapped[str | None] = mapped_column(String(50), nullable=True)
    best_cpp: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ── AI recommendation ─────────────────────────────────────────────────────
    ai_recommendation_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_recommendation_pt: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Alert tracking ────────────────────────────────────────────────────────
    alert_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    alert_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
