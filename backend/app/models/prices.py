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

    # ── Plan v3 P1.1 — richer offer fields ────────────────────────────────────
    legroom_inches: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amenities: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    carbon_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    carbon_typical_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    layovers: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    also_sold_by: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    booking_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    booking_options: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    aircraft_iata: Mapped[str | None] = mapped_column(String(8), nullable=True)
    cabin_quality_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cabin_product_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cabin_seat_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cabin_has_door: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    cabin_lie_flat: Mapped[bool | None] = mapped_column(Boolean, nullable=True)


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

    # ── Plan v3 P1.1 — richer Duffel fields ───────────────────────────────────
    base_amount_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    tax_amount_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    cabin_marketing_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    aircraft_iata: Mapped[str | None] = mapped_column(String(8), nullable=True)
    baggages: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    available_services: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    payment_requires_instant: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    price_guarantee_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    operating_carrier: Mapped[str | None] = mapped_column(String(3), nullable=True)
    marketing_carrier: Mapped[str | None] = mapped_column(String(3), nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cabin_quality_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cabin_product_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cabin_lie_flat: Mapped[bool | None] = mapped_column(Boolean, nullable=True)


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

    # ── Plan v3 P1.1 — richer Seats.aero fields ───────────────────────────────
    seats_directs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    available_boolean: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at_source: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at_source: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    availability_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    origin_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    origin_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    dest_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    dest_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    booking_link_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    stops: Mapped[int | None] = mapped_column(Integer, nullable=True)
    flight_numbers: Mapped[str | None] = mapped_column(Text, nullable=True)
