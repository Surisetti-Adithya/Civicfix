import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Complaint, PaginatedResponse } from '../types';
import { MapPin } from 'lucide-react';

interface ComplaintListProps {
  onSelectComplaint: (id: number) => void;
  title?: string;
  initialStatus?: string;
  scope?: string;
}

export default function ComplaintList({ onSelectComplaint, title = "Issues & Reports", initialStatus = "", scope }: ComplaintListProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchComplaints = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('page_size', '15');
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (scope) params.set('scope', scope);

      const res = await apiRequest<PaginatedResponse<Complaint>>(`/complaints?${params.toString()}`);
      setComplaints(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load complaints.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, [page, statusFilter, priorityFilter, scope]);

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
    <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>{title}</h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Total recorded: {total}</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <label htmlFor="filter-status" style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Status</label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
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

          <div>
            <label htmlFor="filter-priority" style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Priority</label>
            <select
              id="filter-priority"
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
            >
              <option value="">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading issues...</p>
      ) : complaints.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: '#f8fafc', borderRadius: '6px' }}>
          No issues found matching the selected filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {complaints.map((item) => {
            const pBadge = getPriorityBadge(item.current_priority);
            return (
              <div
                key={item.id}
                onClick={() => onSelectComplaint(item.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                      {item.public_reference_number}
                    </span>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: getStatusColor(item.status),
                      color: '#ffffff',
                    }}>
                      {item.status}
                    </span>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      ...pBadge,
                    }}>
                      Priority: {item.current_priority}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.875rem', color: '#334155', margin: '4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} color="#dc2626" />
                    <span>{item.location_text}</span>
                    {item.latitude && item.longitude && (
                      <span style={{ fontSize: '0.7rem', color: '#2563eb', background: '#eff6ff', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        Mapped ({item.latitude.toFixed(3)}, {item.longitude.toFixed(3)})
                      </span>
                    )}
                  </p>

                  <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <span>Category: {item.category?.name || 'Uncategorized'}</span>
                    <span>Assigned Team: {item.assigned_team?.name || 'Unassigned'}</span>
                    <span>Created: {new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                  {item.resolution_deadline && (
                    <div style={{ color: item.is_overdue ? '#dc2626' : '#64748b' }}>
                      Target resolution: {new Date(item.resolution_deadline).toLocaleDateString()}
                      {item.is_overdue && <span style={{ fontWeight: 700, marginLeft: '4px' }}>[Overdue]</span>}
                    </div>
                  )}
                  <span style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.85rem' }}>
                    View Details &rarr;
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
