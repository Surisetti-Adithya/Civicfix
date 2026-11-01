import datetime
from typing import Tuple
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session as DBSession

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.security import hash_password, verify_password, generate_session_token
from backend.app.core.errors import CivicFixException
from backend.app.core.deps import get_current_session_and_user
from backend.app.models import User, Session, Organization, Membership, RoleEnum
from backend.app.schemas.auth import (
    UserRegister,
    UserLogin,
    SessionResponse,
    UserResponse,
    OrganizationBrief,
    MembershipBrief,
    SwitchOrgRequest,
    UpdateProfileRequest,
)
from backend.app.schemas.common import MessageResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def build_session_response(db: DBSession, session_record: Session, user: User) -> SessionResponse:
    # Fetch all memberships
    memberships = (
        db.query(Membership)
        .filter(Membership.user_id == user.id)
        .all()
    )

    membership_briefs = []
    for m in memberships:
        org = db.query(Organization).filter(Organization.id == m.organization_id).first()
        if org:
            membership_briefs.append(
                MembershipBrief(
                    id=m.id,
                    organization_id=m.organization_id,
                    team_id=m.team_id,
                    team_name=m.team.name if m.team else None,
                    role=m.role,
                    organization=OrganizationBrief.model_validate(org),
                )
            )

    active_org_brief = None
    active_role = None
    if session_record.active_organization_id:
        active_org = db.query(Organization).filter(Organization.id == session_record.active_organization_id).first()
        if active_org:
            active_org_brief = OrganizationBrief.model_validate(active_org)
            m = next((mb for mb in memberships if mb.organization_id == active_org.id), None)
            if m:
                active_role = m.role

    return SessionResponse(
        token=session_record.token,
        user=UserResponse.model_validate(user),
        active_organization=active_org_brief,
        role=active_role,
        memberships=membership_briefs,
    )


@router.post("/register", response_model=SessionResponse, status_code=201)
def register(payload: UserRegister, db: DBSession = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if existing:
        raise CivicFixException(
            code="EMAIL_ALREADY_REGISTERED",
            message="An account with this email address already exists.",
            status_code=409,
        )

    user = User(
        email=payload.email.lower().strip(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        phone_number=payload.phone_number,
        permanent_location=payload.permanent_location.strip() if payload.permanent_location else None,
        is_active=True,
    )
    db.add(user)
    db.flush()

    active_org_id = None
    if payload.organization_id:
        org = db.query(Organization).filter(Organization.id == payload.organization_id).first()
        if not org:
            raise CivicFixException(
                code="ORGANIZATION_NOT_FOUND",
                message="Organization specified for registration does not exist.",
                status_code=404,
            )
        assigned_role = payload.role if payload.role in [r.value for r in RoleEnum] else RoleEnum.CITIZEN.value
        membership = Membership(
            user_id=user.id,
            organization_id=org.id,
            role=assigned_role,
        )
        db.add(membership)
        active_org_id = org.id

    now = datetime.datetime.now(datetime.timezone.utc)
    expires_at = now + datetime.timedelta(hours=settings.SESSION_EXPIRE_HOURS)
    session_record = Session(
        token=generate_session_token(),
        user_id=user.id,
        active_organization_id=active_org_id,
        expires_at=expires_at,
    )
    db.add(session_record)
    db.commit()
    db.refresh(user)
    db.refresh(session_record)

    return build_session_response(db, session_record, user)


@router.post("/login", response_model=SessionResponse)
def login(payload: UserLogin, db: DBSession = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise CivicFixException(
            code="INVALID_CREDENTIALS",
            message="Invalid email or password.",
            status_code=401,
        )

    if not user.is_active:
        raise CivicFixException(
            code="ACCOUNT_INACTIVE",
            message="User account is deactivated.",
            status_code=403,
        )

    # Determine active organization
    active_org_id = payload.organization_id
    user_memberships = db.query(Membership).filter(Membership.user_id == user.id).all()

    if active_org_id:
        has_membership = any(m.organization_id == active_org_id for m in user_memberships)
        is_platform_admin = any(m.role == RoleEnum.PLATFORM_ADMIN.value for m in user_memberships)
        if not has_membership and not is_platform_admin:
            raise CivicFixException(
                code="ORGANIZATION_ACCESS_DENIED",
                message="You do not have access to the specified organization.",
                status_code=403,
            )
    else:
        if user_memberships:
            active_org_id = user_memberships[0].organization_id

    now = datetime.datetime.now(datetime.timezone.utc)
    expires_at = now + datetime.timedelta(hours=settings.SESSION_EXPIRE_HOURS)
    session_record = Session(
        token=generate_session_token(),
        user_id=user.id,
        active_organization_id=active_org_id,
        expires_at=expires_at,
    )
    db.add(session_record)
    db.commit()
    db.refresh(session_record)

    return build_session_response(db, session_record, user)


@router.post("/logout", response_model=MessageResponse)
def logout(
    session_and_user: Tuple[Session, User] = Depends(get_current_session_and_user),
    db: DBSession = Depends(get_db),
):
    session_record, _ = session_and_user
    session_record.revoked_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    return MessageResponse(message="Successfully logged out.")


@router.get("/me", response_model=SessionResponse)
def get_me(
    session_and_user: Tuple[Session, User] = Depends(get_current_session_and_user),
    db: DBSession = Depends(get_db),
):
    session_record, user = session_and_user
    return build_session_response(db, session_record, user)


@router.patch("/profile", response_model=SessionResponse)
def update_profile(
    payload: UpdateProfileRequest,
    session_and_user: Tuple[Session, User] = Depends(get_current_session_and_user),
    db: DBSession = Depends(get_db),
):
    session_record, user = session_and_user
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.phone_number is not None:
        user.phone_number = payload.phone_number.strip()
    if payload.permanent_location is not None:
        user.permanent_location = payload.permanent_location.strip()
    if payload.home_latitude is not None:
        user.home_latitude = payload.home_latitude
    if payload.home_longitude is not None:
        user.home_longitude = payload.home_longitude
    db.commit()
    db.refresh(user)
    return build_session_response(db, session_record, user)


@router.post("/switch-organization", response_model=SessionResponse)
def switch_organization(
    payload: SwitchOrgRequest,
    session_and_user: Tuple[Session, User] = Depends(get_current_session_and_user),
    db: DBSession = Depends(get_db),
):
    session_record, user = session_and_user

    org = db.query(Organization).filter(Organization.id == payload.organization_id).first()
    if not org:
        raise CivicFixException(
            code="ORGANIZATION_NOT_FOUND",
            message="The specified organization does not exist.",
            status_code=404,
        )

    # Verify membership or platform admin
    membership = (
        db.query(Membership)
        .filter(
            Membership.user_id == user.id,
            Membership.organization_id == payload.organization_id,
        )
        .first()
    )
    is_platform_admin = (
        db.query(Membership)
        .filter(
            Membership.user_id == user.id,
            Membership.role == RoleEnum.PLATFORM_ADMIN.value,
        )
        .first()
    )

    if not membership and not is_platform_admin:
        raise CivicFixException(
            code="ORGANIZATION_ACCESS_DENIED",
            message="You are not a member of this organization.",
            status_code=403,
        )

    session_record.active_organization_id = payload.organization_id
    db.commit()
    db.refresh(session_record)

    return build_session_response(db, session_record, user)
