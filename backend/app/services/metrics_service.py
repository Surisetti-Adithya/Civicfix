import datetime
import statistics
from typing import Dict, Any, List
from sqlalchemy.orm import Session as DBSession

from backend.app.models import (
    Complaint,
    ComplaintHistory,
    EscalationRecord,
    ComplaintStatusEnum,
)


def compute_organization_metrics(db: DBSession, organization_id: int, days: int = 30) -> Dict[str, Any]:
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
    time_period = f"Last {days} days"

    # All complaints in window
    complaints = (
        db.query(Complaint)
        .filter(
            Complaint.organization_id == organization_id,
            Complaint.created_at >= cutoff,
        )
        .all()
    )

    total_created = len(complaints)

    # 1. Open complaints
    open_complaints = [
        c for c in complaints
        if c.status not in [ComplaintStatusEnum.RESOLVED.value, ComplaintStatusEnum.CLOSED.value, ComplaintStatusEnum.REJECTED.value]
    ]
    open_count = len(open_complaints)

    # 2. Overdue complaints
    overdue_count = sum(1 for c in open_complaints if c.is_overdue)

    # 3. Acknowledgment performance
    # Complaints that transitioned out of SUBMITTED
    acknowledged_count = sum(
        1 for c in complaints if c.status != ComplaintStatusEnum.SUBMITTED.value
    )
    ack_perf_pct = round((acknowledged_count / total_created * 100), 1) if total_created > 0 else 100.0

    # 4. Median resolution time (hours)
    resolution_times_hours = []
    compliant_resolutions = 0
    resolved_complaints = [
        c for c in complaints if c.status in [ComplaintStatusEnum.RESOLVED.value, ComplaintStatusEnum.CLOSED.value]
    ]

    for c in resolved_complaints:
        # Find time of resolution
        res_history = (
            db.query(ComplaintHistory)
            .filter(
                ComplaintHistory.complaint_id == c.id,
                ComplaintHistory.field == "status",
                ComplaintHistory.new_value == ComplaintStatusEnum.RESOLVED.value,
            )
            .order_by(ComplaintHistory.created_at.asc())
            .first()
        )
        res_time = res_history.created_at if res_history else c.updated_at
        c_created = c.created_at
        if c_created.tzinfo is None:
            c_created = c_created.replace(tzinfo=datetime.timezone.utc)
        if res_time.tzinfo is None:
            res_time = res_time.replace(tzinfo=datetime.timezone.utc)

        duration_hours = (res_time - c_created).total_seconds() / 3600.0
        resolution_times_hours.append(duration_hours)

        if c.resolution_deadline:
            dl = c.resolution_deadline
            if dl.tzinfo is None:
                dl = dl.replace(tzinfo=datetime.timezone.utc)
            if res_time <= dl:
                compliant_resolutions += 1

    median_res_hours = round(statistics.median(resolution_times_hours), 1) if resolution_times_hours else 0.0
    target_compliance_pct = round((compliant_resolutions / len(resolved_complaints) * 100), 1) if resolved_complaints else 100.0

    # 5. Escalated complaints
    escalated_comp_ids = {
        r.complaint_id for r in
        db.query(EscalationRecord.complaint_id)
        .join(Complaint, EscalationRecord.complaint_id == Complaint.id)
        .filter(Complaint.organization_id == organization_id, EscalationRecord.prepared_at >= cutoff)
        .all()
    }
    escalated_count = len(escalated_comp_ids)

    # 6. Reopened complaints
    reopened_comp_ids = {
        h.complaint_id for h in
        db.query(ComplaintHistory.complaint_id)
        .join(Complaint, ComplaintHistory.complaint_id == Complaint.id)
        .filter(
            Complaint.organization_id == organization_id,
            ComplaintHistory.field == "status",
            ComplaintHistory.new_value == ComplaintStatusEnum.REOPENED.value,
            ComplaintHistory.created_at >= cutoff,
        )
        .all()
    }
    reopened_count = len(reopened_comp_ids)

    return {
        "time_period": time_period,
        "metrics": {
            "open_complaints": {
                "value": open_count,
                "definition": "Active complaints currently under review, assigned, or in progress.",
                "unit": "complaints",
            },
            "overdue_complaints": {
                "value": overdue_count,
                "definition": "Complaints that have exceeded their target response or resolution timeframe.",
                "unit": "complaints",
            },
            "acknowledgment_performance": {
                "value": ack_perf_pct,
                "definition": "Percentage of submitted complaints that have been reviewed or assigned.",
                "unit": "%",
            },
            "median_resolution_time": {
                "value": median_res_hours,
                "definition": "Median elapsed hours from submission until status was marked resolved.",
                "unit": "hours",
            },
            "escalated_complaints": {
                "value": escalated_count,
                "definition": "Issues where an escalation action was generated due to target limits.",
                "unit": "complaints",
            },
            "reopened_complaints": {
                "value": reopened_count,
                "definition": "Issues marked resolved that reporters indicated were still unresolved.",
                "unit": "complaints",
            },
            "target_compliance": {
                "value": target_compliance_pct,
                "definition": "Percentage of resolved issues completed within the configured resolution target.",
                "unit": "%",
            },
        },
        "breakdown_by_status": {
            st.value: sum(1 for c in complaints if c.status == st.value)
            for st in ComplaintStatusEnum
        },
        "total_recorded_period": total_created,
    }
