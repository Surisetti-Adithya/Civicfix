import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, require_role, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import (
    Complaint,
    EscalationRule,
    EscalationRecord,
    AuditLog,
    RoleEnum,
    EscalationStateEnum,
)
from backend.app.schemas.escalation import (
    EscalationRuleCreate,
    EscalationRuleResponse,
    EscalationRecordResponse,
    EscalationSubmitRequest,
    EscalationAcknowledgeRequest,
)

router = APIRouter(prefix="/escalations", tags=["escalations"])


@router.get("/rules", response_model=List[EscalationRuleResponse])
def list_escalation_rules(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    rules = (
        db.query(EscalationRule)
        .filter(EscalationRule.organization_id == ctx.organization_id)
        .order_by(EscalationRule.level_order.asc())
        .all()
    )
    return [EscalationRuleResponse.model_validate(r) for r in rules]


@router.post("/rules", response_model=EscalationRuleResponse, status_code=201)
def create_escalation_rule(
    payload: EscalationRuleCreate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    rule = EscalationRule(
        organization_id=ctx.organization_id,
        level_order=payload.level_order,
        target_role_or_channel=payload.target_role_or_channel.strip(),
        trigger=payload.trigger.strip(),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return EscalationRuleResponse.model_validate(rule)


@router.get("/records", response_model=List[EscalationRecordResponse])
def list_escalation_records(
    complaint_id: Optional[int] = Query(None),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    query = (
        db.query(EscalationRecord)
        .join(Complaint, EscalationRecord.complaint_id == Complaint.id)
        .filter(Complaint.organization_id == ctx.organization_id)
    )

    if ctx.role == RoleEnum.CITIZEN.value:
        query = query.filter(Complaint.reporter_id == ctx.user.id)

    if complaint_id:
        query = query.filter(EscalationRecord.complaint_id == complaint_id)

    records = query.order_by(EscalationRecord.prepared_at.desc()).all()
    return [EscalationRecordResponse.model_validate(r) for r in records]


@router.patch("/records/{record_id}/submit", response_model=EscalationRecordResponse)
def submit_escalation_record(
    payload: EscalationSubmitRequest,
    record_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.STAFF, RoleEnum.ORG_ADMIN])),
):
    rec = (
        db.query(EscalationRecord)
        .join(Complaint, EscalationRecord.complaint_id == Complaint.id)
        .filter(EscalationRecord.id == record_id, Complaint.organization_id == ctx.organization_id)
        .first()
    )
    if not rec:
        raise CivicFixException(
            code="ESCALATION_RECORD_NOT_FOUND",
            message="Escalation record not found.",
            status_code=404,
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    rec.state = EscalationStateEnum.SUBMITTED.value
    rec.submitted_at = now
    rec.receipt_reference = payload.receipt_reference.strip()
    if payload.notes:
        rec.notes = (rec.notes + "\n" + payload.notes) if rec.notes else payload.notes

    # Write AuditLog for escalation submission
    audit = AuditLog(
        organization_id=ctx.organization_id,
        actor_id=ctx.user.id,
        action="ESCALATION_RECORD_SUBMITTED",
        details={
            "escalation_record_id": rec.id,
            "complaint_id": rec.complaint_id,
            "receipt_reference": rec.receipt_reference,
            "level": rec.level,
        },
    )
    db.add(audit)
    db.commit()
    db.refresh(rec)

    return EscalationRecordResponse.model_validate(rec)


@router.patch("/records/{record_id}/acknowledge", response_model=EscalationRecordResponse)
def acknowledge_escalation_record(
    payload: EscalationAcknowledgeRequest,
    record_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.STAFF, RoleEnum.ORG_ADMIN])),
):
    rec = (
        db.query(EscalationRecord)
        .join(Complaint, EscalationRecord.complaint_id == Complaint.id)
        .filter(EscalationRecord.id == record_id, Complaint.organization_id == ctx.organization_id)
        .first()
    )
    if not rec:
        raise CivicFixException(
            code="ESCALATION_RECORD_NOT_FOUND",
            message="Escalation record not found.",
            status_code=404,
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    rec.state = EscalationStateEnum.ACKNOWLEDGED.value
    rec.acknowledged_at = now
    if payload.notes:
        rec.notes = (rec.notes + "\n" + payload.notes) if rec.notes else payload.notes

    audit = AuditLog(
        organization_id=ctx.organization_id,
        actor_id=ctx.user.id,
        action="ESCALATION_RECORD_ACKNOWLEDGED",
        details={
            "escalation_record_id": rec.id,
            "complaint_id": rec.complaint_id,
            "level": rec.level,
        },
    )
    db.add(audit)
    db.commit()
    db.refresh(rec)

    return EscalationRecordResponse.model_validate(rec)
