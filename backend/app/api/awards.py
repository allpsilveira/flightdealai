from fastapi import APIRouter, Depends
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()


@router.get("/")
async def list_awards(user: User = Depends(get_current_user)):
    # Phase 3 — award data endpoint
    return []
