import datetime
import math
from typing import Optional
from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, require_role, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import (
    Complaint,
    ComplaintHistory,
    Assignment,
    Category,
    Team,
    User,
    RoleEnum,
    ComplaintStatusEnum,
    Notification,
)
from backend.app.schemas.complaint import (
    ComplaintCreate,
    ComplaintStatusUpdate,
    ComplaintAssignRequest,
    ComplaintReopenRequest,
    ExtraInfoRequest,
    ComplaintBrief,
    ComplaintDetail,
)
from backend.app.schemas.common import PaginatedResponse
from backend.app.services.complaint_workflow import (
    generate_reference_number,
    log_complaint_history,
    route_and_calculate_deadlines,
    validate_status_transition,
)

router = APIRouter(prefix="/complaints", tags=["complaints"])


@router.post("", response_model=ComplaintDetail, status_code=201)
def create_complaint(
    payload: ComplaintCreate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    if payload.category_id:
        cat = (
            db.query(Category)
            .filter(Category.id == payload.category_id, Category.organization_id == ctx.organization_id)
            .first()
        )
        if not cat:
            raise CivicFixException(
                code="CATEGORY_NOT_FOUND",
                message="Category does not exist in this organization.",
                status_code=400,
            )

    ref_num = generate_reference_number(db)
    complaint = Complaint(
        public_reference_number=ref_num,
        organization_id=ctx.organization_id,
        reporter_id=ctx.user.id,
        description_original=payload.description.strip(),
        description_improved=payload.description_improved.strip() if payload.description_improved else None,
        category_id=payload.category_id,
        location_text=payload.location_text.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        status=ComplaintStatusEnum.SUBMITTED.value,
        base_severity=payload.base_severity.upper() if payload.base_severity else "MEDIUM",
        current_priority=payload.base_severity.upper() if payload.base_severity else "MEDIUM",
    )

    # Apply routing and calculate targets
    route_and_calculate_deadlines(db, complaint)
    db.add(complaint)
    db.flush()

    # Log initial status history
    log_complaint_history(
        db=db,
        complaint_id=complaint.id,
        actor_id=ctx.user.id,
        field="status",
        old_value=None,
        new_value=ComplaintStatusEnum.SUBMITTED.value,
        notes="Complaint created and submitted.",
    )

    db.commit()
    db.refresh(complaint)
    return ComplaintDetail.model_validate(complaint)


@router.get("", response_model=PaginatedResponse[ComplaintBrief])
def list_complaints(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    is_overdue: Optional[bool] = Query(None),
    scope: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    query = db.query(Complaint).filter(Complaint.organization_id == ctx.organization_id)

    # CITIZEN role: default to own submissions unless scope is 'nearby' or 'all'
    if ctx.role == RoleEnum.CITIZEN.value:
        if scope not in ["nearby", "community", "all"]:
            query = query.filter(Complaint.reporter_id == ctx.user.id)

    if status:
        query = query.filter(Complaint.status == status)
    if priority:
        query = query.filter(Complaint.current_priority == priority)
    if category_id:
        query = query.filter(Complaint.category_id == category_id)
    if is_overdue is not None:
        query = query.filter(Complaint.is_overdue == is_overdue)

    query = query.order_by(Complaint.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return PaginatedResponse[ComplaintBrief](
        items=[ComplaintBrief.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{complaint_id}", response_model=ComplaintDetail)
def get_complaint(
    complaint_id: int,
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

    return ComplaintDetail.model_validate(complaint)


@router.patch("/{complaint_id}/status", response_model=ComplaintDetail)
def update_complaint_status(
    complaint_id: int,
    payload: ComplaintStatusUpdate,
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

    is_reporter = complaint.reporter_id == ctx.user.id
    validate_status_transition(
        current_status=complaint.status,
        new_status=payload.status,
        user_role=ctx.role,
        is_reporter=is_reporter,
    )

    old_status = complaint.status
    complaint.status = payload.status
    complaint.updated_at = datetime.datetime.now(datetime.timezone.utc)

    # Log history in the same transaction
    log_complaint_history(
        db=db,
        complaint_id=complaint.id,
        actor_id=ctx.user.id,
        field="status",
        old_value=old_status,
        new_value=payload.status,
        notes=payload.notes,
    )

    # In-app notification to reporter if actor is not reporter
    if complaint.reporter_id != ctx.user.id:
        notif = Notification(
            user_id=complaint.reporter_id,
            title=f"Complaint Status Updated: {complaint.public_reference_number}",
            message=f"Status changed from {old_status} to {payload.status}.",
            link=f"/complaints/{complaint.id}",
        )
        db.add(notif)

    db.commit()
    db.refresh(complaint)
    return ComplaintDetail.model_validate(complaint)


@router.post("/{complaint_id}/assign", response_model=ComplaintDetail)
def assign_complaint(
    complaint_id: int,
    payload: ComplaintAssignRequest,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.STAFF, RoleEnum.ORG_ADMIN])),
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

    team = (
        db.query(Team)
        .filter(Team.id == payload.team_id, Team.organization_id == ctx.organization_id)
        .first()
    )
    if not team:
        raise CivicFixException(
            code="TEAM_NOT_FOUND",
            message="Assigned team does not exist in this organization.",
            status_code=400,
        )

    target_user = None
    if payload.user_id:
        target_user = db.query(User).filter(User.id == payload.user_id).first()
        if not target_user:
            raise CivicFixException(
                code="USER_NOT_FOUND",
                message="Assigned staff member not found.",
                status_code=400,
            )

    old_team_id = complaint.assigned_team_id
    old_user_id = complaint.assigned_user_id
    old_status = complaint.status

    complaint.assigned_team_id = payload.team_id
    complaint.assigned_user_id = payload.user_id
    complaint.updated_at = datetime.datetime.now(datetime.timezone.utc)

    # If status is SUBMITTED or UNDER_REVIEW, update to ASSIGNED
    if complaint.status in [ComplaintStatusEnum.SUBMITTED.value, ComplaintStatusEnum.UNDER_REVIEW.value]:
        complaint.status = ComplaintStatusEnum.ASSIGNED.value
        log_complaint_history(
            db=db,
            complaint_id=complaint.id,
            actor_id=ctx.user.id,
            field="status",
            old_value=old_status,
            new_value=ComplaintStatusEnum.ASSIGNED.value,
            notes=f"Auto-transitioned to ASSIGNED upon assignment.",
        )

    assignment = Assignment(
        complaint_id=complaint.id,
        team_id=payload.team_id,
        user_id=payload.user_id,
        assigned_by_id=ctx.user.id,
        notes=payload.notes,
    )
    db.add(assignment)

    log_complaint_history(
        db=db,
        complaint_id=complaint.id,
        actor_id=ctx.user.id,
        field="assignment",
        old_value=f"Team:{old_team_id},User:{old_user_id}",
        new_value=f"Team:{payload.team_id},User:{payload.user_id}",
        notes=payload.notes,
    )

    db.commit()
    db.refresh(complaint)
    return ComplaintDetail.model_validate(complaint)


@router.post("/{complaint_id}/reopen", response_model=ComplaintDetail)
def reopen_complaint(
    complaint_id: int,
    payload: ComplaintReopenRequest,
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

    if complaint.status != ComplaintStatusEnum.RESOLVED.value:
        raise CivicFixException(
            code="INVALID_STATUS_TRANSITION",
            message="Only RESOLVED complaints can be reopened.",
            status_code=400,
        )

    is_reporter = complaint.reporter_id == ctx.user.id
    if ctx.role == RoleEnum.CITIZEN.value and not is_reporter:
        raise CivicFixException(
            code="PERMISSION_DENIED",
            message="Only the reporter or staff can reopen this complaint.",
            status_code=403,
        )

    old_status = complaint.status
    complaint.status = ComplaintStatusEnum.REOPENED.value
    complaint.updated_at = datetime.datetime.now(datetime.timezone.utc)

    log_complaint_history(
        db=db,
        complaint_id=complaint.id,
        actor_id=ctx.user.id,
        field="status",
        old_value=old_status,
        new_value=ComplaintStatusEnum.REOPENED.value,
        notes=payload.reason,
    )

    db.commit()
    db.refresh(complaint)
    return ComplaintDetail.model_validate(complaint)


@router.post("/{complaint_id}/extra-info", response_model=ComplaintDetail)
def add_extra_info(
    complaint_id: int,
    payload: ExtraInfoRequest,
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

    # If updated location given, update complaint location & coordinates
    if payload.updated_location:
        complaint.location_text = payload.updated_location.strip()
    if payload.latitude is not None:
        complaint.latitude = payload.latitude
    if payload.longitude is not None:
        complaint.longitude = payload.longitude

    complaint.updated_at = datetime.datetime.now(datetime.timezone.utc)

    # Log in complaint history
    log_complaint_history(
        db=db,
        complaint_id=complaint.id,
        actor_id=ctx.user.id,
        field="extra_info",
        old_value=None,
        new_value=payload.information.strip(),
        notes=payload.information.strip(),
    )

    # Award Trust Level points:
    # Submitting extra info/pictures increases initial poster's trust by +15, contributor's by +10
    if complaint.reporter_id != ctx.user.id:
        if complaint.reporter:
            complaint.reporter.trust_level = (complaint.reporter.trust_level or 50) + 15
        ctx.user.trust_level = (ctx.user.trust_level or 50) + 10
    else:
        ctx.user.trust_level = (ctx.user.trust_level or 50) + 10

    db.commit()
    db.refresh(complaint)
    return ComplaintDetail.model_validate(complaint)

