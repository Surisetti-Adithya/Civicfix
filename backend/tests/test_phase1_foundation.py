def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "CivicFix"


def test_unified_error_format_not_found(client):
    response = client.get("/api/non-existent-endpoint")
    assert response.status_code == 404
    data = response.json()
    assert "code" in data
    assert "message" in data
    assert "details" in data
    assert data["code"] == "NOT_FOUND"


def test_database_tables_exist(db_session):
    from backend.app.models import (
        User,
        Organization,
        Membership,
        Category,
        Team,
        Complaint,
        ComplaintHistory,
        Assignment,
        EvidenceFile,
        CommunityVerification,
        DuplicateGroup,
        DuplicateLink,
        DeadlineRule,
        DeadlineChange,
        EscalationRule,
        EscalationRecord,
        DisasterEvent,
        PriorityHistory,
        AiCallLog,
        Notification,
        AuditLog,
        DemoIdentity,
        VerificationRecord,
    )

    # Simple query to verify tables are queryable
    users = db_session.query(User).all()
    assert users == []
    orgs = db_session.query(Organization).all()
    assert orgs == []
