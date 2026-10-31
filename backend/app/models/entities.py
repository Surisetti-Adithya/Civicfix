import datetime
import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class RoleEnum(str, enum.Enum):
    CITIZEN = "CITIZEN"
    STAFF = "STAFF"
    ORG_ADMIN = "ORG_ADMIN"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"


class ComplaintStatusEnum(str, enum.Enum):
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    AWAITING_INFORMATION = "AWAITING_INFORMATION"
    RESOLVED = "RESOLVED"
    REOPENED = "REOPENED"
    REJECTED = "REJECTED"
    CLOSED = "CLOSED"


class SeverityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class PriorityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class VerificationAnswerEnum(str, enum.Enum):
    STILL_EXISTS = "STILL_EXISTS"
    APPEARS_RESOLVED = "APPEARS_RESOLVED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    VERIFIED_REAL = "VERIFIED_REAL"


class DeadlineModeEnum(str, enum.Enum):
    NORMAL = "NORMAL"
    DISASTER = "DISASTER"


class EscalationStateEnum(str, enum.Enum):
    PREPARED = "PREPARED"
    READY_FOR_MANUAL_SUBMISSION = "READY_FOR_MANUAL_SUBMISSION"
    SUBMITTED = "SUBMITTED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    REJECTED = "REJECTED"
    RESOLVED = "RESOLVED"


class DisasterStateEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class DemoIdentityStateEnum(str, enum.Enum):
    DEMO_VERIFIED = "DEMO_VERIFIED"
    DEMO_UNVERIFIED = "DEMO_UNVERIFIED"
    DEMO_REJECTED = "DEMO_REJECTED"


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone_number = Column(String(50), nullable=True)
    permanent_location = Column(String(500), nullable=True)
    trust_level = Column(Integer, default=50, nullable=False)
    home_latitude = Column(Float, nullable=True)
    home_longitude = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    @property
    def badge_title(self) -> str:
        lvl = self.trust_level or 0
        if lvl >= 500:
            return "Civic Champion"
        elif lvl >= 250:
            return "Community Guardian"
        elif lvl >= 100:
            return "Trusted Citizen"
        elif lvl >= 25:
            return "Active Contributor"
        return "New Resident"

    @property
    def badge_tier(self) -> str:
        lvl = self.trust_level or 0
        if lvl >= 500:
            return "PLATINUM"
        elif lvl >= 250:
            return "GOLD"
        elif lvl >= 100:
            return "SILVER"
        elif lvl >= 25:
            return "BRONZE"
        return "NEW"

    memberships = relationship("Membership", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    type = Column(String(100), nullable=False)  # e.g., "MUNICIPALITY", "APARTMENT"
    time_zone = Column(String(100), default="UTC", nullable=False)
    settings = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    memberships = relationship("Membership", back_populates="organization", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="organization", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="organization", cascade="all, delete-orphan")
    complaints = relationship("Complaint", back_populates="organization", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(255), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    active_organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="sessions")
    active_organization = relationship("Organization")


class Membership(Base):
    __tablename__ = "memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(50), nullable=False, default=RoleEnum.CITIZEN.value)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="memberships")
    organization = relationship("Organization", back_populates="memberships")

    __table_args__ = (
        UniqueConstraint("user_id", "organization_id", name="uq_user_organization"),
    )


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="categories")
    category_team_maps = relationship("CategoryTeamMap", back_populates="category", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_category_org_name"),
    )


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="teams")
    category_team_maps = relationship("CategoryTeamMap", back_populates="team", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_team_org_name"),
    )


class CategoryTeamMap(Base):
    __tablename__ = "category_team_maps"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)

    category = relationship("Category", back_populates="category_team_maps")
    team = relationship("Team", back_populates="category_team_maps")

    __table_args__ = (
        UniqueConstraint("organization_id", "category_id", "team_id", name="uq_category_team_map"),
    )


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    public_reference_number = Column(String(50), unique=True, index=True, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    description_original = Column(Text, nullable=False)
    description_improved = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    
    location_text = Column(String(500), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    status = Column(String(50), default=ComplaintStatusEnum.SUBMITTED.value, nullable=False)
    base_severity = Column(String(50), default=SeverityEnum.MEDIUM.value, nullable=False)
    current_priority = Column(String(50), default=PriorityEnum.MEDIUM.value, nullable=False)
    routing_result = Column(String(100), nullable=True)  # e.g., "ROUTED", "AUTHORITY_NOT_IDENTIFIED"
    
    assigned_team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    response_deadline = Column(DateTime(timezone=True), nullable=True)
    resolution_deadline = Column(DateTime(timezone=True), nullable=True)
    is_overdue = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="complaints")
    reporter = relationship("User", foreign_keys=[reporter_id])
    category = relationship("Category")
    assigned_team = relationship("Team", foreign_keys=[assigned_team_id])
    assigned_user = relationship("User", foreign_keys=[assigned_user_id])
    
    history = relationship("ComplaintHistory", back_populates="complaint", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="complaint", cascade="all, delete-orphan")
    evidence_files = relationship("EvidenceFile", back_populates="complaint", cascade="all, delete-orphan")
    verifications = relationship("CommunityVerification", back_populates="complaint", cascade="all, delete-orphan")
    escalation_records = relationship("EscalationRecord", back_populates="complaint", cascade="all, delete-orphan")
    priority_history = relationship("PriorityHistory", back_populates="complaint", cascade="all, delete-orphan")
    deadline_changes = relationship("DeadlineChange", back_populates="complaint", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_complaint_org_status", "organization_id", "status"),
        Index("ix_complaint_org_priority", "organization_id", "current_priority"),
    )


class ComplaintHistory(Base):
    __tablename__ = "complaint_history"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    field = Column(String(100), nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    complaint = relationship("Complaint", back_populates="history")
    actor = relationship("User")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    complaint = relationship("Complaint", back_populates="assignments")
    team = relationship("Team")
    user = relationship("User", foreign_keys=[user_id])
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])


