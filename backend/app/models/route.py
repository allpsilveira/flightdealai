import uuid
from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Arrays of IATA codes — e.g. ["MIA", "MCO", "FLL"]
    origins: Mapped[list[str]] = mapped_column(ARRAY(String(3)), nullable=False)
    destinations: Mapped[list[str]] = mapped_column(ARRAY(String(3)), nullable=False)
    # BUSINESS | FIRST | PREMIUM_ECONOMY
    cabin_classes: Mapped[list[str]] = mapped_column(ARRAY(String(20)), nullable=False)
    date_from: Mapped[date] = mapped_column(Date, nullable=False)
    date_to: Mapped[date] = mapped_column(Date, nullable=False)
    # ONE_WAY | ROUND_TRIP | MONITOR
    trip_type: Mapped[str] = mapped_column(String(10), default="ONE_WAY", nullable=False)
    # For round-trips: how many days after departure to return (e.g. 7 = one week)
    return_date_offset_days: Mapped[int | None] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Max hours the user is willing to drive to reach a cheaper nearby airport (0 = no driving)
    max_drive_hours: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    # HOT | WARM | COLD — updated by priority engine
    priority_tier: Mapped[str] = mapped_column(String(10), default="WARM", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="routes")  # noqa: F821
    alert_rules: Mapped[list["AlertRule"]] = relationship(  # noqa: F821
        "AlertRule", back_populates="route", lazy="selectin"
    )
