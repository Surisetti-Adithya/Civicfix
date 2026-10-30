import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Complaint, PaginatedResponse } from '../types';

interface DisasterEvent {
  id: number;
  name: string;
  type: string;
  scope: string;
  is_simulated: boolean;
  state: string;
  started_at: string;
  ended_at?: string | null;
}

interface PriorityHistoryRecord {
  id: number;
  complaint_id: number;
  previous_priority: string;
  new_priority: string;
  reason: string;
  method: string;
  created_at: string;
}

export default function DisasterOps({ onSelectComplaint }: { onSelectComplaint: (id: number) => void }) {
  const [activeEvents, setActiveEvents] = useState<DisasterEvent[]>([]);
  const [criticalComplaints, setCriticalComplaints] = useState<Complaint[]>([]);
  const [priorityHistory, setPriorityHistory] = useState<PriorityHistoryRecord[]>([]);
  const [eventName, setEventName] = useState('');
  const [eventType, setEventType] = useState('FLOOD');
  const [isSimulated, setIsSimulated] = useState(true);
  const [, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadDisasterData = async () => {
    setLoading(true);
    setError('');
    try {
      const events = await apiRequest<DisasterEvent[]>('/disaster-events');
      setActiveEvents(events);

      const compRes = await apiRequest<PaginatedResponse<Complaint>>('/complaints?priority=CRITICAL&page_size=20');
      setCriticalComplaints(compRes.items);

      const history = await apiRequest<PriorityHistoryRecord[]>('/priority-history');
      setPriorityHistory(history);
    } catch (err: any) {
      setError(err.message || 'Failed to load disaster operations data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDisasterData();
  }, []);

  const handleActivateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim()) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest('/disaster-events', {
        method: 'POST',
        body: JSON.stringify({
          name: eventName.trim(),
          type: eventType,
          scope: 'ORGANIZATION',
          is_simulated: isSimulated,
        }),
      });
      setEventName('');
      setSuccess('Disaster event activated and complaints reassessed.');
      loadDisasterData();
    } catch (err: any) {
      setError(err.message || 'Failed to activate disaster event.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndEvent = async (eventId: number) => {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/disaster-events/${eventId}/end`, { method: 'POST' });
      setSuccess('Disaster event ended and normal policies restored.');
      loadDisasterData();
    } catch (err: any) {
      setError(err.message || 'Failed to end event.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '1rem auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Critical Life Safety Alert (Rule 8.13) */}
      <div style={{
        background: '#7f1d1d',
        border: '1px solid #b91c1c',
        borderRadius: '8px',
        padding: '1rem 1.5rem',
        color: '#fef2f2',
      }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '0.02em', marginBottom: '4px' }}>
          EMERGENCY SAFETY DIRECTIVE
        </div>
        <div style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
          If there is immediate danger, contact local emergency services now. CivicFix is not an emergency service.
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px', borderRadius: '4px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px', borderRadius: '4px', fontSize: '0.875rem' }}>
          {success}
        </div>
      )}

      {/* Active Events Management */}
      <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem' }}>Disaster & Emergency Coordination</h2>

        {activeEvents.filter(e => e.state === 'ACTIVE').length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {activeEvents.filter(e => e.state === 'ACTIVE').map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  borderRadius: '6px',
                  background: ev.is_simulated ? '#fffbeb' : '#fef2f2',
                  border: ev.is_simulated ? '1px solid #f59e0b' : '1px solid #ef4444',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>{ev.name}</span>
                    {ev.is_simulated && (
                      <span style={{
                        padding: '2px 6px',
                        background: '#d97706',
                        color: '#ffffff',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        borderRadius: '4px',
                        letterSpacing: '0.05em',
                      }}>
                        SIMULATED
                      </span>
                    )}
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#dc2626' }}>
                      [ACTIVE]
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                    Type: {ev.type} | Scope: {ev.scope} | Started: {new Date(ev.started_at).toLocaleString()}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleEndEvent(ev.id)}
                  disabled={submitting}
                  style={{
                    padding: '6px 12px',
                    background: '#374151',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  End Event & Restore Normal Policy
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            No active emergency or disaster events currently declared. Normal service targets in effect.
          </p>
        )}

        {/* Activation Form */}
        <form onSubmit={handleActivateEvent} style={{ padding: '1rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Activate Disaster Event</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label htmlFor="ev-name" style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Event Name</label>
              <input
                id="ev-name"
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Flash Flood Zone 4"
                required
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              />
            </div>

            <div>
              <label htmlFor="ev-type" style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Hazard Type</label>
              <select
                id="ev-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              >
                <option value="FLOOD">FLOOD</option>
                <option value="CYCLONE">CYCLONE</option>
                <option value="FIRE">FIRE</option>
                <option value="EARTHQUAKE">EARTHQUAKE</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
              <input
                id="ev-sim"
                type="checkbox"
                checked={isSimulated}
                onChange={(e) => setIsSimulated(e.target.checked)}
              />
              <label htmlFor="ev-sim" style={{ fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                Simulated Drill Event
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !eventName.trim()}
            style={{
              padding: '8px 16px',
              background: '#b91c1c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            {submitting ? 'Activating...' : 'Activate Event & Reassess Scope'}
          </button>
        </form>
      </div>

      {/* Critical Queue & Priority Changes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Critical Queue */}
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#991b1b' }}>
            Critical Priority Queue ({criticalComplaints.length})
          </h3>
          {criticalComplaints.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No critical issues pending.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {criticalComplaints.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelectComplaint(c.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #f87171',
                    background: '#fef2f2',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{c.public_reference_number}</div>
                  <div style={{ fontSize: '0.8rem', color: '#334155' }}>{c.location_text}</div>
                  <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '2px' }}>
                    Status: {c.status} {c.is_overdue && '• [OVERDUE]'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Priority Reassessment Log */}
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            Priority Reassessment History
          </h3>
          {priorityHistory.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No priority revisions recorded.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
              {priorityHistory.map((ph) => (
                <div
                  key={ph.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '4px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Complaint #{ph.complaint_id}</strong>
                    <span style={{ color: '#2563eb', fontWeight: 600 }}>{ph.previous_priority} &rarr; {ph.new_priority}</span>
                  </div>
                  <div style={{ color: '#64748b', marginTop: '2px' }}>{ph.reason}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                    {new Date(ph.created_at).toLocaleString()} via {ph.method}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
