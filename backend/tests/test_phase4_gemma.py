import os
import pytest
from backend.app.models import Category, AiCallLog
from backend.app.services.ai.factory import set_ai_provider, get_ai_provider
from backend.app.services.ai.fake_provider import FakeAiProvider
from backend.app.services.ai.gemini_provider import HostedGeminiProvider


@pytest.fixture
def org_and_user(client):
    admin_res = client.post(
        "/api/auth/register",
        json={
            "email": "aiadmin@muni.gov",
            "password": "Password123!",
            "full_name": "AI Admin",
        },
    ).json()
    token = admin_res["token"]

    org = client.post(
        "/api/organizations",
        json={
            "name": "AI Test Org",
            "slug": "ai-test-org",
            "type": "MUNICIPALITY",
        },
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    # Add a category
    cat = client.post(
        "/api/categories",
        json={"name": "Water & Sanitation", "description": "Water leaks and sewerage"},
        headers={"Authorization": f"Bearer {token}", "X-Organization-Id": str(org["id"])},
    ).json()

    return {
        "org_id": org["id"],
        "token": token,
        "cat_id": cat["id"],
    }


def test_ai_status_endpoint(client):
    res = client.get("/api/ai/status")
    assert res.status_code == 200
    data = res.json()
    assert "provider" in data
    assert "model_name" in data
    assert "is_configured" in data
    assert "timeout_seconds" in data


def test_ai_feature_a_valid_output(client, org_and_user, db_session):
    fake = FakeAiProvider(mode="normal")
    set_ai_provider(fake)

    headers = {
        "Authorization": f"Bearer {org_and_user['token']}",
        "X-Organization-Id": str(org_and_user["org_id"]),
    }
    res = client.post(
        "/api/ai/improve-description",
        json={"description": "Pipe leaking on 4th floor since 10am"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["improved_description"] is not None
    assert data["is_ai_suggestion"] is True

    # Verify AiCallLog created and does not contain full personal complaint text
    logs = db_session.query(AiCallLog).filter(AiCallLog.feature == "improve-description").all()
    assert len(logs) >= 1
    last_log = logs[-1]
    assert last_log.status == "SUCCESS"
    assert last_log.model_name == fake.model_name
    assert not hasattr(last_log, "prompt")  # Column does not exist in AiCallLog schema


def test_ai_feature_a_hallucination_rejected(client, org_and_user, db_session):
    # Fake provider introduces new numbers/names not in original input
    fake = FakeAiProvider(mode="hallucination")
    set_ai_provider(fake)

    headers = {
        "Authorization": f"Bearer {org_and_user['token']}",
        "X-Organization-Id": str(org_and_user["org_id"]),
    }
    res = client.post(
        "/api/ai/improve-description",
        json={"description": "Minor water leak in hallway"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    # Hallucination detected -> suggestion rejected
    assert data["improved_description"] is None
    assert "rejected" in data["message"].lower()

    # Check log status
    logs = db_session.query(AiCallLog).filter(AiCallLog.feature == "improve-description").all()
    assert logs[-1].status == "REJECTED_HALLUCINATION"


def test_ai_feature_b_invalid_category(client, org_and_user, db_session):
    fake = FakeAiProvider(mode="invalid_category")
    set_ai_provider(fake)

    headers = {
        "Authorization": f"Bearer {org_and_user['token']}",
        "X-Organization-Id": str(org_and_user["org_id"]),
    }
    res = client.post(
        "/api/ai/suggest-category",
        json={"description": "Large garbage heap on roadside"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    # Category 99999 is not in the org's category list -> rejected
    assert data["category_id"] is None

    logs = db_session.query(AiCallLog).filter(AiCallLog.feature == "suggest-category").all()
    assert logs[-1].status == "REJECTED_INVALID_CATEGORY"


def test_ai_timeout_handling(client, org_and_user, db_session):
    fake = FakeAiProvider(mode="timeout")
    set_ai_provider(fake)

    headers = {
        "Authorization": f"Bearer {org_and_user['token']}",
        "X-Organization-Id": str(org_and_user["org_id"]),
    }
    res = client.post(
        "/api/ai/improve-description",
        json={"description": "Broken sidewalk tile near entrance"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    # On timeout, graceful fallback: no suggestion
    assert data["improved_description"] is None

    logs = db_session.query(AiCallLog).filter(AiCallLog.feature == "improve-description").all()
    assert logs[-1].status == "TIMEOUT"


def test_ai_invalid_json_handling(client, org_and_user):
    fake = FakeAiProvider(mode="invalid_json")
    set_ai_provider(fake)

    headers = {
        "Authorization": f"Bearer {org_and_user['token']}",
        "X-Organization-Id": str(org_and_user["org_id"]),
    }
    res = client.post(
        "/api/ai/suggest-category",
        json={"description": "Elevator jerks during descent"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["category_id"] is None


def test_ai_rate_limiting(client, org_and_user):
    fake = FakeAiProvider(mode="normal")
    set_ai_provider(fake)

    headers = {
        "Authorization": f"Bearer {org_and_user['token']}",
        "X-Organization-Id": str(org_and_user["org_id"]),
    }

    # Exhaust rate limit
    got_rate_limited = False
    for i in range(25):
        res = client.post(
            "/api/ai/suggest-category",
            json={"description": f"Test description iteration {i}"},
            headers=headers,
        )
        if res.status_code == 429:
            got_rate_limited = True
            assert res.json()["code"] == "RATE_LIMIT_EXCEEDED"
            break

    assert got_rate_limited is True


@pytest.mark.skipif(not os.getenv("GEMINI_API_KEY"), reason="Requires GEMINI_API_KEY environment variable")
def test_real_model_call_integration(client, org_and_user):
    provider = HostedGeminiProvider(api_key=os.getenv("GEMINI_API_KEY"))
    set_ai_provider(provider)

    headers = {
        "Authorization": f"Bearer {org_and_user['token']}",
        "X-Organization-Id": str(org_and_user["org_id"]),
    }
    res = client.post(
        "/api/ai/improve-description",
        json={"description": "street light blinking in front of house 4b"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["improved_description"] is not None
