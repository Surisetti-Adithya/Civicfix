from fastapi import APIRouter, Depends, Path, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import Complaint, AuditLog, RoleEnum
from backend.app.services.evidence_pack_service import (
    build_evidence_pack_data,
    generate_evidence_pack_pdf,
)

router = APIRouter(prefix="/exports", tags=["exports"])


def check_complaint_export_access(complaint_id: int, ctx: ActiveOrgContext, db: DBSession) -> Complaint:
    comp = (
        db.query(Complaint)
        .filter(Complaint.id == complaint_id, Complaint.organization_id == ctx.organization_id)
        .first()
    )
    if not comp:
        raise CivicFixException(
            code="COMPLAINT_NOT_FOUND",
            message="Complaint not found.",
            status_code=404,
        )

    # CITIZEN can only export their own complaint
    if ctx.role == RoleEnum.CITIZEN.value and comp.reporter_id != ctx.user.id:
        raise CivicFixException(
            code="PERMISSION_DENIED",
            message="You do not have permission to export an evidence pack for this complaint.",
            status_code=403,
        )

    return comp


@router.get("/complaints/{complaint_id}/json")
def export_evidence_pack_json(
    complaint_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    comp = check_complaint_export_access(complaint_id, ctx, db)
    data = build_evidence_pack_data(db, comp.id, ctx.organization_id)

    # Audit log (Rule 10.6 & 14)
    audit = AuditLog(
        organization_id=ctx.organization_id,
        actor_id=ctx.user.id,
        action="EVIDENCE_PACK_EXPORTED_JSON",
        details={"complaint_id": comp.id, "ref_num": comp.public_reference_number},
    )
    db.add(audit)
    db.commit()

    return data


@router.get("/complaints/{complaint_id}/pdf")
def export_evidence_pack_pdf(
    complaint_id: int = Path(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    comp = check_complaint_export_access(complaint_id, ctx, db)
    data = build_evidence_pack_data(db, comp.id, ctx.organization_id)
    pdf_buffer = generate_evidence_pack_pdf(data)

    # Audit log (Rule 10.6 & 14)
    audit = AuditLog(
        organization_id=ctx.organization_id,
        actor_id=ctx.user.id,
        action="EVIDENCE_PACK_EXPORTED_PDF",
        details={"complaint_id": comp.id, "ref_num": comp.public_reference_number},
    )
    db.add(audit)
    db.commit()

    filename = f"evidence_pack_{comp.public_reference_number}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
