import pytest
from backend.app.models import Complaint, ComplaintExtension, User, RoleEnum
from backend.app.services.ai.factory import set_ai_provider
from backend.app.services.ai.fake_provider import FakeAiProvider


@pytest.fixture
def test_setup(client):
    # Register Admin
    admin_res = client.post(
        "/api/auth/register",
        json={
            "email": "admin_merge@test.gov",
            "password": "Password123!",
            "full_name": "Admin Tester",
        },
    ).json()
    admin_token = admin_res["token"]

    # Create Org
    org = client.post(
        "/api/organizations",
        json={
            "name": "Merge Test Org",
            "slug": "merge-test-org",
            "type": "MUNICIPALITY",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    org_id = org["id"]

    # Register Citizen 1
    citizen1_res = client.post(
        "/api/auth/register",
        json={
            "email": "citizen1@test.gov",
            "password": "Password123!",
            "full_name": "Citizen One",
            "organization_id": org_id,
            "role": "CITIZEN",
        },
    ).json()
    c1_token = citizen1_res["token"]
    c1_id = citizen1_res["user"]["id"]

    # Register Citizen 2
    citizen2_res = client.post(
        "/api/auth/register",
        json={
            "email": "citizen2@test.gov",
            "password": "Password123!",
            "full_name": "Citizen Two",
            "organization_id": org_id,
            "role": "CITIZEN",
        },
    ).json()
    c2_token = citizen2_res["token"]
    c2_id = citizen2_res["user"]["id"]

    # Register Staff
    staff_res = client.post(
        "/api/auth/register",
        json={
            "email": "staff_member@test.gov",
            "password": "Password123!",
            "full_name": "Staff Officer",
            "organization_id": org_id,
            "role": "STAFF",
        },
    ).json()
    staff_token = staff_res["token"]

    # Create a Category
    cat_res = client.post(
        "/api/categories",
        json={"name": "Water Services", "description": "Water pipe leaks and main issues"},
        headers={"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)},
    ).json()
    cat_id = cat_res["id"]

    return {
        "org_id": org_id,
        "admin_token": admin_token,
        "c1_token": c1_token,
        "c1_id": c1_id,
        "c2_token": c2_token,
        "c2_id": c2_id,
        "staff_token": staff_token,
        "cat_id": cat_id,
    }


def test_staff_severity_sorting_and_citizen_date_sorting(client, test_setup):
    """
    Requirement 1:
    - Staff portal: sort by severity (Critical at top, Low at bottom).
    - Citizen portal: sort by latest date posted, with option to sort by severity.
    """
    org_id = test_setup["org_id"]
    staff_headers = {
        "Authorization": f"Bearer {test_setup['staff_token']}",
        "X-Organization-Id": str(org_id),
    }

    # Create complaints with different severities and order
    severities = ["LOW", "CRITICAL", "MEDIUM", "HIGH"]
    for sev in severities:
        client.post(
            "/api/complaints",
            json={
                "description": f"Civic report with severity {sev}",
                "location_text": f"Location for {sev}",
                "base_severity": sev,
            },
            headers=staff_headers,
        )

    # 1. Staff query sorted by severity
    res_sev = client.get("/api/complaints?sort_by=severity", headers=staff_headers)
    assert res_sev.status_code == 200
    items_sev = res_sev.json()["items"]
    priorities = [it["current_priority"] for it in items_sev]
    # Critical should be first, followed by High, Medium, and Low
    assert priorities[0] == "CRITICAL"
    assert priorities[-1] == "LOW"
    assert priorities.index("CRITICAL") < priorities.index("HIGH") < priorities.index("MEDIUM") < priorities.index("LOW")

    # 2. Query sorted by latest date
    res_date = client.get("/api/complaints?sort_by=latest", headers=staff_headers)
    assert res_date.status_code == 200
    items_date = res_date.json()["items"]
    # The last submitted (HIGH) should be at top when sorted by latest date
    assert items_date[0]["current_priority"] == "HIGH"


def test_gemma_ai_duplicate_similarity_merge_and_trust_level(client, test_setup, db_session):
    """
    Requirement 4:
    When a separate post is made under the same category, Gemma AI checks similarity.
    If similar, the newer post is added as an extension to the older post.
    Trust Level is increased for both accounts accordingly.
    Posts are merged together to avoid duplicate crowding.
    """
    fake = FakeAiProvider(mode="normal")
    set_ai_provider(fake)

    org_id = test_setup["org_id"]
    cat_id = test_setup["cat_id"]

    h1 = {"Authorization": f"Bearer {test_setup['c1_token']}", "X-Organization-Id": str(org_id)}
    h2 = {"Authorization": f"Bearer {test_setup['c2_token']}", "X-Organization-Id": str(org_id)}

    # Citizen 1 records initial trust
    u1_before = db_session.query(User).filter(User.id == test_setup["c1_id"]).first().trust_level
    u2_before = db_session.query(User).filter(User.id == test_setup["c2_id"]).first().trust_level

    # Post 1 by Citizen 1
    post1_res = client.post(
        "/api/complaints",
        json={
            "description": "Massive broken water pipe leaking on Main street junction",
            "category_id": cat_id,
            "location_text": "Main Street & 4th Cross",
            "latitude": 12.9716,
            "longitude": 77.5946,
            "base_severity": "HIGH",
        },
        headers=h1,
    )
    assert post1_res.status_code == 201
    post1 = post1_res.json()
    post1_id = post1["id"]

    # Post 2 by Citizen 2 (same category, matching problem & location)
    post2_res = client.post(
        "/api/complaints",
        json={
            "description": "Similar duplicate water pipe leak broken on Main street junction overflowing",
            "category_id": cat_id,
            "location_text": "Main Street & 4th Cross",
            "latitude": 12.9718,
            "longitude": 77.5948,
            "base_severity": "HIGH",
        },
        headers=h2,
    )
    assert post2_res.status_code == 201
    post2 = post2_res.json()

    # Post 2 was merged into Post 1 as an extension!
    assert post2["is_merged"] is True
    assert post2["id"] == post1_id
    assert post2["merged_into_id"] == post1_id

    # Verify Trust Levels increased for both accounts
    db_session.expire_all()
    u1_after = db_session.query(User).filter(User.id == test_setup["c1_id"]).first().trust_level
    u2_after = db_session.query(User).filter(User.id == test_setup["c2_id"]).first().trust_level

    # Initial reporter got +15 points, contributor got +10 points
    assert u1_after >= u1_before + 15
    assert u2_after >= u2_before + 10


def test_complaint_chronological_timeline_newer_at_top(client, test_setup):
    """
    Requirement 3:
    When viewing a request, staff and citizens see all pictures, locations, and text
    uploaded about that request from different people, organized in the order of when
    the data was updated, Newer data at the top.
    """
    org_id = test_setup["org_id"]
    h1 = {"Authorization": f"Bearer {test_setup['c1_token']}", "X-Organization-Id": str(org_id)}
    h2 = {"Authorization": f"Bearer {test_setup['c2_token']}", "X-Organization-Id": str(org_id)}
    staff_h = {"Authorization": f"Bearer {test_setup['staff_token']}", "X-Organization-Id": str(org_id)}

    # Citizen 1 creates initial complaint
    c_res = client.post(
        "/api/complaints",
        json={
            "description": "Initial report: Street light flickers and goes dark",
            "location_text": "Pole 42, 2nd Avenue",
            "latitude": 12.9500,
            "longitude": 77.5800,
            "base_severity": "MEDIUM",
        },
        headers=h1,
    )
    comp_id = c_res.json()["id"]

    # Citizen 2 contributes extra information / update
    client.post(
        f"/api/complaints/{comp_id}/extra-info",
        json={
            "information": "Update from Citizen 2: The entire street light fixture has now fallen down completely.",
            "updated_location": "Pole 42, 2nd Avenue (near corner shop)",
            "latitude": 12.9502,
            "longitude": 77.5801,
        },
        headers=h2,
    )

    # Fetch complaint detail
    detail_res = client.get(f"/api/complaints/{comp_id}", headers=staff_h)
    assert detail_res.status_code == 200
    detail = detail_res.json()

    assert "timeline_entries" in detail
    entries = detail["timeline_entries"]
    assert len(entries) >= 2

    # Verify that newer data is at the top (descending timestamp order)
    top_entry = entries[0]
    bottom_entry = entries[-1]

    assert "Citizen 2" in top_entry["text"] or top_entry["author_name"] == "Citizen Two"
    assert bottom_entry["entry_type"] == "INITIAL_REPORT"
    assert "Initial report" in bottom_entry["text"]

    # Verify timestamp ordering: top entry timestamp >= bottom entry timestamp
    assert top_entry["timestamp"] >= bottom_entry["timestamp"]
