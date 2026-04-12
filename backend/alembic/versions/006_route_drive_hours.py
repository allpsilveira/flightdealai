"""Add max_drive_hours to routes

Allows users to specify how far they're willing to drive for a better price.
Scanner uses this to auto-include nearby airports without route modification.

Revision ID: 006
Revises: 005
Create Date: 2026-04-12
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("routes", sa.Column("max_drive_hours", sa.Float, nullable=True))


def downgrade() -> None:
    op.drop_column("routes", "max_drive_hours")
