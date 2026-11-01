import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, require_role, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import (
    User,
    Membership,
    Complaint,
    CommunityVerification,
    AuditLog,
    TrustScoreHistory,
    CitizenAppeal,
    RoleEnum,
    Organization,
)
from backend.app.schemas.trust import (
    CitizenSummary,
    CitizenDetail,
    ComplaintBriefTrust,
    VerificationBriefTrust,
    TrustScoreHistoryItem,
    CitizenAppealItem,
    UpdateAccountStatusRequest,
    AdjustTrustScoreRequest,
    CreateAppealRequest,
    ReviewAppealRequest,
    GemmaPatternAnalysisResponse,
    TrustRulesConfig,
)
from backend.app.schemas.common import MessageResponse
from backend.app.services.trust_service import (
    record_trust_change,
    detect_suspicious_patterns,
    get_trust_rules,
)
from backend.app.services.ai.service import analyze_suspicious_patterns_service

router = APIRouter(prefix="/trust", tags=["trust"])


@router.get("/citizens", response_model=List[CitizenSummary])
def list_citizens(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.PLATFORM_ADMIN])),
):
    # Find all users with CITIZEN membership in this org
    memberships = (
        db.query(Membership)
        .filter(Membership.organization_id == ctx.organization_id, Membership.role == RoleEnum.CITIZEN.value)
        .all()
    )
    user_ids = [m.user_id for m in memberships]

    query = db.query(User).filter(User.id.in_(user_ids))
    if status:
        query = query.filter(User.account_status == status.upper())
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (User.full_name.ilike(s)) | (User.email.ilike(s)) | (User.permanent_location.ilike(s))
        )

    users = query.order_by(User.full_name).all()

    result = []
    for u in users:
        pattern_data = detect_suspicious_patterns(db, u.id, ctx.organization_id)
        pending_appeals = (
            db.query(CitizenAppeal)
            .filter(CitizenAppeal.user_id == u.id, CitizenAppeal.status == "PENDING")
            .count()
        )
        result.append(
            CitizenSummary(
                user_id=u.id,
                full_name=u.full_name,
                email=u.email,
                phone_number=u.phone_number,
                permanent_location=u.permanent_location,
                trust_level=u.trust_level or 0,
                badge_title=u.badge_title,
                badge_tier=u.badge_tier,
                account_status=u.account_status or "ACTIVE",
                status_reason=u.status_reason,
                status_updated_at=u.status_updated_at,
                report_count=pattern_data["total_reports"],
                verification_count=pattern_data["total_verifications"],
                pending_appeals_count=pending_appeals,
                suspicious_flags=pattern_data["suspicious_flags"],
            )
        )
    return result


