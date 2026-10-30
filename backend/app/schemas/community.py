import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, ConfigDict
from backend.app.schemas.complaint import ComplaintBrief


class VerificationCreate(BaseModel):
    answer: str  # "STILL_EXISTS", "APPEARS_RESOLVED", "NEEDS_REVIEW"
    notes: Optional[str] = None


class VerificationSummary(BaseModel):
    complaint_id: int
    total_responses: int
    counts: Dict[str, int]
    user_answer: Optional[str] = None


class DuplicateGroupCreate(BaseModel):
    primary_complaint_id: int


class DuplicateLinkCreate(BaseModel):
    complaint_id: int


class DuplicateLinkResponse(BaseModel):
    id: int
    group_id: int
    complaint_id: int
    linked_at: datetime.datetime
    complaint: Optional[ComplaintBrief] = None

    model_config = ConfigDict(from_attributes=True)


class DuplicateGroupResponse(BaseModel):
    id: int
    organization_id: int
    primary_complaint_id: int
    created_at: datetime.datetime
    primary_complaint: Optional[ComplaintBrief] = None
    links: List[DuplicateLinkResponse] = []

    model_config = ConfigDict(from_attributes=True)