class EvidenceFile(Base):
    __tablename__ = "evidence_files"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False)
    uploader_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    storage_key = Column(String(255), unique=True, index=True, nullable=False)
    original_name = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    file_hash = Column(String(128), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    complaint = relationship("Complaint", back_populates="evidence_files")
    uploader = relationship("User")


class CommunityVerification(Base):
    __tablename__ = "community_verifications"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    answer = Column(String(50), nullable=False)  # VerificationAnswerEnum
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    complaint = relationship("Complaint", back_populates="verifications")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("complaint_id", "user_id", name="uq_complaint_user_verification"),
    )


class DuplicateGroup(Base):
    __tablename__ = "duplicate_groups"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    primary_complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    primary_complaint = relationship("Complaint")
    created_by = relationship("User")
    links = relationship("DuplicateLink", back_populates="group", cascade="all, delete-orphan")


class DuplicateLink(Base):
    __tablename__ = "duplicate_links"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("duplicate_groups.id", ondelete="CASCADE"), nullable=False)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False)
    linked_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    linked_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    group = relationship("DuplicateGroup", back_populates="links")
    complaint = relationship("Complaint")
    linked_by = relationship("User")

    __table_args__ = (
        UniqueConstraint("group_id", "complaint_id", name="uq_group_complaint_link"),
    )


class DeadlineRule(Base):
    __tablename__ = "deadline_rules"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=True)
    response_hours = Column(Integer, default=24, nullable=False)
    resolution_hours = Column(Integer, default=72, nullable=False)
    mode = Column(String(50), default=DeadlineModeEnum.NORMAL.value, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    organization = relationship("Organization")
    category = relationship("Category")


class DeadlineChange(Base):
    __tablename__ = "deadline_changes"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False)
    target_type = Column(String(50), nullable=False)  # "RESPONSE" or "RESOLUTION"
    original_target = Column(DateTime(timezone=True), nullable=False)
    new_target = Column(DateTime(timezone=True), nullable=False)
    effective_time = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    reason = Column(String(255), nullable=False)

    complaint = relationship("Complaint", back_populates="deadline_changes")


class EscalationRule(Base):
    __tablename__ = "escalation_rules"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    level_order = Column(Integer, nullable=False)  # 1, 2, 3...
    target_role_or_channel = Column(String(100), nullable=False)  # e.g., "SUPERVISOR", "WARD_OFFICER"
    trigger = Column(String(100), default="RESPONSE_OVERDUE", nullable=False)  # e.g., "RESPONSE_OVERDUE", "RESOLUTION_OVERDUE"
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    organization = relationship("Organization")


class EscalationRecord(Base):
    __tablename__ = "escalation_records"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False)
    level = Column(Integer, nullable=False)
    state = Column(String(50), default=EscalationStateEnum.PREPARED.value, nullable=False)
    prepared_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    receipt_reference = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)

    complaint = relationship("Complaint", back_populates="escalation_records")


class DisasterEvent(Base):
    __tablename__ = "disaster_events"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(100), nullable=False)  # e.g. "FLOOD", "CYCLONE", "FIRE"
    scope = Column(String(255), nullable=False)  # e.g. "ORGANIZATION", "WARD_4"
    is_simulated = Column(Boolean, default=False, nullable=False)
    state = Column(String(50), default=DisasterStateEnum.ACTIVE.value, nullable=False)
    activated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization")
    activated_by = relationship("User")


class PriorityHistory(Base):
    __tablename__ = "priority_history"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False)
    disaster_event_id = Column(Integer, ForeignKey("disaster_events.id", ondelete="SET NULL"), nullable=True)
    previous_priority = Column(String(50), nullable=False)
    new_priority = Column(String(50), nullable=False)
    reason = Column(Text, nullable=False)
    method = Column(String(50), nullable=False)  # e.g. "AUTOMATED_DISASTER_REASSESSMENT", "STAFF_OVERRIDE"
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    idempotency_key = Column(String(255), unique=True, index=True, nullable=False)

    complaint = relationship("Complaint", back_populates="priority_history")
    disaster_event = relationship("DisasterEvent")


class AiCallLog(Base):
    __tablename__ = "ai_call_logs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    feature = Column(String(100), nullable=False)  # "improve-description", "suggest-category", "duplicate-candidates"
    model_name = Column(String(100), nullable=False)
    status = Column(String(50), nullable=False)  # "SUCCESS", "TIMEOUT", "REJECTED_HALLUCINATION", "ERROR"
    latency_ms = Column(Integer, nullable=False)
    input_size = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    link = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    details = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    organization = relationship("Organization")
    actor = relationship("User")


class DemoIdentity(Base):
    __tablename__ = "demo_identities"

    id = Column(Integer, primary_key=True, index=True)
    synthetic_id = Column(String(100), unique=True, index=True, nullable=False)  # e.g., "DEMO-ID-0001"
    full_name = Column(String(255), nullable=False)
    state = Column(String(50), default=DemoIdentityStateEnum.DEMO_VERIFIED.value, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class VerificationRecord(Base):
    __tablename__ = "verification_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    demo_identity_id = Column(Integer, ForeignKey("demo_identities.id", ondelete="CASCADE"), nullable=False)
    verified_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    status = Column(String(50), default=DemoIdentityStateEnum.DEMO_VERIFIED.value, nullable=False)

    user = relationship("User")
    demo_identity = relationship("DemoIdentity")
