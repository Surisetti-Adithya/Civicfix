import datetime
from typing import Optional
from sqlalchemy.orm import Session as DBSession

from backend.app.models import (
    Complaint,
    EscalationRule,
    EscalationRecord,
    Notification,
    EscalationStateEnum,
    ComplaintStatusEnum,
)
from backend.app.schemas.escalation import DeadlineJobResult


def run_deadline_check_job(db: DBSession, organization_id: Optional[int] = None) -> DeadlineJobResult:
    now = datetime.datetime.now(datetime.timezone.utc)

    # Open complaints query
    query = db.query(Complaint).filter(
        Complaint.status.notin_([
            ComplaintStatusEnum.RESOLVED.value,
            ComplaintStatusEnum.CLOSED.value,
            ComplaintStatusEnum.REJECTED.value,
        ])
    )
    if organization_id:
        query = query.filter(Complaint.organization_id == organization_id)

    open_complaints = query.all()

    evaluated_count = len(open_complaints)
    overdue_count = 0
    escalations_prepared_count = 0

    for c in open_complaints:
        is_overdue = False

        # Compare deadlines (handle sqlite naive datetimes)
        if c.resolution_deadline:
            res_dl = c.resolution_deadline
            if res_dl.tzinfo is None:
                res_dl = res_dl.replace(tzinfo=datetime.timezone.utc)
            if res_dl < now:
                is_overdue = True

        if c.response_deadline and not is_overdue:
            resp_dl = c.response_deadline
            if resp_dl.tzinfo is None:
                resp_dl = resp_dl.replace(tzinfo=datetime.timezone.utc)
            if resp_dl < now and c.status == ComplaintStatusEnum.SUBMITTED.value:
                is_overdue = True

        if is_overdue:
            if not c.is_overdue:
                c.is_overdue = True
                overdue_count += 1

            # Fetch escalation rules for the organization, ordered by level
            rules = (
                db.query(EscalationRule)
                .filter(EscalationRule.organization_id == c.organization_id)
                .order_by(EscalationRule.level_order.asc())
                .all()
            )

            # Check existing escalation records for this complaint
            existing_records = (
                db.query(EscalationRecord)
                .filter(EscalationRecord.complaint_id == c.id)
                .all()
            )
            
            # If any escalation is currently PREPARED or SUBMITTED, do not escalate further
            has_pending = any(
                r.state in [
                    EscalationStateEnum.PREPARED.value,
                    EscalationStateEnum.READY_FOR_MANUAL_SUBMISSION.value,
                    EscalationStateEnum.SUBMITTED.value,
                ]
                for r in existing_records
            )
            if has_pending:
                continue

            existing_levels = {r.level for r in existing_records}

            # Find next rule level that has not been prepared yet
            for rule in rules:
                if rule.level_order not in existing_levels:
                    # Idempotent creation of PREPARED escalation record
                    rec = EscalationRecord(
                        complaint_id=c.id,
                        level=rule.level_order,
                        state=EscalationStateEnum.PREPARED.value,
                        prepared_at=now,
                        submitted_at=None,
                        receipt_reference=None,
                        notes=f"Auto-prepared escalation to {rule.target_role_or_channel} triggered by target overdue.",
                    )
                    db.add(rec)
                    escalations_prepared_count += 1

                    # Create in-app notification for reporter
                    notif = Notification(
                        user_id=c.reporter_id,
                        title=f"Target Overdue Notice: {c.public_reference_number}",
                        message=f"Target resolution time elapsed. Escalation Level {rule.level_order} prepared for {rule.target_role_or_channel}.",
                        link=f"/complaints/{c.id}",
                    )
                    db.add(notif)
                    break

    db.commit()
    return DeadlineJobResult(
        evaluated_complaints=evaluated_count,
        overdue_flagged=overdue_count,
        escalations_prepared=escalations_prepared_count,
    )
