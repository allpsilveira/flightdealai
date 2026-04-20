"""Add saved_items + share_links.

Revision ID: 009
Revises: 008
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "saved_items",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_type", sa.String(20), nullable=False),
        sa.Column("item_id", sa.String(64), nullable=False),
        sa.Column("label", sa.Text, nullable=True),
        sa.Column("snapshot", JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_saved_items_user_id", "saved_items", ["user_id"])
    op.create_index(
        "ix_saved_items_user_item",
        "saved_items",
        ["user_id", "item_type", "item_id"],
        unique=True,
    )

    op.create_table(
        "share_links",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_type", sa.String(20), nullable=False),
        sa.Column("item_id", sa.String(64), nullable=False),
        sa.Column("snapshot", JSONB, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("view_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_share_links_token", "share_links", ["token"], unique=True)


def downgrade():
    op.drop_index("ix_share_links_token", table_name="share_links")
    op.drop_table("share_links")
    op.drop_index("ix_saved_items_user_item", table_name="saved_items")
    op.drop_index("ix_saved_items_user_id", table_name="saved_items")
    op.drop_table("saved_items")
