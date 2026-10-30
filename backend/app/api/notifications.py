import math
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import Notification, RoleEnum
from backend.app.schemas.common import PaginatedResponse, MessageResponse
from pydantic import BaseModel, ConfigDict
import datetime


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    message: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=PaginatedResponse[NotificationResponse])
def list_notifications(
    is_read: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    query = db.query(Notification).filter(Notification.user_id == ctx.user.id)
    if is_read is not None:
        query = query.filter(Notification.is_read == is_read)

    query = query.order_by(Notification.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return PaginatedResponse[NotificationResponse](
        items=[NotificationResponse.model_validate(n) for n in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == ctx.user.id)
        .first()
    )
    if not notif:
        raise CivicFixException(
            code="NOTIFICATION_NOT_FOUND",
            message="Notification not found.",
            status_code=404,
        )

    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return NotificationResponse.model_validate(notif)


@router.post("/mark-all-read", response_model=MessageResponse)
def mark_all_notifications_read(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    db.query(Notification).filter(
        Notification.user_id == ctx.user.id,
        Notification.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session="fetch")
    db.commit()
    return MessageResponse(message="All notifications marked as read.")
