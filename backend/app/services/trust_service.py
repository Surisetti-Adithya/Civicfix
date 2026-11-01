import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session as DBSession

from backend.app.core.errors import CivicFixException
from backend.app.models import (
    User,
    TrustScoreHistory,
    CitizenAppeal,
    AuditLog,
    Complaint,
    CommunityVerification,
    RoleEnum,
)
from backend.app.schemas.trust import TrustRulesConfig

# Transparent Default Rules
DEFAULT_TRUST_RULES = {
    "report_quality_bonus": 15,
    "duplicate_extension_bonus": 10,
    "verification_outcome_bonus": 5,
    "confirmed_abuse_penalty": 30,
    "unresolved_unverified_penalty": 0,  # Explicitly ZERO penalty
}


def get_trust_rules(organization_settings: Optional[dict] = None) -> Dict[str, int]:
    rules = dict(DEFAULT_TRUST_RULES)
    if organization_settings and "trust_rules" in organization_settings:
        rules.update(organization_settings["trust_rules"])
    # Guarantee 0 penalty for unresolved or unverified complaints
    rules["unresolved_unverified_penalty"] = 0
    return rules


def record_trust_change(
    db: DBSession,
    user_id: int,
    organization_id: Optional[int],
    change_amount: int,
    reason: str,
    rule_name: str,
    actor_id: Optional[int] = None,
) -> TrustScoreHistory:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise CivicFixException(code="USER_NOT_FOUND", message="User not found", status_code=404)

    previous_score = user.trust_level or 0
    new_score = max(0, previous_score + change_amount)
    user.trust_level = new_score

    record = TrustScoreHistory(
        user_id=user_id,
        organization_id=organization_id,
        previous_score=previous_score,
        new_score=new_score,
        change_amount=change_amount,
        reason=reason,
        rule_name=rule_name,
        actor_id=actor_id,
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(record)
    return record


def detect_suspicious_patterns(
    db: DBSession,
    citizen_id: int,
    organization_id: int,
) -> Dict[str, Any]:
    """
    Evaluates citizen submission and verification metrics to detect potential abuse patterns.
    """
    complaints = (
        db.query(Complaint)
        .filter(Complaint.organization_id == organization_id, Complaint.reporter_id == citizen_id)
        .order_by(Complaint.created_at.desc())
        .all()
    )

    verifications = (
        db.query(CommunityVerification)
        .join(Complaint, CommunityVerification.complaint_id == Complaint.id)
        .filter(Complaint.organization_id == organization_id, CommunityVerification.user_id == citizen_id)
        .all()
    )

    total_reports = len(complaints)
    total_verifications = len(verifications)
    rejected_reports = sum(1 for c in complaints if c.status == "REJECTED")

    suspicious_flags = []

    # Flag 1: High rejection rate (more than 3 reports and >= 50% rejected)
    if total_reports >= 3 and (rejected_reports / total_reports) >= 0.5:
        suspicious_flags.append(f"High report rejection rate ({rejected_reports}/{total_reports} rejected)")

    # Flag 2: Rapid burst submissions (3+ reports created within 10 minutes)
    if total_reports >= 3:
        for i in range(len(complaints) - 2):
            t1 = complaints[i].created_at
            t3 = complaints[i + 2].created_at
            if t1 and t3:
                diff = abs((t1 - t3).total_seconds())
                if diff < 600:
                    suspicious_flags.append("Rapid burst submission pattern detected (< 10 minutes between multiple reports)")
                    break

    # Flag 3: Repetitive identical descriptions
    descriptions = [c.description_original.strip().lower() for c in complaints]
    if len(descriptions) != len(set(descriptions)) and len(descriptions) >= 2:
        suspicious_flags.append("Identical duplicate complaint descriptions submitted repeatedly")

    return {
        "total_reports": total_reports,
        "rejected_reports": rejected_reports,
        "total_verifications": total_verifications,
        "suspicious_flags": suspicious_flags,
        "complaints": complaints,
        "verifications": verifications,
    }
