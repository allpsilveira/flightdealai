"""Add route_events, price_predictions, price_regimes, api_usage_log, scoring_weights, deal_outcomes.

Revision ID: 008
Revises: 007
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade():
    # ── route_events ───────────────────────────────────────────────────────
    op.create_table(
        "route_events",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "route_id",
            UUID(as_uuid=True),
            sa.ForeignKey("routes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False, server_default="info"),
        sa.Column("headline", sa.Text, nullable=False),
        sa.Column("detail", sa.Text, nullable=True),
        sa.Column("subtext", sa.Text, nullable=True),
        sa.Column("airline", sa.String(50), nullable=True),
        sa.Column("price_usd", sa.Float, nullable=True),
        sa.Column("previous_price_usd", sa.Float, nullable=True),
        sa.Column("deal_analysis_id", UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
    )
    op.create_index("ix_route_events_route_time", "route_events", ["route_id", "timestamp"])
    op.create_index("ix_route_events_event_type", "route_events", ["event_type"])
    op.create_index("ix_route_events_severity", "route_events", ["severity"])

    # ── price_predictions ──────────────────────────────────────────────────
    op.create_table(
        "price_predictions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("route_id", UUID(as_uuid=True), nullable=False),
        sa.Column("origin", sa.String(3), nullable=False),
        sa.Column("destination", sa.String(3), nullable=False),
        sa.Column("cabin_class", sa.String(20), nullable=False),
        sa.Column("predicted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("target_date", sa.Date, nullable=False),
        sa.Column("horizon_days", sa.Integer, nullable=False),
        sa.Column("predicted_price", sa.Float, nullable=False),
        sa.Column("confidence_low", sa.Float, nullable=True),
        sa.Column("confidence_high", sa.Float, nullable=True),
        sa.Column("model_type", sa.String(30), nullable=False),
        sa.Column("metadata", JSONB, nullable=True),
    )
    op.create_index("ix_price_predictions_route_target", "price_predictions", ["route_id", "target_date"])
    op.create_index("ix_price_predictions_predicted_at", "price_predictions", ["predicted_at"])

    # ── price_regimes ──────────────────────────────────────────────────────
    op.create_table(
        "price_regimes",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("route_id", UUID(as_uuid=True), nullable=False),
        sa.Column("origin", sa.String(3), nullable=False),
        sa.Column("destination", sa.String(3), nullable=False),
        sa.Column("cabin_class", sa.String(20), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("regime_label", sa.String(20), nullable=False),
        sa.Column("regime_probability", sa.Float, nullable=False),
        sa.Column("price_threshold_low", sa.Float, nullable=True),
        sa.Column("price_threshold_high", sa.Float, nullable=True),
        sa.Column("sample_size", sa.Integer, nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
    )
    op.create_index("ix_price_regimes_route_computed", "price_regimes", ["route_id", "computed_at"])

    # ── api_usage_log ──────────────────────────────────────────────────────
    op.create_table(
        "api_usage_log",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("endpoint", sa.String(100), nullable=True),
        sa.Column("route_id", UUID(as_uuid=True), nullable=True),
        sa.Column("response_status", sa.Integer, nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("cost_estimate_usd", sa.Float, nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
    )
    op.create_index("ix_api_usage_source_time", "api_usage_log", ["source", "timestamp"])
    op.create_index("ix_api_usage_timestamp", "api_usage_log", ["timestamp"])

    # ── scoring_weights ────────────────────────────────────────────────────
    op.create_table(
        "scoring_weights",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("trained_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("model_type", sa.String(30), nullable=False, server_default="xgboost"),
        sa.Column("auc", sa.Float, nullable=True),
        sa.Column("sample_size", sa.Integer, nullable=True),
        sa.Column("weights", JSONB, nullable=False),
        sa.Column("feature_importance", JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("metadata", JSONB, nullable=True),
    )
    op.create_index("ix_scoring_weights_active", "scoring_weights", ["is_active", "trained_at"])

    # ── deal_outcomes ──────────────────────────────────────────────────────
    op.create_table(
        "deal_outcomes",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("deal_analysis_id", UUID(as_uuid=True), nullable=False),
        sa.Column("deal_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("labeled_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("did_drop_5pct", sa.Boolean, nullable=True),
        sa.Column("did_drop_10pct", sa.Boolean, nullable=True),
        sa.Column("did_drop_20pct", sa.Boolean, nullable=True),
        sa.Column("max_drop_pct", sa.Float, nullable=True),
        sa.Column("days_to_min", sa.Integer, nullable=True),
        sa.Column("final_min_price", sa.Float, nullable=True),
        sa.Column("horizon_days", sa.Integer, nullable=False, server_default="14"),
    )
    op.create_index("ix_deal_outcomes_deal", "deal_outcomes", ["deal_analysis_id"])


def downgrade():
    op.drop_table("deal_outcomes")
    op.drop_table("scoring_weights")
    op.drop_table("api_usage_log")
    op.drop_table("price_regimes")
    op.drop_table("price_predictions")
    op.drop_table("route_events")
