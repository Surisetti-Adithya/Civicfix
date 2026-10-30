import math
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import require_role, ActiveOrgContext
from backend.app.models import AuditLog, RoleEnum
from backend.app.schemas.common import PaginatedResponse
from pydantic import BaseModel, ConfigDict
import datetime


class AuditLogResponse(BaseModel):
    id: int
    organization_id: int
    actor_id: Optional[int] = None
    action: str
    details: Optional[dict] = None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=PaginatedResponse[AuditLogResponse])
def list_audit_logs(
    action: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    query = db.query(AuditLog).filter(AuditLog.organization_id == ctx.organization_id)
    if action:
        query = query.filter(AuditLog.action == action)

    query = query.order_by(AuditLog.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return PaginatedResponse[AuditLogResponse](
        items=[AuditLogResponse.model_validate(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
