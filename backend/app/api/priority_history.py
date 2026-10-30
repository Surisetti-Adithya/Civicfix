from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, ActiveOrgContext
from backend.app.models import Complaint, PriorityHistory, RoleEnum
from backend.app.schemas.disaster import PriorityHistoryResponse

router = APIRouter(prefix="/priority-history", tags=["priority-history"])


@router.get("", response_model=List[PriorityHistoryResponse])
def list_priority_history(
    complaint_id: Optional[int] = Query(None),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    query = (
        db.query(PriorityHistory)
        .join(Complaint, PriorityHistory.complaint_id == Complaint.id)
        .filter(Complaint.organization_id == ctx.organization_id)
    )

    if ctx.role == RoleEnum.CITIZEN.value:
        query = query.filter(Complaint.reporter_id == ctx.user.id)

    if complaint_id:
        query = query.filter(PriorityHistory.complaint_id == complaint_id)

    records = query.order_by(PriorityHistory.created_at.desc()).all()
    return [PriorityHistoryResponse.model_validate(r) for r in records]
