from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.core.config import settings
from backend.app.core.database import Base, engine
import backend.app.models  # ensure models are loaded
from backend.app.core.errors import (
    CivicFixException,
    civicfix_exception_handler,
    http_exception_handler,
    validation_exception_handler,
    generic_exception_handler,
)
from backend.app.api.auth import router as auth_router
from backend.app.api.organizations import router as orgs_router
from backend.app.api.memberships import router as memberships_router
from backend.app.api.demo_identity import router as demo_id_router
from backend.app.api.categories import router as categories_router
from backend.app.api.teams import router as teams_router
from backend.app.api.complaints import router as complaints_router
from backend.app.api.evidence import router as evidence_router
from backend.app.api.ai import router as ai_router
from backend.app.api.verifications import router as verifications_router
from backend.app.api.duplicates import router as duplicates_router
from backend.app.api.deadlines import router as deadlines_router
from backend.app.api.escalations import router as escalations_router
from backend.app.api.disaster_events import router as disaster_events_router
from backend.app.api.priority_history import router as priority_history_router
from backend.app.api.exports import router as exports_router
from backend.app.api.reports import router as reports_router
from backend.app.api.notifications import router as notifications_router
from backend.app.api.audit_logs import router as audit_logs_router
from fastapi.responses import RedirectResponse
from backend.app.api.trust import router as trust_router

app = FastAPI(
    title="CivicFix API",
    version="1.0.0",
    description="Official API for the CivicFix Complaint Management Platform",
    openapi_url=f"/{settings.API_PREFIX}/openapi.json",
    docs_url=f"/{settings.API_PREFIX}/docs",
    redoc_url=f"/{settings.API_PREFIX}/redoc",
)

@app.get("/docs", include_in_schema=False)
def docs_redirect():
    return RedirectResponse(url=f"/{settings.API_PREFIX}/docs")

# Ensure database tables exist
Base.metadata.create_all(bind=engine)

# Exception Handlers
app.add_exception_handler(CivicFixException, civicfix_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(orgs_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(memberships_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(demo_id_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(categories_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(teams_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(complaints_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(evidence_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(ai_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(verifications_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(duplicates_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(deadlines_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(escalations_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(disaster_events_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(priority_history_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(exports_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(reports_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(notifications_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(audit_logs_router, prefix=f"/{settings.API_PREFIX}")
app.include_router(trust_router, prefix=f"/{settings.API_PREFIX}")


@app.get(f"/{settings.API_PREFIX}/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
    }
