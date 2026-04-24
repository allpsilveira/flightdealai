"""Plan v3 P1.4 — tracked_flights table

User clicks "Track this flight" on a fare detail. We pin the exact flight
number + departure_date and alert when its price moves through the threshold.

Revision ID: 015
Revises: 014
Create Date: 2026-04-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tracked_flights",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("route_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("routes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("airline_code", sa.String(3), nullable=False),
        sa.Column("flight_number", sa.String(10), nullable=False),
        sa.Column("departure_date", sa.Date, nullable=False),
        sa.Column("origin", sa.String(3), nullable=False),
        sa.Column("destination", sa.String(3), nullable=False),
        sa.Column("cabin_class", sa.String(20), nullable=False),
        sa.Column("baseline_price_usd", sa.Float, nullable=True),
        sa.Column("alert_threshold_usd", sa.Float, nullable=True),
        sa.Column("last_seen_price_usd", sa.Float, nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tracked_flights_user", "tracked_flights", ["user_id"])
    op.create_index("ix_tracked_flights_route", "tracked_flights", ["route_id"])
    op.create_index(
        "ix_tracked_flights_lookup",
        "tracked_flights",
        ["airline_code", "flight_number", "departure_date"],
    )


def downgrade() -> None:
    op.drop_table("tracked_flights")
