from typing import List, Optional
from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, require_role, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import (
    Complaint,
    DuplicateGroup,
    DuplicateLink,
    RoleEnum,
)
from backend.app.schemas.community import (
    DuplicateGroupCreate,
    DuplicateLinkCreate,
    DuplicateGroupResponse,
    DuplicateLinkResponse,
)
from backend.app.schemas.common import MessageResponse

router = APIRouter(prefix="/duplicates", tags=["duplicates"])


@router.get("/groups", response_model=List[DuplicateGroupResponse])
def list_duplicate_groups(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.STAFF, RoleEnum.ORG_ADMIN])),
):
    groups = (
        db.query(DuplicateGroup)
        .filter(DuplicateGroup.organization_id == ctx.organization_id)
        .order_by(DuplicateGroup.created_at.desc())
        .all()
    )
    return [DuplicateGroupResponse.model_validate(g) for g in groups]


@router.post("/groups", response_model=DuplicateGroupResponse, status_code=201)
def create_duplicate_group(
    payload: DuplicateGroupCreate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.STAFF, RoleEnum.ORG_ADMIN])),
):
    primary = (
        db.query(Complaint)
        .filter(Complaint.id == payload.primary_complaint_id, Complaint.organization_id == ctx.organization_id)
        .first()
    )
    if not primary:
        raise CivicFixException(
            code="COMPLAINT_NOT_FOUND",
            message="Primary complaint not found in this organization.",
            status_code=404,
        )

    # Check if a group already has this as primary
    existing = (
        db.query(DuplicateGroup)
        .filter(
            DuplicateGroup.organization_id == ctx.organization_id,
            DuplicateGroup.primary_complaint_id == payload.primary_complaint_id,
        )
        .first()
    )
    if existing:
        return DuplicateGroupResponse.model_validate(existing)

    group = DuplicateGroup(
        organization_id=ctx.organization_id,
        primary_complaint_id=payload.primary_complaint_id,
        created_by_id=ctx.user.id,
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    return DuplicateGroupResponse.model_validate(group)


@router.post("/groups/{group_id}/link", response_model=DuplicateGroupResponse)
def link_complaint_to_group(
    payload: DuplicateLinkCreate,
    group_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.STAFF, RoleEnum.ORG_ADMIN])),
):
    group = (
        db.query(DuplicateGroup)
        .filter(DuplicateGroup.id == group_id, DuplicateGroup.organization_id == ctx.organization_id)
        .first()
    )
    if not group:
        raise CivicFixException(
            code="GROUP_NOT_FOUND",
            message="Duplicate group not found.",
            status_code=404,
        )

    target_complaint = (
        db.query(Complaint)
        .filter(Complaint.id == payload.complaint_id, Complaint.organization_id == ctx.organization_id)
        .first()
    )
    if not target_complaint:
        raise CivicFixException(
            code="COMPLAINT_NOT_FOUND",
            message="Complaint to link was not found in this organization.",
            status_code=404,
        )

    if group.primary_complaint_id == payload.complaint_id:
        raise CivicFixException(
            code="INVALID_LINK",
            message="Cannot link primary complaint to itself.",
            status_code=400,
        )

    existing_link = (
        db.query(DuplicateLink)
        .filter(DuplicateLink.group_id == group_id, DuplicateLink.complaint_id == payload.complaint_id)
        .first()
    )
    if not existing_link:
        link = DuplicateLink(
            group_id=group_id,
            complaint_id=payload.complaint_id,
            linked_by_id=ctx.user.id,
        )
        db.add(link)
        db.commit()

    db.refresh(group)
    return DuplicateGroupResponse.model_validate(group)


@router.delete("/groups/{group_id}/link/{complaint_id}", response_model=MessageResponse)
def unlink_complaint_from_group(
    group_id: int = Path(...),
    complaint_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.STAFF, RoleEnum.ORG_ADMIN])),
):
    group = (
        db.query(DuplicateGroup)
        .filter(DuplicateGroup.id == group_id, DuplicateGroup.organization_id == ctx.organization_id)
        .first()
    )
    if not group:
        raise CivicFixException(
            code="GROUP_NOT_FOUND",
            message="Duplicate group not found.",
            status_code=404,
        )

    link = (
        db.query(DuplicateLink)
        .filter(DuplicateLink.group_id == group_id, DuplicateLink.complaint_id == complaint_id)
        .first()
    )
    if not link:
        raise CivicFixException(
            code="LINK_NOT_FOUND",
            message="Linked duplicate record not found.",
            status_code=404,
        )

    db.delete(link)
    db.commit()

    return MessageResponse(message="Complaint unlinked from duplicate group.")
