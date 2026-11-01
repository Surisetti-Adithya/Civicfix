import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { RecentActivityItem } from '../types';
import { BarChart3, Users, ShieldAlert, AlertTriangle, Clock, RefreshCw, FileText, CheckCircle2, ArrowRight } from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
  onSelectComplaint: (id: number) => void;
}

export default function AdminDashboard({ onNavigate, onSelectComplaint }: AdminDashboardProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);

  const fetchAdminData = async () => {
    setLoading(true);
    setError('');
    try {
      const [mRes, aRes] = await Promise.all([
        apiRequest<any>(`/reports/metrics?days=${days}`),
        apiRequest<RecentActivityItem[]>('/reports/recent-activity?limit=15'),
      ]);
      setMetrics(mRes);
      setRecentActivity(aRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load organization metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [days]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            Administrator Dashboard
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px', margin: 0 }}>
            Organization-wide complaint metrics, SLA compliance, staffing load, and audit activity.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#ffffff', fontWeight: 600 }}
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>

          <button
            onClick={fetchAdminData}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              color: '#334155',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '12px', borderRadius: '6px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
      }}>
        {/* Total complaints */}
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Total Recorded
              </span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {loading ? '...' : (metrics?.total_recorded_period ?? 0)}
              </div>
            </div>
            <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '8px', color: '#2563eb' }}>
              <FileText size={22} />
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px' }}>
            Across all categories in selected window
          </div>
        </div>

        {/* Overdue Count */}
        <div
          onClick={() => onNavigate('admin-complaints')}
          style={{
            background: '#ffffff',
            borderRadius: '8px',
            border: (metrics?.metrics?.overdue_count ?? 0) > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0',
            padding: '1.25rem',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Overdue Issues
              </span>
              <div style={{
                fontSize: '2rem',
                fontWeight: 800,
                color: (metrics?.metrics?.overdue_count ?? 0) > 0 ? '#dc2626' : '#0f172a',
                marginTop: '4px'
              }}>
                {loading ? '...' : (metrics?.metrics?.overdue_count ?? 0)}
              </div>
            </div>
            <div style={{
              background: (metrics?.metrics?.overdue_count ?? 0) > 0 ? '#fee2e2' : '#f1f5f9',
              padding: '10px',
              borderRadius: '8px',
              color: (metrics?.metrics?.overdue_count ?? 0) > 0 ? '#dc2626' : '#64748b'
            }}>
              <AlertTriangle size={22} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, marginTop: '8px' }}>
            <span>Manage overdue complaints &rarr;</span>
          </div>
        </div>

        {/* Resolution Rate */}
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Resolution Rate
              </span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
                {loading ? '...' : `${(metrics?.metrics?.resolution_rate_percent ?? 0).toFixed(1)}%`}
              </div>
            </div>
            <div style={{ background: '#dcfce7', padding: '10px', borderRadius: '8px', color: '#16a34a' }}>
              <CheckCircle2 size={22} />
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px' }}>
            Resolved vs total closed
          </div>
        </div>

        {/* Reopen Rate */}
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Reopen Rate
              </span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>
                {loading ? '...' : `${(metrics?.metrics?.reopen_rate_percent ?? 0).toFixed(1)}%`}
              </div>
            </div>
            <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '8px', color: '#d97706' }}>
              <BarChart3 size={22} />
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px' }}>
            Citizen satisfaction indicator
          </div>
        </div>
      </div>

      {/* Breakdown by Status Grid */}
      {metrics?.breakdown_by_status && (
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
            Status Distribution
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
            {Object.entries(metrics.breakdown_by_status).map(([st, cnt]: [string, any]) => (
              <div key={st} style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  {st.replace('_', ' ')}
                </span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                  {cnt}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Navigation Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <button
          onClick={() => onNavigate('admin-complaints')}
          style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '1.25rem',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Admin Complaints</span>
            <ArrowRight size={16} color="#2563eb" />
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Assign staff members & manage complaint lifecycles</span>
        </button>

        <button
          onClick={() => onNavigate('staff-management')}
          style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '1.25rem',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Staff Management</span>
            <Users size={16} color="#2563eb" />
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Add staff, adjust roles, and allocate departments</span>
        </button>

        <button
          onClick={() => onNavigate('citizen-trust')}
          style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '1.25rem',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Citizen Trust & Safety</span>
            <ShieldAlert size={16} color="#2563eb" />
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Audit scores, review appeals, run Gemma analysis</span>
        </button>

        <button
          onClick={() => onNavigate('admin-settings')}
          style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '1.25rem',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>System Settings</span>
            <ArrowRight size={16} color="#2563eb" />
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Configure categories, deadlines, and trust rules</span>
        </button>
      </div>

      {/* Recent Organization Activity */}
      <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
          Recent Activity & Audit Trail
        </h2>

        {loading ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading activity logs...</p>
        ) : recentActivity.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No recent audit activity found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {recentActivity.map((act) => (
              <div
                key={act.id}
                onClick={() => onSelectComplaint(act.complaint_id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#2563eb' }}>
                      {act.public_reference_number}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '1px 6px', background: '#e2e8f0', borderRadius: '4px', textTransform: 'uppercase' }}>
                      {act.field}
                    </span>
                    {act.actor_name && (
                      <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                        by <strong>{act.actor_name}</strong>
                      </span>
                    )}
                  </div>
                  {act.notes && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: '#334155' }}>
                      {act.notes}
                    </p>
                  )}
                </div>

                <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} />
                  <span>{new Date(act.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
