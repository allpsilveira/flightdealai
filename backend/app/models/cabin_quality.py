import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CabinQuality(Base):
    __tablename__ = "cabin_quality"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    airline_code: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    aircraft_type: Mapped[str] = mapped_column(String(20), nullable=False)
    product_name: Mapped[str] = mapped_column(String(100), nullable=False)
    quality_score: Mapped[int] = mapped_column(Integer, nullable=False)  # 1–100
    seat_type: Mapped[str] = mapped_column(String(50), nullable=False)
    has_door: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lie_flat: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    bed_length_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seat_width_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    configuration: Mapped[str | None] = mapped_column(String(20), nullable=True)  # e.g. "1-2-1"
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
