import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Complaint, Category, Team, PaginatedResponse } from '../types';
import { Search, MapPin, ArrowRight, X } from 'lucide-react';

interface StaffComplaintsProps {
  onSelectComplaint: (id: number) => void;
  initialFilter?: { status?: string; overdue?: boolean; assignedToMe?: boolean };
}

export default function StaffComplaints({ onSelectComplaint, initialFilter }: StaffComplaintsProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialFilter?.status || '');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(initialFilter?.overdue || false);
  const [sortBy, setSortBy] = useState<'severity' | 'latest'>('severity');

  // Status update modal state
  const [updatingComplaint, setUpdatingComplaint] = useState<Complaint | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState('');

  const loadMetadata = async () => {
    try {
      const [cats, tms] = await Promise.all([
        apiRequest<Category[]>('/categories'),
        apiRequest<Team[]>('/teams'),
      ]);
      setCategories(cats);
      setTeams(tms);
    } catch {
      // ignore metadata failure
    }
  };

  const fetchComplaints = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('page_size', '15');
      params.set('sort_by', sortBy);
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
  }, [page, statusFilter, priorityFilter, categoryFilter, teamFilter, overdueOnly, sortBy]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchComplaints();
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingComplaint || !newStatus) return;
    setStatusSubmitting(true);
    setStatusSuccess('');
    try {
      await apiRequest(`/complaints/${updatingComplaint.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          notes: statusNotes.trim() || undefined,
        }),
      });
      setStatusSuccess(`Updated status of #${updatingComplaint.public_reference_number} to ${newStatus}`);
      setUpdatingComplaint(null);
      setNewStatus('');
      setStatusNotes('');
      fetchComplaints();
    } catch (err: any) {
      setError(err.message || 'Failed to update complaint status.');
    } finally {
      setStatusSubmitting(false);
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

  const getPriorityBadge = (pr: string) => {
    const isCritical = pr === 'CRITICAL';
    const isHigh = pr === 'HIGH';
    return {
      background: isCritical ? '#fee2e2' : isHigh ? '#ffedd5' : '#f1f5f9',
      color: isCritical ? '#991b1b' : isHigh ? '#9a3412' : '#334155',
      border: isCritical ? '1px solid #f87171' : isHigh ? '1px solid #fdba74' : '1px solid #cbd5e1',
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
          Staff Complaints Directory
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px' }}>
          Search, filter, review detailed records, and update ticket operational statuses.
        </p>
      </div>

      {statusSuccess && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: '6px', fontSize: '0.875rem' }}>
          {statusSuccess}
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 14px', borderRadius: '6px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Search and Filters Bar */}
      <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.25rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            <input
              type="text"
              placeholder="Search by keywords, location, or reference number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px 8px 34px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setPage(1); }}
              style={{
                padding: '8px 12px',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </form>

        {/* Filter dropdowns */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem', background: '#f8fafc' }}
            >
              <option value="">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="AWAITING_INFORMATION">Awaiting Info</option>
              <option value="RESOLVED">Resolved</option>
              <option value="REOPENED">Reopened</option>
              <option value="REJECTED">Rejected</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <select
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem', background: '#f8fafc' }}
            >
              <option value="">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div>
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
            </div>
          )}

          {/* Department / Team */}
          {teams.length > 0 && (
            <div>
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
            </div>
          )}

          {/* Overdue checkbox */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', fontWeight: 600, color: overdueOnly ? '#dc2626' : '#475569', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1); }}
            />
            Overdue Only
          </label>

          {/* Sort order */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as 'severity' | 'latest'); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem', background: '#f8fafc', fontWeight: 600 }}
            >
              <option value="severity">Priority (Critical First)</option>
              <option value="latest">Latest Created</option>
            </select>
          </div>
        </div>
      </div>

      {/* List Count and Results */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
          Showing {complaints.length} of {total} tickets
        </span>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading complaints...</p>
      ) : complaints.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          No complaints matched the criteria.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {complaints.map((item) => {
            const pBadge = getPriorityBadge(item.current_priority);
            return (
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
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
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
                      ...pBadge,
                    }}>
                      {item.current_priority}
                    </span>
                    {item.is_overdue && (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#dc2626',
                        color: '#ffffff',
                      }}>
                        OVERDUE
                      </span>
                    )}
                  </div>

                  <p style={{ margin: '4px 0 6px 0', fontSize: '0.875rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} color="#dc2626" />
                    <span>{item.location_text}</span>
                  </p>

                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: '#64748b', flexWrap: 'wrap' }}>
                    <span>Category: <strong>{item.category?.name || 'Unassigned'}</strong></span>
                    <span>Department: <strong>{item.assigned_team?.name || 'Unassigned'}</strong></span>
                    <span>Created: {new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      setUpdatingComplaint(item);
                      setNewStatus(item.status);
                      setStatusNotes('');
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#f1f5f9',
                      color: '#1e293b',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Quick Status Update
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
                    <span>Inspect</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Status Update Modal */}
      {updatingComplaint && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '8px',
            maxWidth: '480px',
            width: '100%',
            padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Update Ticket Status
              </h3>
              <button
                onClick={() => setUpdatingComplaint(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
              Updating status for <strong>#{updatingComplaint.public_reference_number}</strong> ({updatingComplaint.location_text}).
            </p>

            <form onSubmit={handleStatusUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
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
                  Operational Notes / Reason
                </label>
                <textarea
                  rows={3}
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  placeholder="Explain current progress or reason for transition..."
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setUpdatingComplaint(null)}
                  style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusSubmitting}
                  style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {statusSubmitting ? 'Saving...' : 'Commit Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
