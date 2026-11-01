import os
import uuid
import hashlib
from fastapi import APIRouter, Depends, UploadFile, File, Path
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DBSession

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import Complaint, EvidenceFile, RoleEnum
from backend.app.schemas.complaint import EvidenceFileResponse

router = APIRouter(prefix="/complaints/{complaint_id}/evidence", tags=["evidence"])


@router.post("", response_model=EvidenceFileResponse, status_code=201)
async def upload_evidence(
    complaint_id: int,
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    complaint = (
        db.query(Complaint)
        .filter(Complaint.id == complaint_id, Complaint.organization_id == ctx.organization_id)
        .first()
    )
    if not complaint:
        raise CivicFixException(
            code="COMPLAINT_NOT_FOUND",
            message="Complaint not found.",
            status_code=404,
        )

    # If verified on-site by staff, citizens no longer need or are allowed to upload additional evidence
    if getattr(complaint, "is_staff_verified", False) and ctx.role == RoleEnum.CITIZEN.value:
        raise CivicFixException(
            code="VERIFICATION_CLOSED",
            message="This complaint has already been verified on-site by staff. No additional photos or evidence are required.",
            status_code=400,
        )

    # Permission check: citizens can contribute extra evidence to any complaint in their organization
    if complaint.organization_id != ctx.organization_id:
        raise CivicFixException(
            code="PERMISSION_DENIED",
            message="You do not have permission to upload evidence for this complaint.",
            status_code=403,
        )

    # Validate file extension
    original_name = file.filename or "unnamed_file"
    _, ext = os.path.splitext(original_name)
    ext = ext.lower()
    if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise CivicFixException(
            code="INVALID_FILE_TYPE",
            message=f"File extension '{ext}' is not allowed. Permitted: {', '.join(settings.ALLOWED_UPLOAD_EXTENSIONS)}",
            status_code=400,
        )

    # Validate MIME type
    content_type = file.content_type or "application/octet-stream"
    if content_type not in settings.ALLOWED_UPLOAD_MIME_TYPES:
        raise CivicFixException(
            code="INVALID_MIME_TYPE",
            message=f"MIME type '{content_type}' is not allowed.",
            status_code=400,
        )

    # Read and check size
    content = await file.read()
    size = len(content)
    if size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise CivicFixException(
            code="FILE_TOO_LARGE",
            message=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_BYTES // (1024*1024)}MB.",
            status_code=400,
        )
    if size == 0:
        raise CivicFixException(
            code="EMPTY_FILE",
            message="Cannot upload empty file.",
            status_code=400,
        )

    # Calculate SHA256 hash
    file_hash = hashlib.sha256(content).hexdigest()

    # Generate random storage key
    storage_key = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, storage_key)

    # Save to disk outside web root
    with open(file_path, "wb") as f:
        f.write(content)

    evidence = EvidenceFile(
        complaint_id=complaint.id,
        uploader_id=ctx.user.id,
        storage_key=storage_key,
        original_name=original_name,
        content_type=content_type,
        size_bytes=size,
        file_hash=file_hash,
    )
    db.add(evidence)

    # Award Trust Level when contributing extra photo/evidence
    if complaint.reporter_id != ctx.user.id:
        if complaint.reporter:
            complaint.reporter.trust_level = (complaint.reporter.trust_level or 50) + 15
        ctx.user.trust_level = (ctx.user.trust_level or 50) + 10
    else:
        ctx.user.trust_level = (ctx.user.trust_level or 50) + 10

    db.commit()
    db.refresh(evidence)

    return EvidenceFileResponse.model_validate(evidence)


@router.get("/{evidence_id}/download")
def download_evidence(
    complaint_id: int,
    evidence_id: int,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    complaint = (
        db.query(Complaint)
        .filter(Complaint.id == complaint_id, Complaint.organization_id == ctx.organization_id)
        .first()
    )
    if not complaint:
        raise CivicFixException(
            code="COMPLAINT_NOT_FOUND",
            message="Complaint not found.",
            status_code=404,
        )

    if ctx.role == RoleEnum.CITIZEN.value and complaint.reporter_id != ctx.user.id:
        raise CivicFixException(
            code="PERMISSION_DENIED",
            message="You do not have permission to download this evidence file.",
            status_code=403,
        )

    evidence = (
        db.query(EvidenceFile)
        .filter(EvidenceFile.id == evidence_id, EvidenceFile.complaint_id == complaint.id)
        .first()
    )
    if not evidence:
        raise CivicFixException(
            code="EVIDENCE_NOT_FOUND",
            message="Evidence file not found.",
            status_code=404,
        )

    file_path = os.path.join(settings.UPLOAD_DIR, evidence.storage_key)
    if not os.path.exists(file_path):
        raise CivicFixException(
            code="FILE_NOT_FOUND_ON_DISK",
            message="The requested file could not be found in storage.",
            status_code=404,
        )

    return FileResponse(
        path=file_path,
        media_type=evidence.content_type,
        filename=evidence.original_name,
    )
