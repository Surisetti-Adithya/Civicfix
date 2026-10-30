# CivicFix

A multi-tenant complaint management platform for municipalities, apartment communities, and other organizations. Citizens report problems in shared places, staff resolve them, and the system maintains a verifiable record of each step.

## Architecture

```
civic/
  backend/          # Python FastAPI application
    app/
      api/          # REST endpoints
      core/         # Config, database, auth, error handling
      models/       # SQLAlchemy models (PostgreSQL / SQLite)
      schemas/      # Pydantic request/response schemas
      services/     # Business logic and AI integration
    alembic/        # Database migrations
    tests/          # pytest test suite
  frontend/         # React + TypeScript (Vite)
    src/
      api/          # API client
      components/   # Shared UI components
      context/      # Auth context
      pages/        # Page-level components
  scripts/          # Seed data and verification scripts
  docs/             # Design decisions and documentation
```

## Key Features

- **Multi-Organization Tenancy** -- One codebase serves municipalities, apartment communities, and other organization types. Categories, teams, deadlines, and escalation rules are all organization-scoped.
- **Role-Based Access Control** -- Four roles (CITIZEN, STAFF, ORG_ADMIN, PLATFORM_ADMIN) enforced at the API layer.
- **Complaint Life Cycle** -- Nine statuses (SUBMITTED through CLOSED) with validated transitions, history logging, and atomic status changes.
- **AI-Assisted Processing (Gemma/Gemini)** -- Description improvement, category suggestion, and duplicate detection. All AI outputs are validated and clearly labeled as suggestions.
- **Deadline and Escalation Engine** -- Configurable response and resolution targets. Automated overdue detection and escalation record creation.
- **Disaster Mode** -- ORG_ADMIN activates disaster events that trigger priority reassessment. Simulated events are prominently labeled.
- **Community Verification** -- Citizens verify whether resolved complaints are actually fixed.
- **Evidence Pack Export** -- Complaint data exportable as structured JSON and formatted PDF with factual disclaimer.
- **Public Transparency Dashboard** -- Aggregate metrics with no personal information.

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL 16+ (or SQLite for local development)

### Backend Setup

```bash
cd civic

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file and configure
cp .env.example .env
# Edit .env with your database URL and API keys

# Run database migrations
PYTHONPATH=. alembic -c backend/alembic.ini upgrade head

# Seed demo data
PYTHONPATH=. python scripts/seed.py

# Start the backend server
PYTHONPATH=. uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server proxies API requests to `localhost:8000`.

### Docker Deployment

```bash
cp .env.example .env
# Edit .env with production values
docker-compose up --build
```

Services:
- **Backend API**: http://localhost:8000
- **Frontend**: http://localhost:3000
- **API Docs (OpenAPI)**: http://localhost:8000/api/docs

## Demo Credentials

All demo accounts share the password: `CivicFixDemo2026!`

| Email | Role | Organization |
|---|---|---|
| platform.admin@civicfix.org | PLATFORM_ADMIN | Both |
| muni.admin@metro.gov | ORG_ADMIN | Metropolitan Municipal Corporation |
| muni.staff@metro.gov | STAFF | Metropolitan Municipal Corporation |
| muni.citizen@metro.gov | CITIZEN | Metropolitan Municipal Corporation |
| apt.admin@palm.res | ORG_ADMIN | Palm Meadows Residential Community |
| apt.staff@palm.res | STAFF | Palm Meadows Residential Community |
| apt.resident@palm.res | CITIZEN | Palm Meadows Residential Community |

## API Documentation

With the backend running, visit:
- **Swagger UI**: http://localhost:8000/api/docs
- **ReDoc**: http://localhost:8000/api/redoc
- **OpenAPI JSON**: http://localhost:8000/api/openapi.json

### Core Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /api/auth/register | Register a new user |
| POST | /api/auth/login | Log in and receive session token |
| POST | /api/auth/switch-organization | Switch active organization |
| GET | /api/complaints | List complaints (filtered) |
| POST | /api/complaints | Submit a new complaint |
| PATCH | /api/complaints/{id}/status | Update complaint status |
| POST | /api/complaints/{id}/assign | Assign to team/user |
| POST | /api/ai/improve-description | AI: improve complaint text |
| POST | /api/ai/suggest-category | AI: suggest a category |
| POST | /api/ai/duplicate-candidates | AI: find possible duplicates |
| POST | /api/disaster-events | Activate a disaster event |
| POST | /api/deadlines/check | Run deadline check job |
| GET | /api/exports/complaints/{id}/json | Export evidence pack (JSON) |
| GET | /api/exports/complaints/{id}/pdf | Export evidence pack (PDF) |
| GET | /api/reports/public-metrics | Public dashboard metrics |
| GET | /api/notifications | List user notifications |
| GET | /api/audit-logs | List audit logs (ORG_ADMIN) |

## AI Integration

CivicFix supports two AI providers behind a common adapter:

1. **Gemini API** (hosted) -- Set `AI_PROVIDER=gemini` and `GEMINI_API_KEY` in `.env`.
2. **Ollama** (local) -- Set `AI_PROVIDER=ollama` and `OLLAMA_BASE_URL` in `.env`.

The system works without AI -- complaint submission never depends on AI availability. All AI outputs are:
- Validated against Pydantic schemas
- Checked for hallucinated numbers and proper nouns
- Clearly labeled as "AI suggestion" in the UI
- Logged in `AiCallLog` (without storing full personal text)

### Verify AI Setup

```bash
# With real provider
PYTHONPATH=. python scripts/verify_gemma.py

# With fake provider (for testing)
PYTHONPATH=. python scripts/verify_gemma.py --fake
```

## Testing

```bash
# Run all tests
PYTHONPATH=. pytest -v

# Run a specific phase
PYTHONPATH=. pytest backend/tests/test_phase4_gemma.py -v
```

Test phases:
1. Foundation (health, errors, DB tables)
2. Auth and Organizations (register, login, org isolation, demo identity)
3. Complaints (categories, teams, routing, status transitions, evidence)
4. AI/Gemma (valid output, hallucination rejection, timeout, rate limit)
5. Community (verification lifecycle, duplicate linking)
6. Deadlines and Escalations (overdue flagging, escalation submission)
7. Disaster Mode (priority reassessment, idempotency)
8. Evidence and Analytics (evidence pack integrity, public metrics PII check)
9. Demo Scenarios (end-to-end flows: drain complaint, flood disaster, overdue escalation, multi-org)

## Design Decisions

See [docs/DECISIONS.md](docs/DECISIONS.md) for architectural choices and trade-offs.

See [docs/PRIORITY_RULES.md](docs/PRIORITY_RULES.md) for the priority reassessment algorithm.

## Important Safety Notes

- This system does **not** replace emergency services. For life-threatening situations, contact emergency services directly.
- Disaster events created in the system are administrative tools. The system does **not** declare official disasters.
- AI suggestions are unverified and require human review before action.
- Demo identities are synthetic and marked accordingly. No real identity documents are used.
- Evidence packs are factual records, not legal opinions.
