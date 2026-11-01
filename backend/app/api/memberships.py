import math
from typing import Optional
from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import (
    require_role,
    ActiveOrgContext,
)
from backend.app.core.errors import CivicFixException
from backend.app.models import Membership, User, AuditLog, Team, RoleEnum
from backend.app.schemas.organization import (
    MembershipCreate,
    MembershipUpdate,
    MembershipResponse,
)
from backend.app.schemas.auth import UserResponse
from backend.app.schemas.common import PaginatedResponse, MessageResponse

router = APIRouter(prefix="/organizations/{org_id}/memberships", tags=["memberships"])


@router.get("", response_model=PaginatedResponse[MembershipResponse])
def list_memberships(
    org_id: int = Path(...),
    role: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.STAFF, RoleEnum.ORG_ADMIN])),
):
    if ctx.organization_id != org_id and ctx.role != RoleEnum.PLATFORM_ADMIN.value:
        raise CivicFixException(
            code="ORGANIZATION_ACCESS_DENIED",
            message="Cannot view memberships of another organization.",
            status_code=403,
        )

    query = (
        db.query(Membership)
        .filter(Membership.organization_id == org_id)
    )
    if role:
        query = query.filter(Membership.role == role)
    query = query.order_by(Membership.id)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    result_items = []
    for m in items:
        resp = MembershipResponse(
            id=m.id,
            user_id=m.user_id,
            organization_id=m.organization_id,
            team_id=m.team_id,
            team_name=m.team.name if m.team else None,
            role=m.role,
            created_at=m.created_at,
            user=UserResponse.model_validate(m.user) if m.user else None,
        )
        result_items.append(resp)

    return PaginatedResponse[MembershipResponse](
        items=result_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=MembershipResponse, status_code=201)
