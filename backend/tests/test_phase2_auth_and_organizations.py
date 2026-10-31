import pytest
from backend.app.models import DemoIdentity, DemoIdentityStateEnum, AuditLog


@pytest.fixture
def test_setup_data(db_session):
    # Seed a demo synthetic identity
    demo_id = DemoIdentity(
        synthetic_id="DEMO-ID-0001",
        full_name="Aarav Sharma (Synthetic)",
        state=DemoIdentityStateEnum.DEMO_VERIFIED.value,
    )
    db_session.add(demo_id)
    db_session.commit()
    db_session.refresh(demo_id)
    return {"demo_identity": demo_id}


def test_registration_and_login(client):
    # Register user
    reg_payload = {
        "email": "resident1@example.com",
        "password": "StrongPassword123!",
        "full_name": "Resident One",
    }
    res = client.post("/api/auth/register", json=reg_payload)
    assert res.status_code == 201
    data = res.json()
    assert "token" in data
    assert data["user"]["email"] == "resident1@example.com"
    token = data["token"]

    # Verify session with /me
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["user"]["email"] == "resident1@example.com"

    # Login
    login_payload = {
        "email": "resident1@example.com",
        "password": "StrongPassword123!",
    }
    login_res = client.post("/api/auth/login", json=login_payload)
    assert login_res.status_code == 200
    assert "token" in login_res.json()

    # Update profile (permanent location)
    prof_res = client.patch(
        "/api/auth/profile",
        json={"permanent_location": "4th Cross, 5th Main, Indiranagar"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert prof_res.status_code == 200
    assert prof_res.json()["user"]["permanent_location"] == "4th Cross, 5th Main, Indiranagar"

    # Wrong password
    bad_login = client.post(
        "/api/auth/login",
        json={"email": "resident1@example.com", "password": "WrongPassword"},
    )
    assert bad_login.status_code == 401
    assert bad_login.json()["code"] == "INVALID_CREDENTIALS"


def test_organization_creation_and_membership(client):
    # Register admin user
    res = client.post(
        "/api/auth/register",
        json={
            "email": "admin@metro.gov",
            "password": "AdminPassword123!",
            "full_name": "Metro Admin",
        },
    )
    assert res.status_code == 201
    admin_token = res.json()["token"]

    # Create Organization 1 (Municipality)
    org1_payload = {
        "name": "Metropolitan Municipal Corporation",
        "slug": "metro-muncorp",
        "type": "MUNICIPALITY",
        "time_zone": "Asia/Kolkata",
        "settings": {"auto_routing": True},
    }
    res_org1 = client.post(
        "/api/organizations",
        json=org1_payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_org1.status_code == 201
    org1_id = res_org1.json()["id"]

    # Register Citizen in Org 1
    res_citizen = client.post(
        "/api/auth/register",
        json={
            "email": "citizen@metro.gov",
            "password": "CitizenPassword123!",
            "full_name": "Citizen User",
            "organization_id": org1_id,
            "role": "CITIZEN",
        },
    )
    assert res_citizen.status_code == 201
    citizen_token = res_citizen.json()["token"]

    # Citizen tries to update organization -> must be 403 FORBIDDEN
    update_res = client.put(
        f"/api/organizations/{org1_id}",
        json={"name": "Hacked Name"},
        headers={
            "Authorization": f"Bearer {citizen_token}",
            "X-Organization-Id": str(org1_id),
        },
    )
    assert update_res.status_code == 403
    assert update_res.json()["code"] == "PERMISSION_DENIED"


def test_organization_isolation(client):
    # Create Admin
    admin_res = client.post(
        "/api/auth/register",
        json={
            "email": "platform@civicfix.org",
            "password": "PlatformAdminPassword123!",
            "full_name": "Platform Admin",
        },
    )
    assert admin_res.status_code == 201
    admin_token = admin_res.json()["token"]

    # Create Org 1
    org1 = client.post(
        "/api/organizations",
        json={
            "name": "City Municipality",
            "slug": "city-muni",
            "type": "MUNICIPALITY",
            "time_zone": "UTC",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()

    # Create Org 2
    org2 = client.post(
        "/api/organizations",
        json={
            "name": "Green Heights Apartments",
            "slug": "green-heights",
            "type": "APARTMENT",
            "time_zone": "UTC",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()

    # Register User A in Org 1
    user_a = client.post(
        "/api/auth/register",
        json={
            "email": "userA@muni.gov",
            "password": "PasswordA123!",
            "full_name": "User Alpha",
            "organization_id": org1["id"],
            "role": "CITIZEN",
        },
    ).json()
    token_a = user_a["token"]

    # User A tries to access Org 2 memberships -> must be 403
    res = client.get(
        f"/api/organizations/{org2['id']}/memberships",
        headers={
            "Authorization": f"Bearer {token_a}",
            "X-Organization-Id": str(org2["id"]),
        },
    )
    assert res.status_code == 403
    assert res.json()["code"] in ["ORGANIZATION_ACCESS_DENIED", "PERMISSION_DENIED"]


def test_synthetic_identity_verification(client, test_setup_data):
    # Register user
    user = client.post(
        "/api/auth/register",
        json={
            "email": "demo_user@example.com",
            "password": "DemoPassword123!",
            "full_name": "Demo User",
        },
    ).json()
    token = user["token"]

    # List demo identities
    list_res = client.get(
        "/api/demo-identity",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_res.status_code == 200
    identities = list_res.json()
    assert len(identities) >= 1
    demo_id = identities[0]["id"]

    # Verify user
    verify_res = client.post(
        "/api/demo-identity/verify",
        json={"demo_identity_id": demo_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "DEMO_VERIFIED"
    assert verify_res.json()["demo_identity"]["synthetic_id"] == "DEMO-ID-0001"
