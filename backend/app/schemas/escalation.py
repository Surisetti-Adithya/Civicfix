import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from backend.app.schemas.complaint import ComplaintBrief


class DeadlineRuleCreate(BaseModel):
    category_id: Optional[int] = None
    response_hours: int = 24
    resolution_hours: int = 72
    mode: str = "NORMAL"


class DeadlineRuleResponse(DeadlineRuleCreate):
    id: int
    organization_id: int
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class EscalationRuleCreate(BaseModel):
    level_order: int
    target_role_or_channel: str
    trigger: str = "RESOLUTION_OVERDUE"


class EscalationRuleResponse(EscalationRuleCreate):
    id: int
    organization_id: int
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class EscalationRecordResponse(BaseModel):
    id: int
    complaint_id: int
    level: int
    state: str
    prepared_at: datetime.datetime
    submitted_at: Optional[datetime.datetime] = None
    acknowledged_at: Optional[datetime.datetime] = None
    receipt_reference: Optional[str] = None
    notes: Optional[str] = None
    complaint: Optional[ComplaintBrief] = None

    model_config = ConfigDict(from_attributes=True)


class EscalationSubmitRequest(BaseModel):
    receipt_reference: str
    notes: Optional[str] = None


class EscalationAcknowledgeRequest(BaseModel):
    notes: Optional[str] = None


class DeadlineJobResult(BaseModel):
    evaluated_complaints: int
    overdue_flagged: int
    escalations_prepared: int
