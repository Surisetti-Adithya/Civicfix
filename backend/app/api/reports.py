from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import Organization, Complaint, ComplaintHistory, ComplaintStatusEnum
from backend.app.services.metrics_service import compute_organization_metrics

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/metrics")
def get_organization_metrics(
    days: int = Query(30, ge=1, le=365),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    return compute_organization_metrics(db=db, organization_id=ctx.organization_id, days=days)


@router.get("/recent-activity")
def get_recent_activity(
    limit: int = Query(20, ge=1, le=100),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    history_records = (
        db.query(ComplaintHistory)
        .join(Complaint, ComplaintHistory.complaint_id == Complaint.id)
        .filter(Complaint.organization_id == ctx.organization_id)
        .order_by(ComplaintHistory.created_at.desc())
        .limit(limit)
        .all()
    )

    results = []
    for h in history_records:
        results.append({
            "id": h.id,
            "complaint_id": h.complaint_id,
            "public_reference_number": h.complaint.public_reference_number if h.complaint else f"#{h.complaint_id}",
            "location_text": h.complaint.location_text if h.complaint else "",
            "field": h.field,
            "old_value": h.old_value,
            "new_value": h.new_value,
            "notes": h.notes,
            "actor_id": h.actor_id,
            "actor_name": h.actor.full_name if h.actor else "System",
            "created_at": h.created_at,
        })
    return results


@router.get("/staff-dashboard")
def get_staff_dashboard(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    open_statuses = [
        ComplaintStatusEnum.SUBMITTED.value,
        ComplaintStatusEnum.UNDER_REVIEW.value,
        ComplaintStatusEnum.ASSIGNED.value,
        ComplaintStatusEnum.IN_PROGRESS.value,
        ComplaintStatusEnum.AWAITING_INFORMATION.value,
        ComplaintStatusEnum.REOPENED.value,
    ]

    open_count = (
        db.query(Complaint)
        .filter(
            Complaint.organization_id == ctx.organization_id,
            Complaint.status.in_(open_statuses),
        )
        .count()
    )

    my_assigned_count = (
        db.query(Complaint)
        .filter(
            Complaint.organization_id == ctx.organization_id,
            Complaint.assigned_user_id == ctx.user.id,
            Complaint.status.in_(open_statuses),
        )
        .count()
    )

    overdue_count = (
        db.query(Complaint)
        .filter(
            Complaint.organization_id == ctx.organization_id,
            Complaint.is_overdue.is_(True),
            Complaint.status.in_(open_statuses),
        )
        .count()
    )

    recent_history = (
        db.query(ComplaintHistory)
        .join(Complaint, ComplaintHistory.complaint_id == Complaint.id)
        .filter(Complaint.organization_id == ctx.organization_id)
        .order_by(ComplaintHistory.created_at.desc())
        .limit(10)
        .all()
    )

    activity = []
    for h in recent_history:
        activity.append({
            "id": h.id,
            "complaint_id": h.complaint_id,
            "public_reference_number": h.complaint.public_reference_number if h.complaint else f"#{h.complaint_id}",
            "location_text": h.complaint.location_text if h.complaint else "",
            "field": h.field,
            "old_value": h.old_value,
            "new_value": h.new_value,
            "notes": h.notes,
            "actor_name": h.actor.full_name if h.actor else "System",
            "created_at": h.created_at,
        })

    return {
        "open_complaints_count": open_count,
        "assigned_complaints_count": my_assigned_count,
        "overdue_complaints_count": overdue_count,
        "recent_activity": activity,
    }


@router.get("/public-metrics")
def get_public_metrics(
    org_id: int = Query(..., description="Organization ID for public metrics"),
    days: int = Query(30, ge=1, le=365),
    db: DBSession = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise CivicFixException(
            code="ORGANIZATION_NOT_FOUND",
            message="Organization not found.",
            status_code=404,
        )

    # Compute privacy-safe aggregates only
    metrics = compute_organization_metrics(db=db, organization_id=org_id, days=days)
    return {
        "organization_id": org.id,
        "organization_name": org.name,
        "organization_type": org.type,
        "time_zone": org.time_zone,
        "time_period": metrics["time_period"],
        "metrics": metrics["metrics"],
        "breakdown_by_status": metrics["breakdown_by_status"],
        "total_recorded_period": metrics["total_recorded_period"],
    }
