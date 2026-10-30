import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class DemoIdentityResponse(BaseModel):
    id: int
    synthetic_id: str
    full_name: str
    state: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class VerificationRequest(BaseModel):
    demo_identity_id: int


class VerificationRecordResponse(BaseModel):
    id: int
    user_id: int
    demo_identity_id: int
    status: str
    verified_at: datetime.datetime
    demo_identity: Optional[DemoIdentityResponse] = None

    model_config = ConfigDict(from_attributes=True)
