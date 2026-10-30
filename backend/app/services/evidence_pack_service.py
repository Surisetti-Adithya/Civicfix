import io
import datetime
from typing import Dict, Any
from sqlalchemy.orm import Session as DBSession
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from backend.app.core.errors import CivicFixException
from backend.app.models import (
    Complaint,
    AuditLog,
    RoleEnum,
    CommunityVerification,
)


FACTUAL_DISCLAIMER = (
    "This document is a factual record. It is not a legal opinion. "
    "It does not show that a legal claim is valid."
)


def build_evidence_pack_data(db: DBSession, complaint_id: int, organization_id: int) -> Dict[str, Any]:
    comp = (
        db.query(Complaint)
        .filter(Complaint.id == complaint_id, Complaint.organization_id == organization_id)
        .first()
    )
    if not comp:
        raise CivicFixException(code="NOT_FOUND", message="Complaint not found.", status_code=404)

    # Verifications aggregate (anonymized)
    verifications = (
        db.query(CommunityVerification)
        .filter(CommunityVerification.complaint_id == comp.id)
        .all()
    )
    verification_counts = {}
    for v in verifications:
        verification_counts[v.answer] = verification_counts.get(v.answer, 0) + 1

    return {
        "disclaimer": FACTUAL_DISCLAIMER,
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "complaint": {
            "id": comp.id,
            "public_reference_number": comp.public_reference_number,
            "created_at": comp.created_at.isoformat(),
            "updated_at": comp.updated_at.isoformat(),
            "organization_name": comp.organization.name if comp.organization else "N/A",
            "category_name": comp.category.name if comp.category else "Unassigned",
            "location_text": comp.location_text,
            "latitude": comp.latitude,
            "longitude": comp.longitude,
            "status": comp.status,
            "base_severity": comp.base_severity,
            "current_priority": comp.current_priority,
            "routing_result": comp.routing_result,
            "response_deadline": comp.response_deadline.isoformat() if comp.response_deadline else None,
            "resolution_deadline": comp.resolution_deadline.isoformat() if comp.resolution_deadline else None,
            "is_overdue": comp.is_overdue,
            "description_original": comp.description_original,
            "description_improved": comp.description_improved,
        },
        "history": [
            {
                "field": h.field,
                "old_value": h.old_value,
                "new_value": h.new_value,
                "actor": h.actor.full_name if h.actor else "System",
                "notes": h.notes,
                "timestamp": h.created_at.isoformat(),
            }
            for h in comp.history
        ],
        "assignments": [
            {
                "team_name": a.team.name if a.team else "N/A",
                "assigned_to": a.user.full_name if a.user else None,
                "assigned_by": a.assigned_by.full_name if a.assigned_by else "System",
                "notes": a.notes,
                "timestamp": a.created_at.isoformat(),
            }
            for a in comp.assignments
        ],
        "evidence_files": [
            {
                "original_name": ef.original_name,
                "content_type": ef.content_type,
                "size_bytes": ef.size_bytes,
                "file_hash": ef.file_hash,
                "uploaded_at": ef.uploaded_at.isoformat(),
            }
            for ef in comp.evidence_files
        ],
        "escalation_records": [
            {
                "level": er.level,
                "state": er.state,
                "prepared_at": er.prepared_at.isoformat(),
                "submitted_at": er.submitted_at.isoformat() if er.submitted_at else None,
                "acknowledged_at": er.acknowledged_at.isoformat() if er.acknowledged_at else None,
                "receipt_reference": er.receipt_reference,
                "notes": er.notes,
            }
            for er in comp.escalation_records
        ],
        "deadline_changes": [
            {
                "target_type": dc.target_type,
                "original_target": dc.original_target.isoformat(),
                "new_target": dc.new_target.isoformat(),
                "effective_time": dc.effective_time.isoformat(),
                "reason": dc.reason,
            }
            for dc in comp.deadline_changes
        ],
        "community_verifications_aggregate": verification_counts,
    }


