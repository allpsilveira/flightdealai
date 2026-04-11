import uuid
from sqlalchemy import Boolean, Float, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TransferPartner(Base):
    __tablename__ = "transfer_partners"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    card_program: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    airline_program: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    transfer_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    transfer_fee_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    min_transfer_points: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
