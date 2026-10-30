import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Organization, PaginatedResponse } from '../types';

interface MetricDetail {
  value: number;
  definition: string;
  unit: string;
}

interface PublicMetricsData {
  organization_id: number;
  organization_name: string;
  organization_type: string;
  time_zone: string;
  time_period: string;
  metrics: Record<string, MetricDetail>;
  breakdown_by_status: Record<string, number>;
  total_recorded_period: number;
}

export default function PublicMetrics() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [metricsData, setMetricsData] = useState<PublicMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<PaginatedResponse<Organization>>('/organizations')
      .then((res) => {
        setOrganizations(res.items);
        if (res.items.length > 0) {
          const defaultId = Number(localStorage.getItem('civicfix_org_id')) || res.items[0].id;
          setSelectedOrgId(defaultId);
        }
      })
      .catch((err) => setError(err.message || 'Could not load organizations.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError('');
    apiRequest<PublicMetricsData>(`/reports/public-metrics?org_id=${selectedOrgId}&days=30`)
      .then((data) => setMetricsData(data))
      .catch((err) => setError(err.message || 'Could not load metrics.'))
      .finally(() => setLoading(false));
  }, [selectedOrgId]);

  return (
    <div style={{ maxWidth: '1000px', margin: '1rem auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ background: '#ffffff', padding: '1.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Public Transparency Dashboard</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px' }}>
              Aggregate operational performance and service target compliance. All metrics exclude personal identifiable information.
            </p>
          </div>

          {organizations.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label htmlFor="pub-org" style={{ fontSize: '0.875rem', fontWeight: 600 }}>Organization:</label>
              <select
                id="pub-org"
                value={selectedOrgId || ''}
                onChange={(e) => setSelectedOrgId(Number(e.target.value))}
                style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.type})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px', borderRadius: '4px', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Computing aggregate metrics...</p>
        ) : metricsData ? (
          <div>
            <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: '0.875rem', color: '#475569' }}>
              <span><strong>Evaluation Window:</strong> {metricsData.time_period}</span>
              <span><strong>Total Reports Recorded:</strong> {metricsData.total_recorded_period}</span>
              <span><strong>Time Zone:</strong> {metricsData.time_zone}</span>
            </div>

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              {Object.entries(metricsData.metrics).map(([key, item]) => {
                const label = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                const isOverdue = key === 'overdue_complaints' && item.value > 0;
                return (
                  <div
                    key={key}
                    style={{
                      background: '#ffffff',
                      border: isOverdue ? '1px solid #f87171' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: isOverdue ? '#dc2626' : '#0f172a', margin: '0.25rem 0' }}>
                        {item.value} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#64748b' }}>{item.unit}</span>
                      </div>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem', marginTop: '0.5rem', lineHeight: 1.4 }}>
                      <strong>Definition:</strong> {item.definition}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Status Breakdown Table */}
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Status Distribution</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
              {Object.entries(metricsData.breakdown_by_status).map(([st, cnt]) => (
                <div key={st} style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>{st}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>{cnt}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
