import uuid
from datetime import datetime
from sqlalchemy import DateTime, Float, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProgramBaseline(Base):
    __tablename__ = "program_baselines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    program_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    program_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Baseline cents-per-point (CPP) — e.g. 1.5 for Chase UR
    baseline_cpp: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
