import math
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import (
    get_current_session_and_user,
    get_active_org_context,
    require_role,
    ActiveOrgContext,
)
from backend.app.core.errors import CivicFixException
from backend.app.models import Organization, Membership, AuditLog, RoleEnum, User
from backend.app.schemas.organization import (
    OrganizationCreate,
    OrganizationUpdate,
    OrganizationResponse,
)
from backend.app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=PaginatedResponse[OrganizationResponse])
def list_organizations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: DBSession = Depends(get_db),
):
    query = db.query(Organization).order_by(Organization.name)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return PaginatedResponse[OrganizationResponse](
        items=[OrganizationResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=OrganizationResponse, status_code=201)
def create_organization(
    payload: OrganizationCreate,
    db: DBSession = Depends(get_db),
    session_and_user=Depends(get_current_session_and_user),
):
    _, user = session_and_user

    # Allow creating organization if user is PLATFORM_ADMIN or no organizations exist yet
    existing_org_count = db.query(Organization).count()
    is_platform_admin = (
        db.query(Membership)
        .filter(
            Membership.user_id == user.id,
            Membership.role == RoleEnum.PLATFORM_ADMIN.value,
        )
        .first()
    )

    if existing_org_count > 0 and not is_platform_admin:
        raise CivicFixException(
            code="PERMISSION_DENIED",
            message="Only platform administrators can create new organizations.",
            status_code=403,
        )

    # Check slug uniqueness
    slug = payload.slug.strip().lower()
    if db.query(Organization).filter(Organization.slug == slug).first():
        raise CivicFixException(
            code="SLUG_ALREADY_EXISTS",
            message=f"An organization with slug '{slug}' already exists.",
            status_code=409,
        )

    org = Organization(
        name=payload.name.strip(),
        slug=slug,
        type=payload.type.strip().upper(),
        time_zone=payload.time_zone.strip(),
        settings=payload.settings,
    )
    db.add(org)
    db.flush()

    # Make creator PLATFORM_ADMIN if first organization or already platform admin
    creator_role = (
        RoleEnum.PLATFORM_ADMIN.value
        if (is_platform_admin or existing_org_count == 0)
        else RoleEnum.ORG_ADMIN.value
    )
    membership = Membership(
        user_id=user.id,
        organization_id=org.id,
        role=creator_role,
    )
    db.add(membership)

    audit = AuditLog(
        organization_id=org.id,
        actor_id=user.id,
        action="ORGANIZATION_CREATED",
        details={"org_name": org.name, "org_type": org.type, "slug": org.slug},
    )
    db.add(audit)
    db.commit()
    db.refresh(org)

    return OrganizationResponse.model_validate(org)


@router.get("/{org_id}", response_model=OrganizationResponse)
def get_organization(
    org_id: int,
    db: DBSession = Depends(get_db),
    session_and_user=Depends(get_current_session_and_user),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise CivicFixException(
            code="ORGANIZATION_NOT_FOUND",
            message="Organization not found.",
            status_code=404,
        )
    return OrganizationResponse.model_validate(org)


@router.put("/{org_id}", response_model=OrganizationResponse)
def update_organization(
    org_id: int,
    payload: OrganizationUpdate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    if ctx.organization_id != org_id and ctx.role != RoleEnum.PLATFORM_ADMIN.value:
        raise CivicFixException(
            code="ORGANIZATION_ACCESS_DENIED",
            message="Cannot update another organization.",
            status_code=403,
        )

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise CivicFixException(
            code="ORGANIZATION_NOT_FOUND",
            message="Organization not found.",
            status_code=404,
        )

    if payload.name is not None:
        org.name = payload.name.strip()
    if payload.type is not None:
        org.type = payload.type.strip().upper()
    if payload.time_zone is not None:
        org.time_zone = payload.time_zone.strip()
    if payload.settings is not None:
        org.settings = payload.settings

    audit = AuditLog(
        organization_id=org.id,
        actor_id=ctx.user.id,
        action="ORGANIZATION_UPDATED",
        details={"updated_fields": payload.model_dump(exclude_unset=True)},
    )
    db.add(audit)
    db.commit()
    db.refresh(org)

    return OrganizationResponse.model_validate(org)
