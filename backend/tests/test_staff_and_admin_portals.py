import pytest
from backend.app.models import User, RoleEnum, AuditLog, CitizenAppeal, TrustScoreHistory
from backend.app.services.ai.factory import set_ai_provider
from backend.app.services.ai.fake_provider import FakeAiProvider


@pytest.fixture
def portal_setup(client):
    # Register Admin
    admin_res = client.post(
        "/api/auth/register",
        json={
            "email": "org_admin_portal@metro.gov",
            "password": "Password123!",
            "full_name": "Portal Admin",
        },
    ).json()
    admin_token = admin_res["token"]

    # Create Organization
    org = client.post(
        "/api/organizations",
        json={
            "name": "Portal Municipal Corp",
            "slug": "portal-muni-corp",
            "type": "MUNICIPALITY",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    org_id = org["id"]

    # Create Department/Team
    team_res = client.post(
        "/api/teams",
        json={"name": "Water Engineering", "description": "Municipal water pipeline repairs"},
        headers={"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)},
    ).json()
    team_id = team_res["id"]

    # Create Category mapped to Team
    cat_res = client.post(
        "/api/categories",
        json={"name": "Water Pipe Leaks", "description": "Drinking water leaks"},
        headers={"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)},
    ).json()
    cat_id = cat_res["id"]

    client.post(
        "/api/teams/category-team-maps",
        json={"category_id": cat_id, "team_id": team_id},
        headers={"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)},
    )

    # Register Staff Member
    staff_res = client.post(
        "/api/auth/register",
        json={
            "email": "field_staff@metro.gov",
            "password": "Password123!",
            "full_name": "Field Officer Dave",
            "organization_id": org_id,
            "role": "STAFF",
        },
    ).json()
    staff_token = staff_res["token"]
    staff_id = staff_res["user"]["id"]

    # Assign Department to Staff member
    # Find membership ID
    mems = client.get(
        f"/api/organizations/{org_id}/memberships",
        headers={"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)},
    ).json()["items"]
    staff_mem = next(m for m in mems if m["user_id"] == staff_id)

    client.patch(
        f"/api/organizations/{org_id}/memberships/{staff_mem['id']}",
        json={"team_id": team_id, "role": "STAFF"},
        headers={"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)},
    )

    # Register Citizen
    citizen_res = client.post(
        "/api/auth/register",
        json={
            "email": "citizen_alice@metro.gov",
            "password": "Password123!",
            "full_name": "Citizen Alice",
            "organization_id": org_id,
            "role": "CITIZEN",
        },
    ).json()
    citizen_token = citizen_res["token"]
    citizen_id = citizen_res["user"]["id"]

    return {
        "org_id": org_id,
        "team_id": team_id,
        "cat_id": cat_id,
        "admin_token": admin_token,
        "staff_token": staff_token,
        "staff_id": staff_id,
        "citizen_token": citizen_token,
        "citizen_id": citizen_id,
    }


def test_staff_portal_dashboard_and_assignment_workflow(client, portal_setup, db_session):
    admin_token = portal_setup["admin_token"]
    staff_token = portal_setup["staff_token"]
    staff_id = portal_setup["staff_id"]
    citizen_token = portal_setup["citizen_token"]
    org_id = portal_setup["org_id"]
    cat_id = portal_setup["cat_id"]
    team_id = portal_setup["team_id"]

    staff_headers = {"Authorization": f"Bearer {staff_token}", "X-Organization-Id": str(org_id)}
    admin_headers = {"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)}
    citizen_headers = {"Authorization": f"Bearer {citizen_token}", "X-Organization-Id": str(org_id)}

    # Citizen submits complaint
    comp_res = client.post(
        "/api/complaints",
        json={
            "description": "Burst main pipe leaking large volume of water on 5th avenue",
            "location_text": "5th Avenue corner",
            "category_id": cat_id,
            "base_severity": "HIGH",
        },
        headers=citizen_headers,
    )
    assert comp_res.status_code in (200, 201)
    comp_id = comp_res.json()["id"]

    # Admin assigns complaint to staff Dave
    assign_res = client.post(
        f"/api/complaints/{comp_id}/assign",
        json={"team_id": team_id, "user_id": staff_id, "notes": "Investigate immediately"},
        headers=admin_headers,
    )
    assert assign_res.status_code == 200
    assert assign_res.json()["assigned_user_id"] == staff_id
    assert assign_res.json()["status"] == "ASSIGNED"

    # Staff tests staff dashboard metrics endpoint
    dash_res = client.get("/api/reports/staff-dashboard", headers=staff_headers)
    assert dash_res.status_code == 200
    dash_data = dash_res.json()
    assert dash_data["open_complaints_count"] >= 1
    assert dash_data["assigned_complaints_count"] >= 1
    assert len(dash_data["recent_activity"]) >= 1

    # Staff tests "My Assignments" query: assigned_to_me=true
    my_assigned_res = client.get("/api/complaints?assigned_to_me=true", headers=staff_headers)
    assert my_assigned_res.status_code == 200
    my_items = my_assigned_res.json()["items"]
    assert any(c["id"] == comp_id for c in my_items)

    # Staff searches complaints by keyword
    search_res = client.get("/api/complaints?search=burst+main", headers=staff_headers)
    assert search_res.status_code == 200
    assert len(search_res.json()["items"]) >= 1

    # Staff adds a work note
    note_res = client.post(
        f"/api/complaints/{comp_id}/notes",
        json={"notes": "Field inspection confirmed ruptured valve. Replacement parts dispatched."},
        headers=staff_headers,
    )
    assert note_res.status_code == 200
    detail = note_res.json()
    # Work note is logged in both history and timeline_entries
    history = detail.get("history", [])
    timeline = detail.get("timeline_entries", [])
    found_in_history = any("ruptured valve" in (h.get("new_value", "") or "") or "ruptured valve" in (h.get("notes", "") or "") for h in history)
    found_in_timeline = any("ruptured valve" in (t.get("text", "") or "") or "ruptured valve" in (t.get("notes", "") or "") for t in timeline)
    assert found_in_history or found_in_timeline, f"Work note not found in history or timeline_entries"

    # Staff updates status to IN_PROGRESS
    status_res = client.patch(
        f"/api/complaints/{comp_id}/status",
        json={"status": "IN_PROGRESS", "notes": "Work commenced on valve replacement"},
        headers=staff_headers,
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "IN_PROGRESS"


def test_admin_staff_management(client, portal_setup):
    admin_token = portal_setup["admin_token"]
    org_id = portal_setup["org_id"]
    team_id = portal_setup["team_id"]
    admin_headers = {"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)}

    # Register a new user
    new_user = client.post(
        "/api/auth/register",
        json={
            "email": "new_mechanic@metro.gov",
            "password": "Password123!",
            "full_name": "Sam Mechanic",
        },
    ).json()
    new_user_id = new_user["user"]["id"]

    # Admin adds staff and assigns department
    add_staff_res = client.post(
        f"/api/organizations/{org_id}/memberships",
        json={"user_id": new_user_id, "role": "STAFF", "team_id": team_id},
        headers=admin_headers,
    )
    assert add_staff_res.status_code == 201
    assert add_staff_res.json()["role"] == "STAFF"
    assert add_staff_res.json()["team_id"] == team_id
    assert add_staff_res.json()["team_name"] == "Water Engineering"


def test_citizen_trust_management_and_gemma_analysis(client, portal_setup, db_session):
    admin_token = portal_setup["admin_token"]
    citizen_token = portal_setup["citizen_token"]
    citizen_id = portal_setup["citizen_id"]
    org_id = portal_setup["org_id"]
    cat_id = portal_setup["cat_id"]

    admin_headers = {"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)}
    citizen_headers = {"Authorization": f"Bearer {citizen_token}", "X-Organization-Id": str(org_id)}

    # Set Fake Gemma Provider
    fake_ai = FakeAiProvider(mode="normal")
    set_ai_provider(fake_ai)

    # Citizen submits complaint
    client.post(
        "/api/complaints",
        json={
            "description": "Indiranagar water pipeline maintenance check requested",
            "location_text": "Indiranagar 100ft road",
            "category_id": cat_id,
        },
        headers=citizen_headers,
    )

    # 1. Admin views citizen list
    cit_list_res = client.get("/api/trust/citizens", headers=admin_headers)
    assert cit_list_res.status_code == 200
    c_item = next(c for c in cit_list_res.json() if c["user_id"] == citizen_id)
    assert c_item["account_status"] == "ACTIVE"
    assert c_item["report_count"] >= 1

    # 2. Admin views citizen detail
    detail_res = client.get(f"/api/trust/citizens/{citizen_id}", headers=admin_headers)
    assert detail_res.status_code == 200
    assert len(detail_res.json()["reports"]) >= 1

    # 3. Gemma Pattern Analysis (must not auto-ban citizen)
    gemma_res = client.post(f"/api/trust/citizens/{citizen_id}/gemma-analyze", headers=admin_headers)
    assert gemma_res.status_code == 200
    gemma_data = gemma_res.json()
    assert "disclaimer" in gemma_data
    assert gemma_data["is_ai_suggestion"] is True
    # Verify citizen account is still ACTIVE (Gemma does not make final decision or auto-ban)
    user_check = db_session.query(User).filter(User.id == citizen_id).first()
    assert user_check.account_status == "ACTIVE"

    # 4. Admin manual score adjustment with mandatory reason
    adj_res = client.post(
        f"/api/trust/citizens/{citizen_id}/adjust-score",
        json={"change_amount": 15, "reason": "Consistent accurate location details provided"},
        headers=admin_headers,
    )
    assert adj_res.status_code == 200
    # Audit log check
    audit = db_session.query(AuditLog).filter(AuditLog.action == "TRUST_SCORE_ADJUSTED").first()
    assert audit is not None

    # 5. Admin restricts account with mandatory reason
    restrict_res = client.post(
        f"/api/trust/citizens/{citizen_id}/status",
        json={"account_status": "RESTRICTED", "reason": "Repeated submissions flagged for review"},
        headers=admin_headers,
    )
    assert restrict_res.status_code == 200
    user_check = db_session.query(User).filter(User.id == citizen_id).first()
    assert user_check.account_status == "RESTRICTED"

    # 6. Citizen submits appeal
    appeal_res = client.post(
        "/api/trust/appeals",
        json={"reason": "My submissions were genuine reports of two different pipeline joints."},
        headers=citizen_headers,
    )
    assert appeal_res.status_code == 201
    appeal_id = appeal_res.json()["id"]

    # 7. Admin reviews and approves appeal
    review_res = client.post(
        f"/api/trust/appeals/{appeal_id}/review",
        json={"status": "APPROVED", "admin_notes": "Verified reports were for separate joints. Restored account."},
        headers=admin_headers,
    )
    assert review_res.status_code == 200

    # User restored to ACTIVE
    db_session.refresh(user_check)
    assert user_check.account_status == "ACTIVE"


def test_trust_score_rules_no_penalty_for_unresolved(client, portal_setup):
    admin_token = portal_setup["admin_token"]
    org_id = portal_setup["org_id"]
    admin_headers = {"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)}

    # Get rules
    rules_res = client.get("/api/trust/rules", headers=admin_headers)
    assert rules_res.status_code == 200
    rules = rules_res.json()
    assert rules["unresolved_unverified_penalty"] == 0

    # Attempt to post a penalty for unresolved reports (must be forced to 0)
    update_res = client.post(
        "/api/trust/rules",
        json={
            "report_quality_bonus": 20,
            "duplicate_extension_bonus": 10,
            "verification_outcome_bonus": 5,
            "confirmed_abuse_penalty": 40,
            "unresolved_unverified_penalty": 15,  # Trying to set penalty
        },
        headers=admin_headers,
    )
    assert update_res.status_code == 200
    # Must remain 0
    assert update_res.json()["unresolved_unverified_penalty"] == 0


def test_disaster_mode_admin_only_access(client, portal_setup):
    admin_token = portal_setup["admin_token"]
    staff_token = portal_setup["staff_token"]
    org_id = portal_setup["org_id"]

    admin_headers = {"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)}
    staff_headers = {"Authorization": f"Bearer {staff_token}", "X-Organization-Id": str(org_id)}

    # Staff cannot activate disaster
    staff_disaster = client.post(
        "/api/disaster-events",
        json={"name": "Flash Flood", "type": "FLOOD", "scope": "ORGANIZATION", "is_simulated": True},
        headers=staff_headers,
    )
    assert staff_disaster.status_code == 403

    # Admin activates disaster
    admin_disaster = client.post(
        "/api/disaster-events",
        json={"name": "Flash Flood Emergency", "type": "FLOOD", "scope": "ORGANIZATION", "is_simulated": True},
        headers=admin_headers,
    )
    assert admin_disaster.status_code == 201
    event_id = admin_disaster.json()["id"]

    # Priority history is recorded
    hist_res = client.get("/api/priority-history", headers=admin_headers)
    assert hist_res.status_code == 200

    # Admin ends disaster event
    end_res = client.post(f"/api/disaster-events/{event_id}/end", headers=admin_headers)
    assert end_res.status_code == 200
    assert end_res.json()["state"] == "ENDED"
