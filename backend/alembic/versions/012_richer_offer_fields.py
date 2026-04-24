"""Plan v3 P1.1 — richer offer/duffel/award fields from existing API responses

We were already calling SerpApi/Duffel/Seats.aero and discarding most of the
response. This migration adds first-class columns for the fields we need to
power Plan v3 features (cabin quality enrichment, GEM detection, scarcity
events, ancillaries, map pins, booking redirects).

Revision ID: 012
Revises: 011
Create Date: 2026-04-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── flight_offers ────────────────────────────────────────────────────────
    op.add_column("flight_offers", sa.Column("legroom_inches", sa.Integer, nullable=True))
    op.add_column("flight_offers", sa.Column("amenities", postgresql.ARRAY(sa.Text), nullable=True))
    op.add_column("flight_offers", sa.Column("carbon_grams", sa.Integer, nullable=True))
    op.add_column("flight_offers", sa.Column("carbon_typical_grams", sa.Integer, nullable=True))
    op.add_column("flight_offers", sa.Column("layovers", postgresql.JSONB, nullable=True))
    op.add_column("flight_offers", sa.Column("also_sold_by", postgresql.ARRAY(sa.Text), nullable=True))
    op.add_column("flight_offers", sa.Column("booking_token", sa.Text, nullable=True))
    op.add_column("flight_offers", sa.Column("booking_options", postgresql.JSONB, nullable=True))
    op.add_column("flight_offers", sa.Column("aircraft_iata", sa.String(8), nullable=True))
    # Cabin-quality enrichment (denormalized for fast list rendering)
    op.add_column("flight_offers", sa.Column("cabin_quality_score", sa.Integer, nullable=True))
    op.add_column("flight_offers", sa.Column("cabin_product_name", sa.String(100), nullable=True))
    op.add_column("flight_offers", sa.Column("cabin_seat_type", sa.String(50), nullable=True))
    op.add_column("flight_offers", sa.Column("cabin_has_door", sa.Boolean, nullable=True))
    op.add_column("flight_offers", sa.Column("cabin_lie_flat", sa.Boolean, nullable=True))

    # ── duffel_prices ────────────────────────────────────────────────────────
    op.add_column("duffel_prices", sa.Column("base_amount_usd", sa.Float, nullable=True))
    op.add_column("duffel_prices", sa.Column("tax_amount_usd", sa.Float, nullable=True))
    op.add_column("duffel_prices", sa.Column("cabin_marketing_name", sa.String(80), nullable=True))
    op.add_column("duffel_prices", sa.Column("aircraft_iata", sa.String(8), nullable=True))
    op.add_column("duffel_prices", sa.Column("baggages", postgresql.JSONB, nullable=True))
    op.add_column("duffel_prices", sa.Column("available_services", postgresql.JSONB, nullable=True))
    op.add_column("duffel_prices", sa.Column("payment_requires_instant", sa.Boolean, nullable=True))
    op.add_column("duffel_prices", sa.Column("price_guarantee_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("duffel_prices", sa.Column("operating_carrier", sa.String(3), nullable=True))
    op.add_column("duffel_prices", sa.Column("marketing_carrier", sa.String(3), nullable=True))
    op.add_column("duffel_prices", sa.Column("duration_minutes", sa.Integer, nullable=True))
    op.add_column("duffel_prices", sa.Column("cabin_quality_score", sa.Integer, nullable=True))
    op.add_column("duffel_prices", sa.Column("cabin_product_name", sa.String(100), nullable=True))
    op.add_column("duffel_prices", sa.Column("cabin_lie_flat", sa.Boolean, nullable=True))

    # ── award_prices ─────────────────────────────────────────────────────────
    op.add_column("award_prices", sa.Column("seats_directs", sa.Integer, nullable=True))
    op.add_column("award_prices", sa.Column("available_boolean", sa.Boolean, nullable=True))
    op.add_column("award_prices", sa.Column("created_at_source", sa.DateTime(timezone=True), nullable=True))
    op.add_column("award_prices", sa.Column("updated_at_source", sa.DateTime(timezone=True), nullable=True))
    op.add_column("award_prices", sa.Column("availability_id", sa.String(64), nullable=True))
    op.add_column("award_prices", sa.Column("origin_lat", sa.Float, nullable=True))
    op.add_column("award_prices", sa.Column("origin_lng", sa.Float, nullable=True))
    op.add_column("award_prices", sa.Column("dest_lat", sa.Float, nullable=True))
    op.add_column("award_prices", sa.Column("dest_lng", sa.Float, nullable=True))
    op.add_column("award_prices", sa.Column("booking_link_url", sa.Text, nullable=True))
    op.add_column("award_prices", sa.Column("stops", sa.Integer, nullable=True))
    op.add_column("award_prices", sa.Column("flight_numbers", sa.Text, nullable=True))


def downgrade() -> None:
    for col in (
        "legroom_inches", "amenities", "carbon_grams", "carbon_typical_grams",
        "layovers", "also_sold_by", "booking_token", "booking_options", "aircraft_iata",
        "cabin_quality_score", "cabin_product_name", "cabin_seat_type",
        "cabin_has_door", "cabin_lie_flat",
    ):
        op.drop_column("flight_offers", col)
    for col in (
        "base_amount_usd", "tax_amount_usd", "cabin_marketing_name", "aircraft_iata",
        "baggages", "available_services", "payment_requires_instant",
        "price_guarantee_expires_at", "operating_carrier", "marketing_carrier",
        "duration_minutes", "cabin_quality_score", "cabin_product_name", "cabin_lie_flat",
    ):
        op.drop_column("duffel_prices", col)
    for col in (
        "seats_directs", "available_boolean", "created_at_source", "updated_at_source",
        "availability_id", "origin_lat", "origin_lng", "dest_lat", "dest_lng",
        "booking_link_url", "stops", "flight_numbers",
    ):
        op.drop_column("award_prices", col)
