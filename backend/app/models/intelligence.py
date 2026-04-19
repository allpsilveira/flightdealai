"""
Data science intelligence tables: price predictions, price regimes, API usage tracking.
"""
import uuid
from datetime import date, datetime
from sqlalchemy import Date, DateTime, Float, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PricePrediction(Base):
    """Forecast outputs from intelligence.forecast_prices()."""
    __tablename__ = "price_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    predicted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    horizon_days: Mapped[int] = mapped_column(Integer, nullable=False)
    predicted_price: Mapped[float] = mapped_column(Float, nullable=False)
    confidence_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_type: Mapped[str] = mapped_column(String(30), nullable=False)  # linear|seasonal|knn_pattern
    prediction_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    __table_args__ = (
        Index("ix_price_predictions_route_target", "route_id", "target_date"),
        Index("ix_price_predictions_predicted_at", "predicted_at"),
    )


class PriceRegime(Base):
    """GMM-classified market regime for a route."""
    __tablename__ = "price_regimes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    regime_label: Mapped[str] = mapped_column(String(20), nullable=False)  # sale|normal|peak|error
    regime_probability: Mapped[float] = mapped_column(Float, nullable=False)
    price_threshold_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_threshold_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    sample_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    regime_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    __table_args__ = (
        Index("ix_price_regimes_route_computed", "route_id", "computed_at"),
    )


class ApiUsageLog(Base):
    """Tracks every external API call for cost + rate-limit monitoring."""
    __tablename__ = "api_usage_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # serpapi|duffel|seats_aero|anthropic
    endpoint: Mapped[str | None] = mapped_column(String(100), nullable=True)
    route_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_estimate_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    usage_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    __table_args__ = (
        Index("ix_api_usage_source_time", "source", "timestamp"),
        Index("ix_api_usage_timestamp", "timestamp"),
    )


class ScoringWeights(Base):
    """ML-learned weights for the scoring engine (Phase 6.5)."""
    __tablename__ = "scoring_weights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trained_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    model_type: Mapped[str] = mapped_column(String(30), nullable=False, default="xgboost")
    auc: Mapped[float | None] = mapped_column(Float, nullable=True)
    sample_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weights: Mapped[dict] = mapped_column(JSONB, nullable=False)  # {sub_score_name: weight}
    feature_importance: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=False)
    weights_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)


class DealOutcome(Base):
    """Forward-looking labels for ML training (Phase 6.5)."""
    __tablename__ = "deal_outcomes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    deal_analysis_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    deal_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    labeled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    did_drop_5pct: Mapped[bool | None] = mapped_column(nullable=True)
    did_drop_10pct: Mapped[bool | None] = mapped_column(nullable=True)
    did_drop_20pct: Mapped[bool | None] = mapped_column(nullable=True)
    max_drop_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    days_to_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_min_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    horizon_days: Mapped[int] = mapped_column(Integer, nullable=False, default=14)
