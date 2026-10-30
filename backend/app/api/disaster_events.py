import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, require_role, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import (
    DisasterEvent,
    AuditLog,
    RoleEnum,
    DisasterStateEnum,
)
from backend.app.schemas.disaster import (
    DisasterEventCreate,
    DisasterEventResponse,
    DisasterReassessmentResult,
)
from backend.app.services.disaster_service import reassess_complaints_for_event

router = APIRouter(prefix="/disaster-events", tags=["disaster-events"])


@router.get("", response_model=List[DisasterEventResponse])
def list_disaster_events(
    state: Optional[str] = Query(None),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    query = db.query(DisasterEvent).filter(DisasterEvent.organization_id == ctx.organization_id)
    if state:
        query = query.filter(DisasterEvent.state == state.upper())
    events = query.order_by(DisasterEvent.started_at.desc()).all()
    return [DisasterEventResponse.model_validate(e) for e in events]


@router.post("", response_model=DisasterEventResponse, status_code=201)
def activate_disaster_event(
    payload: DisasterEventCreate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    event = DisasterEvent(
        organization_id=ctx.organization_id,
        name=payload.name.strip(),
        type=payload.type.strip().upper(),
        scope=payload.scope.strip().upper(),
        is_simulated=payload.is_simulated,
        state=DisasterStateEnum.ACTIVE.value,
        activated_by_id=ctx.user.id,
    )
    db.add(event)
    db.flush()

    audit = AuditLog(
        organization_id=ctx.organization_id,
        actor_id=ctx.user.id,
        action="DISASTER_EVENT_ACTIVATED",
        details={
            "event_id": event.id,
            "name": event.name,
            "type": event.type,
            "is_simulated": event.is_simulated,
        },
    )
    db.add(audit)
    db.commit()
    db.refresh(event)

    # Immediately reassess open complaints in scope
    reassess_complaints_for_event(db=db, event=event)

    return DisasterEventResponse.model_validate(event)


@router.post("/{event_id}/end", response_model=DisasterEventResponse)
def end_disaster_event(
    event_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    event = (
        db.query(DisasterEvent)
        .filter(DisasterEvent.id == event_id, DisasterEvent.organization_id == ctx.organization_id)
        .first()
    )
    if not event:
        raise CivicFixException(
            code="EVENT_NOT_FOUND",
            message="Disaster event not found.",
            status_code=404,
        )

    if event.state == DisasterStateEnum.ENDED.value:
        return DisasterEventResponse.model_validate(event)

    now = datetime.datetime.now(datetime.timezone.utc)
    event.state = DisasterStateEnum.ENDED.value
    event.ended_at = now

    audit = AuditLog(
        organization_id=ctx.organization_id,
        actor_id=ctx.user.id,
        action="DISASTER_EVENT_ENDED",
        details={"event_id": event.id, "name": event.name},
    )
    db.add(audit)
    db.commit()
    db.refresh(event)

    # Reassess affected open reports under normal policy
    reassess_complaints_for_event(db=db, event=event)

    return DisasterEventResponse.model_validate(event)


@router.post("/{event_id}/reassess", response_model=DisasterReassessmentResult)
def manual_reassess_event(
    event_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.STAFF, RoleEnum.ORG_ADMIN])),
):
    event = (
        db.query(DisasterEvent)
        .filter(DisasterEvent.id == event_id, DisasterEvent.organization_id == ctx.organization_id)
        .first()
    )
    if not event:
        raise CivicFixException(
            code="EVENT_NOT_FOUND",
            message="Disaster event not found.",
            status_code=404,
        )

    return reassess_complaints_for_event(db=db, event=event)
