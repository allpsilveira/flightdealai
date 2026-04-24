"""Add discount_pct column to deal_analysis.

Stores the percentage by which the best price sits below the midpoint of
Google's typical_price_range.  Positive = cheaper than typical midpoint.
Null when Google returned no typical range for that scan.

Revision ID: 011
Revises: 010
Create Date: 2026-04-20
"""
from alembic import op
import sqlalchemy as sa


revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "deal_analysis",
        sa.Column("discount_pct", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("deal_analysis", "discount_pct")
