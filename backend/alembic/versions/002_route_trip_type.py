"""Add trip_type and return_date_offset_days to routes

Revision ID: 002
Revises: 001
Create Date: 2026-04-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "routes",
        sa.Column("trip_type", sa.String(10), nullable=False, server_default="ONE_WAY"),
    )
    op.add_column(
        "routes",
        sa.Column("return_date_offset_days", sa.Integer, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("routes", "return_date_offset_days")
    op.drop_column("routes", "trip_type")
