"""TrackedFlight model — Plan v3 P1.4 / P8.2.

Lets a user pin "watch this exact flight" (airline + flight_number +
departure_date) and receive an alert when the price crosses a threshold.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TrackedFlight(Base):
    __tablename__ = "tracked_flights"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    route_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("routes.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    airline_code: Mapped[str] = mapped_column(String(3), nullable=False)
    flight_number: Mapped[str] = mapped_column(String(10), nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)

    baseline_price_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    alert_threshold_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_seen_price_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
