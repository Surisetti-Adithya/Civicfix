import datetime
import math
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy import case
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, require_role, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import (
    Complaint,
    ComplaintExtension,
    ComplaintHistory,
    DuplicateGroup,
    DuplicateLink,
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
    ComplaintTimelineEntry,
    EvidenceFileResponse,
)
from backend.app.schemas.common import PaginatedResponse
from backend.app.services.complaint_workflow import (
    generate_reference_number,
    log_complaint_history,
    route_and_calculate_deadlines,
    validate_status_transition,
)
from backend.app.services.ai.service import check_complaint_similarity_service

router = APIRouter(prefix="/complaints", tags=["complaints"])


def build_complaint_detail(complaint: Complaint) -> ComplaintDetail:
    detail = ComplaintDetail.model_validate(complaint)

    # Build timeline entries combining initial report, extensions, extra info, and media
    entries: List[ComplaintTimelineEntry] = []

    # 1. Initial report entry
    entries.append(
        ComplaintTimelineEntry(
            id=f"initial-{complaint.id}",
            entry_type="INITIAL_REPORT",
            timestamp=complaint.created_at,
            author_name=complaint.reporter.full_name if complaint.reporter else "Citizen Reporter",
            author_id=complaint.reporter_id,
            author_trust_level=complaint.reporter.trust_level if complaint.reporter else None,
            author_badge_title=complaint.reporter.badge_title if complaint.reporter else None,
            author_badge_tier=complaint.reporter.badge_tier if complaint.reporter else None,
            text=complaint.description_original,
            location_text=complaint.location_text,
            latitude=complaint.latitude,
            longitude=complaint.longitude,
            photos=[],
            notes=complaint.description_improved if complaint.description_improved else None,
        )
    )

    # 2. Extensions / merged posts
    if complaint.extensions:
        for ext in complaint.extensions:
            entries.append(
                ComplaintTimelineEntry(
                    id=f"ext-{ext.id}",
                    entry_type="AI_MERGED_EXTENSION" if ext.is_ai_merged else "COMMUNITY_CONTRIBUTION",
                    timestamp=ext.created_at,
                    author_name=ext.user.full_name if ext.user else "Community Contributor",
                    author_id=ext.user_id,
                    author_trust_level=ext.user.trust_level if ext.user else None,
                    author_badge_title=ext.user.badge_title if ext.user else None,
                    author_badge_tier=ext.user.badge_tier if ext.user else None,
                    text=ext.text,
                    location_text=ext.location_text,
                    latitude=ext.latitude,
                    longitude=ext.longitude,
                    photos=[],
                    notes=ext.similarity_reason if ext.similarity_reason else None,
                )
            )

    # 3. Evidence / photo uploads
    if complaint.evidence_files:
        for ef in complaint.evidence_files:
            entries.append(
                ComplaintTimelineEntry(
                    id=f"ev-{ef.id}",
                    entry_type="EVIDENCE_PHOTO",
                    timestamp=ef.uploaded_at,
                    author_name=ef.uploader.full_name if ef.uploader else "Contributor",
                    author_id=ef.uploader_id,
                    author_trust_level=ef.uploader.trust_level if ef.uploader else None,
                    author_badge_title=ef.uploader.badge_title if ef.uploader else None,
                    author_badge_tier=ef.uploader.badge_tier if ef.uploader else None,
                    text=f"Uploaded photo attachment: {ef.original_name}",
                    location_text=None,
                    latitude=None,
                    longitude=None,
                    photos=[EvidenceFileResponse.model_validate(ef)],
                    notes=None,
                )
            )

    # 4. Status updates from history
    if complaint.history:
        for h in complaint.history:
            if h.field == "status":
                entries.append(
                    ComplaintTimelineEntry(
                        id=f"hist-{h.id}",
                        entry_type="STATUS_UPDATE",
                        timestamp=h.created_at,
                        author_name=h.actor.full_name if h.actor else "Staff / System",
                        author_id=h.actor_id,
                        author_trust_level=h.actor.trust_level if h.actor else None,
                        author_badge_title=h.actor.badge_title if h.actor else None,
                        author_badge_tier=h.actor.badge_tier if h.actor else None,
                        text=f"Status updated: {h.old_value or 'None'} -> {h.new_value}",
                        notes=h.notes,
                    )
                )

    # Sort with NEWER DATA AT THE TOP (descending by timestamp)
    entries.sort(key=lambda e: e.timestamp, reverse=True)
    detail.timeline_entries = entries
    return detail


