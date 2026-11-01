import datetime
import pytest
from backend.app.models import Complaint, User


@pytest.fixture
def portal_setup(client):
    # Register Admin
    admin_res = client.post(
        "/api/auth/register",
        json={"email": "enh_admin@civicfix.org", "password": "Password123!", "full_name": "Enhance Admin"},
    ).json()
    admin_token = admin_res["token"]

    # Create Organization
    org_res = client.post(
        "/api/organizations",
        json={"name": "Enhance Municipality", "slug": "enhance-muni", "type": "MUNICIPALITY"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    org_id = org_res["id"]

    # Register Citizen A (Reporter)
    cit_a_res = client.post(
        "/api/auth/register",
        json={"email": "enh_cit_a@civicfix.org", "password": "Password123!", "full_name": "Citizen Alice", "organization_id": org_id, "role": "CITIZEN"},
    ).json()

    # Register Citizen B (Neighbor)
    cit_b_res = client.post(
        "/api/auth/register",
        json={"email": "enh_cit_b@civicfix.org", "password": "Password123!", "full_name": "Citizen Bob", "organization_id": org_id, "role": "CITIZEN"},
    ).json()

    # Register Staff Dave
    staff_res = client.post(
        "/api/auth/register",
        json={"email": "enh_staff_dave@civicfix.org", "password": "Password123!", "full_name": "Staff Dave", "organization_id": org_id, "role": "STAFF"},
    ).json()

    # Create Category
    cat_res = client.post(
        "/api/categories",
        json={"name": "Electrical Safety", "description": "Power lines, sparking cables and transformer issues", "target_resolution_hours": 24},
        headers={"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)},
    ).json()

    return {
        "org_id": org_id,
        "admin_token": admin_token,
        "cit_a_token": cit_a_res["token"],
        "cit_a_id": cit_a_res["user"]["id"],
        "cit_b_token": cit_b_res["token"],
        "cit_b_id": cit_b_res["user"]["id"],
        "staff_token": staff_res["token"],
        "staff_id": staff_res["user"]["id"],
        "cat_id": cat_res["id"],
    }


def test_citizen_cannot_verify_own_submission(client, portal_setup):
    org_id = portal_setup["org_id"]
    cit_a_headers = {"Authorization": f"Bearer {portal_setup['cit_a_token']}", "X-Organization-Id": str(org_id)}
    cit_b_headers = {"Authorization": f"Bearer {portal_setup['cit_b_token']}", "X-Organization-Id": str(org_id)}

    # Citizen A submits complaint without setting severity
    c_res = client.post(
        "/api/complaints",
        json={
            "description": "High voltage wire snapped and sparking onto wet pavement",
            "location_text": "Park Street Crossing",
            "category_id": portal_setup["cat_id"],
        },
        headers=cit_a_headers,
    )
    assert c_res.status_code == 201
    comp = c_res.json()
    comp_id = comp["id"]

    # AI hazard assessment automatically evaluated sparking wire as CRITICAL
    assert comp["current_priority"] == "CRITICAL"
    assert comp["priority_manually_set"] is False

    # Citizen A attempts to verify their own complaint -> must be rejected
    v_own = client.post(
        f"/api/complaints/{comp_id}/verifications",
        json={"answer": "STILL_EXISTS", "notes": "I reported this"},
        headers=cit_a_headers,
    )
    assert v_own.status_code == 400
    assert v_own.json()["code"] == "CANNOT_VERIFY_OWN_REPORT"

    # Citizen B (neighbor) CAN verify
    v_b = client.post(
        f"/api/complaints/{comp_id}/verifications",
        json={"answer": "STILL_EXISTS", "notes": "Confirmed danger in neighborhood"},
        headers=cit_b_headers,
    )
    assert v_b.status_code == 201
    assert v_b.json()["counts"]["STILL_EXISTS"] == 1


def test_staff_verification_valid_awards_points_and_closes_citizen_verification(client, portal_setup, db_session):
    org_id = portal_setup["org_id"]
    cit_a_headers = {"Authorization": f"Bearer {portal_setup['cit_a_token']}", "X-Organization-Id": str(org_id)}
    cit_b_headers = {"Authorization": f"Bearer {portal_setup['cit_b_token']}", "X-Organization-Id": str(org_id)}
    staff_headers = {"Authorization": f"Bearer {portal_setup['staff_token']}", "X-Organization-Id": str(org_id)}

    # Citizen A starts with trust 50
    user_a = db_session.query(User).filter(User.id == portal_setup["cit_a_id"]).first()
    assert user_a.trust_level == 50

    # Submit complaint
    c_res = client.post(
        "/api/complaints",
        json={"description": "Broken sidewalk flagstone creating trip hazard", "location_text": "Front Walk"},
        headers=cit_a_headers,
    )
    comp_id = c_res.json()["id"]

    # Staff member verifies as valid report on-site without needing evidence upload
    v_res = client.post(
        f"/api/complaints/{comp_id}/staff-verify",
        json={"is_valid": True, "notes": "On-site inspection completed. Genuine broken flagstone verified."},
        headers=staff_headers,
    )
    assert v_res.status_code == 200
    comp_data = v_res.json()
    assert comp_data["is_staff_verified"] is True
    assert "Genuine broken flagstone verified" in comp_data["staff_verification_notes"]
    assert comp_data["status"] == "IN_PROGRESS"

    # Trust points awarded: 50 + 15 = 65
    db_session.refresh(user_a)
    assert user_a.trust_level == 65

    # Once staff verified, community verification is closed
    v_cit = client.post(
        f"/api/complaints/{comp_id}/verifications",
        json={"answer": "STILL_EXISTS"},
        headers=cit_b_headers,
    )
    assert v_cit.status_code == 400
    assert v_cit.json()["code"] == "VERIFICATION_CLOSED"


def test_staff_verification_false_penalizes_citizen(client, portal_setup, db_session):
    org_id = portal_setup["org_id"]
    cit_a_headers = {"Authorization": f"Bearer {portal_setup['cit_a_token']}", "X-Organization-Id": str(org_id)}
    staff_headers = {"Authorization": f"Bearer {portal_setup['staff_token']}", "X-Organization-Id": str(org_id)}

    user_a = db_session.query(User).filter(User.id == portal_setup["cit_a_id"]).first()
    user_a.trust_level = 60
    db_session.commit()

    # Submit complaint
    c_res = client.post(
        "/api/complaints",
        json={"description": "Completely made up fictional sinkhole", "location_text": "Imaginary Lane"},
        headers=cit_a_headers,
    )
    comp_id = c_res.json()["id"]

    # Staff determines report is false/fabricated
    v_res = client.post(
        f"/api/complaints/{comp_id}/staff-verify",
        json={"is_valid": False, "notes": "No sinkhole or defect found at given coordinates. Fabricated report."},
        headers=staff_headers,
    )
    assert v_res.status_code == 200
    comp_data = v_res.json()
    assert comp_data["is_staff_verified"] is True
    assert comp_data["status"] == "REJECTED"

    # Citizen penalized by 30 points: 60 - 30 = 30
    db_session.refresh(user_a)
    assert user_a.trust_level == 30


def test_staff_priority_override_and_work_notes(client, portal_setup):
    org_id = portal_setup["org_id"]
    cit_a_headers = {"Authorization": f"Bearer {portal_setup['cit_a_token']}", "X-Organization-Id": str(org_id)}
    staff_headers = {"Authorization": f"Bearer {portal_setup['staff_token']}", "X-Organization-Id": str(org_id)}

    # Citizen submits complaint
    c_res = client.post(
        "/api/complaints",
        json={"description": "Small graffiti on park bench", "location_text": "Park Lawn"},
        headers=cit_a_headers,
    )
    comp_id = c_res.json()["id"]
    assert c_res.json()["current_priority"] in ("LOW", "MEDIUM")

    # Staff overrides priority to HIGH with note
    prio_res = client.patch(
        f"/api/complaints/{comp_id}/priority",
        json={"priority": "HIGH", "notes": "Offensive content requires priority removal"},
        headers=staff_headers,
    )
    assert prio_res.status_code == 200
    assert prio_res.json()["current_priority"] == "HIGH"
    assert prio_res.json()["priority_manually_set"] is True

    # Staff adds work note
    note_res = client.post(
        f"/api/complaints/{comp_id}/notes",
        json={"notes": "Specialized cleaning solvents requested from depot."},
        headers=staff_headers,
    )
    assert note_res.status_code == 200
    timeline = note_res.json()["timeline_entries"]
    assert any("cleaning solvents" in (t.get("text", "") or "") or "cleaning solvents" in (t.get("notes", "") or "") for t in timeline)


def test_citizen_blocked_from_extra_evidence_after_staff_verification(client, portal_setup):
    """
    Once a report is verified by staff on-site:
    - Community verification is closed.
    - Citizens cannot submit extra information/photos to inflate trust points.
    - Citizens cannot upload additional evidence files.
    """
    org_id = portal_setup["org_id"]
    cit_a_headers = {"Authorization": f"Bearer {portal_setup['cit_a_token']}", "X-Organization-Id": str(org_id)}
    cit_b_headers = {"Authorization": f"Bearer {portal_setup['cit_b_token']}", "X-Organization-Id": str(org_id)}
    staff_headers = {"Authorization": f"Bearer {portal_setup['staff_token']}", "X-Organization-Id": str(org_id)}

    # Citizen A submits complaint
    c_res = client.post(
        "/api/complaints",
        json={"description": "Fallen tree limb across bicycle pathway", "location_text": "Bike Path North"},
        headers=cit_a_headers,
    )
    comp_id = c_res.json()["id"]

    # Staff verifies on-site
    v_res = client.post(
        f"/api/complaints/{comp_id}/staff-verify",
        json={"is_valid": True, "notes": "Tree obstruction confirmed and work crew scheduled."},
        headers=staff_headers,
    )
    assert v_res.status_code == 200
    assert v_res.json()["is_staff_verified"] is True

    # Citizen tries to add extra info after staff verification -> 400 VERIFICATION_CLOSED
    extra_res = client.post(
        f"/api/complaints/{comp_id}/extra-info",
        json={"information": "Adding extra details to get more trust points"},
        headers=cit_b_headers,
    )
    assert extra_res.status_code == 400
    assert extra_res.json()["code"] == "VERIFICATION_CLOSED"

    # Citizen tries to upload evidence after staff verification -> 400 VERIFICATION_CLOSED
    files = {"file": ("limb.png", b"\x89PNG\r\n\x1a\nFakePngBytes", "image/png")}
    upload_res = client.post(
        f"/api/complaints/{comp_id}/evidence",
        files=files,
        headers=cit_b_headers,
    )
    assert upload_res.status_code == 400
    assert upload_res.json()["code"] == "VERIFICATION_CLOSED"

