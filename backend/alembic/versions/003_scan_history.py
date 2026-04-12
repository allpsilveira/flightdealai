"""add scan_history table

Revision ID: 003
Revises: 002
Create Date: 2026-04-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scan_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("route_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("triggered_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("trigger_type", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("origins", sa.String(100), nullable=False),
        sa.Column("destinations", sa.String(100), nullable=False),
        sa.Column("cabin_classes", sa.String(100), nullable=False),
        sa.Column("prices_collected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deals_scored", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("best_price_usd", sa.Float(), nullable=True),
        sa.Column("best_origin", sa.String(3), nullable=True),
        sa.Column("best_destination", sa.String(3), nullable=True),
        sa.Column("best_cabin", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="ok"),
    )


def downgrade() -> None:
    op.drop_table("scan_history")
