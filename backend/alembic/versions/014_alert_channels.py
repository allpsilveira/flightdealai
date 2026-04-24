"""Plan v3 P1.3 — alert channels JSONB

Replaces the flat boolean alert flags with a per-channel rules JSONB so users
can configure thresholds and event filters independently for whatsapp / push /
email / in-app.

Schema for `channels` JSONB:
{
  "whatsapp": {"enabled": true,  "min_score": 5.0, "events": ["new_low","gem","error_fare"], "quiet_hours": [22, 7]},
  "web_push": {"enabled": true,  "min_score": 4.0, "events": ["new_low","gem"]},
  "email":    {"enabled": false, "min_score": 6.0, "events": ["gem"]},
  "in_app":   {"enabled": true,  "min_score": 0.0, "events": ["*"]}
}

Revision ID: 014
Revises: 013
Create Date: 2026-04-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_DEFAULT_CHANNELS = """
{
  "whatsapp": {"enabled": false, "min_score": 6.0, "events": ["new_low","gem","error_fare"], "quiet_hours": [22, 7]},
  "web_push": {"enabled": true,  "min_score": 5.0, "events": ["new_low","gem","error_fare","award_opened"]},
  "email":    {"enabled": false, "min_score": 7.0, "events": ["gem"]},
  "in_app":   {"enabled": true,  "min_score": 3.0, "events": ["*"]}
}
""".strip()


def upgrade() -> None:
    op.add_column(
        "alert_rules",
        sa.Column("channels", postgresql.JSONB, nullable=False,
                  server_default=sa.text(f"'{_DEFAULT_CHANNELS}'::jsonb")),
    )
    op.add_column("alert_rules", sa.Column("gem_only", sa.Boolean, nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("alert_rules", "channels")
    op.drop_column("alert_rules", "gem_only")
