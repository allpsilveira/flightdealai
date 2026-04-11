import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.alert_rule import AlertRule
from app.models.user import User

router = APIRouter()


class AlertRuleCreate(BaseModel):
    route_id: uuid.UUID | None = None
    score_threshold: int = 80
    gem_alerts: bool = True
    scarcity_alerts: bool = True
    trend_reversal_alerts: bool = False
    error_fare_alerts: bool = True
    whatsapp_enabled: bool = False
    web_push_enabled: bool = True


class AlertRuleResponse(BaseModel):
    id: uuid.UUID
    route_id: uuid.UUID | None
    score_threshold: int
    gem_alerts: bool
    scarcity_alerts: bool
    whatsapp_enabled: bool
    web_push_enabled: bool

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[AlertRuleResponse])
async def list_alert_rules(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AlertRule).where(AlertRule.user_id == user.id))
    return result.scalars().all()


@router.post("/", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_rule(
    body: AlertRuleCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = AlertRule(id=uuid.uuid4(), user_id=user.id, **body.model_dump())
    db.add(rule)
    await db.flush()
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(
    rule_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id, AlertRule.user_id == user.id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
