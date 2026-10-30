from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from backend.app.core.database import get_db
from backend.app.core.deps import get_active_org_context, require_role, ActiveOrgContext
from backend.app.core.errors import CivicFixException
from backend.app.models import Team, CategoryTeamMap, Category, RoleEnum
from backend.app.schemas.complaint import (
    TeamCreate,
    TeamResponse,
    CategoryTeamMapCreate,
    CategoryTeamMapResponse,
)
from backend.app.schemas.common import MessageResponse

router = APIRouter(tags=["teams"])


@router.get("/teams", response_model=List[TeamResponse])
def list_teams(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    teams = (
        db.query(Team)
        .filter(Team.organization_id == ctx.organization_id, Team.is_active.is_(True))
        .order_by(Team.name)
        .all()
    )
    return [TeamResponse.model_validate(t) for t in teams]


@router.post("/teams", response_model=TeamResponse, status_code=201)
def create_team(
    payload: TeamCreate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    existing = (
        db.query(Team)
        .filter(
            Team.organization_id == ctx.organization_id,
            Team.name == payload.name.strip(),
        )
        .first()
    )
    if existing:
        raise CivicFixException(
            code="TEAM_ALREADY_EXISTS",
            message=f"Team '{payload.name}' already exists in this organization.",
            status_code=409,
        )

    team = Team(
        organization_id=ctx.organization_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        is_active=payload.is_active,
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return TeamResponse.model_validate(team)


@router.get("/category-team-maps", response_model=List[CategoryTeamMapResponse])
def list_category_team_maps(
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(get_active_org_context),
):
    maps = (
        db.query(CategoryTeamMap)
        .filter(CategoryTeamMap.organization_id == ctx.organization_id)
        .all()
    )
    return [CategoryTeamMapResponse.model_validate(m) for m in maps]


@router.post("/category-team-maps", response_model=CategoryTeamMapResponse, status_code=201)
def create_category_team_map(
    payload: CategoryTeamMapCreate,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    cat = (
        db.query(Category)
        .filter(Category.id == payload.category_id, Category.organization_id == ctx.organization_id)
        .first()
    )
    if not cat:
        raise CivicFixException(
            code="CATEGORY_NOT_FOUND",
            message="Category not found in this organization.",
            status_code=404,
        )

    team = (
        db.query(Team)
        .filter(Team.id == payload.team_id, Team.organization_id == ctx.organization_id)
        .first()
    )
    if not team:
        raise CivicFixException(
            code="TEAM_NOT_FOUND",
            message="Team not found in this organization.",
            status_code=404,
        )

    existing = (
        db.query(CategoryTeamMap)
        .filter(
            CategoryTeamMap.organization_id == ctx.organization_id,
            CategoryTeamMap.category_id == payload.category_id,
            CategoryTeamMap.team_id == payload.team_id,
        )
        .first()
    )
    if existing:
        return CategoryTeamMapResponse.model_validate(existing)

    mapping = CategoryTeamMap(
        organization_id=ctx.organization_id,
        category_id=payload.category_id,
        team_id=payload.team_id,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return CategoryTeamMapResponse.model_validate(mapping)


@router.delete("/category-team-maps/{map_id}", response_model=MessageResponse)
def delete_category_team_map(
    map_id: int,
    db: DBSession = Depends(get_db),
    ctx: ActiveOrgContext = Depends(require_role([RoleEnum.ORG_ADMIN])),
):
    mapping = (
        db.query(CategoryTeamMap)
        .filter(CategoryTeamMap.id == map_id, CategoryTeamMap.organization_id == ctx.organization_id)
        .first()
    )
    if not mapping:
        raise CivicFixException(
            code="NOT_FOUND",
            message="Routing mapping not found.",
            status_code=404,
        )
    db.delete(mapping)
    db.commit()
    return MessageResponse(message="Routing mapping deleted successfully.")
