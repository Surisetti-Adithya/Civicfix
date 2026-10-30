import datetime
import random
import string
from typing import Optional, Set, Tuple
from sqlalchemy.orm import Session as DBSession

from backend.app.core.errors import CivicFixException
from backend.app.models import (
    Complaint,
    ComplaintHistory,
    CategoryTeamMap,
    DeadlineRule,
    RoleEnum,
    ComplaintStatusEnum,
)

# Allowed status transitions and authorized roles
ALLOWED_TRANSITIONS: dict[Tuple[str, str], Set[str]] = {
    # SUBMITTED
    (ComplaintStatusEnum.SUBMITTED.value, ComplaintStatusEnum.UNDER_REVIEW.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },
    (ComplaintStatusEnum.SUBMITTED.value, ComplaintStatusEnum.ASSIGNED.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },
    (ComplaintStatusEnum.SUBMITTED.value, ComplaintStatusEnum.REJECTED.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },

    # UNDER_REVIEW
    (ComplaintStatusEnum.UNDER_REVIEW.value, ComplaintStatusEnum.ASSIGNED.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },
    (ComplaintStatusEnum.UNDER_REVIEW.value, ComplaintStatusEnum.IN_PROGRESS.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },
    (ComplaintStatusEnum.UNDER_REVIEW.value, ComplaintStatusEnum.REJECTED.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },

    # ASSIGNED
    (ComplaintStatusEnum.ASSIGNED.value, ComplaintStatusEnum.IN_PROGRESS.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },
    (ComplaintStatusEnum.ASSIGNED.value, ComplaintStatusEnum.REJECTED.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },

    # IN_PROGRESS
    (ComplaintStatusEnum.IN_PROGRESS.value, ComplaintStatusEnum.AWAITING_INFORMATION.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },
    (ComplaintStatusEnum.IN_PROGRESS.value, ComplaintStatusEnum.RESOLVED.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },

    # AWAITING_INFORMATION
    (ComplaintStatusEnum.AWAITING_INFORMATION.value, ComplaintStatusEnum.IN_PROGRESS.value): {
        RoleEnum.CITIZEN.value,
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },
    (ComplaintStatusEnum.AWAITING_INFORMATION.value, ComplaintStatusEnum.UNDER_REVIEW.value): {
        RoleEnum.CITIZEN.value,
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },

    # RESOLVED
    (ComplaintStatusEnum.RESOLVED.value, ComplaintStatusEnum.REOPENED.value): {
        RoleEnum.CITIZEN.value,
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },
    (ComplaintStatusEnum.RESOLVED.value, ComplaintStatusEnum.CLOSED.value): {
        RoleEnum.CITIZEN.value,
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },

    # REOPENED
    (ComplaintStatusEnum.REOPENED.value, ComplaintStatusEnum.UNDER_REVIEW.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },
    (ComplaintStatusEnum.REOPENED.value, ComplaintStatusEnum.ASSIGNED.value): {
        RoleEnum.STAFF.value,
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },

    # REJECTED
    (ComplaintStatusEnum.REJECTED.value, ComplaintStatusEnum.UNDER_REVIEW.value): {
        RoleEnum.ORG_ADMIN.value,
        RoleEnum.PLATFORM_ADMIN.value,
    },
}


def validate_status_transition(current_status: str, new_status: str, user_role: str, is_reporter: bool = False):
    if current_status == new_status:
        return

    allowed_roles = ALLOWED_TRANSITIONS.get((current_status, new_status))
    if not allowed_roles:
        raise CivicFixException(
            code="INVALID_STATUS_TRANSITION",
            message=f"Transition from {current_status} to {new_status} is not allowed.",
            status_code=400,
            details={"current_status": current_status, "target_status": new_status},
        )

    # CITIZEN can only reopen if they are the reporter
    if new_status == ComplaintStatusEnum.REOPENED.value and user_role == RoleEnum.CITIZEN.value and not is_reporter:
        raise CivicFixException(
            code="PERMISSION_DENIED",
            message="Only the original reporter or staff can reopen a resolved complaint.",
            status_code=403,
        )

    if user_role not in allowed_roles and user_role != RoleEnum.PLATFORM_ADMIN.value:
        raise CivicFixException(
            code="PERMISSION_DENIED",
            message=f"Role '{user_role}' is not authorized to transition complaint to {new_status}.",
            status_code=403,
            details={"required_roles": list(allowed_roles), "user_role": user_role},
        )


def generate_reference_number(db: DBSession) -> str:
    year = datetime.datetime.now(datetime.timezone.utc).year
    for _ in range(10):
        random_suffix = "".join(random.choices(string.digits, k=5))
        ref = f"CF-{year}-{random_suffix}"
        if not db.query(Complaint).filter(Complaint.public_reference_number == ref).first():
            return ref
    # Fallback with timestamp
    return f"CF-{year}-{int(datetime.datetime.now().timestamp()) % 100000:05d}"


def log_complaint_history(
    db: DBSession,
    complaint_id: int,
    actor_id: Optional[int],
    field: str,
    old_value: Optional[str],
    new_value: Optional[str],
    notes: Optional[str] = None,
):
    entry = ComplaintHistory(
        complaint_id=complaint_id,
        actor_id=actor_id,
        field=field,
        old_value=str(old_value) if old_value is not None else None,
        new_value=str(new_value) if new_value is not None else None,
        notes=notes,
    )
    db.add(entry)


def route_and_calculate_deadlines(db: DBSession, complaint: Complaint):
    # Routing via CategoryTeamMap
    if complaint.category_id:
        mapping = (
            db.query(CategoryTeamMap)
            .filter(
                CategoryTeamMap.organization_id == complaint.organization_id,
                CategoryTeamMap.category_id == complaint.category_id,
            )
            .first()
        )
        if mapping:
            complaint.assigned_team_id = mapping.team_id
            complaint.routing_result = "ROUTED"
        else:
            complaint.assigned_team_id = None
            complaint.routing_result = "AUTHORITY_NOT_IDENTIFIED"
    else:
        complaint.assigned_team_id = None
        complaint.routing_result = "AUTHORITY_NOT_IDENTIFIED"

    # Deadline calculation
    now = datetime.datetime.now(datetime.timezone.utc)
    rule = None
    if complaint.category_id:
        rule = (
            db.query(DeadlineRule)
            .filter(
                DeadlineRule.organization_id == complaint.organization_id,
                DeadlineRule.category_id == complaint.category_id,
                DeadlineRule.mode == "NORMAL",
            )
            .first()
        )
    if not rule:
        # Check org-level default rule (category_id is NULL)
        rule = (
            db.query(DeadlineRule)
            .filter(
                DeadlineRule.organization_id == complaint.organization_id,
                DeadlineRule.category_id.is_(None),
                DeadlineRule.mode == "NORMAL",
            )
            .first()
        )

    response_hours = rule.response_hours if rule else 24
    resolution_hours = rule.resolution_hours if rule else 72

    complaint.response_deadline = now + datetime.timedelta(hours=response_hours)
    complaint.resolution_deadline = now + datetime.timedelta(hours=resolution_hours)
