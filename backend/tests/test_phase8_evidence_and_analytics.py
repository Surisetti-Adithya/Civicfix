import pytest
from backend.app.models import Complaint, AuditLog
from backend.app.services.evidence_pack_service import FACTUAL_DISCLAIMER


@pytest.fixture
def analytics_setup(client):
    admin = client.post(
        "/api/auth/register",
        json={
            "email": "analytics_admin@muni.gov",
            "password": "Password123!",
            "full_name": "Analytics Administrator",
        },
    ).json()
    token = admin["token"]

    org = client.post(
        "/api/organizations",
        json={
            "name": "Analytics Municipal Council",
            "slug": "analytics-council",
            "type": "MUNICIPALITY",
        },
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    org_id = org["id"]

    admin_headers = {"Authorization": f"Bearer {token}", "X-Organization-Id": str(org_id)}

    # Submit 2 complaints
    c1 = client.post(
        "/api/complaints",
        json={"description": "Blocked stormwater conduit with debris", "location_text": "Junction 5"},
        headers=admin_headers,
    ).json()

    c2 = client.post(
        "/api/complaints",
        json={"description": "Broken footbridge railing", "location_text": "Park canal"},
        headers=admin_headers,
    ).json()

    # Move c2 to RESOLVED
    client.patch(
        f"/api/complaints/{c2['id']}/status",
        json={"status": "UNDER_REVIEW"},
        headers=admin_headers,
    )
    client.patch(
        f"/api/complaints/{c2['id']}/status",
        json={"status": "RESOLVED", "notes": "Welded new handrail"},
        headers=admin_headers,
    )

    return {
        "org_id": org_id,
        "token": token,
        "c1_id": c1["id"],
        "c2_id": c2["id"],
        "c1_ref": c1["public_reference_number"],
    }


def test_evidence_pack_matches_database_records(client, analytics_setup, db_session):
    org_id = analytics_setup["org_id"]
    c1_id = analytics_setup["c1_id"]
    headers = {"Authorization": f"Bearer {analytics_setup['token']}", "X-Organization-Id": str(org_id)}

    # 1. Test JSON Export
    res_json = client.get(f"/api/exports/complaints/{c1_id}/json", headers=headers)
    assert res_json.status_code == 200
    pack_data = res_json.json()

    # Verify mandatory disclaimer
    assert pack_data["disclaimer"] == FACTUAL_DISCLAIMER

    # Query database directly to compare
    db_comp = db_session.query(Complaint).filter(Complaint.id == c1_id).first()
    assert pack_data["complaint"]["public_reference_number"] == db_comp.public_reference_number
    assert pack_data["complaint"]["description_original"] == db_comp.description_original
    assert pack_data["complaint"]["location_text"] == db_comp.location_text
    assert pack_data["complaint"]["status"] == db_comp.status
    assert len(pack_data["history"]) == len(db_comp.history)

    # 2. Test PDF Export
    res_pdf = client.get(f"/api/exports/complaints/{c1_id}/pdf", headers=headers)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert len(res_pdf.content) > 1000
    assert res_pdf.content.startswith(b"%PDF")

    # Verify AuditLog recorded
    audit_exports = (
        db_session.query(AuditLog)
        .filter(AuditLog.action.in_(["EVIDENCE_PACK_EXPORTED_JSON", "EVIDENCE_PACK_EXPORTED_PDF"]))
        .all()
    )
    assert len(audit_exports) >= 2


def test_public_dashboard_metrics_contains_no_personal_data(client, analytics_setup):
    org_id = analytics_setup["org_id"]

    # Public endpoint without authentication
    pub_res = client.get(f"/api/reports/public-metrics?org_id={org_id}")
    assert pub_res.status_code == 200
    data = pub_res.json()

    # Verify metrics structure
    assert "metrics" in data
    assert "time_period" in data
    assert "open_complaints" in data["metrics"]
    assert "overdue_complaints" in data["metrics"]
    assert "acknowledgment_performance" in data["metrics"]
    assert "median_resolution_time" in data["metrics"]
    assert "escalated_complaints" in data["metrics"]
    assert "reopened_complaints" in data["metrics"]
    assert "target_compliance" in data["metrics"]

    # Every metric has a written definition
    for m_name, m_info in data["metrics"].items():
        assert "definition" in m_info
        assert len(m_info["definition"]) > 10
        assert "value" in m_info

    # CRITICAL SECURITY TEST: Ensure NO personal data (names, emails, phones, user IDs)
    data_str = str(data).lower()
    assert "analytics_admin@muni.gov" not in data_str
    assert "analytics administrator" not in data_str
    assert "reporter" not in data
    assert "users" not in data
