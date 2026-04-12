"""Scan history — one row per manual or scheduled scan trigger."""
import uuid
from datetime import datetime
from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ScanHistory(Base):
    __tablename__ = "scan_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    trigger_type: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)  # manual | scheduled
    origins: Mapped[str] = mapped_column(String(100), nullable=False)       # comma-joined
    destinations: Mapped[str] = mapped_column(String(100), nullable=False)
    cabin_classes: Mapped[str] = mapped_column(String(100), nullable=False)
    prices_collected: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deals_scored: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    best_price_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    best_origin: Mapped[str | None] = mapped_column(String(3), nullable=True)
    best_destination: Mapped[str | None] = mapped_column(String(3), nullable=True)
    best_cabin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ok", nullable=False)  # ok | error
