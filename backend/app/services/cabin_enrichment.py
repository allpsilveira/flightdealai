"""
Cabin-quality enrichment — joins offer rows with backend/app/data/cabin_quality.json.

SerpApi returns aircraft as a free-form name ("Boeing 787", "Airbus A380-800",
"Boeing 777-300ER"). Duffel returns aircraft as both a name and an IATA code
("789", "388", "77W"). The cabin_quality.json table is keyed by short codes
("B787", "A380", "B777", "A350", "A330"), so we normalize both inputs to that
short form before lookup.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "cabin_quality.json"

# IATA aircraft sub-codes → short family code used by cabin_quality.json
# Reference: https://www.iata.org/en/publications/directories/code-search/
_IATA_TO_SHORT = {
    # Boeing 787 family
    "788": "B787", "789": "B787", "78J": "B787", "78X": "B787",
    # Boeing 777 family
    "777": "B777", "772": "B777", "773": "B777", "77W": "B777",
    "77L": "B777", "77F": "B777",
    # Boeing 747
    "744": "B747", "748": "B747",
    # Boeing 767
    "763": "B767", "764": "B767",
    # Boeing 737 (rare in J/F)
    "738": "B737", "739": "B737", "73H": "B737", "7M8": "B737",
    # Airbus A380
    "388": "A380",
    # Airbus A350
    "351": "A350", "359": "A350", "35K": "A350",
    # Airbus A330 family (incl. neo)
    "330": "A330", "332": "A330", "333": "A330", "338": "A330", "339": "A330",
    # Airbus A340
    "342": "A340", "343": "A340", "345": "A340", "346": "A340",
    # Airbus A321
    "321": "A321", "32Q": "A321", "32N": "A321",
    # Airbus A320
    "320": "A320", "32A": "A320",
}


@lru_cache(maxsize=1)
def _load_table() -> list[dict[str, Any]]:
    if not _DATA_PATH.exists():
        return []
    try:
        return json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []


@lru_cache(maxsize=1)
def _index() -> dict[tuple[str, str], dict[str, Any]]:
    """Index by (airline_code_upper, aircraft_short)."""
    return {
        (row["airline_code"].upper(), row["aircraft_type"].upper()): row
        for row in _load_table()
        if row.get("airline_code") and row.get("aircraft_type")
    }


def normalize_aircraft(value: str | None) -> str | None:
    """
    Normalize any aircraft input to the short family code used in cabin_quality.json.

    Accepts:
      - IATA sub-codes ("789", "388", "77W")
      - Names ("Boeing 787", "Airbus A380-800", "Boeing 777-300ER")
      - Already-short codes ("B787", "A350")
    Returns None if no match can be inferred.
    """
    if not value:
        return None
    raw = str(value).strip().upper()

    # Already a known short code in our table?
    if any(raw == short for short in {row["aircraft_type"].upper() for row in _load_table()}):
        return raw

    # IATA sub-code (3 chars, alphanumeric)
    if raw in _IATA_TO_SHORT:
        return _IATA_TO_SHORT[raw]

    # Strip manufacturer prefix and try to extract a model number
    cleaned = re.sub(r"^(BOEING|AIRBUS|EMBRAER|BOMBARDIER)\s*", "", raw)

    # "787-9" → "787"; "A380-800" → "A380"; "777-300ER" → "777"
    m = re.match(r"^(A\d{3,4}|7\d{2}|E\d{3})", cleaned)
    if not m:
        return None
    base = m.group(1)
    if base.startswith("A"):
        return base[:4]  # A380, A350, A330
    if base.startswith("7"):
        return f"B{base[:3]}"  # 787 → B787
    return base


def lookup_cabin_quality(
    airline_code: str | None,
    aircraft: str | None,
) -> dict[str, Any] | None:
    """
    Look up cabin product details for an (airline, aircraft) pair.

    Returns a dict with keys:
      product_name, quality_score, seat_type, has_door, lie_flat, configuration
    or None if no entry exists.
    """
    if not airline_code or not aircraft:
        return None
    short = normalize_aircraft(aircraft)
    if not short:
        return None
    return _index().get((airline_code.upper(), short))


def enrich_offer_fields(
    airline_code: str | None,
    aircraft: str | None,
) -> dict[str, Any]:
    """
    Returns the denormalized cabin_quality_* fields ready to merge into a
    FlightOffer or DuffelPrice insert row. Empty-but-present keys when no
    match — so the merge still overwrites stale values to NULL deterministically.
    """
    short = normalize_aircraft(aircraft)
    row = lookup_cabin_quality(airline_code, aircraft)
    base = {
        "aircraft_iata":       short,
        "cabin_quality_score": None,
        "cabin_product_name":  None,
        "cabin_seat_type":     None,
        "cabin_has_door":      None,
        "cabin_lie_flat":      None,
    }
    if not row:
        return base
    base.update({
        "cabin_quality_score": row.get("quality_score"),
        "cabin_product_name":  row.get("product_name"),
        "cabin_seat_type":     row.get("seat_type"),
        "cabin_has_door":      row.get("has_door"),
        "cabin_lie_flat":      row.get("lie_flat"),
    })
    return base
