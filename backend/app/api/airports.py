import json
import os
import unicodedata
from fastapi import APIRouter, Depends
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()

_airports_cache: list[dict] | None = None


def _strip_accents(text: str) -> str:
    """Normalize accented chars: 'São Paulo' → 'sao paulo', 'Zürich' → 'zurich'."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _load_airports() -> list[dict]:
    global _airports_cache
    if _airports_cache is None:
        data_path = os.path.join(os.path.dirname(__file__), "..", "data", "airports.json")
        with open(data_path) as f:
            _airports_cache = json.load(f)
    return _airports_cache


@router.get("/")
async def list_airports(user: User = Depends(get_current_user)):
    return _load_airports()


@router.get("/search")
async def search_airports(q: str, user: User = Depends(get_current_user)):
    """
    Diacritic-insensitive airport search.
    'sao' matches 'São Paulo', 'bogota' matches 'Bogotá', 'zurich' matches 'Zürich'.
    Also: exact-IATA match (3 uppercase chars) prioritized.
    """
    if not q:
        return []

    q_stripped = _strip_accents(q)
    q_upper = q.upper().strip()

    # Exact IATA short-circuit
    if len(q_upper) == 3 and q_upper.isalpha():
        for a in _load_airports():
            if a.get("iata", "").upper() == q_upper:
                return [a]

    matches = []
    for a in _load_airports():
        iata = a.get("iata", "").lower()
        name = _strip_accents(a.get("name", ""))
        city = _strip_accents(a.get("city", ""))
        country = _strip_accents(a.get("country", ""))
        if (q_stripped in iata or q_stripped in name or q_stripped in city or q_stripped in country):
            matches.append(a)
        if len(matches) >= 50:
            break
    return matches[:20]
