import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    phone_number: Optional[str] = None
    permanent_location: Optional[str] = None
    home_latitude: Optional[float] = None
    home_longitude: Optional[float] = None


class UserRegister(UserBase):
    password: str = Field(..., min_length=8)
    organization_id: Optional[int] = None
    role: Optional[str] = "CITIZEN"


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    permanent_location: Optional[str] = None
    home_latitude: Optional[float] = None
    home_longitude: Optional[float] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    organization_id: Optional[int] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    trust_level: int = 50
    badge_title: Optional[str] = "Active Contributor"
    badge_tier: Optional[str] = "BRONZE"
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class OrganizationBrief(BaseModel):
    id: int
    name: str
    slug: str
    type: str
    time_zone: str

    model_config = ConfigDict(from_attributes=True)


class MembershipBrief(BaseModel):
    id: int
    organization_id: int
    role: str
    organization: OrganizationBrief

    model_config = ConfigDict(from_attributes=True)


class SessionResponse(BaseModel):
    token: str
    user: UserResponse
    active_organization: Optional[OrganizationBrief] = None
    role: Optional[str] = None
    memberships: List[MembershipBrief] = []


class SwitchOrgRequest(BaseModel):
    organization_id: int
