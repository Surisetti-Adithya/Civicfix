"""
Phase 9: Integrated Demo Scenario Tests.

Each test is self-contained: it creates its own users, organizations,
categories, teams, routing maps, and complaints via the API. No seeded
data is required.
"""
import datetime

import pytest
from backend.app.models import (
    Complaint,
    EscalationRecord,
    DeadlineRule,
    EscalationRule,
    PriorityHistory,
    DisasterEvent,
    RoleEnum,
    ComplaintStatusEnum,
    EscalationStateEnum,
    DisasterStateEnum,
    SeverityEnum,
)
from backend.app.services.ai.fake_provider import FakeAiProvider
from backend.app.services.ai.factory import set_ai_provider


# ---------------------------------------------------------------------------
# Helpers: register a user, create an org, add memberships, categories, teams
# ---------------------------------------------------------------------------

def _register(client, email, full_name, password="CivicFixDemo2026!"):
    res = client.post(
        "/api/auth/register",
        json={"email": email, "full_name": full_name, "password": password},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _login(client, email, org_id=None, password="CivicFixDemo2026!"):
    payload = {"email": email, "password": password}
    if org_id:
        payload["organization_id"] = org_id
    res = client.post("/api/auth/login", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    return data["token"], data


def _headers(token, org_id):
    return {"Authorization": f"Bearer {token}", "X-Organization-Id": str(org_id)}


def _create_org(client, headers, name, slug, org_type, time_zone="Asia/Kolkata"):
    res = client.post(
        "/api/organizations",
        json={"name": name, "slug": slug, "type": org_type, "time_zone": time_zone},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


def _add_member(client, headers, org_id, user_id, role):
    res = client.post(
        f"/api/organizations/{org_id}/memberships",
        json={"user_id": user_id, "role": role},
        headers=headers,
    )
    assert res.status_code in (200, 201), res.text
    return res.json()


def _create_category(client, headers, name, description=""):
    res = client.post(
        "/api/categories",
        json={"name": name, "description": description},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


def _create_team(client, headers, name, description=""):
    res = client.post(
        "/api/teams",
        json={"name": name, "description": description},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


def _create_routing(client, headers, category_id, team_id):
    res = client.post(
        "/api/category-team-maps",
        json={"category_id": category_id, "team_id": team_id},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


def _submit_complaint(client, headers, description, category_id, location_text, severity="MEDIUM"):
    res = client.post(
        "/api/complaints",
        json={
            "description": description,
            "category_id": category_id,
            "location_text": location_text,
            "base_severity": severity,
        },
        headers=headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


def _setup_muni_org(client, db_session):
    """Creates a municipality org with an admin, staff, citizen, categories,
    teams, routing maps, and deadline/escalation rules. Returns a dict of
    useful ids and tokens."""

    # 1. Register three users
    admin_data = _register(client, "sc_admin@demo.gov", "Demo Admin")
    admin_token = admin_data["token"]
    admin_user_id = admin_data["user"]["id"]
    admin_h = _headers(admin_token, 0)  # no org yet, will set later

    staff_data = _register(client, "sc_staff@demo.gov", "Demo Staff")
    staff_user_id = staff_data["user"]["id"]

    citizen_data = _register(client, "sc_citizen@demo.gov", "Demo Citizen")
    citizen_user_id = citizen_data["user"]["id"]

    # 2. Create org (first org creator becomes PLATFORM_ADMIN or gets role)
    org = _create_org(client, admin_h, "Demo Municipality", "demo-muni", "MUNICIPALITY")
    org_id = org["id"]

    # Re-login admin with org context
    admin_token, _ = _login(client, "sc_admin@demo.gov", org_id)
    admin_h = _headers(admin_token, org_id)

    # Add ORG_ADMIN role to admin user (may already be PLATFORM_ADMIN; upgrade)
    # The first user to create an org has PLATFORM_ADMIN. Let's add explicit memberships.
    # Add staff and citizen
    _add_member(client, admin_h, org_id, staff_user_id, "STAFF")
    _add_member(client, admin_h, org_id, citizen_user_id, "CITIZEN")

    # 3. Create categories and teams
    cat_drain = _create_category(client, admin_h, "Drainage", "Clogged drains")
    cat_roads = _create_category(client, admin_h, "Roads", "Potholes and roads")
    cat_lights = _create_category(client, admin_h, "Streetlights", "Lights and signals")

    team_drain = _create_team(client, admin_h, "Drainage Unit", "Drain crews")
    team_roads = _create_team(client, admin_h, "Road Works", "Road crews")
    team_lights = _create_team(client, admin_h, "Electrical Cell", "Electrical maintenance")

    # 4. Routing maps
    _create_routing(client, admin_h, cat_drain["id"], team_drain["id"])
    _create_routing(client, admin_h, cat_roads["id"], team_roads["id"])
    _create_routing(client, admin_h, cat_lights["id"], team_lights["id"])

    # 5. Deadline and escalation rules (directly via db for speed)
    db_session.add(DeadlineRule(
        organization_id=org_id, response_hours=24, resolution_hours=72, mode="NORMAL",
    ))
    db_session.add(EscalationRule(
        organization_id=org_id, level_order=1,
        target_role_or_channel="Ward Supervisor", trigger="RESOLUTION_OVERDUE",
    ))
    db_session.flush()

    # Get tokens for staff and citizen
    staff_token, _ = _login(client, "sc_staff@demo.gov", org_id)
    citizen_token, _ = _login(client, "sc_citizen@demo.gov", org_id)

    return {
        "org_id": org_id,
        "admin_token": admin_token,
        "admin_h": admin_h,
        "admin_user_id": admin_user_id,
        "staff_token": staff_token,
        "staff_h": _headers(staff_token, org_id),
        "staff_user_id": staff_user_id,
        "citizen_token": citizen_token,
        "citizen_h": _headers(citizen_token, org_id),
        "citizen_user_id": citizen_user_id,
        "cat_drain": cat_drain,
        "cat_roads": cat_roads,
        "cat_lights": cat_lights,
        "team_drain": team_drain,
        "team_roads": team_roads,
        "team_lights": team_lights,
    }


# ---------------------------------------------------------------------------
# Scenario A: Blocked drain -- AI improve, AI category, duplicate, submit,
# staff assigns and progresses.
# ---------------------------------------------------------------------------

def test_scenario_a_blocked_drain_flow(client, db_session):
    """Submit a blocked drain complaint.  Gemma improves it and suggests a
    category.  A possible duplicate appears.  Staff assigns and updates."""
    fake = FakeAiProvider(mode="normal")
    set_ai_provider(fake)

    ctx = _setup_muni_org(client, db_session)

    # Citizen creates an existing complaint so duplicates have something to match
    first = _submit_complaint(
        client, ctx["citizen_h"],
        "Drain blocked near 4th cross junction dirty water overflowing onto road",
        ctx["cat_drain"]["id"], "4th Cross Ward 12", "HIGH",
    )

    # -- AI improve description --
    rough_text = "drain choked near 4th cross junction dirty water coming out"
    improve_res = client.post(
        "/api/ai/improve-description",
        json={"description": rough_text},
        headers=ctx["citizen_h"],
    )
    assert improve_res.status_code == 200
    improved_text = improve_res.json()["improved_description"]
    assert improved_text is not None

    # -- AI suggest category --
    cat_res = client.post(
        "/api/ai/suggest-category",
        json={"description": improved_text},
        headers=ctx["citizen_h"],
    )
    assert cat_res.status_code == 200
    suggested_cat_id = cat_res.json()["category_id"]
    assert suggested_cat_id is not None

    # -- Duplicate candidates --
    dup_res = client.post(
        "/api/ai/duplicate-candidates",
        json={
            "description": rough_text,
            "location_text": "4th Cross",
            "category_id": suggested_cat_id,
        },
        headers=ctx["citizen_h"],
    )
    assert dup_res.status_code == 200
    candidates = dup_res.json()["candidates"]
    assert len(candidates) >= 1

    # -- Submit the new complaint --
    comp = _submit_complaint(
        client, ctx["citizen_h"],
        rough_text,
        suggested_cat_id,
        "4th Cross Road",
        "HIGH",
    )
    comp_id = comp["id"]

    # -- Staff assigns --
    assign_res = client.post(
        f"/api/complaints/{comp_id}/assign",
        json={"team_id": ctx["team_drain"]["id"], "notes": "Dispatched crew."},
        headers=ctx["staff_h"],
    )
    assert assign_res.status_code == 200
    assert assign_res.json()["status"] == "ASSIGNED"

    # -- Staff advances to IN_PROGRESS --
    prog_res = client.patch(
        f"/api/complaints/{comp_id}/status",
        json={"status": "IN_PROGRESS", "notes": "Jetting machine in operation."},
        headers=ctx["staff_h"],
    )
    assert prog_res.status_code == 200
    assert prog_res.json()["status"] == "IN_PROGRESS"


# ---------------------------------------------------------------------------
# Scenario B: Simulated flood -- disaster activation, priority reassessment
# ---------------------------------------------------------------------------

def test_scenario_b_simulated_flood_hazard_reassessment(client, db_session):
    """Activate a simulated flood.  A drain complaint rises in priority.
    Priority history records the change."""
    ctx = _setup_muni_org(client, db_session)

    # Citizen creates a drain complaint with MEDIUM severity
    comp = _submit_complaint(
        client, ctx["citizen_h"],
        "Drain clogged causing stagnant water flooding in low-lying area near market",
        ctx["cat_drain"]["id"], "Market Crossing Ward 5", "MEDIUM",
    )
    comp_id = comp["id"]
    assert comp["current_priority"] == "MEDIUM"

    # Admin activates a SIMULATED flood disaster
    flood_res = client.post(
        "/api/disaster-events",
        json={
            "name": "Simulated Monsoon Flood Alert",
            "type": "FLOOD",
            "scope": "ORGANIZATION",
            "is_simulated": True,
        },
        headers=ctx["admin_h"],
    )
    assert flood_res.status_code == 201
    event = flood_res.json()
    assert event["is_simulated"] is True

    # Verify the complaint was reassessed -- its priority should have risen
    detail = client.get(f"/api/complaints/{comp_id}", headers=ctx["staff_h"]).json()
    # During flood, drain-related complaints with stagnant water keywords get HIGH/CRITICAL
    assert detail["current_priority"] in ("HIGH", "CRITICAL")

    # Check priority history
    history = client.get(
        f"/api/priority-history?complaint_id={comp_id}", headers=ctx["staff_h"],
    ).json()
    assert len(history) >= 1
    latest = history[0]
    assert latest["new_priority"] in ("HIGH", "CRITICAL")
    assert "SIMULATED" in latest["reason"]


# ---------------------------------------------------------------------------
# Scenario C: Overdue escalation and evidence pack
# ---------------------------------------------------------------------------

def test_scenario_c_overdue_escalation_and_evidence_pack(client, db_session):
    """A complaint misses its resolution target.  The deadline check marks
    it overdue, creates an escalation record, and the evidence pack is
    exportable."""
    ctx = _setup_muni_org(client, db_session)

    # Citizen submits a complaint
    comp = _submit_complaint(
        client, ctx["citizen_h"],
        "Deep crater pothole breaking car axles on ring road",
        ctx["cat_roads"]["id"], "Outer Ring Road Pillar 44", "HIGH",
    )
    comp_id = comp["id"]

    # Manually backdate the complaint's deadlines to simulate overdue
    db_comp = db_session.query(Complaint).filter(Complaint.id == comp_id).first()
    past = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=5)
    db_comp.response_deadline = past
    db_comp.resolution_deadline = past
    db_comp.status = ComplaintStatusEnum.IN_PROGRESS.value
    db_session.flush()

    # Staff triggers deadline check
    check_res = client.post("/api/deadlines/check", headers=ctx["staff_h"])
    assert check_res.status_code == 200

    # Verify complaint is now overdue
    detail = client.get(f"/api/complaints/{comp_id}", headers=ctx["staff_h"]).json()
    assert detail["is_overdue"] is True

    # Verify escalation record created in PREPARED state
    esc_records = client.get(
        f"/api/escalations/records?complaint_id={comp_id}", headers=ctx["staff_h"],
    ).json()
    assert len(esc_records) >= 1
    assert esc_records[0]["state"] == "PREPARED"
    assert esc_records[0]["submitted_at"] is None

    # Export JSON evidence pack
    pack_res = client.get(
        f"/api/exports/complaints/{comp_id}/json", headers=ctx["staff_h"],
    )
    assert pack_res.status_code == 200
    pack_data = pack_res.json()
    assert "This document is a factual record" in pack_data["disclaimer"]
    assert pack_data["complaint"]["public_reference_number"] == detail["public_reference_number"]


# ---------------------------------------------------------------------------
# Scenario D: Multi-org -- apartment community with separate config
# ---------------------------------------------------------------------------

def test_scenario_d_organization_switching_and_apartment_reporting(client, db_session):
    """Switch to an apartment organization.  A resident reports a water leak.
    The categories, teams, and deadlines differ.  The engine is the same."""
    # -- Set up apartment org --
    admin_data = _register(client, "apt_admin@palm.res", "Apartment Manager")
    admin_token = admin_data["token"]
    admin_h = _headers(admin_token, 0)

    apt_org = _create_org(client, admin_h, "Palm Meadows", "palm-meadows", "APARTMENT")
    apt_org_id = apt_org["id"]

    admin_token, _ = _login(client, "apt_admin@palm.res", apt_org_id)
    admin_h = _headers(admin_token, apt_org_id)

    # Register resident and add membership
    resident_data = _register(client, "apt_res@palm.res", "Deepak Verma")
    resident_user_id = resident_data["user"]["id"]
    _add_member(client, admin_h, apt_org_id, resident_user_id, "CITIZEN")

    # Categories and teams
    cat_plumbing = _create_category(client, admin_h, "Plumbing", "Water supply and pipe leaks")
    cat_lifts = _create_category(client, admin_h, "Lifts and Elevators", "Lift breakdown")

    team_plumbing = _create_team(client, admin_h, "In-House Plumbing Team", "Plumbing staff")
    team_lifts = _create_team(client, admin_h, "Lift AMC Partner", "External lift agency")

    _create_routing(client, admin_h, cat_plumbing["id"], team_plumbing["id"])
    _create_routing(client, admin_h, cat_lifts["id"], team_lifts["id"])

    # Deadline rule
    db_session.add(DeadlineRule(
        organization_id=apt_org_id, response_hours=4, resolution_hours=24, mode="NORMAL",
    ))
    db_session.flush()

    # Login resident
    res_token, login_data = _login(client, "apt_res@palm.res", apt_org_id)
    res_h = _headers(res_token, apt_org_id)

    assert login_data["active_organization"]["type"] == "APARTMENT"

    # Verify categories
    cats = client.get("/api/categories", headers=res_h).json()
    cat_names = [c["name"] for c in cats]
    assert "Plumbing" in cat_names
    assert "Lifts and Elevators" in cat_names

    # Submit leak complaint
    new_comp = _submit_complaint(
        client, res_h,
        "Continuous leak in washbasin pipeline under kitchen cabinet",
        cat_plumbing["id"],
        "Flat 504 Kitchen",
        "MEDIUM",
    )
    assert new_comp["routing_result"] == "ROUTED"
    assert new_comp["assigned_team"]["name"] == "In-House Plumbing Team"
