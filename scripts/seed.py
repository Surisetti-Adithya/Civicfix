#!/usr/bin/env python3
import datetime
import sys
import random

# Ensure workspace root is in sys.path
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from backend.app.core.database import SessionLocal, Base, engine
from backend.app.core.security import hash_password
from backend.app.models import (
    User,
    Organization,
    Membership,
    Category,
    Team,
    CategoryTeamMap,
    Complaint,
    ComplaintHistory,
    Assignment,
    DeadlineRule,
    EscalationRule,
    EscalationRecord,
    DemoIdentity,
    RoleEnum,
    ComplaintStatusEnum,
    SeverityEnum,
    PriorityEnum,
    DeadlineModeEnum,
    EscalationStateEnum,
    DemoIdentityStateEnum,
)

DEMO_PASSWORD = "CivicFixDemo2026!"


def seed_database():
    print("Seeding CivicFix database...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        now = datetime.datetime.now(datetime.timezone.utc)

        # 1. Synthetic Demo Identities (Section 11.3)
        print("  - Creating synthetic demo identities...")
        demo_ids_data = [
            ("DEMO-ID-0001", "Aarav Sharma (Synthetic)", DemoIdentityStateEnum.DEMO_VERIFIED.value),
            ("DEMO-ID-0002", "Priya Patel (Synthetic)", DemoIdentityStateEnum.DEMO_VERIFIED.value),
            ("DEMO-ID-0003", "Rohan Deshmukh (Synthetic)", DemoIdentityStateEnum.DEMO_UNVERIFIED.value),
        ]
        for syn_id, name, state in demo_ids_data:
            if not db.query(DemoIdentity).filter(DemoIdentity.synthetic_id == syn_id).first():
                db.add(DemoIdentity(synthetic_id=syn_id, full_name=name, state=state))

        # 2. Users
        print("  - Creating demo users...")
        hashed_pwd = hash_password(DEMO_PASSWORD)

        users_data = [
            ("platform.admin@civicfix.org", "Platform Administrator", "9999900000", "CivicFix Command Center"),
            ("muni.admin@metro.gov", "Municipal Administrator", "9999911111", "Municipal HQ, Metro City"),
            ("muni.staff@metro.gov", "Rajesh Kumar (Field Officer)", "9999922222", "Central Depot, Ward 12, Metro City"),
            ("muni.citizen@metro.gov", "Sunita Rao (Citizen)", "9999933333", "4th Cross, 5th Main, Indiranagar, Metro City"),
            ("apt.admin@palm.res", "Apartment Estate Manager", "9999944444", "Clubhouse Office, Palm Meadows"),
            ("apt.staff@palm.res", "Kavita Nair (Maintenance Head)", "9999955555", "Maintenance Bay, Basement 1, Palm Meadows"),
            ("apt.resident@palm.res", "Deepak Verma (Resident Flat 402)", "9999966666", "Flat 402, Block B, Palm Meadows, Bangalore"),
        ]

        user_map = {}
        for email, full_name, phone, loc in users_data:
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(
                    email=email,
                    hashed_password=hashed_pwd,
                    full_name=full_name,
                    phone_number=phone,
                    permanent_location=loc,
                    is_active=True,
                )
                db.add(u)
                db.flush()
            else:
                u.permanent_location = loc
                db.flush()
            user_map[email] = u

        # 3. Organizations (Municipality & Apartment Community)
        print("  - Creating organizations...")
        muni_org = db.query(Organization).filter(Organization.slug == "metro-muncorp").first()
        if not muni_org:
            muni_org = Organization(
                name="Metropolitan Municipal Corporation",
                slug="metro-muncorp",
                type="MUNICIPALITY",
                time_zone="Asia/Kolkata",
                settings={"auto_routing": True, "public_dashboard_enabled": True},
            )
            db.add(muni_org)
            db.flush()

        apt_org = db.query(Organization).filter(Organization.slug == "palm-meadows").first()
        if not apt_org:
            apt_org = Organization(
                name="Palm Meadows Residential Community",
                slug="palm-meadows",
                type="APARTMENT",
                time_zone="Asia/Kolkata",
                settings={"auto_routing": True, "public_dashboard_enabled": True},
            )
            db.add(apt_org)
            db.flush()

        # Memberships
        print("  - Assigning memberships...")
        memberships_data = [
            (user_map["platform.admin@civicfix.org"].id, muni_org.id, RoleEnum.PLATFORM_ADMIN.value),
            (user_map["platform.admin@civicfix.org"].id, apt_org.id, RoleEnum.PLATFORM_ADMIN.value),
            (user_map["muni.admin@metro.gov"].id, muni_org.id, RoleEnum.ORG_ADMIN.value),
            (user_map["muni.staff@metro.gov"].id, muni_org.id, RoleEnum.STAFF.value),
            (user_map["muni.citizen@metro.gov"].id, muni_org.id, RoleEnum.CITIZEN.value),
            (user_map["apt.admin@palm.res"].id, apt_org.id, RoleEnum.ORG_ADMIN.value),
            (user_map["apt.staff@palm.res"].id, apt_org.id, RoleEnum.STAFF.value),
            (user_map["apt.resident@palm.res"].id, apt_org.id, RoleEnum.CITIZEN.value),
        ]
        for uid, oid, role in memberships_data:
            if not db.query(Membership).filter(Membership.user_id == uid, Membership.organization_id == oid).first():
                db.add(Membership(user_id=uid, organization_id=oid, role=role))

        # 4. Categories & Teams for Municipality
        print("  - Configuring municipality categories and teams...")
        muni_cats = [
            ("Roads & Pavements", "Potholes, cracked roads, broken footpaths, speed breakers, asphalt damage, road cave-in"),
            ("Drainage & Stormwater", "Clogged drains, overflowing manholes, culverts, gutter flooding, street water accumulation, waterlogging"),
            ("Sanitation & Waste", "Garbage collection, public bins overflow, sweeping, dead animal removal, litter, waste dumping"),
            ("Streetlights & Signals", "Non-functional street lights, flickering lamps, traffic signal outages, pole damage, dark roads"),
            ("Water Supply & Pipelines", "Water pipe burst, supply disruption, contaminated water, no water supply, low water pressure"),
            ("Parks & Public Spaces", "Park maintenance, bench damage, playground equipment broken, overgrown trees, public garden upkeep"),
            ("Encroachment & Illegal Construction", "Illegal structures, road encroachment, footpath obstruction, unauthorized building activity"),
            ("Noise & Pollution", "Construction noise, loudspeaker nuisance, air pollution, smoke, illegal burning, industrial waste"),
            ("Footpath & Pedestrian Safety", "Broken footpath tiles, missing footpath, footpath obstruction, accessibility ramp damage, tripping hazard"),
            ("Stray Animals & Pest Control", "Stray dog attack, stray cattle, mosquito breeding, rodent infestation, pest nuisance, dog bite"),
        ]
        muni_cat_map = {}
        for cname, cdesc in muni_cats:
            cat = db.query(Category).filter(Category.organization_id == muni_org.id, Category.name == cname).first()
            if not cat:
                cat = Category(organization_id=muni_org.id, name=cname, description=cdesc, is_active=True)
                db.add(cat)
                db.flush()
            muni_cat_map[cname] = cat

        muni_teams = [
            ("Road Works Division", "Road repair and asphalt crew"),
            ("Drainage & Culvert Unit", "Stormwater and gutter clearance squad"),
            ("Solid Waste Operations", "Sanitation vehicles and collectors"),
            ("Electrical Maintenance Cell", "Street illumination and wiring division"),
            ("Water & Pipelines Unit", "Pipeline repair and water supply crew"),
            ("Parks & Horticulture Cell", "Park maintenance and tree-trimming squad"),
            ("Anti-Encroachment Squad", "Illegal construction and encroachment removal"),
            ("Pollution Control Unit", "Noise and pollution complaint responders"),
            ("Footpath Maintenance Crew", "Footpath tile repair and pedestrian safety"),
            ("Veterinary & Pest Control", "Stray animal management and pest control"),
        ]
        muni_team_map = {}
        for tname, tdesc in muni_teams:
            team = db.query(Team).filter(Team.organization_id == muni_org.id, Team.name == tname).first()
            if not team:
                team = Team(organization_id=muni_org.id, name=tname, description=tdesc, is_active=True)
                db.add(team)
                db.flush()
            muni_team_map[tname] = team

        # Routing maps for Municipality
        routing_pairs_muni = [
            ("Roads & Pavements", "Road Works Division"),
            ("Drainage & Stormwater", "Drainage & Culvert Unit"),
            ("Sanitation & Waste", "Solid Waste Operations"),
            ("Streetlights & Signals", "Electrical Maintenance Cell"),
            ("Water Supply & Pipelines", "Water & Pipelines Unit"),
            ("Parks & Public Spaces", "Parks & Horticulture Cell"),
            ("Encroachment & Illegal Construction", "Anti-Encroachment Squad"),
            ("Noise & Pollution", "Pollution Control Unit"),
            ("Footpath & Pedestrian Safety", "Footpath Maintenance Crew"),
            ("Stray Animals & Pest Control", "Veterinary & Pest Control"),
        ]
        for cname, tname in routing_pairs_muni:
            if cname not in muni_cat_map or tname not in muni_team_map:
                continue
            cid = muni_cat_map[cname].id
            tid = muni_team_map[tname].id
            if not db.query(CategoryTeamMap).filter(CategoryTeamMap.organization_id == muni_org.id, CategoryTeamMap.category_id == cid).first():
                db.add(CategoryTeamMap(organization_id=muni_org.id, category_id=cid, team_id=tid))

        # 5. Categories & Teams for Apartment Community
        print("  - Configuring apartment categories and teams...")
        apt_cats = [
            ("Plumbing", "Water supply, pipe leaks, sanitary fittings, flush tank, tap leakage"),
            ("Lifts & Elevators", "Lift breakdown, floor-stop failure, jerky motion, lift door malfunction"),
            ("Cleaning & Housekeeping", "Corridor mopping, garbage chutes, staircase cleaning, common area hygiene"),
            ("Electrical", "Common area lighting, backup generators, meters, sparking wires, power outage"),
            ("Security & Access", "Boom barriers, intercom failure, visitor registration, CCTV, gate security"),
            ("Parking & Vehicles", "Parking violations, blocked entrance, damaged parking structure, EV charging"),
            ("Common Area & Amenities", "Gym equipment, swimming pool, clubhouse, terrace access, common area damage"),
            ("Pest & Housekeeping", "Cockroaches, rodents, lizards, bed bugs, fumigation request, mosquito breeding"),
        ]
        apt_cat_map = {}
        for cname, cdesc in apt_cats:
            cat = db.query(Category).filter(Category.organization_id == apt_org.id, Category.name == cname).first()
            if not cat:
                cat = Category(organization_id=apt_org.id, name=cname, description=cdesc, is_active=True)
                db.add(cat)
                db.flush()
            apt_cat_map[cname] = cat

        apt_teams = [
            ("In-House Plumbing Team", "Plumbing staff on premises"),
            ("Lift AMC Partner", "External lift maintenance agency"),
            ("Housekeeping Crew", "Daily cleaning staff"),
            ("Facility Electrical Team", "Electricians on call"),
            ("Gate Security Force", "Security supervisors and guards"),
            ("Parking Management Cell", "Parking enforcement and vehicle management"),
            ("Amenities Maintenance Team", "Gym, pool, and clubhouse upkeep crew"),
            ("Pest Control Team", "Professional pest control and fumigation"),
        ]
        apt_team_map = {}
        for tname, tdesc in apt_teams:
            team = db.query(Team).filter(Team.organization_id == apt_org.id, Team.name == tname).first()
            if not team:
                team = Team(organization_id=apt_org.id, name=tname, description=tdesc, is_active=True)
                db.add(team)
                db.flush()
            apt_team_map[tname] = team

        routing_pairs_apt = [
            ("Plumbing", "In-House Plumbing Team"),
            ("Lifts & Elevators", "Lift AMC Partner"),
            ("Cleaning & Housekeeping", "Housekeeping Crew"),
            ("Electrical", "Facility Electrical Team"),
            ("Security & Access", "Gate Security Force"),
            ("Parking & Vehicles", "Parking Management Cell"),
            ("Common Area & Amenities", "Amenities Maintenance Team"),
            ("Pest & Housekeeping", "Pest Control Team"),
        ]
        for cname, tname in routing_pairs_apt:
            if cname not in apt_cat_map or tname not in apt_team_map:
                continue
            cid = apt_cat_map[cname].id
            tid = apt_team_map[tname].id
            if not db.query(CategoryTeamMap).filter(CategoryTeamMap.organization_id == apt_org.id, CategoryTeamMap.category_id == cid).first():
                db.add(CategoryTeamMap(organization_id=apt_org.id, category_id=cid, team_id=tid))

        # 6. Deadlines and Escalations
        print("  - Setting deadline and escalation rules...")
        # Municipality rules
        if not db.query(DeadlineRule).filter(DeadlineRule.organization_id == muni_org.id, DeadlineRule.mode == "NORMAL").first():
            db.add(DeadlineRule(organization_id=muni_org.id, response_hours=24, resolution_hours=72, mode="NORMAL"))
            db.add(DeadlineRule(organization_id=muni_org.id, response_hours=4, resolution_hours=12, mode="DISASTER"))

        if not db.query(EscalationRule).filter(EscalationRule.organization_id == muni_org.id).first():
            db.add(EscalationRule(organization_id=muni_org.id, level_order=1, target_role_or_channel="Ward Supervisor", trigger="RESOLUTION_OVERDUE"))
            db.add(EscalationRule(organization_id=muni_org.id, level_order=2, target_role_or_channel="Zonal Commissioner", trigger="RESOLUTION_OVERDUE"))

        # Apartment rules
        if not db.query(DeadlineRule).filter(DeadlineRule.organization_id == apt_org.id, DeadlineRule.mode == "NORMAL").first():
            db.add(DeadlineRule(organization_id=apt_org.id, response_hours=4, resolution_hours=24, mode="NORMAL"))
            db.add(DeadlineRule(organization_id=apt_org.id, response_hours=2, resolution_hours=6, mode="DISASTER"))

        if not db.query(EscalationRule).filter(EscalationRule.organization_id == apt_org.id).first():
            db.add(EscalationRule(organization_id=apt_org.id, level_order=1, target_role_or_channel="Facility Manager", trigger="RESOLUTION_OVERDUE"))
            db.add(EscalationRule(organization_id=apt_org.id, level_order=2, target_role_or_channel="Management Committee", trigger="RESOLUTION_OVERDUE"))

        # 7. Sample Complaints (~30 items)
        print("  - Seeding ~30 realistic complaints supporting demo scenarios...")
        muni_citizen_id = user_map["muni.citizen@metro.gov"].id
        apt_resident_id = user_map["apt.resident@palm.res"].id

        sample_complaints_data = [
            # SCENARIO A: Blocked drain complaint + possible duplicates
            (muni_org.id, muni_citizen_id, "Drain blocked near 4th cross junction dirty water overflowing onto street", "Drainage & Stormwater", "4th Cross, Ward 12", "HIGH", "HIGH", "SUBMITTED", 0, False, "ROUTED", muni_team_map["Drainage & Culvert Unit"].id),
            (muni_org.id, muni_citizen_id, "Heavy drain water overflow on 4th cross road smelly water accumulating", "Drainage & Stormwater", "4th Cross Road near bakery", "HIGH", "HIGH", "SUBMITTED", 0, False, "ROUTED", muni_team_map["Drainage & Culvert Unit"].id),

            # SCENARIO B: Hazard report near water for flood disaster demonstration
            (muni_org.id, muni_citizen_id, "Exposed high voltage wire sparking dangling into stagnant flood water near pedestrian crossing", "Streetlights & Signals", "Main Bazaar Crossing", "HIGH", "HIGH", "UNDER_REVIEW", 1, False, "ROUTED", muni_team_map["Electrical Maintenance Cell"].id),

            # SCENARIO C: Overdue complaint that missed target
            (muni_org.id, muni_citizen_id, "Deep crater pothole breaking car axles on ring road", "Roads & Pavements", "Outer Ring Road Pillar 44", "HIGH", "HIGH", "IN_PROGRESS", 5, True, "ROUTED", muni_team_map["Road Works Division"].id),

            # Old unresolved complaint (reopened)
            (muni_org.id, muni_citizen_id, "Garbage dumping spot still uncleared after closing", "Sanitation & Waste", "Sector 3 park corner", "MEDIUM", "MEDIUM", "REOPENED", 10, False, "ROUTED", muni_team_map["Solid Waste Operations"].id),

            # Additional Municipal Complaints
            (muni_org.id, muni_citizen_id, "Streetlights not working for whole block since storm", "Streetlights & Signals", "12th Avenue Block B", "MEDIUM", "MEDIUM", "ASSIGNED", 2, False, "ROUTED", muni_team_map["Electrical Maintenance Cell"].id),
            (muni_org.id, muni_citizen_id, "Broken slab over storm sewer dangerous for walkers", "Drainage & Stormwater", "Bus Stand Footpath", "HIGH", "HIGH", "UNDER_REVIEW", 1, False, "ROUTED", muni_team_map["Drainage & Culvert Unit"].id),
            (muni_org.id, muni_citizen_id, "Overflowing dustbin dog menace", "Sanitation & Waste", "Market Street", "LOW", "LOW", "RESOLVED", 7, False, "ROUTED", muni_team_map["Solid Waste Operations"].id),
            (muni_org.id, muni_citizen_id, "Missing manhole cover near school gate", "Drainage & Stormwater", "Primary School Road", "CRITICAL", "CRITICAL", "IN_PROGRESS", 1, False, "ROUTED", muni_team_map["Drainage & Culvert Unit"].id),
            (muni_org.id, muni_citizen_id, "Dead tree branch resting on electrical line", "Streetlights & Signals", "Green Park Avenue", "HIGH", "HIGH", "SUBMITTED", 0, False, "ROUTED", muni_team_map["Electrical Maintenance Cell"].id),
            (muni_org.id, muni_citizen_id, "Road dug up for pipeline not restored with tar", "Roads & Pavements", "Sector 7 Main Road", "MEDIUM", "MEDIUM", "UNDER_REVIEW", 3, False, "ROUTED", muni_team_map["Road Works Division"].id),
            (muni_org.id, muni_citizen_id, "Open bio waste dumped in storm drain", "Sanitation & Waste", "Near Hospital Backgate", "HIGH", "HIGH", "ASSIGNED", 2, False, "ROUTED", muni_team_map["Solid Waste Operations"].id),
            (muni_org.id, muni_citizen_id, "Pedestrian signal button stuck", "Streetlights & Signals", "Hospital Junction", "LOW", "LOW", "RESOLVED", 8, False, "ROUTED", muni_team_map["Electrical Maintenance Cell"].id),
            (muni_org.id, muni_citizen_id, "Water stagnation causing mosquito breeding", "Drainage & Stormwater", "Community Hall Lane", "MEDIUM", "MEDIUM", "IN_PROGRESS", 4, False, "ROUTED", muni_team_map["Drainage & Culvert Unit"].id),
            (muni_org.id, muni_citizen_id, "Construction rubble blocking pedestrian walkway", "Roads & Pavements", "Opposite Bank Branch", "LOW", "LOW", "CLOSED", 14, False, "ROUTED", muni_team_map["Road Works Division"].id),

            # SCENARIO D: Apartment Community Complaints
            (apt_org.id, apt_resident_id, "Major water pipe burst in Tower B basement pooling near meter board", "Plumbing", "Tower B Basement B1", "HIGH", "HIGH", "SUBMITTED", 0, False, "ROUTED", apt_team_map["In-House Plumbing Team"].id),
            (apt_org.id, apt_resident_id, "Lift 3 making grinding metallic noise and shaking between 5th and 6th floor", "Lifts & Elevators", "Tower A Lift 3", "HIGH", "HIGH", "IN_PROGRESS", 1, False, "ROUTED", apt_team_map["Lift AMC Partner"].id),
            (apt_org.id, apt_resident_id, "Garbage chute blocked on 8th floor smelling foul", "Cleaning & Housekeeping", "Tower C Floor 8", "MEDIUM", "MEDIUM", "ASSIGNED", 0, False, "ROUTED", apt_team_map["Housekeeping Crew"].id),
            (apt_org.id, apt_resident_id, "Basement emergency exit light battery dead", "Electrical", "Tower B Exit Staircase", "LOW", "LOW", "UNDER_REVIEW", 2, False, "ROUTED", apt_team_map["Facility Electrical Team"].id),
            (apt_org.id, apt_resident_id, "Boom barrier not opening for registered vehicles", "Security & Access", "Main Entrance Gate 1", "MEDIUM", "MEDIUM", "RESOLVED", 5, False, "ROUTED", apt_team_map["Gate Security Force"].id),
            (apt_org.id, apt_resident_id, "Water seepage through ceiling of flat 402 from upstairs", "Plumbing", "Flat 402 Bedroom", "HIGH", "HIGH", "IN_PROGRESS", 3, False, "ROUTED", apt_team_map["In-House Plumbing Team"].id),
            (apt_org.id, apt_resident_id, "Clubhouse gym treadmill display flickering", "Electrical", "Clubhouse 2nd Floor", "LOW", "LOW", "SUBMITTED", 0, False, "ROUTED", apt_team_map["Facility Electrical Team"].id),
            (apt_org.id, apt_resident_id, "Visitor intercom phone line buzzing with static", "Security & Access", "Tower A Lobby Desk", "LOW", "LOW", "UNDER_REVIEW", 1, False, "ROUTED", apt_team_map["Gate Security Force"].id),
            (apt_org.id, apt_resident_id, "Swimming pool filtration pump making rattling sound", "Plumbing", "Pool Plant Room", "MEDIUM", "MEDIUM", "RESOLVED", 6, False, "ROUTED", apt_team_map["In-House Plumbing Team"].id),
            (apt_org.id, apt_resident_id, "Common corridor light bulbs fused on 12th floor", "Electrical", "Tower C 12th Floor Corridor", "LOW", "LOW", "ASSIGNED", 1, False, "ROUTED", apt_team_map["Facility Electrical Team"].id),
            (apt_org.id, apt_resident_id, "Lift 1 door sensor not stopping door from closing on persons", "Lifts & Elevators", "Tower B Lift 1", "CRITICAL", "CRITICAL", "IN_PROGRESS", 0, False, "ROUTED", apt_team_map["Lift AMC Partner"].id),
            (apt_org.id, apt_resident_id, "Kids play area swing chain unhooked and rusty", "Cleaning & Housekeeping", "Central Lawn Play Area", "MEDIUM", "MEDIUM", "RESOLVED", 9, False, "ROUTED", apt_team_map["Housekeeping Crew"].id),
            (apt_org.id, apt_resident_id, "Overhead tank float valve stuck causing overflow", "Plumbing", "Tower A Terrace", "HIGH", "HIGH", "ASSIGNED", 1, False, "ROUTED", apt_team_map["In-House Plumbing Team"].id),
            (apt_org.id, apt_resident_id, "EV charging point 4 not recognizing vehicle", "Electrical", "Podium Parking EV Bay", "MEDIUM", "MEDIUM", "UNDER_REVIEW", 2, False, "ROUTED", apt_team_map["Facility Electrical Team"].id),
            (apt_org.id, apt_resident_id, "CCTV camera 14 covering visitor gate offline", "Security & Access", "Visitor Gate Camera Pole", "MEDIUM", "MEDIUM", "SUBMITTED", 0, False, "ROUTED", apt_team_map["Gate Security Force"].id),
        ]

        for i, (org_id, rep_id, desc, cat_name, loc, base_sev, cur_prio, status, days_ago, is_od, routing, team_id) in enumerate(sample_complaints_data):
            ref_num = f"CF-2026-{1000 + i}"
            if not db.query(Complaint).filter(Complaint.public_reference_number == ref_num).first():
                created_dt = now - datetime.timedelta(days=days_ago)
                # Overdue complaint has target in past
                res_target = created_dt + datetime.timedelta(hours=24) if is_od else created_dt + datetime.timedelta(hours=72)

                cat_obj = (muni_cat_map if org_id == muni_org.id else apt_cat_map).get(cat_name)
                cat_id = cat_obj.id if cat_obj else None

                c = Complaint(
                    public_reference_number=ref_num,
                    organization_id=org_id,
                    reporter_id=rep_id,
                    description_original=desc,
                    category_id=cat_id,
                    location_text=loc,
                    status=status,
                    base_severity=base_sev,
                    current_priority=cur_prio,
                    routing_result=routing,
                    assigned_team_id=team_id,
                    response_deadline=created_dt + datetime.timedelta(hours=24),
                    resolution_deadline=res_target,
                    is_overdue=is_od,
                    created_at=created_dt,
                    updated_at=now,
                )
                db.add(c)
                db.flush()

                # History row
                db.add(ComplaintHistory(
                    complaint_id=c.id,
                    actor_id=rep_id,
                    field="status",
                    old_value=None,
                    new_value=status,
                    notes="Initial submission in seed data.",
                    created_at=created_dt,
                ))

                # If overdue, add prepared escalation record
                if is_od:
                    db.add(EscalationRecord(
                        complaint_id=c.id,
                        level=1,
                        state=EscalationStateEnum.PREPARED.value,
                        prepared_at=now - datetime.timedelta(days=1),
                        submitted_at=None,
                        receipt_reference=None,
                        notes="Auto-prepared escalation for overdue target.",
                    ))

        db.commit()
        print("Seed data successfully created!")
        print(f"  Organizations: 2 (Municipality & Apartment)")
        print(f"  Total Demo Accounts: {len(users_data)} (Password: {DEMO_PASSWORD})")
        print(f"  Total Complaints: {len(sample_complaints_data)}")

    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