def generate_evidence_pack_pdf(data: Dict[str, Any]) -> io.BytesIO:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0f172a'),
    )
    section_style = ParagraphStyle(
        'DocSection',
        parent=styles['Heading2'],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1e40af'),
        spaceBefore=10,
        spaceAfter=6,
    )
    disclaimer_style = ParagraphStyle(
        'Disclaimer',
        parent=styles['Italic'],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#475569'),
        backColor=colors.HexColor('#f1f5f9'),
        borderColor=colors.HexColor('#cbd5e1'),
        borderWidth=1,
        borderPadding=6,
        spaceAfter=12,
    )
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#334155'),
    )

    story = []

    # Title & Disclaimer
    comp = data["complaint"]
    story.append(Paragraph(f"CivicFix Factual Evidence Pack: {comp['public_reference_number']}", title_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph(data["disclaimer"], disclaimer_style))
    story.append(Spacer(1, 4))

    # General Information Table
    info_data = [
        ["Organization", comp["organization_name"], "Status", comp["status"]],
        ["Category", comp["category_name"], "Priority", comp["current_priority"]],
        ["Location", comp["location_text"], "Overdue Status", "YES" if comp["is_overdue"] else "NO"],
        ["Created Date", comp["created_at"][:19], "Exported At", data["exported_at"][:19]],
        ["Response Target", comp["response_deadline"][:19] if comp["response_deadline"] else "N/A",
         "Resolution Target", comp["resolution_deadline"][:19] if comp["resolution_deadline"] else "N/A"],
    ]
    t = Table(info_data, colWidths=[90, 180, 90, 180])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#0f172a')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    # Description
    story.append(Paragraph("Original Description", section_style))
    story.append(Paragraph(comp["description_original"], body_style))
    story.append(Spacer(1, 10))

    # Status & Assignment Timeline
    story.append(Paragraph("Status and Assignment History", section_style))
    hist_rows = [["Timestamp", "Field", "Old -> New", "Actor", "Notes"]]
    for h in data["history"][:10]:
        transition = f"{h['old_value'] or 'None'} -> {h['new_value'] or 'None'}"
        hist_rows.append([h["timestamp"][:19], h["field"], transition[:30], h["actor"], (h["notes"] or "")[:35]])

    if len(hist_rows) > 1:
        th = Table(hist_rows, colWidths=[90, 60, 140, 90, 160])
        th.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7.5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ]))
        story.append(th)
    story.append(Spacer(1, 10))

    # Evidence Files
    story.append(Paragraph("Evidence Files and Checksums", section_style))
    file_rows = [["File Name", "MIME Type", "Size", "SHA-256 Checksum", "Uploaded At"]]
    for ef in data["evidence_files"]:
        file_rows.append([
            ef["original_name"][:20],
            ef["content_type"],
            f"{ef['size_bytes'] / 1024:.1f} KB",
            ef["file_hash"][:16] + "...",
            ef["uploaded_at"][:19],
        ])
    if len(file_rows) > 1:
        tf = Table(file_rows, colWidths=[110, 80, 60, 160, 130])
        tf.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7.5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ]))
        story.append(tf)
    else:
        story.append(Paragraph("No attachments recorded.", body_style))
    story.append(Spacer(1, 10))

    # Escalation Records
    story.append(Paragraph("Escalation Records & Submissions", section_style))
    esc_rows = [["Level", "State", "Prepared At", "Submitted At", "Receipt Reference", "Notes"]]
    for er in data["escalation_records"]:
        esc_rows.append([
            str(er["level"]),
            er["state"],
            er["prepared_at"][:19],
            er["submitted_at"][:19] if er["submitted_at"] else "Unsubmitted",
            er["receipt_reference"] or "None",
            (er["notes"] or "")[:25],
        ])
    if len(esc_rows) > 1:
        te = Table(esc_rows, colWidths=[40, 80, 100, 100, 110, 110])
        te.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7.5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ]))
        story.append(te)
    else:
        story.append(Paragraph("No escalation records.", body_style))

    doc.build(story)
    buffer.seek(0)
    return buffer
