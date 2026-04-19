import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    route_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("routes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    score_threshold: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    gem_alerts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    scarcity_alerts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    trend_reversal_alerts: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error_fare_alerts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    web_push_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="alert_rules")  # noqa: F821
    route: Mapped["Route | None"] = relationship("Route", back_populates="alert_rules")  # noqa: F821