@router.get("/citizens/{user_id}", response_model=CitizenDetail)
def get_citizen_detail(
    user_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.PLATFORM_ADMIN])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise CivicFixException(code="USER_NOT_FOUND", message="Citizen not found.", status_code=404)

    # Verify membership in org
    membership = (
        db.query(Membership)
        .filter(Membership.user_id == user_id, Membership.organization_id == ctx.organization_id)
        .first()
    )
    if not membership and ctx.role != RoleEnum.PLATFORM_ADMIN.value:
        raise CivicFixException(code="ACCESS_DENIED", message="User is not part of this organization.", status_code=403)

    pattern_data = detect_suspicious_patterns(db, user_id, ctx.organization_id)

    # Complaints
    reports = []
    for c in pattern_data["complaints"]:
        reports.append(
            ComplaintBriefTrust(
                id=c.id,
                public_reference_number=c.public_reference_number,
                description=c.description_original,
                category_name=c.category.name if c.category else "Uncategorized",
                location_text=c.location_text,
                status=c.status,
                current_priority=c.current_priority,
                is_overdue=c.is_overdue,
                created_at=c.created_at,
            )
        )

    # Verifications
    verifs = []
    for v in pattern_data["verifications"]:
        verifs.append(
            VerificationBriefTrust(
                id=v.id,
                complaint_id=v.complaint_id,
                complaint_reference=v.complaint.public_reference_number if v.complaint else f"#{v.complaint_id}",
                answer=v.answer,
                notes=v.notes,
                created_at=v.created_at,
            )
        )

    # Trust History
    history_records = (
        db.query(TrustScoreHistory)
        .filter(TrustScoreHistory.user_id == user_id)
        .order_by(TrustScoreHistory.created_at.desc())
        .all()
    )
    hist_items = [
        TrustScoreHistoryItem(
            id=h.id,
            user_id=h.user_id,
            organization_id=h.organization_id,
            previous_score=h.previous_score,
            new_score=h.new_score,
            change_amount=h.change_amount,
            reason=h.reason,
            rule_name=h.rule_name,
            actor_id=h.actor_id,
            actor_name=h.actor.full_name if h.actor else "System",
            created_at=h.created_at,
        )
        for h in history_records
    ]

    # Appeals
    appeals_records = (
        db.query(CitizenAppeal)
        .filter(CitizenAppeal.user_id == user_id)
        .order_by(CitizenAppeal.created_at.desc())
        .all()
    )
    appeal_items = [
        CitizenAppealItem(
            id=a.id,
            user_id=a.user_id,
            organization_id=a.organization_id,
            appeal_type=a.appeal_type,
            reason=a.reason,
            status=a.status,
            admin_notes=a.admin_notes,
            reviewed_by_id=a.reviewed_by_id,
            reviewed_by_name=a.reviewed_by.full_name if a.reviewed_by else None,
            created_at=a.created_at,
            reviewed_at=a.reviewed_at,
        )
        for a in appeals_records
    ]

    admin_updater = None
    if user.status_updated_by_id:
        admin_u = db.query(User).filter(User.id == user.status_updated_by_id).first()
        if admin_u:
            admin_updater = admin_u.full_name

    return CitizenDetail(
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        phone_number=user.phone_number,
        permanent_location=user.permanent_location,
        trust_level=user.trust_level or 0,
        badge_title=user.badge_title,
        badge_tier=user.badge_tier,
        account_status=user.account_status or "ACTIVE",
        status_reason=user.status_reason,
        status_updated_at=user.status_updated_at,
        status_updated_by_name=admin_updater,
        reports=reports,
        verifications=verifs,
        trust_history=hist_items,
        appeals=appeal_items,
        suspicious_flags=pattern_data["suspicious_flags"],
    )


@router.post("/citizens/{user_id}/status", response_model=MessageResponse)
def update_account_status(
    user_id: int,
    payload: UpdateAccountStatusRequest,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.PLATFORM_ADMIN])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise CivicFixException(code="USER_NOT_FOUND", message="Citizen not found.", status_code=404)

    new_status = payload.account_status.upper().strip()
    if new_status not in ["ACTIVE", "RESTRICTED", "BANNED"]:
        raise CivicFixException(code="INVALID_STATUS", message="Status must be ACTIVE, RESTRICTED, or BANNED.", status_code=400)

    old_status = user.account_status or "ACTIVE"
    now = datetime.datetime.now(datetime.timezone.utc)

    user.account_status = new_status
    user.status_reason = payload.reason.strip()
    user.status_updated_at = now
    user.status_updated_by_id = ctx.user.id

    if new_status == "BANNED":
        user.is_active = False
    elif new_status == "ACTIVE":
        user.is_active = True

    # Mandatory Audit Log Record
    audit = AuditLog(
        organization_id=ctx.organization_id,
        actor_id=ctx.user.id,
        action=f"ACCOUNT_{new_status}",
        details={
            "target_user_id": user.id,
            "target_user_email": user.email,
            "old_status": old_status,
            "new_status": new_status,
            "mandatory_reason": payload.reason.strip(),
            "admin_id": ctx.user.id,
            "admin_name": ctx.user.full_name,
        },
    )
    db.add(audit)

    # Record score change if confirmed abuse resulted in restriction or ban
    if new_status in ["RESTRICTED", "BANNED"] and old_status == "ACTIVE":
        rules = get_trust_rules()
        penalty = rules.get("confirmed_abuse_penalty", 30)
        record_trust_change(
            db=db,
            user_id=user.id,
            organization_id=ctx.organization_id,
            change_amount=-penalty,
            reason=f"Account {new_status.lower()}: {payload.reason.strip()}",
            rule_name="CONFIRMED_ABUSE",
            actor_id=ctx.user.id,
        )

    db.commit()
    return MessageResponse(message=f"Citizen account status successfully updated to {new_status}.")


