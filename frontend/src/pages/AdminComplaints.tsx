import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Complaint, Category, Team, Membership, PaginatedResponse } from '../types';
import { Search, MapPin, UserPlus, ArrowRight, X } from 'lucide-react';

interface AdminComplaintsProps {
  onSelectComplaint: (id: number) => void;
}

export default function AdminComplaints({ onSelectComplaint }: AdminComplaintsProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [staffMembers, setStaffMembers] = useState<Membership[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Assignment Modal
  const [assignComplaint, setAssignComplaint] = useState<Complaint | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | ''>('');
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Status Change Modal
  const [statusComplaint, setStatusComplaint] = useState<Complaint | null>(null);
  const [targetStatus, setTargetStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadMetadata = async () => {
    try {
      const orgId = localStorage.getItem('civicfix_org_id');
      const [cats, tms] = await Promise.all([
        apiRequest<Category[]>('/categories'),
        apiRequest<Team[]>('/teams'),
      ]);
      setCategories(cats);
      setTeams(tms);

      if (orgId) {
        const memRes = await apiRequest<{ items: Membership[] }>(`/organizations/${orgId}/memberships`);
        setStaffMembers(memRes.items.filter((m) => m.role === 'STAFF' || m.role === 'ORG_ADMIN'));
      }
    } catch {
      // ignore
    }
  };

  const fetchComplaints = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('page_size', '15');
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (categoryFilter) params.set('category_id', categoryFilter);
      if (teamFilter) params.set('team_id', teamFilter);
      if (overdueOnly) params.set('is_overdue', 'true');

      const res = await apiRequest<PaginatedResponse<Complaint>>(`/complaints?${params.toString()}`);
      setComplaints(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch complaints.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [page, statusFilter, priorityFilter, categoryFilter, teamFilter, overdueOnly]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignComplaint || !selectedTeamId) {
      setError('Please select a department team.');
      return;
    }
    setAssigning(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/complaints/${assignComplaint.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          team_id: Number(selectedTeamId),
          user_id: selectedUserId ? Number(selectedUserId) : undefined,
          notes: assignNotes.trim() || undefined,
        }),
      });
      setSuccess(`Complaint #${assignComplaint.public_reference_number} assigned successfully.`);
      setAssignComplaint(null);
      setSelectedTeamId('');
      setSelectedUserId('');
      setAssignNotes('');
      fetchComplaints();
    } catch (err: any) {
      setError(err.message || 'Failed to assign complaint.');
    } finally {
      setAssigning(false);
    }
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusComplaint || !targetStatus) return;
    setUpdatingStatus(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/complaints/${statusComplaint.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: targetStatus,
          notes: statusNotes.trim() || undefined,
        }),
      });
      setSuccess(`Updated #${statusComplaint.public_reference_number} to ${targetStatus}`);
      setStatusComplaint(null);
      setTargetStatus('');
      setStatusNotes('');
      fetchComplaints();
    } catch (err: any) {
      setError(err.message || 'Failed to update status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusColor = (st: string) => {
    switch (st) {
      case 'SUBMITTED': return '#475569';
      case 'UNDER_REVIEW': return '#0369a1';
      case 'ASSIGNED': return '#4338ca';
      case 'IN_PROGRESS': return '#b45309';
      case 'AWAITING_INFORMATION': return '#d97706';
      case 'RESOLVED': return '#15803d';
      case 'REOPENED': return '#b91c1c';
      case 'REJECTED': return '#6b7280';
      case 'CLOSED': return '#374151';
      default: return '#475569';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
          Admin Complaint & Dispatch Management
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px' }}>
          Assign operational teams, dispatch field officers, and govern complaint resolution lifecycles.
        </p>
      </div>

      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: '6px', fontSize: '0.875rem' }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 14px', borderRadius: '6px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.25rem' }}>
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchComplaints(); }} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            <input
              type="text"
              placeholder="Search reference numbers, location or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 10px 8px 34px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
            />
          </div>
          <button
            type="submit"
            style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
          >
            Search
          </button>
        </form>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem', background: '#f8fafc' }}
          >
            <option value="">All Statuses</option>
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="UNDER_REVIEW">UNDER_REVIEW</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="AWAITING_INFORMATION">AWAITING_INFORMATION</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="REOPENED">REOPENED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="CLOSED">CLOSED</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem', background: '#f8fafc' }}
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>

          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem', background: '#f8fafc' }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id.toString()}>{c.name}</option>
              ))}
            </select>
          )}

          {teams.length > 0 && (
            <select
              value={teamFilter}
              onChange={(e) => { setTeamFilter(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem', background: '#f8fafc' }}
            >
              <option value="">All Departments</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id.toString()}>{t.name}</option>
              ))}
            </select>
          )}

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', fontWeight: 600, color: overdueOnly ? '#dc2626' : '#475569', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1); }}
            />
            Overdue Only
          </label>
        </div>
      </div>

      {/* Complaints List */}
      <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
        Found {total} complaints matching criteria
      </span>

      {loading ? (
        <p style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading complaints...</p>
      ) : complaints.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          No complaints match the specified query.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {complaints.map((item) => (
            <div
              key={item.id}
              style={{
                background: '#ffffff',
                borderRadius: '8px',
                border: item.is_overdue ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                padding: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: '260px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                    {item.public_reference_number}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: getStatusColor(item.status),
                    color: '#ffffff',
                  }}>
                    {item.status}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: item.current_priority === 'CRITICAL' ? '#fee2e2' : '#f1f5f9',
                    color: item.current_priority === 'CRITICAL' ? '#991b1b' : '#334155',
                  }}>
                    {item.current_priority}
                  </span>
                  {item.is_overdue && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#dc2626', color: '#ffffff' }}>
                      OVERDUE
                    </span>
                  )}
                </div>

                <p style={{ margin: '4px 0 6px 0', fontSize: '0.875rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="#dc2626" />
                  <span>{item.location_text}</span>
                </p>

                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: '#64748b', flexWrap: 'wrap' }}>
                  <span>Department: <strong>{item.assigned_team?.name || 'Unassigned'}</strong></span>
                  <span>Assigned Officer: <strong>{item.assigned_user?.full_name || 'Unassigned'}</strong></span>
                  <span>Created: {new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setAssignComplaint(item);
                    setSelectedTeamId(item.assigned_team_id || (teams[0]?.id ?? ''));
                    setSelectedUserId(item.assigned_user_id || '');
                    setAssignNotes('');
                  }}
                  style={{
                    padding: '6px 12px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <UserPlus size={14} />
                  <span>Assign Staff</span>
                </button>

                <button
                  onClick={() => {
                    setStatusComplaint(item);
                    setTargetStatus(item.status);
                    setStatusNotes('');
                  }}
                  style={{
                    padding: '6px 12px',
                    background: '#f8fafc',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Change Status
                </button>

                <button
                  onClick={() => onSelectComplaint(item.id)}
                  style={{
                    padding: '6px 14px',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>Details</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ASSIGN STAFF MODAL */}
      {assignComplaint && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Assign Complaint #{assignComplaint.public_reference_number}
              </h3>
              <button onClick={() => setAssignComplaint(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Responsible Department / Team *
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(Number(e.target.value))}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="">Select a Department</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Assign Specific Staff Member (Optional)
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="">-- Unassigned to specific officer --</option>
                  {staffMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user?.full_name || `Staff #${m.user_id}`} ({m.user?.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Dispatch Notes / Instructions
                </label>
                <textarea
                  rows={3}
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="e.g. Please deploy water sensor kit and report back."
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setAssignComplaint(null)}
                  style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {assigning ? 'Dispatching...' : 'Dispatch & Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHANGE STATUS MODAL */}
      {statusComplaint && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Manage Status for #{statusComplaint.public_reference_number}
              </h3>
              <button onClick={() => setStatusComplaint(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStatusSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Target Status *
                </label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                  <option value="ASSIGNED">ASSIGNED</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="AWAITING_INFORMATION">AWAITING_INFORMATION</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Administrative Reason / Log Note
                </label>
                <textarea
                  rows={3}
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  placeholder="Record formal administrative justification for this transition..."
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setStatusComplaint(null)}
                  style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingStatus}
                  style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {updatingStatus ? 'Updating...' : 'Commit Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
