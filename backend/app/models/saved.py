"""
Saved items + shareable links.

A "saved item" is anything the user wants to come back to:
- an event (snapshot of an event_id)
- a deal/fare (snapshot of a deal_analysis_id)
- a route (snapshot of a route_id)

A "share link" is a signed token that exposes a single saved item read-only,
no auth required, for sharing with non-users (WhatsApp, email).
"""
import uuid
import secrets
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SavedItem(Base):
    __tablename__ = "saved_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # 'event' | 'deal' | 'route'
    item_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # Stringified UUID or integer id
    label: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Optional user-supplied note
    snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Cached snapshot of the item at save time — survives even if the source row is rotated
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )


class ShareLink(Base):
    __tablename__ = "share_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    item_id: Mapped[str] = mapped_column(String(64), nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )

    @staticmethod
    def new_token() -> str:
        # 43-char URL-safe token (256 bits of entropy)
        return secrets.token_urlsafe(32)