@router.post("/citizens/{user_id}/adjust-score", response_model=MessageResponse)
def adjust_trust_score(
    user_id: int,
    payload: AdjustTrustScoreRequest,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.PLATFORM_ADMIN])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise CivicFixException(code="USER_NOT_FOUND", message="Citizen not found.", status_code=404)

    record_trust_change(
        db=db,
        user_id=user.id,
        organization_id=ctx.organization_id,
        change_amount=payload.change_amount,
        reason=payload.reason.strip(),
        rule_name=payload.rule_name,
        actor_id=ctx.user.id,
    )

    audit = AuditLog(
        organization_id=ctx.organization_id,
        actor_id=ctx.user.id,
        action="TRUST_SCORE_ADJUSTED",
        details={
            "target_user_id": user.id,
            "change_amount": payload.change_amount,
            "new_score": user.trust_level,
            "reason": payload.reason.strip(),
            "rule_name": payload.rule_name,
        },
    )
    db.add(audit)
    db.commit()

    return MessageResponse(message=f"Trust score adjusted by {payload.change_amount}. New score: {user.trust_level}.")


@router.post("/citizens/{user_id}/gemma-analyze", response_model=GemmaPatternAnalysisResponse)
async def analyze_citizen_with_gemma(
    user_id: int,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.PLATFORM_ADMIN])),
):
    analysis = await analyze_suspicious_patterns_service(
        citizen_id=user_id,
        organization_id=ctx.organization_id,
        db=db,
    )
    return analysis


# Citizen Appeals
@router.post("/appeals", response_model=CitizenAppealItem, status_code=201)
def submit_appeal(
    payload: CreateAppealRequest,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    if ctx.user.account_status == "ACTIVE":
        raise CivicFixException(
            code="NOT_RESTRICTED",
            message="Your account is active; appeals are for restricted or banned accounts.",
            status_code=400,
        )

    # Check for pending appeal
    existing = (
        db.query(CitizenAppeal)
        .filter(CitizenAppeal.user_id == ctx.user.id, CitizenAppeal.status == "PENDING")
        .first()
    )
    if existing:
        raise CivicFixException(
            code="PENDING_APPEAL_EXISTS",
            message="You already have a pending appeal under review.",
            status_code=409,
        )

    appeal = CitizenAppeal(
        user_id=ctx.user.id,
        organization_id=ctx.organization_id,
        appeal_type=ctx.user.account_status or "RESTRICTION",
        reason=payload.reason.strip(),
        status="PENDING",
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(appeal)
    db.commit()
    db.refresh(appeal)

    return CitizenAppealItem(
        id=appeal.id,
        user_id=appeal.user_id,
        organization_id=appeal.organization_id,
        appeal_type=appeal.appeal_type,
        reason=appeal.reason,
        status=appeal.status,
        created_at=appeal.created_at,
    )


@router.get("/appeals", response_model=List[CitizenAppealItem])
def list_appeals(
    status: Optional[str] = Query(None),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.PLATFORM_ADMIN])),
):
    query = (
        db.query(CitizenAppeal)
        .filter(CitizenAppeal.organization_id == ctx.organization_id)
    )
    if status:
        query = query.filter(CitizenAppeal.status == status.upper())
    query = query.order_by(CitizenAppeal.created_at.desc())

    items = query.all()
    result = []
    for a in items:
        result.append(
            CitizenAppealItem(
                id=a.id,
                user_id=a.user_id,
                organization_id=a.organization_id,
                appeal_type=a.appeal_type,
                reason=a.reason,
                status=a.status,
                admin_notes=a.admin_notes,
                reviewed_by_id=a.reviewed_by_id,
                reviewed_by_name=a.reviewed_by.full_name if a.reviewed_by else None,
                created_at=a.created_at,
                reviewed_at=a.reviewed_at,
            )
        )
    return result