@router.post("", response_model=ComplaintDetail, status_code=201)
async def create_complaint(
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

        # Requirement 4: Gemma AI checks other posts under the same category to see if there is already a post about it
        match_tuple = await check_complaint_similarity_service(
            db=db,
            organization_id=ctx.organization_id,
            user_id=ctx.user.id,
            category_id=payload.category_id,
            description=payload.description,
            location_text=payload.location_text,
            latitude=payload.latitude,
            longitude=payload.longitude,
            photo_name=payload.photo_name,
        )

        if match_tuple:
            matched_complaint, reason, score = match_tuple

            # Add newer post as an extension to the older post
            extension = ComplaintExtension(
                complaint_id=matched_complaint.id,
                user_id=ctx.user.id,
                text=payload.description.strip(),
                location_text=payload.location_text.strip(),
                latitude=payload.latitude,
                longitude=payload.longitude,
                is_ai_merged=True,
                similarity_reason=reason,
            )
            db.add(extension)

            # Update timestamp of older post
            matched_complaint.updated_at = datetime.datetime.now(datetime.timezone.utc)

            # Log history
            log_complaint_history(
                db=db,
                complaint_id=matched_complaint.id,
                actor_id=ctx.user.id,
                field="merged_extension",
                old_value=None,
                new_value=payload.description.strip(),
                notes=f"Gemma AI merged extension: {reason}",
            )

            # Increase Trust Level for both accounts accordingly
            if matched_complaint.reporter_id != ctx.user.id:
                if matched_complaint.reporter:
                    matched_complaint.reporter.trust_level = (matched_complaint.reporter.trust_level or 50) + 15
                ctx.user.trust_level = (ctx.user.trust_level or 50) + 10

                db.add(
                    Notification(
                        user_id=matched_complaint.reporter_id,
                        title="Report Extended by Neighbor (+15 pts)",
                        message=f"Gemma AI merged a new similar report into #{matched_complaint.public_reference_number} as an extension. +15 Trust Points awarded!",
                        link=f"/complaints/{matched_complaint.id}",
                    )
                )
            else:
                ctx.user.trust_level = (ctx.user.trust_level or 50) + 10

            db.add(
                Notification(
                    user_id=ctx.user.id,
                    title="Report Merged into Existing Post (+10 pts)",
                    message=f"Gemma AI identified an existing report #{matched_complaint.public_reference_number} under this category. Your post was added as an extension. +10 Trust Points awarded!",
                    link=f"/complaints/{matched_complaint.id}",
                )
            )

            # Maintain duplicate tracking group
            dup_group = (
                db.query(DuplicateGroup)
                .filter(
                    DuplicateGroup.organization_id == ctx.organization_id,
                    DuplicateGroup.primary_complaint_id == matched_complaint.id,
                )
                .first()
            )
            if not dup_group:
                dup_group = DuplicateGroup(
                    organization_id=ctx.organization_id,
                    primary_complaint_id=matched_complaint.id,
                    created_by_id=ctx.user.id,
                )
                db.add(dup_group)

            db.commit()
            db.refresh(matched_complaint)

            detail = build_complaint_detail(matched_complaint)
            detail.is_merged = True
            detail.merged_into_id = matched_complaint.id
            detail.merge_reason = reason
            return detail

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
    return build_complaint_detail(complaint)


@router.get("", response_model=PaginatedResponse[ComplaintBrief])
def list_complaints(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    is_overdue: Optional[bool] = Query(None),
    scope: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("date"),
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

    # Requirements 1: Sorting by severity (Critical at top, Low at bottom) or latest date posted
    if sort_by == "severity":
        priority_order = case(
            (Complaint.current_priority == "CRITICAL", 1),
            (Complaint.current_priority == "HIGH", 2),
            (Complaint.current_priority == "MEDIUM", 3),
            (Complaint.current_priority == "LOW", 4),
            else_=5,
        )
        query = query.order_by(priority_order, Complaint.created_at.desc())
    else:
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

    return build_complaint_detail(complaint)


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
    return build_complaint_detail(complaint)


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
    return build_complaint_detail(complaint)


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
    return build_complaint_detail(complaint)


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

    # Record in ComplaintExtension for unified timeline progression
    ext = ComplaintExtension(
        complaint_id=complaint.id,
        user_id=ctx.user.id,
        text=payload.information.strip(),
        location_text=payload.updated_location.strip() if payload.updated_location else complaint.location_text,
        latitude=payload.latitude if payload.latitude is not None else complaint.latitude,
        longitude=payload.longitude if payload.longitude is not None else complaint.longitude,
        is_ai_merged=False,
    )
    db.add(ext)

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
    return build_complaint_detail(complaint)

