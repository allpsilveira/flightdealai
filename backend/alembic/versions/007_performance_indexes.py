"""Add performance indexes for hot query paths.

Revision ID: 007
Revises: 006
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def _safe_create_index(name, table, columns, **kwargs):
    """Create index only if the target table exists."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"),
        {"t": table},
    )
    if result.scalar():
        op.create_index(name, table, columns, if_not_exists=True, **kwargs)


def upgrade():
    # ── Deal queries: latest per (route, cabin, date) sorted by score ──────
    _safe_create_index(
        "ix_deal_analysis_route_cabin_date_time",
        "deal_analysis",
        ["route_id", "cabin_class", "departure_date", sa.text("time DESC")],
    )

    # ── Deal listing: score sort ───────────────────────────────────────────
    _safe_create_index(
        "ix_deal_analysis_score_total",
        "deal_analysis",
        [sa.text("score_total DESC")],
    )

    # ── Google prices: history chart lookups ────────────────────────────────
    _safe_create_index(
        "ix_google_prices_route_date_time",
        "google_prices",
        ["route_id", "departure_date", "cabin_class", sa.text("time DESC")],
    )

    # ── Flight offers: leaderboard per route ───────────────────────────────
    _safe_create_index(
        "ix_flight_offers_route_airline",
        "flight_offers",
        ["route_id", "primary_airline", "stops", sa.text("price_usd ASC")],
    )

    # ── Alert rules: lookup by route + user ────────────────────────────────
    _safe_create_index(
        "ix_alert_rules_route_user",
        "alert_rules",
        ["route_id", "user_id"],
    )

    # ── Routes: active routes per user (partial index) ─────────────────────
    _safe_create_index(
        "ix_routes_user_active",
        "routes",
        ["user_id"],
        postgresql_where=sa.text("is_active = true"),
    )

    # ── Route events: timeline feed (table may not exist yet) ──────────────
    _safe_create_index(
        "ix_route_events_route_time",
        "route_events",
        ["route_id", sa.text("timestamp DESC")],
    )

    # ── Duffel prices: enrichment lookups ──────────────────────────────────
    _safe_create_index(
        "ix_duffel_prices_route_combo",
        "duffel_prices",
        ["origin", "destination", "cabin_class", "departure_date", sa.text("time DESC")],
    )

    # ── Award prices: enrichment lookups ───────────────────────────────────
    _safe_create_index(
        "ix_award_prices_route_combo",
        "award_prices",
        ["origin", "destination", "cabin_class", "departure_date", sa.text("time DESC")],
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
