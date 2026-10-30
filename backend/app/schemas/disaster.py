import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from backend.app.schemas.complaint import ComplaintBrief


class DisasterEventCreate(BaseModel):
    name: str
    type: str  # "FLOOD", "CYCLONE", "FIRE", "EARTHQUAKE"
    scope: str = "ORGANIZATION"  # or specific ward/area
    is_simulated: bool = False


class DisasterEventResponse(DisasterEventCreate):
    id: int
    organization_id: int
    state: str
    activated_by_id: Optional[int] = None
    started_at: datetime.datetime
    ended_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PriorityHistoryResponse(BaseModel):
    id: int
    complaint_id: int
    disaster_event_id: Optional[int] = None
    previous_priority: str
    new_priority: str
    reason: str
    method: str
    created_at: datetime.datetime
    idempotency_key: str
    complaint: Optional[ComplaintBrief] = None
    disaster_event: Optional[DisasterEventResponse] = None

    model_config = ConfigDict(from_attributes=True)


class DisasterReassessmentResult(BaseModel):
    event_id: int
    event_name: str
    is_simulated: bool
    reassessed_complaints: int
    priorities_elevated: int
    history_records_written: int
