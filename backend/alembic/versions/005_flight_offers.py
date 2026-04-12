"""Add flight_offers hypertable

Creates the flight_offers TimescaleDB hypertable which stores individual
flight offers from SerpApi (cheapest per airline+stops combo per scan),
linked to deal_analysis via deal_analysis_id FK.

Revision ID: 005
Revises: 004
Create Date: 2026-04-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "flight_offers",
        sa.Column("time", sa.DateTime(timezone=True), nullable=False, primary_key=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, primary_key=True),
        sa.Column("deal_analysis_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("route_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("origin", sa.String(3), nullable=False),
        sa.Column("destination", sa.String(3), nullable=False),
        sa.Column("departure_date", sa.Date, nullable=False),
        sa.Column("cabin_class", sa.String(20), nullable=False),
        sa.Column("price_usd", sa.Float, nullable=False),
        sa.Column("primary_airline", sa.String(3), nullable=True),
        sa.Column("airline_codes", postgresql.ARRAY(sa.String(3)), nullable=False),
        sa.Column("stops", sa.Integer, nullable=False, server_default="0"),
        sa.Column("duration_minutes", sa.Integer, nullable=True),
        sa.Column("is_direct", sa.Boolean, nullable=False, server_default="false"),
    )
    op.create_index("ix_flight_offers_route_id", "flight_offers", ["route_id"])
    op.create_index("ix_flight_offers_deal_analysis_id", "flight_offers", ["deal_analysis_id"])
    op.execute(
        "SELECT create_hypertable('flight_offers', 'time', if_not_exists => TRUE);"
    )


def downgrade() -> None:
    op.drop_table("flight_offers")
