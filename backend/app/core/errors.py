from typing import Any, Dict, Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


class CivicFixException(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


def error_response(code: str, message: str, status_code: int = 400, details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "code": code,
            "message": message,
            "details": details or {},
        },
    )


async def civicfix_exception_handler(request: Request, exc: CivicFixException) -> JSONResponse:
    return error_response(
        code=exc.code,
        message=exc.message,
        status_code=exc.status_code,
        details=exc.details,
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "HTTP_ERROR"
    if exc.status_code == 401:
        code = "UNAUTHORIZED"
    elif exc.status_code == 403:
        code = "FORBIDDEN"
    elif exc.status_code == 404:
        code = "NOT_FOUND"
    elif exc.status_code == 405:
        code = "METHOD_NOT_ALLOWED"
    elif exc.status_code == 429:
        code = "RATE_LIMIT_EXCEEDED"
    elif exc.status_code >= 500:
        code = "INTERNAL_SERVER_ERROR"

    message = str(exc.detail) if exc.detail else "An HTTP error occurred."
    return error_response(code=code, message=message, status_code=exc.status_code)


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = {}
    for err in exc.errors():
        field = ".".join(str(loc) for loc in err.get("loc", []))
        details[field] = err.get("msg", "Invalid value")
    return error_response(
        code="VALIDATION_ERROR",
        message="Request validation failed.",
        status_code=422,
        details=details,
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Do not leak stack traces or internal secrets
    return error_response(
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected server error occurred. Please try again later.",
        status_code=500,
    )
