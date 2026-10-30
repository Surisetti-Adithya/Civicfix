from typing import List
from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, require_role, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import Category, RoleEnum
from backend.app.schemas.complaint import CategoryCreate, CategoryResponse

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=List[CategoryResponse])
def list_categories(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    categories = (
        db.query(Category)
        .filter(Category.organization_id == ctx.organization_id, Category.is_active.is_(True))
        .order_by(Category.name)
        .all()
    )
    return [CategoryResponse.model_validate(c) for c in categories]


@router.post("", response_model=CategoryResponse, status_code=201)
def create_category(
    payload: CategoryCreate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    existing = (
        db.query(Category)
        .filter(
            Category.organization_id == ctx.organization_id,
            Category.name == payload.name.strip(),
        )
        .first()
    )
    if existing:
        raise CivicFixException(
            code="CATEGORY_ALREADY_EXISTS",
            message=f"Category '{payload.name}' already exists in this organization.",
            status_code=409,
        )

    cat = Category(
        organization_id=ctx.organization_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        is_active=payload.is_active,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryResponse.model_validate(cat)


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    payload: CategoryCreate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    cat = (
        db.query(Category)
        .filter(Category.id == category_id, Category.organization_id == ctx.organization_id)
        .first()
    )
    if not cat:
        raise CivicFixException(
            code="CATEGORY_NOT_FOUND",
            message="Category not found.",
            status_code=404,
        )

    cat.name = payload.name.strip()
    cat.description = payload.description.strip() if payload.description else None
    cat.is_active = payload.is_active
    db.commit()
    db.refresh(cat)
    return CategoryResponse.model_validate(cat)
