import datetime
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_session_and_user
from backend.app.core.errors import CivicFixException
from backend.app.models import DemoIdentity, VerificationRecord, DemoIdentityStateEnum
from backend.app.schemas.demo_identity import (
    DemoIdentityResponse,
    VerificationRequest,
    VerificationRecordResponse,
)

router = APIRouter(prefix="/demo-identity", tags=["demo-identity"])


@router.get("", response_model=List[DemoIdentityResponse])
def list_demo_identities(
    db: DBSession = Depends(get_db),
    session_and_user=Depends(get_current_session_and_user),
):
    if settings.ENVIRONMENT == "production" or not settings.ENABLE_DEMO_IDENTITY:
        raise CivicFixException(
            code="FEATURE_DISABLED",
            message="Synthetic demo identity is disabled in production environments.",
            status_code=403,
        )

    identities = db.query(DemoIdentity).order_by(DemoIdentity.id).all()
    return [DemoIdentityResponse.model_validate(i) for i in identities]


@router.post("/verify", response_model=VerificationRecordResponse)
def verify_demo_identity(
    payload: VerificationRequest,
    db: DBSession = Depends(get_db),
    session_and_user=Depends(get_current_session_and_user),
):
    if settings.ENVIRONMENT == "production" or not settings.ENABLE_DEMO_IDENTITY:
        raise CivicFixException(
            code="FEATURE_DISABLED",
            message="Synthetic demo identity is disabled in production environments.",
            status_code=403,
        )

    _, user = session_and_user
    demo_id = db.query(DemoIdentity).filter(DemoIdentity.id == payload.demo_identity_id).first()
    if not demo_id:
        raise CivicFixException(
            code="DEMO_IDENTITY_NOT_FOUND",
            message="Synthetic demo identity not found.",
            status_code=404,
        )

    existing_record = (
        db.query(VerificationRecord)
        .filter(VerificationRecord.user_id == user.id)
        .first()
    )

    now = datetime.datetime.now(datetime.timezone.utc)
    if existing_record:
        existing_record.demo_identity_id = demo_id.id
        existing_record.status = demo_id.state
        existing_record.verified_at = now
        record = existing_record
    else:
        record = VerificationRecord(
            user_id=user.id,
            demo_identity_id=demo_id.id,
            status=demo_id.state,
            verified_at=now,
        )
        db.add(record)

    db.commit()
    db.refresh(record)

    return VerificationRecordResponse(
        id=record.id,
        user_id=record.user_id,
        demo_identity_id=record.demo_identity_id,
        status=record.status,
        verified_at=record.verified_at,
        demo_identity=DemoIdentityResponse.model_validate(demo_id),
    )


@router.get("/status", response_model=VerificationRecordResponse)
def get_verification_status(
    db: DBSession = Depends(get_db),
    session_and_user=Depends(get_current_session_and_user),
):
    _, user = session_and_user
    record = (
        db.query(VerificationRecord)
        .filter(VerificationRecord.user_id == user.id)
        .first()
    )
    if not record:
        raise CivicFixException(
            code="NOT_VERIFIED",
            message="No synthetic verification record found for this user.",
            status_code=404,
        )

    return VerificationRecordResponse(
        id=record.id,
        user_id=record.user_id,
        demo_identity_id=record.demo_identity_id,
        status=record.status,
        verified_at=record.verified_at,
        demo_identity=DemoIdentityResponse.model_validate(record.demo_identity)
        if record.demo_identity
        else None,
    )
