"""
TimescaleDB hypertable models for raw price data.

Active sources:
  GooglePrice   — SerpApi best price per scan
  FlightOffer   — all individual offers from SerpApi (per airline+stops), linked to DealAnalysis
  DuffelPrice   — direct airline cash price + fare conditions (daily enrichment)
  AwardPrice    — award availability from Seats.aero (daily enrichment)

Dead tables (do not write to — kept for historical data):
  AmadeusPrice  — decommissioned July 2026
  KiwiPrice     — decommissioned July 2026
"""
import uuid
from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GooglePrice(Base):
    """Overall best price per scan from SerpApi (Google Flights). Primary stats source."""
    __tablename__ = "google_prices"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, primary_key=True)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    price_level: Mapped[str | None] = mapped_column(String(20), nullable=True)   # low/typical/high
    typical_price_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    typical_price_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_history: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    airline_codes: Mapped[list[str]] = mapped_column(ARRAY(String(3)), nullable=False, default=list)
    is_direct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class FlightOffer(Base):
    """
    Individual flight offers from SerpApi — cheapest per (primary_airline, stops) per scan.
    Linked to the DealAnalysis row produced by the same scan via deal_analysis_id.
    Powers the "Flight Options" breakdown in the deal detail modal.
    """
    __tablename__ = "flight_offers"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, primary_key=True)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deal_analysis_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    primary_airline: Mapped[str | None] = mapped_column(String(3), nullable=True)
    airline_codes: Mapped[list[str]] = mapped_column(ARRAY(String(3)), nullable=False, default=list)
    stops: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_direct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class DuffelPrice(Base):
    """Direct airline cash price + fare brand + conditions from Duffel. Daily enrichment."""
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
    """Award/miles availability from Seats.aero. Daily enrichment."""
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
    cpp_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
