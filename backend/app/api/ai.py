from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, ActiveOrgContext
from backend.app.services.ai.factory import get_ai_provider
from backend.app.schemas.ai import (
    ImproveDescriptionRequest,
    ImproveDescriptionResponse,
    SuggestCategoryRequest,
    SuggestCategoryResponse,
    DuplicateCandidateRequest,
    DuplicateCandidateResponse,
    AiStatusResponse,
)
from backend.app.services.ai.service import (
    improve_description_service,
    suggest_category_service,
    find_duplicate_candidates_service,
)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status", response_model=AiStatusResponse)
def get_ai_status():
    provider = get_ai_provider()
    is_configured = True
    provider_name = settings.AI_PROVIDER.lower().strip()
    if provider_name == "gemini":
        is_configured = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())
    elif provider_name == "disabled":
        is_configured = False

    return AiStatusResponse(
        provider=settings.AI_PROVIDER,
        model_name=provider.model_name,
        is_configured=is_configured,
        timeout_seconds=settings.AI_TIMEOUT_SECONDS,
        max_retries=settings.AI_MAX_RETRIES,
    )


@router.post("/improve-description", response_model=ImproveDescriptionResponse)
async def improve_description(
    payload: ImproveDescriptionRequest,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    return await improve_description_service(
        db=db,
        organization_id=ctx.organization_id,
        user_id=ctx.user.id,
        description=payload.description,
    )


@router.post("/suggest-category", response_model=SuggestCategoryResponse)
async def suggest_category(
    payload: SuggestCategoryRequest,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    return await suggest_category_service(
        db=db,
        organization_id=ctx.organization_id,
        user_id=ctx.user.id,
        description=payload.description,
    )


@router.post("/duplicate-candidates", response_model=DuplicateCandidateResponse)
async def duplicate_candidates(
    payload: DuplicateCandidateRequest,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    return await find_duplicate_candidates_service(
        db=db,
        organization_id=ctx.organization_id,
        user_id=ctx.user.id,
        description=payload.description,
        category_id=payload.category_id,
        location_text=payload.location_text,
        limit=payload.limit,
    )