@router.get("/my-appeals", response_model=List[CitizenAppealItem])
def list_my_appeals(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    appeals = (
        db.query(CitizenAppeal)
        .filter(CitizenAppeal.user_id == ctx.user.id)
        .order_by(CitizenAppeal.created_at.desc())
        .all()
    )
    return [
        CitizenAppealItem(
            id=a.id,
            user_id=a.user_id,
            organization_id=a.organization_id,
            appeal_type=a.appeal_type,
            reason=a.reason,
            status=a.status,
            admin_notes=a.admin_notes,
            reviewed_by_id=a.reviewed_by_id,
            reviewed_by_name=a.reviewed_by.full_name if a.reviewed_by else None,
            created_at=a.created_at,
            reviewed_at=a.reviewed_at,
        )
        for a in appeals
    ]


@router.post("/appeals/{appeal_id}/review", response_model=MessageResponse)
def review_appeal(
    appeal_id: int,
    payload: ReviewAppealRequest,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.PLATFORM_ADMIN])),
):
    appeal = (
        db.query(CitizenAppeal)
        .filter(CitizenAppeal.id == appeal_id, CitizenAppeal.organization_id == ctx.organization_id)
        .first()
    )
    if not appeal:
        raise CivicFixException(code="APPEAL_NOT_FOUND", message="Appeal not found.", status_code=404)

    review_status = payload.status.upper().strip()
    if review_status not in ["APPROVED", "REJECTED"]:
        raise CivicFixException(code="INVALID_STATUS", message="Status must be APPROVED or REJECTED.", status_code=400)

    now = datetime.datetime.now(datetime.timezone.utc)
    appeal.status = review_status
    appeal.admin_notes = payload.admin_notes.strip()
    appeal.reviewed_by_id = ctx.user.id
    appeal.reviewed_at = now

    target_user = db.query(User).filter(User.id == appeal.user_id).first()
    if target_user and review_status == "APPROVED":
        target_user.account_status = "ACTIVE"
        target_user.status_reason = f"Restored via Appeal #{appeal.id}: {payload.admin_notes.strip()}"
        target_user.status_updated_at = now
        target_user.status_updated_by_id = ctx.user.id
        target_user.is_active = True

        # Restore some trust points upon approved appeal
        record_trust_change(
            db=db,
            user_id=target_user.id,
            organization_id=ctx.organization_id,
            change_amount=20,
            reason=f"Account reinstated after approved appeal #{appeal.id}",
            rule_name="APPEAL_APPROVED",
            actor_id=ctx.user.id,
        )

    audit = AuditLog(
        organization_id=ctx.organization_id,
        actor_id=ctx.user.id,
        action=f"APPEAL_{review_status}",
        details={
            "appeal_id": appeal.id,
            "target_user_id": appeal.user_id,
            "decision": review_status,
            "admin_notes": payload.admin_notes.strip(),
        },
    )
    db.add(audit)
    db.commit()

    return MessageResponse(message=f"Appeal #{appeal.id} has been {review_status.lower()}.")


# Configurable Trust Rules
@router.get("/rules", response_model=TrustRulesConfig)
def get_rules(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.PLATFORM_ADMIN])),
):
    org = db.query(Organization).filter(Organization.id == ctx.organization_id).first()
    rules = get_trust_rules(org.settings if org else None)
    return TrustRulesConfig(**rules)


@router.post("/rules", response_model=TrustRulesConfig)
def update_rules(
    payload: TrustRulesConfig,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.PLATFORM_ADMIN])),
):
    org = db.query(Organization).filter(Organization.id == ctx.organization_id).first()
    if not org:
        raise CivicFixException(code="ORGANIZATION_NOT_FOUND", message="Organization not found", status_code=404)

    # Enforce transparent rule: unresolved / unverified NEVER incurs a penalty
    clean_dict = payload.model_dump()
    clean_dict["unresolved_unverified_penalty"] = 0

    settings = dict(org.settings or {})
    settings["trust_rules"] = clean_dict
    org.settings = settings

    audit = AuditLog(
        organization_id=ctx.organization_id,
        actor_id=ctx.user.id,
        action="TRUST_RULES_UPDATED",
        details=clean_dict,
    )
    db.add(audit)
    db.commit()
    db.refresh(org)

    return TrustRulesConfig(**clean_dict)
