import datetime
import pytest
from backend.app.models import Complaint, PriorityHistory, ComplaintStatusEnum


@pytest.fixture
def disaster_setup(client, db_session):
    admin = client.post(
        "/api/auth/register",
        json={
            "email": "disaster_admin@muni.gov",
            "password": "Password123!",
            "full_name": "Disaster Admin",
        },
    ).json()
    admin_token = admin["token"]

    org = client.post(
        "/api/organizations",
        json={
            "name": "Disaster Test Org",
            "slug": "disaster-org",
            "type": "MUNICIPALITY",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    org_id = org["id"]

    admin_headers = {"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)}

    # Citizen submits 3 complaints:
    # 1. Normal drain issue
    c1 = client.post(
        "/api/complaints",
        json={"description": "Drain overflowing with rain water on 3rd street", "location_text": "3rd Street", "base_severity": "LOW"},
        headers=admin_headers,
    ).json()

    # 2. Critical hazard (exposed electrical wire near water)
    c2 = client.post(
        "/api/complaints",
        json={"description": "Exposed high voltage wire sparking into stagnant flood water", "location_text": "Main Crossing", "base_severity": "MEDIUM"},
        headers=admin_headers,
    ).json()

    # 3. Already closed complaint (should NOT be reopened or modified)
    c3 = client.post(
        "/api/complaints",
        json={"description": "Past garden cleanup complete", "location_text": "Park lawn", "base_severity": "LOW"},
        headers=admin_headers,
    ).json()

    # Mark c3 as CLOSED
    comp3 = db_session.query(Complaint).filter(Complaint.id == c3["id"]).first()
    comp3.status = ComplaintStatusEnum.CLOSED.value
    db_session.commit()

    return {
        "org_id": org_id,
        "admin_token": admin_token,
        "c1_id": c1["id"],
        "c2_id": c2["id"],
        "c3_id": c3["id"],
    }


def test_disaster_reassessment_and_idempotency(client, disaster_setup, db_session):
    org_id = disaster_setup["org_id"]
    c1_id = disaster_setup["c1_id"]
    c2_id = disaster_setup["c2_id"]
    c3_id = disaster_setup["c3_id"]
    admin_headers = {"Authorization": f"Bearer {disaster_setup['admin_token']}", "X-Organization-Id": str(org_id)}

    # Activate simulated disaster event
    event_res = client.post(
        "/api/disaster-events",
        json={
            "name": "Simulated Monsoon Flash Flood 2026",
            "type": "FLOOD",
            "scope": "ORGANIZATION",
            "is_simulated": True,
        },
        headers=admin_headers,
    )
    assert event_res.status_code == 201
    event_data = event_res.json()
    assert event_data["is_simulated"] is True
    event_id = event_data["id"]

    # Verify c2 (exposed wire in flood water) was elevated to CRITICAL
    c2_updated = client.get(f"/api/complaints/{c2_id}", headers=admin_headers).json()
    assert c2_updated["current_priority"] == "CRITICAL"
    assert c2_updated["base_severity"] == "MEDIUM"  # Original severity preserved!

    # Verify c1 (drain overflowing) was elevated to HIGH
    c1_updated = client.get(f"/api/complaints/{c1_id}", headers=admin_headers).json()
    assert c1_updated["current_priority"] == "HIGH"

    # Verify c3 (CLOSED) was NOT modified or reopened
    c3_check = client.get(f"/api/complaints/{c3_id}", headers=admin_headers).json()
    assert c3_check["status"] == "CLOSED"

    # Verify PriorityHistory recorded
    history_c2 = client.get(f"/api/priority-history?complaint_id={c2_id}", headers=admin_headers).json()
    assert len(history_c2) == 1
    rec = history_c2[0]
    assert rec["previous_priority"] == "MEDIUM"
    assert rec["new_priority"] == "CRITICAL"
    assert rec["method"] == "AUTOMATED_DISASTER_REASSESSMENT"
    assert "[SIMULATED]" in rec["reason"]

    # IDEMPOTENCY TEST: Trigger manual reassessment for same event -> NO duplicate history rows!
    reassess_res = client.post(f"/api/disaster-events/{event_id}/reassess", headers=admin_headers)
    assert reassess_res.status_code == 200
    assert reassess_res.json()["history_records_written"] == 0

    history_c2_retry = client.get(f"/api/priority-history?complaint_id={c2_id}", headers=admin_headers).json()
    assert len(history_c2_retry) == 1  # Still exactly 1 row!


def test_old_overdue_complaint_not_lowered(client, disaster_setup, db_session):
    org_id = disaster_setup["org_id"]
    admin_headers = {"Authorization": f"Bearer {disaster_setup['admin_token']}", "X-Organization-Id": str(org_id)}

    # Create an old overdue complaint with CRITICAL priority
    old_comp = client.post(
        "/api/complaints",
        json={"description": "Overdue gas leak inquiry", "location_text": "Block C", "base_severity": "CRITICAL"},
        headers=admin_headers,
    ).json()
    old_id = old_comp["id"]

    comp_rec = db_session.query(Complaint).filter(Complaint.id == old_id).first()
    comp_rec.is_overdue = True
    comp_rec.current_priority = "CRITICAL"
    db_session.commit()

    # Activate a CYCLONE event (which might not prioritize gas leak)
    client.post(
        "/api/disaster-events",
        json={
            "name": "Simulated Cyclone Vardah",
            "type": "CYCLONE",
            "scope": "ORGANIZATION",
            "is_simulated": True,
        },
        headers=admin_headers,
    )

    # Priority must NOT be lowered because of age or event start
    updated = client.get(f"/api/complaints/{old_id}", headers=admin_headers).json()
    assert updated["current_priority"] == "CRITICAL"
