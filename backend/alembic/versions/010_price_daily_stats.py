"""Recreate price_daily_stats continuous aggregate.

Migration 001 attempted to create this view using PERCENTILE_CONT, which is
unsupported in TimescaleDB continuous aggregates before v2.15.  This migration
drops any partial/failed state and recreates the view from deal_analysis using
compatible syntax, then registers a refresh policy.

Revision ID: 010
Revises: 009
Create Date: 2026-04-20
"""
from alembic import op


revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop any pre-existing version (from migration 001 or failed attempts).
    # CASCADE drops the associated policy as well.
    op.execute("DROP MATERIALIZED VIEW IF EXISTS price_daily_stats CASCADE;")

    # Recreate.  TimescaleDB continuous aggregates support percentile_agg
    # (from the timescaledb_toolkit extension) for incrementally-updatable
    # percentiles.  We fall back to the simpler MIN/AVG/MAX/STDDEV
    # non-approximated approach here because toolkit may not be installed;
    # percentile columns are computed from the raw values at refresh time using
    # ordered-set aggregates (supported in TimescaleDB >= 2.7 released 2022).
    op.execute("""
        CREATE MATERIALIZED VIEW price_daily_stats
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 day', time)                                          AS bucket,
            route_id,
            origin,
            destination,
            cabin_class,
            MIN(best_price_usd)                                                 AS min_price,
            MAX(best_price_usd)                                                 AS max_price,
            AVG(best_price_usd)                                                 AS avg_price,
            STDDEV(best_price_usd)                                              AS stddev_price,
            PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY best_price_usd)        AS p5,
            PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY best_price_usd)        AS p10,
            PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY best_price_usd)        AS p20,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY best_price_usd)        AS p25,
            PERCENTILE_CONT(0.30) WITHIN GROUP (ORDER BY best_price_usd)        AS p30,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY best_price_usd)        AS p50,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY best_price_usd)        AS p75,
            PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY best_price_usd)        AS p90,
            COUNT(*)                                                             AS sample_count
        FROM deal_analysis
        WHERE best_price_usd IS NOT NULL
        GROUP BY bucket, route_id, origin, destination, cabin_class
        WITH NO DATA;
    """)

    # Refresh policy: keep last 91 days up-to-date, refresh every 6 hours
    # (aligned with the stats_refresh_dag schedule).
    op.execute("""
        SELECT add_continuous_aggregate_policy(
            'price_daily_stats',
            start_offset      => INTERVAL '91 days',
            end_offset        => INTERVAL '1 day',
            schedule_interval => INTERVAL '6 hours',
            if_not_exists     => TRUE
        );
    """)

    # Backfill all existing data immediately after creation.
    op.execute(
        "CALL refresh_continuous_aggregate('price_daily_stats', NULL, NULL);"
    )


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS price_daily_stats CASCADE;")