def add_or_update_membership(
    org_id: int,
    payload: MembershipCreate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    if ctx.organization_id != org_id and ctx.role != RoleEnum.PLATFORM_ADMIN.value:
        raise CivicFixException(
            code="ORGANIZATION_ACCESS_DENIED",
            message="Cannot manage memberships of another organization.",
            status_code=403,
        )

    target_user = db.query(User).filter(User.id == payload.user_id).first()
    if not target_user:
        raise CivicFixException(
            code="USER_NOT_FOUND",
            message="User not found.",
            status_code=404,
        )

    valid_roles = [r.value for r in RoleEnum]
    if payload.role not in valid_roles:
        raise CivicFixException(
            code="INVALID_ROLE",
            message=f"Role must be one of: {', '.join(valid_roles)}",
            status_code=400,
        )

    membership = (
        db.query(Membership)
        .filter(
            Membership.user_id == payload.user_id,
            Membership.organization_id == org_id,
        )
        .first()
    )

    action = "MEMBERSHIP_UPDATED" if membership else "MEMBERSHIP_CREATED"
    old_role = membership.role if membership else None
    old_team_id = membership.team_id if membership else None

    if membership:
        membership.role = payload.role
        if payload.team_id is not None:
            membership.team_id = payload.team_id
    else:
        membership = Membership(
            user_id=payload.user_id,
            organization_id=org_id,
            team_id=payload.team_id,
            role=payload.role,
        )
        db.add(membership)

    audit = AuditLog(
        organization_id=org_id,
        actor_id=ctx.user.id,
        action=action,
        details={
            "target_user_id": payload.user_id,
            "target_user_email": target_user.email,
            "old_role": old_role,
            "new_role": payload.role,
            "old_team_id": old_team_id,
            "new_team_id": payload.team_id,
        },
    )
    db.add(audit)
    db.commit()
    db.refresh(membership)

    return MembershipResponse(
        id=membership.id,
        user_id=membership.user_id,
        organization_id=membership.organization_id,
        team_id=membership.team_id,
        team_name=membership.team.name if membership.team else None,
        role=membership.role,
        created_at=membership.created_at,
        user=UserResponse.model_validate(target_user),
    )


@router.patch("/{membership_id}", response_model=MembershipResponse)
def update_membership(
    org_id: int,
    membership_id: int,
    payload: MembershipUpdate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    if ctx.organization_id != org_id and ctx.role != RoleEnum.PLATFORM_ADMIN.value:
        raise CivicFixException(
            code="ORGANIZATION_ACCESS_DENIED",
            message="Cannot manage memberships of another organization.",
            status_code=403,
        )

    membership = (
        db.query(Membership)
        .filter(Membership.id == membership_id, Membership.organization_id == org_id)
        .first()
    )
    if not membership:
        raise CivicFixException(
            code="MEMBERSHIP_NOT_FOUND",
            message="Membership record not found.",
            status_code=404,
        )

    old_role = membership.role
    old_team_id = membership.team_id

    if payload.role is not None:
        valid_roles = [r.value for r in RoleEnum]
        if payload.role not in valid_roles:
            raise CivicFixException(
                code="INVALID_ROLE",
                message=f"Role must be one of: {', '.join(valid_roles)}",
                status_code=400,
            )
        membership.role = payload.role

    if payload.team_id is not None:
        # Check team exists if team_id > 0, or allow null/0 to unassign
        if payload.team_id > 0:
            team = db.query(Team).filter(Team.id == payload.team_id, Team.organization_id == org_id).first()
            if not team:
                raise CivicFixException(
                    code="TEAM_NOT_FOUND",
                    message="Department/team not found in this organization.",
                    status_code=404,
                )
            membership.team_id = payload.team_id
        else:
            membership.team_id = None

    audit = AuditLog(
        organization_id=org_id,
        actor_id=ctx.user.id,
        action="MEMBERSHIP_UPDATED",
        details={
            "target_user_id": membership.user_id,
            "old_role": old_role,
            "new_role": membership.role,
            "old_team_id": old_team_id,
            "new_team_id": membership.team_id,
        },
    )
    db.add(audit)
    db.commit()
    db.refresh(membership)

    return MembershipResponse(
        id=membership.id,
        user_id=membership.user_id,
        organization_id=membership.organization_id,
        team_id=membership.team_id,
        team_name=membership.team.name if membership.team else None,
        role=membership.role,
        created_at=membership.created_at,
        user=UserResponse.model_validate(membership.user) if membership.user else None,
    )


@router.delete("/{membership_id}", response_model=MessageResponse)
def remove_membership(
    org_id: int,
    membership_id: int,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    if ctx.organization_id != org_id and ctx.role != RoleEnum.PLATFORM_ADMIN.value:
        raise CivicFixException(
            code="ORGANIZATION_ACCESS_DENIED",
            message="Cannot manage memberships of another organization.",
            status_code=403,
        )

    membership = (
        db.query(Membership)
        .filter(Membership.id == membership_id, Membership.organization_id == org_id)
        .first()
    )
    if not membership:
        raise CivicFixException(
            code="MEMBERSHIP_NOT_FOUND",
            message="Membership record not found.",
            status_code=404,
        )

    # Protect against self-removal if last ORG_ADMIN
    if membership.user_id == ctx.user.id:
        admin_count = (
            db.query(Membership)
            .filter(
                Membership.organization_id == org_id,
                Membership.role == RoleEnum.ORG_ADMIN.value,
            )
            .count()
        )
        if admin_count <= 1:
            raise CivicFixException(
                code="CANNOT_REMOVE_LAST_ADMIN",
                message="Cannot remove the last organization administrator.",
                status_code=400,
            )

    audit = AuditLog(
        organization_id=org_id,
        actor_id=ctx.user.id,
        action="MEMBERSHIP_REMOVED",
        details={
            "removed_membership_id": membership.id,
            "removed_user_id": membership.user_id,
            "removed_role": membership.role,
        },
    )
    db.add(audit)
    db.delete(membership)
    db.commit()

    return MessageResponse(message="Membership removed successfully.")
