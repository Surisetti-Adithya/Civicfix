import datetime
import pytest
from backend.app.models import Complaint, AuditLog, EscalationStateEnum


@pytest.fixture
def deadline_setup(client):
    admin = client.post(
        "/api/auth/register",
        json={
            "email": "deadline_admin@muni.gov",
            "password": "Password123!",
            "full_name": "Deadline Admin",
        },
    ).json()
    admin_token = admin["token"]

    org = client.post(
        "/api/organizations",
        json={
            "name": "Deadline Org",
            "slug": "deadline-org",
            "type": "MUNICIPALITY",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    org_id = org["id"]

    admin_headers = {"Authorization": f"Bearer {admin_token}", "X-Organization-Id": str(org_id)}

    # Create Escalation Rule (Level 1: Supervisor, Level 2: Municipal Commissioner)
    client.post(
        "/api/escalations/rules",
        json={"level_order": 1, "target_role_or_channel": "Ward Supervisor", "trigger": "RESOLUTION_OVERDUE"},
        headers=admin_headers,
    )
    client.post(
        "/api/escalations/rules",
        json={"level_order": 2, "target_role_or_channel": "Municipal Commissioner", "trigger": "RESOLUTION_OVERDUE"},
        headers=admin_headers,
    )

    # Citizen submits complaint
    citizen = client.post(
        "/api/auth/register",
        json={
            "email": "deadline_citizen@muni.gov",
            "password": "Password123!",
            "full_name": "Citizen Overdue",
            "organization_id": org_id,
            "role": "CITIZEN",
        },
    ).json()
    citizen_headers = {"Authorization": f"Bearer {citizen['token']}", "X-Organization-Id": str(org_id)}

    comp = client.post(
        "/api/complaints",
        json={"description": "Dangerous pothole with exposed pipe", "location_text": "Sector 9 road"},
        headers=citizen_headers,
    ).json()

    return {
        "org_id": org_id,
        "admin_token": admin_token,
        "citizen_token": citizen["token"],
        "complaint_id": comp["id"],
    }


def test_deadline_job_idempotency_and_prepared_state(client, deadline_setup, db_session):
    org_id = deadline_setup["org_id"]
    comp_id = deadline_setup["complaint_id"]
    admin_headers = {"Authorization": f"Bearer {deadline_setup['admin_token']}", "X-Organization-Id": str(org_id)}

    # Manually set resolution_deadline to 2 days in the past to simulate overdue
    past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=2)
    comp = db_session.query(Complaint).filter(Complaint.id == comp_id).first()
    comp.resolution_deadline = past_time
    db_session.commit()

    # 1. Trigger deadline check
    job_res = client.post("/api/deadlines/check", headers=admin_headers)
    assert job_res.status_code == 200
    res_data = job_res.json()
    assert res_data["overdue_flagged"] >= 1
    assert res_data["escalations_prepared"] >= 1

    # Verify EscalationRecord state
    records = client.get(f"/api/escalations/records?complaint_id={comp_id}", headers=admin_headers).json()
    assert len(records) == 1
    rec = records[0]
    assert rec["level"] == 1
    assert rec["state"] == "PREPARED"
    # REQUIRED BY SPEC: a PREPARED record has NO submitted_at
    assert rec["submitted_at"] is None
    assert rec["receipt_reference"] is None

    # 2. Re-run deadline check job -> IDEMPOTENT: must NOT create duplicate records!
    job_retry = client.post("/api/deadlines/check", headers=admin_headers)
    assert job_retry.status_code == 200
    retry_records = client.get(f"/api/escalations/records?complaint_id={comp_id}", headers=admin_headers).json()
    assert len(retry_records) == 1  # Still exactly 1 record!


def test_escalation_submission_and_acknowledgment(client, deadline_setup, db_session):
    org_id = deadline_setup["org_id"]
    comp_id = deadline_setup["complaint_id"]
    admin_headers = {"Authorization": f"Bearer {deadline_setup['admin_token']}", "X-Organization-Id": str(org_id)}

    # Set deadline in past and run check
    past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=2)
    comp = db_session.query(Complaint).filter(Complaint.id == comp_id).first()
    comp.resolution_deadline = past_time
    db_session.commit()

    client.post("/api/deadlines/check", headers=admin_headers)
    records = client.get(f"/api/escalations/records?complaint_id={comp_id}", headers=admin_headers).json()
    record_id = records[0]["id"]

    # Submit escalation with real receipt reference
    submit_res = client.patch(
        f"/api/escalations/records/{record_id}/submit",
        json={"receipt_reference": "GOV-ESC-2026-9921", "notes": "Hand-delivered to ward desk"},
        headers=admin_headers,
    )
    assert submit_res.status_code == 200
    sub_data = submit_res.json()
    assert sub_data["state"] == "SUBMITTED"
    assert sub_data["submitted_at"] is not None
    assert sub_data["receipt_reference"] == "GOV-ESC-2026-9921"

    # Verify AuditLog row recorded
    audits = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "ESCALATION_RECORD_SUBMITTED")
        .all()
    )
    assert len(audits) >= 1
    assert audits[-1].details["receipt_reference"] == "GOV-ESC-2026-9921"

    # Acknowledge escalation
    ack_res = client.patch(
        f"/api/escalations/records/{record_id}/acknowledge",
        json={"notes": "Received by Ward Office in-charge"},
        headers=admin_headers,
    )
    assert ack_res.status_code == 200
    assert ack_res.json()["state"] == "ACKNOWLEDGED"
    assert ack_res.json()["acknowledged_at"] is not None
