#!/bin/sh
set -e

echo "=== CivicFix Backend Starting ==="
echo "Environment: ${ENVIRONMENT:-production}"
echo "AI Provider: ${AI_PROVIDER:-gemini} (Model: ${AI_MODEL_NAME:-default})"

# Apply database migrations
echo "Applying database schema migrations..."
alembic -c backend/alembic.ini upgrade head

# Seed initial demo data if requested or on first run
if [ "${AUTO_SEED}" = "true" ]; then
    echo "AUTO_SEED=true: Seeding baseline organizations, roles, categories, teams, and sample complaints..."
    python scripts/seed.py || echo "Seed completed or already populated."
fi

echo "Starting Uvicorn HTTP server on 0.0.0.0:8000..."
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
