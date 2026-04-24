"""Plan v3 P1.2 — route preferences (passes through to SerpApi/Duffel/Seats.aero)

Adds per-route filter columns that map directly to API request params, so users
can constrain monitoring (max budget, time windows, airline include/exclude,
stops, layovers, low-carbon, preferred award programs, passenger composition).

Revision ID: 013
Revises: 012
Create Date: 2026-04-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("routes", sa.Column("max_budget_usd", sa.Float, nullable=True))
    op.add_column("routes", sa.Column("outbound_time_window", sa.String(11), nullable=True))   # "06,22"
    op.add_column("routes", sa.Column("return_time_window", sa.String(11), nullable=True))
    op.add_column("routes", sa.Column("preferred_airlines", postgresql.ARRAY(sa.String(3)), nullable=True))
    op.add_column("routes", sa.Column("excluded_airlines", postgresql.ARRAY(sa.String(3)), nullable=True))
    op.add_column("routes", sa.Column("max_stops", sa.Integer, nullable=True))
    op.add_column("routes", sa.Column("max_layover_minutes", sa.Integer, nullable=True))
    op.add_column("routes", sa.Column("excluded_connection_airports", postgresql.ARRAY(sa.String(3)), nullable=True))
    op.add_column("routes", sa.Column("max_total_duration_minutes", sa.Integer, nullable=True))
    op.add_column("routes", sa.Column("low_carbon_only", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("routes", sa.Column("preferred_award_programs", postgresql.ARRAY(sa.String(30)), nullable=True))
    op.add_column("routes", sa.Column("passengers", postgresql.JSONB, nullable=False,
                                      server_default=sa.text("""'[{"type":"adult"}]'::jsonb""")))
    op.add_column("routes", sa.Column("currency", sa.String(3), nullable=False, server_default="USD"))


def downgrade() -> None:
    for col in (
        "max_budget_usd", "outbound_time_window", "return_time_window",
        "preferred_airlines", "excluded_airlines", "max_stops",
        "max_layover_minutes", "excluded_connection_airports",
        "max_total_duration_minutes", "low_carbon_only", "preferred_award_programs",
        "passengers", "currency",
    ):
        op.drop_column("routes", col)
