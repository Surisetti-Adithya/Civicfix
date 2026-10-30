from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, require_role, ActiveOrgContext
from backend.app.models import DeadlineRule, RoleEnum
from backend.app.schemas.escalation import (
    DeadlineRuleCreate,
    DeadlineRuleResponse,
    DeadlineJobResult,
)
from backend.app.services.deadline_service import run_deadline_check_job

router = APIRouter(prefix="/deadlines", tags=["deadlines"])


@router.get("/rules", response_model=List[DeadlineRuleResponse])
def list_deadline_rules(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    rules = (
        db.query(DeadlineRule)
        .filter(DeadlineRule.organization_id == ctx.organization_id)
        .order_by(DeadlineRule.id)
        .all()
    )
    return [DeadlineRuleResponse.model_validate(r) for r in rules]


@router.post("/rules", response_model=DeadlineRuleResponse, status_code=201)
def create_deadline_rule(
    payload: DeadlineRuleCreate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    rule = DeadlineRule(
        organization_id=ctx.organization_id,
        category_id=payload.category_id,
        response_hours=payload.response_hours,
        resolution_hours=payload.resolution_hours,
        mode=payload.mode.upper(),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return DeadlineRuleResponse.model_validate(rule)


@router.post("/check", response_model=DeadlineJobResult)
def trigger_deadline_check(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.STAFF, RoleEnum.ORG_ADMIN])),
):
    return run_deadline_check_job(db=db, organization_id=ctx.organization_id)
