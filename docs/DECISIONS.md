# CivicFix Architecture & Implementation Decisions

This document records the architectural and design decisions made for the CivicFix platform in accordance with the project requirements.

## Decision 1: Database Support and Test Strategy
- **Choice**: Use PostgreSQL as the production database, configured via SQLAlchemy 2.0 with Alembic migrations and provided in `docker-compose.yml`. For automated tests and environments without an active PostgreSQL service, support SQLite (with `StaticPool` and WAL/foreign-keys enabled) as a drop-in fallback.
- **Rationale**: Meets tech stack requirement for PostgreSQL, SQLAlchemy, Alembic, and docker-compose, while guaranteeing that tests run deterministically without external database daemon dependencies.

## Decision 2: Multi-Tenancy and Organization Isolation
- **Choice**: Enforce row-level organization filtering at the service and query layers for all organization-owned entities (`organization_id`). Every protected request verifies the user's active session, active organization header/context, and membership record with the assigned role.
- **Rationale**: Fully meets rules 5.1, 5.2, 5.7, and 5.8. Never relies on client-side filtering.

## Decision 3: Unified Error Response Structure
- **Choice**: All API errors adhere to the single JSON format:
  ```json
  {
    "code": "ERROR_CODE",
    "message": "Human readable explanation",
    "details": {}
  }
  ```
- **Rationale**: Complies with requirement 13.3. Prevents leakage of stack traces, internal paths, or credentials.

## Decision 4: Password Hashing
- **Choice**: Use `bcrypt` via the official `bcrypt` library with a salt work factor of 12 for password hashing.
- **Rationale**: Complies with requirement 14 for strong, standard password hashing.

## Decision 5: Session Management
- **Choice**: Secure, revocable server-stored sessions in the `Session` table identified by a cryptographically random 256-bit token (`secrets.token_urlsafe(32)`), transmitted via secure cookies or `Authorization: Bearer <session_token>`.
- **Rationale**: Complies with requirements 4, 5.2, and 14 for revocable sessions.

## Decision 6: Gemma Model Providers & Safety Checks
- **Choice**: The backend abstracts AI calls behind an `AiProvider` interface with two implementations: `HostedGeminiProvider` (using official Google GenAI / Gemini API endpoint) and `OllamaProvider` (using local Ollama endpoint).
- **Rationale**: Complies with requirement 7.1. Output is validated against strict Pydantic schemas, and hallmarked numbers and proper names are verified against the input description.
