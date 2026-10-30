import datetime
import re
from typing import Optional, List
from sqlalchemy.orm import Session as DBSession

from backend.app.models import (
    Complaint,
    DisasterEvent,
    PriorityHistory,
    DeadlineRule,
    DeadlineChange,
    Notification,
    DisasterStateEnum,
    ComplaintStatusEnum,
)
from backend.app.schemas.disaster import DisasterReassessmentResult

PRIORITY_RANKS = {
    "LOW": 1,
    "MEDIUM": 2,
    "HIGH": 3,
    "CRITICAL": 4,
}
RANK_TO_PRIORITY = {v: k for k, v in PRIORITY_RANKS.items()}


def compute_target_priority(
    complaint: Complaint,
    active_events: List[DisasterEvent],
) -> tuple[str, str]:
    base_rank = PRIORITY_RANKS.get(complaint.base_severity.upper(), 2)
    max_rank = base_rank
    reasons = []

    # Old overdue complaint rule (8.8): must not lower priority
    current_rank = PRIORITY_RANKS.get(complaint.current_priority.upper(), 2)
    if complaint.is_overdue and current_rank > max_rank:
        max_rank = current_rank
        reasons.append("Maintained elevated priority due to existing overdue status.")

    desc_lower = (complaint.description_original + " " + complaint.location_text).lower()

    for event in active_events:
        event_reasons = []
        event_rank = base_rank
        event_type = event.type.upper()

        if event_type == "FLOOD":
            # High risk keywords
            if re.search(r"\b(electric|wire|electrocution|short circuit|shock)\b", desc_lower) and re.search(r"\b(water|flood|rain|drain|leak)\b", desc_lower):
                event_rank = max(event_rank, 4)
                event_reasons.append("Exposed electrical hazard in wet conditions during flood.")
            elif re.search(r"\b(drain|sewer|water|flood|overflow|inundat|overflowing)\b", desc_lower):
                event_rank = max(event_rank, 3)
                event_reasons.append("Drainage and water accumulation during active flood event.")

        elif event_type == "CYCLONE":
            if re.search(r"\b(wire|pole|roof|tree|fall|falling|collapse)\b", desc_lower):
                event_rank = max(event_rank, 3)
                event_reasons.append("Structural and wind hazard during cyclone event.")

        elif event_type == "FIRE":
            if re.search(r"\b(smoke|spark|flame|gas|cylinder)\b", desc_lower):
                event_rank = max(event_rank, 4)
                event_reasons.append("Active ignition and combustion risk.")

        # Overlapping events (Rule 8.11): take highest result
        if event_rank > max_rank:
            max_rank = event_rank
            prefix = "[SIMULATED] " if event.is_simulated else ""
            reasons.append(f"{prefix}Elevated by {event.name}: {'; '.join(event_reasons)}")

    if not reasons:
        reasons.append("Evaluated under standard severity parameters.")

    final_priority = RANK_TO_PRIORITY.get(max_rank, "MEDIUM")
    return final_priority, " | ".join(reasons)


def reassess_complaints_for_event(
    db: DBSession,
    event: DisasterEvent,
) -> DisasterReassessmentResult:
    now = datetime.datetime.now(datetime.timezone.utc)

    # Fetch all active events in scope for overlapping calculation
    active_events = (
        db.query(DisasterEvent)
        .filter(
            DisasterEvent.organization_id == event.organization_id,
            DisasterEvent.state == DisasterStateEnum.ACTIVE.value,
        )
        .all()
    )

    # Open complaints in scope (Closed complaints not reopened automatically - Rule 8.9)
    open_complaints = (
        db.query(Complaint)
        .filter(
            Complaint.organization_id == event.organization_id,
            Complaint.status.notin_([
                ComplaintStatusEnum.RESOLVED.value,
                ComplaintStatusEnum.CLOSED.value,
                ComplaintStatusEnum.REJECTED.value,
            ]),
        )
        .all()
    )

    # Check for disaster deadline rules
    disaster_rule = (
        db.query(DeadlineRule)
        .filter(
            DeadlineRule.organization_id == event.organization_id,
            DeadlineRule.mode == "DISASTER",
        )
        .first()
    )

    elevated_count = 0
    history_written_count = 0

    for c in open_complaints:
        target_priority, reason = compute_target_priority(c, active_events)

        # Unique idempotency key (Rule 8.10)
        idempotency_key = f"evt_{event.id}_comp_{c.id}_st_{event.state}_tgt_{target_priority}"
        existing_history = (
            db.query(PriorityHistory)
            .filter(PriorityHistory.idempotency_key == idempotency_key)
            .first()
        )

        if not existing_history:
            prev_p = c.current_priority
            if target_priority != prev_p:
                c.current_priority = target_priority
                c.updated_at = now
                elevated_count += 1

                history = PriorityHistory(
                    complaint_id=c.id,
                    disaster_event_id=event.id,
                    previous_priority=prev_p,
                    new_priority=target_priority,
                    reason=reason,
                    method="AUTOMATED_DISASTER_REASSESSMENT",
                    idempotency_key=idempotency_key,
                )
                db.add(history)
                history_written_count += 1

                # In-app notification for reporter
                notif = Notification(
                    user_id=c.reporter_id,
                    title=f"Priority Updated: {c.public_reference_number}",
                    message=f"Priority revised from {prev_p} to {target_priority} due to {event.name}.",
                    link=f"/complaints/{c.id}",
                )
                db.add(notif)

        # Update disaster deadline if active and not already updated
        if event.state == DisasterStateEnum.ACTIVE.value and disaster_rule and c.resolution_deadline:
            disaster_res_target = c.created_at + datetime.timedelta(hours=disaster_rule.resolution_hours)
            if disaster_res_target < c.resolution_deadline:
                change = DeadlineChange(
                    complaint_id=c.id,
                    target_type="RESOLUTION",
                    original_target=c.resolution_deadline,
                    new_target=disaster_res_target,
                    effective_time=now,
                    reason=f"Emergency acceleration under {event.name}",
                )
                db.add(change)
                c.resolution_deadline = disaster_res_target

    db.commit()

    return DisasterReassessmentResult(
        event_id=event.id,
        event_name=event.name,
        is_simulated=event.is_simulated,
        reassessed_complaints=len(open_complaints),
        priorities_elevated=elevated_count,
        history_records_written=history_written_count,
    )
