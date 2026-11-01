import pytest


@pytest.fixture
def community_setup(client):
    admin = client.post(
        "/api/auth/register",
        json={
            "email": "community_admin@muni.gov",
            "password": "Password123!",
            "full_name": "Community Admin",
        },
    ).json()
    token = admin["token"]

    org = client.post(
        "/api/organizations",
        json={
            "name": "Community Org",
            "slug": "community-org",
            "type": "MUNICIPALITY",
        },
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    org_id = org["id"]

    citizen1 = client.post(
        "/api/auth/register",
        json={
            "email": "citizenA@muni.gov",
            "password": "Password123!",
            "full_name": "Citizen Alpha",
            "organization_id": org_id,
            "role": "CITIZEN",
        },
    ).json()

    citizen2 = client.post(
        "/api/auth/register",
        json={
            "email": "citizenB@muni.gov",
            "password": "Password123!",
            "full_name": "Citizen Beta",
            "organization_id": org_id,
            "role": "CITIZEN",
        },
    ).json()

    citizen3 = client.post(
        "/api/auth/register",
        json={
            "email": "citizenC@muni.gov",
            "password": "Password123!",
            "full_name": "Citizen Gamma",
            "organization_id": org_id,
            "role": "CITIZEN",
        },
    ).json()

    # Create 2 complaints
    c1 = client.post(
        "/api/complaints",
        json={"description": "Large water leak at entrance", "location_text": "Main Gate"},
        headers={"Authorization": f"Bearer {citizen1['token']}", "X-Organization-Id": str(org_id)},
    ).json()

    c2 = client.post(
        "/api/complaints",
        json={"description": "Water overflowing near main entrance gate", "location_text": "Main Gate"},
        headers={"Authorization": f"Bearer {citizen2['token']}", "X-Organization-Id": str(org_id)},
    ).json()

    return {
        "org_id": org_id,
        "admin_token": token,
        "citizen1_token": citizen1["token"],
        "citizen2_token": citizen2["token"],
        "citizen3_token": citizen3["token"],
        "c1_id": c1["id"],
        "c2_id": c2["id"],
    }


def test_community_verification_lifecycle(client, community_setup):
    org_id = community_setup["org_id"]
    c1_id = community_setup["c1_id"]

    h1 = {"Authorization": f"Bearer {community_setup['citizen1_token']}", "X-Organization-Id": str(org_id)}
    h2 = {"Authorization": f"Bearer {community_setup['citizen2_token']}", "X-Organization-Id": str(org_id)}
    h3 = {"Authorization": f"Bearer {community_setup['citizen3_token']}", "X-Organization-Id": str(org_id)}

    # Citizen 1 (the reporter) CANNOT verify their own submission
    v_own = client.post(
        f"/api/complaints/{c1_id}/verifications",
        json={"answer": "STILL_EXISTS", "notes": "I reported this"},
        headers=h1,
    )
    assert v_own.status_code == 400
    assert v_own.json()["code"] == "CANNOT_VERIFY_OWN_REPORT"

    # Neighbor Citizen 2 marks STILL_EXISTS
    v1 = client.post(
        f"/api/complaints/{c1_id}/verifications",
        json={"answer": "STILL_EXISTS", "notes": "Water still pooling"},
        headers=h2,
    )
    assert v1.status_code == 201
    data1 = v1.json()
    assert data1["total_responses"] == 1
    assert data1["counts"]["STILL_EXISTS"] == 1
    assert data1["user_answer"] == "STILL_EXISTS"

    # Neighbor Citizen 3 marks APPEARS_RESOLVED
    v2 = client.post(
        f"/api/complaints/{c1_id}/verifications",
        json={"answer": "APPEARS_RESOLVED"},
        headers=h3,
    )
    assert v2.status_code == 201
    data2 = v2.json()
    assert data2["total_responses"] == 2
    assert data2["counts"]["STILL_EXISTS"] == 1
    assert data2["counts"]["APPEARS_RESOLVED"] == 1

    # Citizen 2 changes mind to NEEDS_REVIEW
    v3 = client.post(
        f"/api/complaints/{c1_id}/verifications",
        json={"answer": "NEEDS_REVIEW"},
        headers=h2,
    )
    assert v3.status_code == 201
    data3 = v3.json()
    assert data3["total_responses"] == 2  # Total responses still 2
    assert data3["counts"]["STILL_EXISTS"] == 0
    assert data3["counts"]["NEEDS_REVIEW"] == 1


def test_human_reviewed_duplicate_linking(client, community_setup):
    org_id = community_setup["org_id"]
    c1_id = community_setup["c1_id"]
    c2_id = community_setup["c2_id"]
    admin_headers = {"Authorization": f"Bearer {community_setup['admin_token']}", "X-Organization-Id": str(org_id)}

    # Staff/Admin creates duplicate group with c1 as primary
    group_res = client.post(
        "/api/duplicates/groups",
        json={"primary_complaint_id": c1_id},
        headers=admin_headers,
    )
    assert group_res.status_code == 201
    group_data = group_res.json()
    group_id = group_data["id"]

    # Link c2 to group
    link_res = client.post(
        f"/api/duplicates/groups/{group_id}/link",
        json={"complaint_id": c2_id},
        headers=admin_headers,
    )
    assert link_res.status_code == 200
    links = link_res.json()["links"]
    assert len(links) == 1
    assert links[0]["complaint_id"] == c2_id

    # Verify both complaints still exist independently in database (never merged destructively)
    get_c1 = client.get(f"/api/complaints/{c1_id}", headers=admin_headers)
    get_c2 = client.get(f"/api/complaints/{c2_id}", headers=admin_headers)
    assert get_c1.status_code == 200
    assert get_c2.status_code == 200

    # Unlink c2
    unlink_res = client.delete(
        f"/api/duplicates/groups/{group_id}/link/{c2_id}",
        headers=admin_headers,
    )
    assert unlink_res.status_code == 200

    # Verify link removed
    groups_list = client.get("/api/duplicates/groups", headers=admin_headers).json()
    assert len(groups_list[0]["links"]) == 0
