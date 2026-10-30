import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from backend.app.schemas.auth import UserResponse


class CategoryBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    is_active: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryResponse(CategoryBase):
    id: int
    organization_id: int
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class TeamBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    is_active: bool = True


class TeamCreate(TeamBase):
    pass


class TeamResponse(TeamBase):
    id: int
    organization_id: int
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class CategoryTeamMapCreate(BaseModel):
    category_id: int
    team_id: int


class CategoryTeamMapResponse(BaseModel):
    id: int
    organization_id: int
    category_id: int
    team_id: int
    category: Optional[CategoryResponse] = None
    team: Optional[TeamResponse] = None

    model_config = ConfigDict(from_attributes=True)


class ComplaintCreate(BaseModel):
    description: str = Field(..., min_length=5, max_length=1500)
    description_improved: Optional[str] = None
    category_id: Optional[int] = None
    location_text: str = Field(..., min_length=2, max_length=500)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    base_severity: Optional[str] = "MEDIUM"


class ComplaintStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


class ComplaintAssignRequest(BaseModel):
    team_id: int
    user_id: Optional[int] = None
    notes: Optional[str] = None


class ComplaintReopenRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class ComplaintHistoryResponse(BaseModel):
    id: int
    complaint_id: int
    actor_id: Optional[int] = None
    field: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime.datetime
    actor: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class AssignmentResponse(BaseModel):
    id: int
    complaint_id: int
    team_id: int
    user_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime.datetime
    team: Optional[TeamResponse] = None
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class EvidenceFileResponse(BaseModel):
    id: int
    complaint_id: int
    uploader_id: int
    original_name: str
    content_type: str
    size_bytes: int
    file_hash: str
    uploaded_at: datetime.datetime
    uploader: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class ComplaintBrief(BaseModel):
    id: int
    public_reference_number: str
    organization_id: int
    reporter_id: int
    category_id: Optional[int] = None
    location_text: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str
    base_severity: str
    current_priority: str
    routing_result: Optional[str] = None
    assigned_team_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    response_deadline: Optional[datetime.datetime] = None
    resolution_deadline: Optional[datetime.datetime] = None
    is_overdue: bool = False
    created_at: datetime.datetime
    updated_at: datetime.datetime

    category: Optional[CategoryResponse] = None
    assigned_team: Optional[TeamResponse] = None

    model_config = ConfigDict(from_attributes=True)


class ComplaintDetail(ComplaintBrief):
    description_original: str
    description_improved: Optional[str] = None
    reporter: Optional[UserResponse] = None
    assigned_user: Optional[UserResponse] = None
    history: List[ComplaintHistoryResponse] = []
    assignments: List[AssignmentResponse] = []
    evidence_files: List[EvidenceFileResponse] = []

    model_config = ConfigDict(from_attributes=True)
