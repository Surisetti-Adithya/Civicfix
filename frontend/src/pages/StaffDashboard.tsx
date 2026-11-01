import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { StaffDashboardData } from '../types';
import { AlertTriangle, CheckCircle, Clock, FileText, ArrowRight, RefreshCw, Activity } from 'lucide-react';

interface StaffDashboardProps {
  onNavigateToComplaints: (filter?: { status?: string; overdue?: boolean; assignedToMe?: boolean }) => void;
  onSelectComplaint: (id: number) => void;
}

export default function StaffDashboard({ onNavigateToComplaints, onSelectComplaint }: StaffDashboardProps) {
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<StaffDashboardData>('/reports/staff-dashboard');
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load staff dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            Staff Operations Dashboard
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px', margin: 0 }}>
            Real-time overview of departmental queue, personal assignments, and overdue operational tickets.
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            color: '#334155',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '12px', borderRadius: '6px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1rem',
      }}>
        {/* Open Complaints */}
        <div
          onClick={() => onNavigateToComplaints({})}
          style={{
            background: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '1.25rem',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Open Complaints
              </span>
              <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {loading ? '...' : (data?.open_complaints_count ?? 0)}
              </div>
            </div>
            <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '8px', color: '#2563eb' }}>
              <FileText size={24} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '12px', fontSize: '0.8rem', color: '#2563eb', fontWeight: 600 }}>
            <span>View all queue</span>
            <ArrowRight size={14} />
          </div>
        </div>

        {/* My Assigned */}
        <div
          onClick={() => onNavigateToComplaints({ assignedToMe: true })}
          style={{
            background: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '1.25rem',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                My Assigned
              </span>
              <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#4338ca', marginTop: '4px' }}>
                {loading ? '...' : (data?.assigned_complaints_count ?? 0)}
              </div>
            </div>
            <div style={{ background: '#eef2ff', padding: '10px', borderRadius: '8px', color: '#4338ca' }}>
              <CheckCircle size={24} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '12px', fontSize: '0.8rem', color: '#4338ca', fontWeight: 600 }}>
            <span>Go to My Assignments</span>
            <ArrowRight size={14} />
          </div>
        </div>

        {/* Overdue */}
        <div
          onClick={() => onNavigateToComplaints({ overdue: true })}
          style={{
            background: '#ffffff',
            borderRadius: '8px',
            border: (data?.overdue_complaints_count ?? 0) > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0',
            padding: '1.25rem',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Overdue Escalations
              </span>
              <div style={{
                fontSize: '2.25rem',
                fontWeight: 800,
                color: (data?.overdue_complaints_count ?? 0) > 0 ? '#dc2626' : '#0f172a',
                marginTop: '4px'
              }}>
                {loading ? '...' : (data?.overdue_complaints_count ?? 0)}
              </div>
            </div>
            <div style={{
              background: (data?.overdue_complaints_count ?? 0) > 0 ? '#fee2e2' : '#f1f5f9',
              padding: '10px',
              borderRadius: '8px',
              color: (data?.overdue_complaints_count ?? 0) > 0 ? '#dc2626' : '#64748b'
            }}>
              <AlertTriangle size={24} />
            </div>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '12px',
            fontSize: '0.8rem',
            color: (data?.overdue_complaints_count ?? 0) > 0 ? '#dc2626' : '#64748b',
            fontWeight: 600
          }}>
            <span>Review SLA breach issues</span>
            <ArrowRight size={14} />
          </div>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
          <Activity size={20} color="#2563eb" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
            Recent Activity & Audit Trail
          </h2>
        </div>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '1.25rem' }}>
          Latest work notes, assignments, status transitions, and community updates across all complaints.
        </p>

        {loading ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading recent activity...</p>
        ) : !data || data.recent_activity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b', background: '#f8fafc', borderRadius: '6px' }}>
            No recent activity recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data.recent_activity.map((act) => (
              <div
                key={act.id}
                onClick={() => onSelectComplaint(act.complaint_id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  padding: '12px 14px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#2563eb' }}>
                      {act.public_reference_number}
                    </span>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: '#e2e8f0',
                      color: '#334155',
                      textTransform: 'uppercase',
                    }}>
                      {act.field}
                    </span>
                  </div>

                  {act.notes && (
                    <p style={{ margin: '4px 0', fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}>
                      "{act.notes}"
                    </p>
                  )}

                  {act.old_value && act.new_value && (
                    <p style={{ margin: '2px 0', fontSize: '0.8rem', color: '#64748b' }}>
                      Changed: <span style={{ textDecoration: 'line-through' }}>{act.old_value}</span> &rarr; <span style={{ fontWeight: 600, color: '#0f172a' }}>{act.new_value}</span>
                    </p>
                  )}

                  {act.location_text && (
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                      Location: {act.location_text}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#64748b' }}>
                  <div style={{ fontWeight: 600, color: '#334155' }}>{act.actor_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', marginTop: '2px' }}>
                    <Clock size={12} />
                    <span>{new Date(act.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
