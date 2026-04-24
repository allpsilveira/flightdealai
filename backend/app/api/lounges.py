from fastapi import APIRouter, Query
from typing import List

from app.services.lounges_loader import load_lounges

router = APIRouter()


@router.get('/', response_model=List[dict])
async def list_lounges(airport: str | None = Query(None)):
    lounges = load_lounges()
    if airport:
        airport = airport.upper()
        lounges = [l for l in lounges if l.get('airport_iata') == airport]
    return lounges
