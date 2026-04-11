"""
TimescaleDB hypertable models for raw price data from all 5 sources.
The `time` column is always the first column — required for hypertable creation.
"""
import uuid
from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AmadeusPrice(Base):
    """Raw price data from Amadeus Self-Service API (Tier 1 tripwire)."""
    __tablename__ = "amadeus_prices"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, primary_key=True)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    seats_remaining: Mapped[int | None] = mapped_column(Integer, nullable=True)
    booking_class: Mapped[str | None] = mapped_column(String(5), nullable=True)
    branded_fare: Mapped[str | None] = mapped_column(String(50), nullable=True)
    airline_codes: Mapped[list[str]] = mapped_column(ARRAY(String(3)), nullable=False, default=list)
    is_direct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class GooglePrice(Base):
    """Price + trend data from SearchApi.io (Google Flights). Tier 2 deep scan."""
    __tablename__ = "google_prices"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, primary_key=True)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    # Google price_insights fields
    price_level: Mapped[str | None] = mapped_column(String(20), nullable=True)  # low/typical/high
    typical_price_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    typical_price_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_history: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    airline_codes: Mapped[list[str]] = mapped_column(ARRAY(String(3)), nullable=False, default=list)
    is_direct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class KiwiPrice(Base):
    """Creative routing data from Kiwi Tequila (virtual interlining). Tier 1."""
    __tablename__ = "kiwi_prices"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, primary_key=True)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    is_virtual_interlining: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_airport_change: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    technical_stops: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deep_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    airline_codes: Mapped[list[str]] = mapped_column(ARRAY(String(3)), nullable=False, default=list)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class DuffelPrice(Base):
    """Fare brand + conditions data from Duffel (on-demand enrichment). Tier 3."""
    __tablename__ = "duffel_prices"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, primary_key=True)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    fare_brand_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fare_basis_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_refundable: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    change_fee_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    cancellation_penalty_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    baggage_included: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    airline_codes: Mapped[list[str]] = mapped_column(ARRAY(String(3)), nullable=False, default=list)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class AwardPrice(Base):
    """Award/miles availability from Seats.aero (on-demand). Tier 3."""
    __tablename__ = "award_prices"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, primary_key=True)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    loyalty_program: Mapped[str] = mapped_column(String(50), nullable=False)
    miles_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    cash_taxes_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    seats_available: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    operating_airline: Mapped[str | None] = mapped_column(String(3), nullable=True)
    # Computed at ingestion time based on companion cash price
    cpp_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
