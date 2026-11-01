export interface ApiError {
  code: string;
  message: string;
  details: Record<string, string>;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone_number?: string | null;
  permanent_location?: string | null;
  is_active: boolean;
  created_at: string;
  trust_level?: number;
  badge_title?: string;
  badge_tier?: string;
  home_latitude?: number | null;
  home_longitude?: number | null;
  account_status?: 'ACTIVE' | 'RESTRICTED' | 'BANNED';
  status_reason?: string | null;
}

export interface VerificationSummary {
  complaint_id: number;
  total_responses: number;
  counts: Record<string, number>;
  user_answer?: string | null;
  verified_count: number;
}

export interface Organization {
  id: number;
  name: string;
  slug: string;
  type: string;
  time_zone: string;
  settings: Record<string, any>;
  created_at: string;
}

export interface Membership {
  id: number;
  user_id: number;
  organization_id: number;
  role: 'CITIZEN' | 'STAFF' | 'ORG_ADMIN' | 'PLATFORM_ADMIN';
  team_id?: number | null;
  team_name?: string | null;
  created_at: string;
  organization?: Organization;
  team?: Team | null;
  user?: User;
}

export interface SessionResponse {
  token: string;
  user: User;
  active_organization: Organization | null;
  role: string | null;
  memberships: Membership[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface Category {
  id: number;
  organization_id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Team {
  id: number;
  organization_id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ComplaintHistory {
  id: number;
  complaint_id: number;
  actor_id?: number | null;
  field: string;
  old_value?: string | null;
  new_value?: string | null;
  notes?: string | null;
  created_at: string;
  actor?: User | null;
}

export interface Assignment {
  id: number;
  complaint_id: number;
  team_id: number;
  user_id?: number | null;
  notes?: string | null;
  created_at: string;
  team?: Team | null;
  user?: User | null;
}

export interface EvidenceFile {
  id: number;
  complaint_id: number;
  uploader_id: number;
  original_name: string;
  content_type: string;
  size_bytes: number;
  file_hash: string;
  uploaded_at: string;
  uploader?: User | null;
}

export interface ComplaintExtension {
  id: number;
  complaint_id: number;
  user_id: number;
  text: string;
  location_text?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_ai_merged: boolean;
  similarity_reason?: string | null;
  created_at: string;
  user?: User | null;
}

export interface ComplaintTimelineEntry {
  id: string;
  entry_type: string;
  timestamp: string;
  author_name: string;
  author_id?: number | null;
  author_trust_level?: number | null;
  author_badge_title?: string | null;
  author_badge_tier?: string | null;
  text?: string | null;
  location_text?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  photos: EvidenceFile[];
  notes?: string | null;
}

export interface Complaint {
  id: number;
  public_reference_number: string;
  organization_id: number;
  reporter_id: number;
  category_id?: number | null;
  location_text: string;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  base_severity: string;
  current_priority: string;
  routing_result?: string | null;
  assigned_team_id?: number | null;
  assigned_user_id?: number | null;
  response_deadline?: string | null;
  resolution_deadline?: string | null;
  is_overdue: boolean;
  is_staff_verified?: boolean;
  staff_verification_notes?: string | null;
  staff_verified_by_id?: number | null;
  priority_manually_set?: boolean;
  staff_verified_by?: User | null;
  created_at: string;
  updated_at: string;
  description_original?: string;
  description_improved?: string | null;
  category?: Category | null;
  assigned_team?: Team | null;
  assigned_user?: User | null;
  reporter?: User | null;
  history?: ComplaintHistory[];
  assignments?: Assignment[];
  evidence_files?: EvidenceFile[];
  extensions?: ComplaintExtension[];
  timeline_entries?: ComplaintTimelineEntry[];
  is_merged?: boolean;
  merged_into_id?: number | null;
  merge_reason?: string | null;
}

export interface RecentActivityItem {
  id: number;
  complaint_id: number;
  public_reference_number: string;
  location_text?: string;
  field: string;
  old_value?: string | null;
  new_value?: string | null;
  notes?: string | null;
  actor_id?: number | null;
  actor_name: string;
  created_at: string;
}

export interface StaffDashboardData {
  open_complaints_count: number;
  assigned_complaints_count: number;
  overdue_complaints_count: number;
  recent_activity: RecentActivityItem[];
}

export interface TrustScoreHistoryItem {
  id: number;
  user_id: number;
  organization_id?: number | null;
  previous_score: number;
  new_score: number;
  change_amount: number;
  reason: string;
  rule_name: string;
  actor_id?: number | null;
  actor_name?: string | null;
  created_at: string;
}

export interface CitizenAppealItem {
  id: number;
  user_id: number;
  organization_id: number;
  appeal_type: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  admin_notes?: string | null;
  reviewed_by_id?: number | null;
  reviewed_by_name?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

export interface CitizenSummary {
  user_id: number;
  full_name: string;
  email: string;
  phone_number?: string | null;
  permanent_location?: string | null;
  trust_level: number;
  badge_title: string;
  badge_tier: string;
  account_status: 'ACTIVE' | 'RESTRICTED' | 'BANNED';
  status_reason?: string | null;
  status_updated_at?: string | null;
  report_count: number;
  verification_count: number;
  pending_appeals_count: number;
  suspicious_flags: string[];
}

export interface ComplaintBriefTrust {
  id: number;
  public_reference_number: string;
  description: string;
  category_name?: string | null;
  location_text: string;
  status: string;
  current_priority: string;
  is_overdue: boolean;
  is_staff_verified?: boolean;
  staff_verification_notes?: string | null;
  staff_verified_by_id?: number | null;
  priority_manually_set?: boolean;
  staff_verified_by?: User | null;
  created_at: string;
}

export interface VerificationBriefTrust {
  id: number;
  complaint_id: number;
  complaint_reference: string;
  answer: string;
  notes?: string | null;
  created_at: string;
}

export interface CitizenDetail extends CitizenSummary {
  status_updated_by_name?: string | null;
  reports: ComplaintBriefTrust[];
  verifications: VerificationBriefTrust[];
  trust_history: TrustScoreHistoryItem[];
  appeals: CitizenAppealItem[];
}

export interface GemmaPatternAnalysisResponse {
  citizen_id: number;
  citizen_name: string;
  suspicious_flags: string[];
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  summary_analysis: string;
  recommended_action: 'NO_ACTION' | 'FLAG_FOR_REVIEW' | 'ADJUST_TRUST_SCORE';
  recommended_trust_adjustment: number;
  recommendation_reason: string;
  is_ai_suggestion: boolean;
  disclaimer: string;
}

export interface TrustRulesConfig {
  report_quality_bonus: number;
  duplicate_extension_bonus: number;
  verification_outcome_bonus: number;
  confirmed_abuse_penalty: number;
  unresolved_unverified_penalty: number;
}

