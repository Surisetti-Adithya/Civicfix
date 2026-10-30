import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict
from backend.app.schemas.auth import UserResponse


class OrganizationBase(BaseModel):
    name: str
    slug: str
    type: str  # e.g., "MUNICIPALITY", "APARTMENT"
    time_zone: str = "UTC"
    settings: Dict[str, Any] = {}


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    time_zone: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class OrganizationResponse(OrganizationBase):
    id: int
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class MembershipCreate(BaseModel):
    user_id: int
    role: str  # CITIZEN, STAFF, ORG_ADMIN


class MembershipUpdate(BaseModel):
    role: str


class MembershipResponse(BaseModel):
    id: int
    user_id: int
    organization_id: int
    role: str
    created_at: datetime.datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)
