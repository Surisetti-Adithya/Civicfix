import datetime
from typing import Optional, List, Tuple
from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.errors import CivicFixException
from backend.app.models import (
    User,
    Session,
    Membership,
    Organization,
    AuditLog,
    RoleEnum,
)


def get_token_from_request(
    request: Request,
    authorization: Optional[str] = Header(None),
) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:].strip()
    # Also support cookie if present
    cookie_token = request.cookies.get("civicfix_token")
    if cookie_token:
        return cookie_token
    return None


def get_current_session_and_user(
    request: Request,
    db: DBSession = Depends(get_db),
    authorization: Optional[str] = Header(None),
) -> Tuple[Session, User]:
    token = get_token_from_request(request, authorization)
    if not token:
        raise CivicFixException(
            code="UNAUTHORIZED",
            message="Authentication credentials were not provided.",
            status_code=401,
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    session_record = (
        db.query(Session)
        .filter(Session.token == token, Session.revoked_at.is_(None))
        .first()
    )

    if not session_record:
        raise CivicFixException(
            code="INVALID_SESSION",
            message="Session is invalid or has expired.",
            status_code=401,
        )

    # Check expiration
    # Handle SQLite naive vs UTC datetime comparison
    expires_at = session_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)
    if expires_at < now:
        session_record.revoked_at = now
        db.commit()
        raise CivicFixException(
            code="SESSION_EXPIRED",
            message="Session has expired. Please sign in again.",
            status_code=401,
        )

    user = db.query(User).filter(User.id == session_record.user_id, User.is_active.is_(True)).first()
    if not user:
        raise CivicFixException(
            code="USER_NOT_FOUND",
            message="User account is inactive or not found.",
            status_code=401,
        )

    return session_record, user


def get_current_user(
    session_and_user: Tuple[Session, User] = Depends(get_current_session_and_user),
) -> User:
    return session_and_user[1]


class ActiveOrgContext:
    def __init__(
        self,
        user: User,
        session: Session,
        organization: Organization,
        membership: Membership,
    ):
        self.user = user
        self.session = session
        self.organization = organization
        self.membership = membership
        self.role = membership.role
        self.organization_id = organization.id


def get_active_org_context(
    request: Request,
    x_organization_id: Optional[int] = Header(None, alias="X-Organization-Id"),
    session_and_user: Tuple[Session, User] = Depends(get_current_session_and_user),
    db: DBSession = Depends(get_db),
) -> ActiveOrgContext:
    session_record, user = session_and_user

    # Determine organization ID: header takes precedence, then session's active_organization_id
    target_org_id = x_organization_id or session_record.active_organization_id

    # If user has memberships, check if user is PLATFORM_ADMIN
    platform_admin_membership = (
        db.query(Membership)
        .filter(
            Membership.user_id == user.id,
            Membership.role == RoleEnum.PLATFORM_ADMIN.value,
        )
        .first()
    )

    if not target_org_id:
        # If user has only one membership, use it
        first_membership = (
            db.query(Membership).filter(Membership.user_id == user.id).first()
        )
        if first_membership:
            target_org_id = first_membership.organization_id
        else:
            raise CivicFixException(
                code="NO_ACTIVE_ORGANIZATION",
                message="No active organization selected.",
                status_code=400,
            )

    organization = db.query(Organization).filter(Organization.id == target_org_id).first()
    if not organization:
        raise CivicFixException(
            code="ORGANIZATION_NOT_FOUND",
            message="The specified organization does not exist.",
            status_code=404,
        )

    # Check membership
    membership = (
        db.query(Membership)
        .filter(
            Membership.user_id == user.id,
            Membership.organization_id == target_org_id,
        )
        .first()
    )

    if not membership:
        if platform_admin_membership:
            # Platform admin can access, create a virtual membership record or use platform admin role
            membership = Membership(
                user_id=user.id,
                organization_id=target_org_id,
                role=RoleEnum.PLATFORM_ADMIN.value,
            )
            # Log platform admin action
            audit = AuditLog(
                organization_id=target_org_id,
                actor_id=user.id,
                action="PLATFORM_ADMIN_CROSS_ORG_ACCESS",
                details={"target_org_id": target_org_id, "path": request.url.path},
            )
            db.add(audit)
            db.commit()
        else:
            raise CivicFixException(
                code="ORGANIZATION_ACCESS_DENIED",
                message="You are not a member of this organization.",
                status_code=403,
            )

    # Update session active organization if changed
    if session_record.active_organization_id != target_org_id:
        session_record.active_organization_id = target_org_id
        db.commit()

    return ActiveOrgContext(
        user=user,
        session=session_record,
        organization=organization,
        membership=membership,
    )


def require_role(allowed_roles: List[RoleEnum]):
    def role_checker(
        ctx: ActiveOrgContext = Depends(get_active_org_context),
    ) -> ActiveOrgContext:
        role_values = [r.value for r in allowed_roles]
        if ctx.role not in role_values and ctx.role != RoleEnum.PLATFORM_ADMIN.value:
            raise CivicFixException(
                code="PERMISSION_DENIED",
                message=f"Action requires one of the roles: {', '.join(role_values)}.",
                status_code=403,
            )
        return ctx

    return role_checker
