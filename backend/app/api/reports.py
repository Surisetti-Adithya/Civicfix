from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import Organization
from backend.app.services.metrics_service import compute_organization_metrics

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/metrics")
def get_organization_metrics(
    days: int = Query(30, ge=1, le=365),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    return compute_organization_metrics(db=db, organization_id=ctx.organization_id, days=days)


@router.get("/public-metrics")
def get_public_metrics(
    org_id: int = Query(..., description="Organization ID for public metrics"),
    days: int = Query(30, ge=1, le=365),
    db: DBSession = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise CivicFixException(
            code="ORGANIZATION_NOT_FOUND",
            message="Organization not found.",
            status_code=404,
        )

    # Compute privacy-safe aggregates only
    metrics = compute_organization_metrics(db=db, organization_id=org_id, days=days)
    return {
        "organization_id": org.id,
        "organization_name": org.name,
        "organization_type": org.type,
        "time_zone": org.time_zone,
        "time_period": metrics["time_period"],
        "metrics": metrics["metrics"],
        "breakdown_by_status": metrics["breakdown_by_status"],
        "total_recorded_period": metrics["total_recorded_period"],
    }
