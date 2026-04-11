"""Initial schema — all tables + TimescaleDB hypertables + continuous aggregates

Revision ID: 001
Revises:
Create Date: 2026-04-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Regular tables ────────────────────────────────────────────────────────

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("whatsapp_number", sa.String(20), nullable=True),
        sa.Column("language", sa.String(2), nullable=False, server_default="en"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_superuser", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("web_push_subscription", sa.String(2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "routes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("origins", postgresql.ARRAY(sa.String(3)), nullable=False),
        sa.Column("destinations", postgresql.ARRAY(sa.String(3)), nullable=False),
        sa.Column("cabin_classes", postgresql.ARRAY(sa.String(20)), nullable=False),
        sa.Column("date_from", sa.Date, nullable=False),
        sa.Column("date_to", sa.Date, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("priority_tier", sa.String(10), nullable=False, server_default="WARM"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_routes_user_id", "routes", ["user_id"])

    op.create_table(
        "alert_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("route_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("routes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("score_threshold", sa.Integer, nullable=False, server_default="80"),
        sa.Column("gem_alerts", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("scarcity_alerts", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("trend_reversal_alerts", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("error_fare_alerts", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("whatsapp_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("web_push_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "cabin_quality",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("airline_code", sa.String(3), nullable=False),
        sa.Column("aircraft_type", sa.String(20), nullable=False),
        sa.Column("product_name", sa.String(100), nullable=False),
        sa.Column("quality_score", sa.Integer, nullable=False),
        sa.Column("seat_type", sa.String(50), nullable=False),
        sa.Column("has_door", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("lie_flat", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("bed_length_cm", sa.Integer, nullable=True),
        sa.Column("seat_width_cm", sa.Float, nullable=True),
        sa.Column("configuration", sa.String(20), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_cabin_quality_airline", "cabin_quality", ["airline_code"])

    op.create_table(
        "transfer_partners",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("card_program", sa.String(50), nullable=False),
        sa.Column("airline_program", sa.String(50), nullable=False),
        sa.Column("transfer_ratio", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("transfer_fee_percent", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("min_transfer_points", sa.Integer, nullable=False, server_default="1000"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
    )

    op.create_table(
        "program_baselines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("program_code", sa.String(20), nullable=False, unique=True),
        sa.Column("program_name", sa.String(100), nullable=False),
        sa.Column("baseline_cpp", sa.Float, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Hypertables (time-series) ──────────────────────────────────────────────
    # TimescaleDB requires `time` to be part of primary key for hypertables.

    for table_name, extra_cols in [
        ("amadeus_prices", [
            sa.Column("route_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("origin", sa.String(3), nullable=False),
            sa.Column("destination", sa.String(3), nullable=False),
            sa.Column("departure_date", sa.Date, nullable=False),
            sa.Column("cabin_class", sa.String(20), nullable=False),
            sa.Column("price_usd", sa.Float, nullable=False),
            sa.Column("seats_remaining", sa.Integer, nullable=True),
            sa.Column("booking_class", sa.String(5), nullable=True),
            sa.Column("branded_fare", sa.String(50), nullable=True),
            sa.Column("airline_codes", postgresql.ARRAY(sa.String(3)), nullable=False),
            sa.Column("is_direct", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("duration_minutes", sa.Integer, nullable=True),
            sa.Column("raw_response", postgresql.JSONB, nullable=True),
        ]),
        ("google_prices", [
            sa.Column("route_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("origin", sa.String(3), nullable=False),
            sa.Column("destination", sa.String(3), nullable=False),
            sa.Column("departure_date", sa.Date, nullable=False),
            sa.Column("cabin_class", sa.String(20), nullable=False),
            sa.Column("price_usd", sa.Float, nullable=False),
            sa.Column("price_level", sa.String(20), nullable=True),
            sa.Column("typical_price_low", sa.Float, nullable=True),
            sa.Column("typical_price_high", sa.Float, nullable=True),
            sa.Column("price_history", postgresql.JSONB, nullable=True),
            sa.Column("airline_codes", postgresql.ARRAY(sa.String(3)), nullable=False),
            sa.Column("is_direct", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("raw_response", postgresql.JSONB, nullable=True),
        ]),
        ("kiwi_prices", [
            sa.Column("route_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("origin", sa.String(3), nullable=False),
            sa.Column("destination", sa.String(3), nullable=False),
            sa.Column("departure_date", sa.Date, nullable=False),
            sa.Column("cabin_class", sa.String(20), nullable=False),
            sa.Column("price_usd", sa.Float, nullable=False),
            sa.Column("is_virtual_interlining", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("has_airport_change", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("technical_stops", sa.Integer, nullable=False, server_default="0"),
            sa.Column("deep_link", sa.Text, nullable=True),
            sa.Column("airline_codes", postgresql.ARRAY(sa.String(3)), nullable=False),
            sa.Column("duration_minutes", sa.Integer, nullable=True),
            sa.Column("raw_response", postgresql.JSONB, nullable=True),
        ]),
        ("duffel_prices", [
            sa.Column("route_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("origin", sa.String(3), nullable=False),
            sa.Column("destination", sa.String(3), nullable=False),
            sa.Column("departure_date", sa.Date, nullable=False),
            sa.Column("cabin_class", sa.String(20), nullable=False),
            sa.Column("price_usd", sa.Float, nullable=False),
            sa.Column("fare_brand_name", sa.String(100), nullable=True),
            sa.Column("fare_basis_code", sa.String(20), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_refundable", sa.Boolean, nullable=True),
            sa.Column("change_fee_usd", sa.Float, nullable=True),
            sa.Column("cancellation_penalty_usd", sa.Float, nullable=True),
            sa.Column("baggage_included", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("airline_codes", postgresql.ARRAY(sa.String(3)), nullable=False),
            sa.Column("raw_response", postgresql.JSONB, nullable=True),
        ]),
        ("award_prices", [
            sa.Column("route_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("origin", sa.String(3), nullable=False),
            sa.Column("destination", sa.String(3), nullable=False),
            sa.Column("departure_date", sa.Date, nullable=False),
            sa.Column("cabin_class", sa.String(20), nullable=False),
            sa.Column("loyalty_program", sa.String(50), nullable=False),
            sa.Column("miles_cost", sa.Integer, nullable=False),
            sa.Column("cash_taxes_usd", sa.Float, nullable=False, server_default="0"),
            sa.Column("seats_available", sa.Integer, nullable=False, server_default="1"),
            sa.Column("operating_airline", sa.String(3), nullable=True),
            sa.Column("cpp_value", sa.Float, nullable=True),
            sa.Column("raw_response", postgresql.JSONB, nullable=True),
        ]),
        ("deal_analysis", [
            sa.Column("route_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("origin", sa.String(3), nullable=False),
            sa.Column("destination", sa.String(3), nullable=False),
            sa.Column("departure_date", sa.Date, nullable=False),
            sa.Column("cabin_class", sa.String(20), nullable=False),
            sa.Column("best_price_usd", sa.Float, nullable=False),
            sa.Column("best_source", sa.String(20), nullable=False),
            sa.Column("airline_code", sa.String(3), nullable=True),
            sa.Column("score_total", sa.Float, nullable=False, server_default="0"),
            sa.Column("score_percentile", sa.Float, nullable=False, server_default="0"),
            sa.Column("score_zscore", sa.Float, nullable=False, server_default="0"),
            sa.Column("score_trend_alignment", sa.Float, nullable=False, server_default="0"),
            sa.Column("score_trend_direction", sa.Float, nullable=False, server_default="0"),
            sa.Column("score_cross_source", sa.Float, nullable=False, server_default="0"),
            sa.Column("score_arbitrage", sa.Float, nullable=False, server_default="0"),
            sa.Column("score_fare_brand", sa.Float, nullable=False, server_default="0"),
            sa.Column("score_scarcity", sa.Float, nullable=False, server_default="0"),
            sa.Column("score_award", sa.Float, nullable=False, server_default="0"),
            sa.Column("action", sa.String(15), nullable=False, server_default="NORMAL"),
            sa.Column("is_gem", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("is_error_fare", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("sources_confirmed", postgresql.ARRAY(sa.String(20)), nullable=False),
            sa.Column("percentile_position", sa.Float, nullable=True),
            sa.Column("zscore", sa.Float, nullable=True),
            sa.Column("google_price_level", sa.String(20), nullable=True),
            sa.Column("seats_remaining", sa.Integer, nullable=True),
            sa.Column("fare_brand_name", sa.String(100), nullable=True),
            sa.Column("best_award_miles", sa.Integer, nullable=True),
            sa.Column("best_award_program", sa.String(50), nullable=True),
            sa.Column("best_cpp", sa.Float, nullable=True),
            sa.Column("ai_recommendation_en", sa.Text, nullable=True),
            sa.Column("ai_recommendation_pt", sa.Text, nullable=True),
            sa.Column("alert_sent", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("alert_sent_at", sa.DateTime(timezone=True), nullable=True),
        ]),
    ]:
        op.create_table(
            table_name,
            sa.Column("time", sa.DateTime(timezone=True), nullable=False, primary_key=True),
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, primary_key=True),
            *extra_cols,
        )
        op.create_index(f"ix_{table_name}_route_id", table_name, ["route_id"])
        # Convert to TimescaleDB hypertable partitioned by time
        op.execute(
            f"SELECT create_hypertable('{table_name}', 'time', if_not_exists => TRUE);"
        )

    # ── Continuous aggregates ──────────────────────────────────────────────────
    for source in ["amadeus", "google", "kiwi"]:
        table = f"{source}_prices"
        op.execute(f"""
            CREATE MATERIALIZED VIEW {source}_price_hourly
            WITH (timescaledb.continuous) AS
            SELECT
                time_bucket('1 hour', time) AS bucket,
                route_id,
                origin,
                destination,
                cabin_class,
                MIN(price_usd) AS min_price,
                AVG(price_usd) AS avg_price,
                MAX(price_usd) AS max_price,
                COUNT(*) AS sample_count
            FROM {table}
            GROUP BY bucket, route_id, origin, destination, cabin_class
            WITH NO DATA;
        """)

    # Daily stats with percentiles (across all sources — based on deal_analysis)
    op.execute("""
        CREATE MATERIALIZED VIEW price_daily_stats
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 day', time) AS bucket,
            route_id,
            origin,
            destination,
            cabin_class,
            MIN(best_price_usd) AS min_price,
            MAX(best_price_usd) AS max_price,
            AVG(best_price_usd) AS avg_price,
            STDDEV(best_price_usd) AS stddev_price,
            PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY best_price_usd) AS p5,
            PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY best_price_usd) AS p10,
            PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY best_price_usd) AS p20,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY best_price_usd) AS p25,
            PERCENTILE_CONT(0.30) WITHIN GROUP (ORDER BY best_price_usd) AS p30,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY best_price_usd) AS p50,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY best_price_usd) AS p75,
            PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY best_price_usd) AS p90,
            COUNT(*) AS sample_count
        FROM deal_analysis
        GROUP BY bucket, route_id, origin, destination, cabin_class
        WITH NO DATA;
    """)

    # Refresh policies — refresh last 7 days every hour
    for view in ["amadeus_price_hourly", "google_price_hourly", "kiwi_price_hourly"]:
        op.execute(f"""
            SELECT add_continuous_aggregate_policy('{view}',
                start_offset => INTERVAL '7 days',
                end_offset   => INTERVAL '1 hour',
                schedule_interval => INTERVAL '1 hour',
                if_not_exists => TRUE);
        """)
    op.execute("""
        SELECT add_continuous_aggregate_policy('price_daily_stats',
            start_offset => INTERVAL '90 days',
            end_offset   => INTERVAL '1 day',
            schedule_interval => INTERVAL '1 day',
            if_not_exists => TRUE);
    """)


def downgrade() -> None:
    for view in ["price_daily_stats", "amadeus_price_hourly", "google_price_hourly", "kiwi_price_hourly"]:
        op.execute(f"DROP MATERIALIZED VIEW IF EXISTS {view} CASCADE;")
    for table in ["deal_analysis", "award_prices", "duffel_prices", "kiwi_prices", "google_prices", "amadeus_prices"]:
        op.drop_table(table)
    for table in ["program_baselines", "transfer_partners", "cabin_quality", "alert_rules", "routes", "users"]:
        op.drop_table(table)
