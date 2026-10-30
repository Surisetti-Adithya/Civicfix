from typing import Optional
from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import (
    Complaint,
    CommunityVerification,
    VerificationAnswerEnum,
)
from backend.app.schemas.community import VerificationCreate, VerificationSummary

router = APIRouter(prefix="/complaints/{complaint_id}/verifications", tags=["verifications"])


@router.get("", response_model=VerificationSummary)
def get_verification_summary(
    complaint_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    complaint = (
        db.query(Complaint)
        .filter(Complaint.id == complaint_id, Complaint.organization_id == ctx.organization_id)
        .first()
    )
    if not complaint:
        raise CivicFixException(
            code="COMPLAINT_NOT_FOUND",
            message="Complaint not found.",
            status_code=404,
        )

    records = (
        db.query(CommunityVerification)
        .filter(CommunityVerification.complaint_id == complaint_id)
        .all()
    )

    counts = {
        VerificationAnswerEnum.STILL_EXISTS.value: 0,
        VerificationAnswerEnum.APPEARS_RESOLVED.value: 0,
        VerificationAnswerEnum.NEEDS_REVIEW.value: 0,
    }

    user_answer = None
    for r in records:
        if r.answer in counts:
            counts[r.answer] += 1
        if r.user_id == ctx.user.id:
            user_answer = r.answer

    return VerificationSummary(
        complaint_id=complaint_id,
        total_responses=len(records),
        counts=counts,
        user_answer=user_answer,
    )


@router.post("", response_model=VerificationSummary, status_code=201)
def submit_verification(
    payload: VerificationCreate,
    complaint_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    complaint = (
        db.query(Complaint)
        .filter(Complaint.id == complaint_id, Complaint.organization_id == ctx.organization_id)
        .first()
    )
    if not complaint:
        raise CivicFixException(
            code="COMPLAINT_NOT_FOUND",
            message="Complaint not found.",
            status_code=404,
        )

    valid_answers = [a.value for a in VerificationAnswerEnum]
    if payload.answer not in valid_answers:
        raise CivicFixException(
            code="INVALID_ANSWER",
            message=f"Answer must be one of: {', '.join(valid_answers)}",
            status_code=400,
        )

    existing = (
        db.query(CommunityVerification)
        .filter(
            CommunityVerification.complaint_id == complaint_id,
            CommunityVerification.user_id == ctx.user.id,
        )
        .first()
    )

    if existing:
        existing.answer = payload.answer
        existing.notes = payload.notes
    else:
        record = CommunityVerification(
            complaint_id=complaint_id,
            user_id=ctx.user.id,
            answer=payload.answer,
            notes=payload.notes,
        )
        db.add(record)

    db.commit()

    return get_verification_summary(complaint_id=complaint_id, db=db, ctx=ctx)
