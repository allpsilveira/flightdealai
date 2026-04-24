import uuid
from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
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

    # ── Plan v3 P1.2 — Route preferences (passed through to APIs) ─────────────
    max_budget_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    outbound_time_window: Mapped[str | None] = mapped_column(String(11), nullable=True)
    return_time_window: Mapped[str | None] = mapped_column(String(11), nullable=True)
    preferred_airlines: Mapped[list[str] | None] = mapped_column(ARRAY(String(3)), nullable=True)
    excluded_airlines: Mapped[list[str] | None] = mapped_column(ARRAY(String(3)), nullable=True)
    max_stops: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_layover_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    excluded_connection_airports: Mapped[list[str] | None] = mapped_column(ARRAY(String(3)), nullable=True)
    max_total_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    low_carbon_only: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    preferred_award_programs: Mapped[list[str] | None] = mapped_column(ARRAY(String(30)), nullable=True)
    passengers: Mapped[list] = mapped_column(
        JSONB, nullable=False,
        server_default=text("""'[{"type":"adult"}]'::jsonb"""),
        default=lambda: [{"type": "adult"}],
    )
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)

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
