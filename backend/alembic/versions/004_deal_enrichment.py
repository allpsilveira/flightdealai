"""add typical_price and is_direct to deal_analysis

Revision ID: 004
Revises: 003
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("deal_analysis", sa.Column("typical_price_low",  sa.Float(), nullable=True))
    op.add_column("deal_analysis", sa.Column("typical_price_high", sa.Float(), nullable=True))
    op.add_column("deal_analysis", sa.Column("is_direct", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("deal_analysis", "typical_price_low")
    op.drop_column("deal_analysis", "typical_price_high")
    op.drop_column("deal_analysis", "is_direct")
