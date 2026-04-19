"""Add performance indexes for hot query paths.

Revision ID: 007_performance_indexes
Revises: 006_route_drive_hours
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa

revision = "007_performance_indexes"
down_revision = "006_route_drive_hours"
branch_labels = None
depends_on = None


def upgrade():
    # ── Deal queries: latest per (route, cabin, date) sorted by score ──────
    op.create_index(
        "ix_deal_analysis_route_cabin_date_time",
        "deal_analysis",
        ["route_id", "cabin_class", "departure_date", sa.text("time DESC")],
        if_not_exists=True,
    )

    # ── Deal listing: score sort ───────────────────────────────────────────
    op.create_index(
        "ix_deal_analysis_score_total",
        "deal_analysis",
        [sa.text("score_total DESC")],
        if_not_exists=True,
    )

    # ── Google prices: history chart lookups ────────────────────────────────
    op.create_index(
        "ix_google_prices_route_date_time",
        "google_prices",
        ["route_id", "departure_date", "cabin_class", sa.text("time DESC")],
        if_not_exists=True,
    )

    # ── Flight offers: leaderboard per route ───────────────────────────────
    op.create_index(
        "ix_flight_offers_route_airline",
        "flight_offers",
        ["route_id", "primary_airline", "stops", sa.text("price_usd ASC")],
        if_not_exists=True,
    )

    # ── Alert rules: lookup by route + user ────────────────────────────────
    op.create_index(
        "ix_alert_rules_route_user",
        "alert_rules",
        ["route_id", "user_id"],
        if_not_exists=True,
    )

    # ── Routes: active routes per user (partial index) ─────────────────────
    op.create_index(
        "ix_routes_user_active",
        "routes",
        ["user_id"],
        postgresql_where=sa.text("is_active = true"),
        if_not_exists=True,
    )

    # ── Route events: timeline feed ────────────────────────────────────────
    op.create_index(
        "ix_route_events_route_time",
        "route_events",
        ["route_id", sa.text("timestamp DESC")],
        if_not_exists=True,
    )

    # ── Duffel prices: enrichment lookups ──────────────────────────────────
    op.create_index(
        "ix_duffel_prices_route_combo",
        "duffel_prices",
        ["origin", "destination", "cabin_class", "departure_date", sa.text("time DESC")],
        if_not_exists=True,
    )

    # ── Award prices: enrichment lookups ───────────────────────────────────
    op.create_index(
        "ix_award_prices_route_combo",
        "award_prices",
        ["origin", "destination", "cabin_class", "departure_date", sa.text("time DESC")],
        if_not_exists=True,
    )


def downgrade():
    for idx in [
        "ix_deal_analysis_route_cabin_date_time",
        "ix_deal_analysis_score_total",
        "ix_google_prices_route_date_time",
        "ix_flight_offers_route_airline",
        "ix_alert_rules_route_user",
        "ix_routes_user_active",
        "ix_route_events_route_time",
        "ix_duffel_prices_route_combo",
        "ix_award_prices_route_combo",
    ]:
        op.drop_index(idx, if_exists=True)
