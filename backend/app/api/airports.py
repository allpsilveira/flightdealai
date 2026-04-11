import json
import os
from fastapi import APIRouter, Depends
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()

_airports_cache: list[dict] | None = None


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
    q_lower = q.lower()
    return [
        a for a in _load_airports()
        if q_lower in a.get("iata", "").lower()
        or q_lower in a.get("name", "").lower()
        or q_lower in a.get("city", "").lower()
    ][:20]
