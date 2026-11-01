from typing import Optional, List
from pydantic import BaseModel, Field


class ImproveDescriptionRequest(BaseModel):
    description: str = Field(..., min_length=5, max_length=1500)


class ImproveDescriptionOutput(BaseModel):
    improved_description: str
    explanation: Optional[str] = None


class ImproveDescriptionResponse(BaseModel):
    improved_description: Optional[str] = None
    original_description: str
    message: Optional[str] = None
    is_ai_suggestion: bool = True


class SuggestCategoryRequest(BaseModel):
    description: str = Field(..., min_length=5, max_length=1500)


class SuggestCategoryOutput(BaseModel):
    category_id: int
    reason: str
    confidence: str  # "HIGH", "MEDIUM", "LOW"


class SuggestCategoryResponse(BaseModel):
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    reason: Optional[str] = None
    confidence: Optional[str] = None
    is_ai_suggestion: bool = True


class FollowUpQuestionsRequest(BaseModel):
    description: str = Field(..., min_length=5, max_length=1500)


class FollowUpQuestionsOutput(BaseModel):
    questions: List[str]


class FollowUpQuestionsResponse(BaseModel):
    questions: List[str]
    is_ai_suggestion: bool = True


class DuplicateCandidateRequest(BaseModel):
    description: str = Field(..., min_length=5, max_length=1500)
    category_id: Optional[int] = None
    location_text: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    limit: int = 5


class AiDuplicateComparison(BaseModel):
    complaint_id: int
    is_possible_duplicate: bool
    reason: str
    confidence: str  # "HIGH", "MEDIUM", "LOW"


class AiDuplicateOutput(BaseModel):
    matches: List[AiDuplicateComparison] = []


class AiSimilarityCheckOutput(BaseModel):
    is_match: bool
    similarity_score: float = 0.0
    confidence: str = "MEDIUM"  # "HIGH", "MEDIUM", "LOW"
    reason: str = ""


class DuplicateCandidateResponse(BaseModel):
    candidates: List[dict]
    is_ai_suggestion: bool = True


class AiStatusResponse(BaseModel):
    provider: str
    model_name: str
    is_configured: bool
    timeout_seconds: float
    max_retries: int

