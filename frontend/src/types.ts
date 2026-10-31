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
  created_at: string;
  organization?: Organization;
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
}
