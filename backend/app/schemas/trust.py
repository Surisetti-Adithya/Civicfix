import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class TrustScoreHistoryItem(BaseModel):
    id: int
    user_id: int
    organization_id: Optional[int] = None
    previous_score: int
    new_score: int
    change_amount: int
    reason: str
    rule_name: str
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class CitizenAppealItem(BaseModel):
    id: int
    user_id: int
    organization_id: int
    appeal_type: str
    reason: str
    status: str
    admin_notes: Optional[str] = None
    reviewed_by_id: Optional[int] = None
    reviewed_by_name: Optional[str] = None
    created_at: datetime.datetime
    reviewed_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CitizenSummary(BaseModel):
    user_id: int
    full_name: str
    email: str
    phone_number: Optional[str] = None
    permanent_location: Optional[str] = None
    trust_level: int
    badge_title: str
    badge_tier: str
    account_status: str  # ACTIVE, RESTRICTED, BANNED
    status_reason: Optional[str] = None
    status_updated_at: Optional[datetime.datetime] = None
    report_count: int = 0
    verification_count: int = 0
    pending_appeals_count: int = 0
    suspicious_flags: List[str] = []


class ComplaintBriefTrust(BaseModel):
    id: int
    public_reference_number: str
    description: str
    category_name: Optional[str] = None
    location_text: str
    status: str
    current_priority: str
    is_overdue: bool
    created_at: datetime.datetime


class VerificationBriefTrust(BaseModel):
    id: int
    complaint_id: int
    complaint_reference: str
    answer: str
    notes: Optional[str] = None
    created_at: datetime.datetime


class CitizenDetail(BaseModel):
    user_id: int
    full_name: str
    email: str
    phone_number: Optional[str] = None
    permanent_location: Optional[str] = None
    trust_level: int
    badge_title: str
    badge_tier: str
    account_status: str
    status_reason: Optional[str] = None
    status_updated_at: Optional[datetime.datetime] = None
    status_updated_by_name: Optional[str] = None
    reports: List[ComplaintBriefTrust] = []
    verifications: List[VerificationBriefTrust] = []
    trust_history: List[TrustScoreHistoryItem] = []
    appeals: List[CitizenAppealItem] = []
    suspicious_flags: List[str] = []


class UpdateAccountStatusRequest(BaseModel):
    account_status: str = Field(..., description="ACTIVE, RESTRICTED, or BANNED")
    reason: str = Field(..., min_length=5, description="Mandatory reason for restriction, ban, or reinstatement")


class AdjustTrustScoreRequest(BaseModel):
    change_amount: int = Field(..., description="Score delta (positive or negative)")
    reason: str = Field(..., min_length=3, description="Mandatory explanation for score change")
    rule_name: str = Field("ADMIN_ADJUSTMENT", description="Rule identifier")


class CreateAppealRequest(BaseModel):
    reason: str = Field(..., min_length=10, description="Citizen explanation for appeal against restriction/ban")


class ReviewAppealRequest(BaseModel):
    status: str = Field(..., description="APPROVED or REJECTED")
    admin_notes: str = Field(..., min_length=3, description="Mandatory review explanation")


class CitizenPatternAnalysisOutput(BaseModel):
    suspicious_flags: List[str] = []
    risk_level: str = "LOW"  # LOW, MEDIUM, HIGH
    summary_analysis: str
    recommended_action: str = "NO_ACTION"  # NO_ACTION, FLAG_FOR_REVIEW, ADJUST_TRUST_SCORE
    recommended_trust_adjustment: int = 0
    recommendation_reason: str


class GemmaPatternAnalysisResponse(BaseModel):
    citizen_id: int
    citizen_name: str
    suspicious_flags: List[str]
    risk_level: str
    summary_analysis: str
    recommended_action: str
    recommended_trust_adjustment: int
    recommendation_reason: str
    is_ai_suggestion: bool = True
    disclaimer: str = (
        "Gemma analysis and recommendations are advisory only. "
        "Gemma never automatically bans citizens or makes final trust decisions. "
        "All restrictions, bans, and adjustments must be reviewed and confirmed by authorized administrators."
    )


class TrustRulesConfig(BaseModel):
    report_quality_bonus: int = 15
    duplicate_extension_bonus: int = 10
    verification_outcome_bonus: int = 5
    confirmed_abuse_penalty: int = 30
    unresolved_unverified_penalty: int = 0  # Explicitly 0
