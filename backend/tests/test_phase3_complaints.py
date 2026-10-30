import io
import pytest


@pytest.fixture
def org_and_users(client):
    # Register Org Admin
    admin_res = client.post(
        "/api/auth/register",
        json={
            "email": "orgadmin@muni.gov",
            "password": "AdminPassword123!",
            "full_name": "Org Administrator",
        },
    ).json()
    admin_token = admin_res["token"]

    # Create Org
    org = client.post(
        "/api/organizations",
        json={
            "name": "Phase 3 Municipality",
            "slug": "p3-muni",
            "type": "MUNICIPALITY",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    org_id = org["id"]

    # Register Staff
    staff_res = client.post(
        "/api/auth/register",
        json={
            "email": "staff1@muni.gov",
            "password": "StaffPassword123!",
            "full_name": "Field Staff",
            "organization_id": org_id,
            "role": "STAFF",
        },
    ).json()
    staff_token = staff_res["token"]

    # Register Citizen
    citizen_res = client.post(
        "/api/auth/register",
        json={
            "email": "citizen1@muni.gov",
            "password": "CitizenPassword123!",
            "full_name": "Citizen User",
            "organization_id": org_id,
            "role": "CITIZEN",
        },
    ).json()
    citizen_token = citizen_res["token"]

    return {
        "org_id": org_id,
        "admin_token": admin_token,
        "staff_token": staff_token,
        "citizen_token": citizen_token,
        "citizen_id": citizen_res["user"]["id"],
    }


def test_categories_teams_and_routing(client, org_and_users):
    org_id = org_and_users["org_id"]
    admin_headers = {
        "Authorization": f"Bearer {org_and_users['admin_token']}",
        "X-Organization-Id": str(org_id),
    }

    # Create category
    cat_res = client.post(
        "/api/categories",
        json={"name": "Drainage", "description": "Blocked drains and stormwater"},
        headers=admin_headers,
    )
    assert cat_res.status_code == 201
    cat_id = cat_res.json()["id"]

    # Create team
    team_res = client.post(
        "/api/teams",
        json={"name": "Sanitation & Drainage Team", "description": "Maintenance crew"},
        headers=admin_headers,
    )
    assert team_res.status_code == 201
    team_id = team_res.json()["id"]

    # Map category to team
    map_res = client.post(
        "/api/category-team-maps",
        json={"category_id": cat_id, "team_id": team_id},
        headers=admin_headers,
    )
    assert map_res.status_code == 201

    # Citizen submits complaint with mapped category
    citizen_headers = {
        "Authorization": f"Bearer {org_and_users['citizen_token']}",
        "X-Organization-Id": str(org_id),
    }
    comp_res = client.post(
        "/api/complaints",
        json={
            "description": "Drain overflow on 5th cross road",
            "category_id": cat_id,
            "location_text": "5th Cross, Ward 12",
            "base_severity": "HIGH",
        },
        headers=citizen_headers,
    )
    assert comp_res.status_code == 201
    comp_data = comp_res.json()
    assert comp_data["routing_result"] == "ROUTED"
    assert comp_data["assigned_team_id"] == team_id
    assert comp_data["public_reference_number"].startswith("CF-")
    assert len(comp_data["history"]) == 1
    assert comp_data["history"][0]["new_value"] == "SUBMITTED"

    # Submit complaint without category -> AUTHORITY_NOT_IDENTIFIED
    unrouted_res = client.post(
        "/api/complaints",
        json={
            "description": "Unknown noise in the area",
            "location_text": "Near market clocktower",
        },
        headers=citizen_headers,
    )
    assert unrouted_res.status_code == 201
    assert unrouted_res.json()["routing_result"] == "AUTHORITY_NOT_IDENTIFIED"
    assert unrouted_res.json()["assigned_team_id"] is None


def test_complaint_status_transitions_and_reopen(client, org_and_users):
    org_id = org_and_users["org_id"]
    citizen_headers = {
        "Authorization": f"Bearer {org_and_users['citizen_token']}",
        "X-Organization-Id": str(org_id),
    }
    staff_headers = {
        "Authorization": f"Bearer {org_and_users['staff_token']}",
        "X-Organization-Id": str(org_id),
    }

    # Citizen submits complaint
    comp = client.post(
        "/api/complaints",
        json={
            "description": "Broken street lamp blinking continuously",
            "location_text": "Main Street pole 14",
            "base_severity": "LOW",
        },
        headers=citizen_headers,
    ).json()
    comp_id = comp["id"]

    # Invalid jump: SUBMITTED -> RESOLVED must fail
    bad_jump = client.patch(
        f"/api/complaints/{comp_id}/status",
        json={"status": "RESOLVED"},
        headers=staff_headers,
    )
    assert bad_jump.status_code == 400
    assert bad_jump.json()["code"] == "INVALID_STATUS_TRANSITION"

    # Citizen trying to approve/reject -> 403
    citizen_jump = client.patch(
        f"/api/complaints/{comp_id}/status",
        json={"status": "UNDER_REVIEW"},
        headers=citizen_headers,
    )
    assert citizen_jump.status_code == 403

    # Staff updates to UNDER_REVIEW
    s1 = client.patch(
        f"/api/complaints/{comp_id}/status",
        json={"status": "UNDER_REVIEW", "notes": "Staff reviewing location."},
        headers=staff_headers,
    )
    assert s1.status_code == 200
    assert s1.json()["status"] == "UNDER_REVIEW"

    # Staff updates to IN_PROGRESS
    s2 = client.patch(
        f"/api/complaints/{comp_id}/status",
        json={"status": "IN_PROGRESS", "notes": "Crew dispatched to site."},
        headers=staff_headers,
    )
    assert s2.status_code == 200
    assert s2.json()["status"] == "IN_PROGRESS"

    # Staff updates to RESOLVED
    s3 = client.patch(
        f"/api/complaints/{comp_id}/status",
        json={"status": "RESOLVED", "notes": "Bulb replaced and fixture tested."},
        headers=staff_headers,
    )
    assert s3.status_code == 200
    assert s3.json()["status"] == "RESOLVED"

    # Reporter reopens the complaint
    reopen_res = client.post(
        f"/api/complaints/{comp_id}/reopen",
        json={"reason": "Light is blinking again tonight."},
        headers=citizen_headers,
    )
    assert reopen_res.status_code == 200
    assert reopen_res.json()["status"] == "REOPENED"
    # Verify history recorded
    detail = client.get(f"/api/complaints/{comp_id}", headers=citizen_headers).json()
    history_fields = [h["new_value"] for h in detail["history"] if h["field"] == "status"]
    assert "REOPENED" in history_fields


def test_evidence_upload_and_validation(client, org_and_users):
    org_id = org_and_users["org_id"]
    citizen_headers = {
        "Authorization": f"Bearer {org_and_users['citizen_token']}",
        "X-Organization-Id": str(org_id),
    }

    comp = client.post(
        "/api/complaints",
        json={
            "description": "Pothole damaging vehicle tires",
            "location_text": "Sector 4 crossroads",
        },
        headers=citizen_headers,
    ).json()
    comp_id = comp["id"]

    # 1. Valid image upload
    file_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRsampleimagecontent"
    upload_res = client.post(
        f"/api/complaints/{comp_id}/evidence",
        files={"file": ("pothole.png", io.BytesIO(file_bytes), "image/png")},
        headers=citizen_headers,
    )
    assert upload_res.status_code == 201
    evidence_data = upload_res.json()
    assert evidence_data["original_name"] == "pothole.png"
    assert evidence_data["content_type"] == "image/png"
    assert "file_hash" in evidence_data
    evidence_id = evidence_data["id"]

    # Download evidence
    download_res = client.get(
        f"/api/complaints/{comp_id}/evidence/{evidence_id}/download",
        headers=citizen_headers,
    )
    assert download_res.status_code == 200
    assert download_res.content == file_bytes

    # 2. Reject disallowed file type (.exe)
    bad_type_res = client.post(
        f"/api/complaints/{comp_id}/evidence",
        files={"file": ("malicious.exe", io.BytesIO(b"binary"), "application/octet-stream")},
        headers=citizen_headers,
    )
    assert bad_type_res.status_code == 400
    assert bad_type_res.json()["code"] in ["INVALID_FILE_TYPE", "INVALID_MIME_TYPE"]

    # 3. Reject oversized file
    large_payload = b"A" * (11 * 1024 * 1024)  # 11MB
    large_res = client.post(
        f"/api/complaints/{comp_id}/evidence",
        files={"file": ("large.png", io.BytesIO(large_payload), "image/png")},
        headers=citizen_headers,
    )
    assert large_res.status_code == 400
    assert large_res.json()["code"] == "FILE_TOO_LARGE"
