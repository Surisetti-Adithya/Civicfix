import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Complaint, PaginatedResponse } from '../types';
import { CheckCircle, MapPin, Upload, MessageSquare, X } from 'lucide-react';

interface MyAssignmentsProps {
  onSelectComplaint: (id: number) => void;
}

export default function MyAssignments({ onSelectComplaint }: MyAssignmentsProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Selected complaint for quick inline action
  const [activeComplaint, setActiveComplaint] = useState<Complaint | null>(null);
  const [activeTab, setActiveTab] = useState<'verify' | 'notes' | 'evidence' | 'status'>('verify');

  // Staff verification state
  const [staffVerifyIsValid, setStaffVerifyIsValid] = useState(true);
  const [staffVerifyNotes, setStaffVerifyNotes] = useState('');
  const [submittingStaffVerify, setSubmittingStaffVerify] = useState(false);

  // Work note state
  const [workNoteText, setWorkNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  // Evidence upload state
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceSubmitting, setEvidenceSubmitting] = useState(false);

  // Status update state
  const [statusVal, setStatusVal] = useState('IN_PROGRESS');
  const [statusNotes, setStatusNotes] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const fetchMyAssignments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<PaginatedResponse<Complaint>>('/complaints?assigned_to_me=true&page_size=50');
      setComplaints(res.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load assigned complaints.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyAssignments();
  }, []);

  const handleStaffVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplaint || !staffVerifyNotes.trim()) return;
    setSubmittingStaffVerify(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/complaints/${activeComplaint.id}/staff-verify`, {
        method: 'POST',
        body: JSON.stringify({ is_valid: staffVerifyIsValid, notes: staffVerifyNotes.trim() }),
      });
      setSuccess(
        staffVerifyIsValid
          ? `✓ Verified #${activeComplaint.public_reference_number} as authentic report. +15 Trust Points awarded to citizen reporter!`
          : `✕ Deemed #${activeComplaint.public_reference_number} as false/fabricated. -30 Trust Points penalty applied to citizen.`
      );
      setStaffVerifyNotes('');
      fetchMyAssignments();
    } catch (err: any) {
      setError(err.message || 'Staff verification failed.');
    } finally {
      setSubmittingStaffVerify(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplaint || !workNoteText.trim()) return;
    setNoteSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/complaints/${activeComplaint.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ notes: workNoteText.trim() }),
      });
      setSuccess(`Work note appended to #${activeComplaint.public_reference_number}`);
      setWorkNoteText('');
      fetchMyAssignments();
    } catch (err: any) {
      setError(err.message || 'Failed to record work note.');
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplaint || !evidenceFile) return;
    setEvidenceSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const formData = new FormData();
      formData.append('file', evidenceFile);

      const token = localStorage.getItem('civicfix_token');
      const orgId = localStorage.getItem('civicfix_org_id');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (orgId) headers['X-Organization-Id'] = orgId;

      const res = await fetch(`/api/complaints/${activeComplaint.id}/evidence`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Upload failed.');
      }

      setSuccess(`Resolution evidence uploaded to #${activeComplaint.public_reference_number}`);
      setEvidenceFile(null);
      fetchMyAssignments();
    } catch (err: any) {
      setError(err.message || 'Failed to upload evidence.');
    } finally {
      setEvidenceSubmitting(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplaint || !statusVal) return;
    setStatusSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/complaints/${activeComplaint.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: statusVal,
          notes: statusNotes.trim() || undefined,
        }),
      });
      setSuccess(`Status of #${activeComplaint.public_reference_number} changed to ${statusVal}`);
      setStatusNotes('');
      fetchMyAssignments();
    } catch (err: any) {
      setError(err.message || 'Failed to update status.');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
          My Assigned Tickets
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px' }}>
          Tasks assigned directly to you. Record field inspection notes, upload resolution evidence photos, and track resolution deadlines.
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

      <div style={{ display: 'grid', gridTemplateColumns: activeComplaint ? '1fr 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left Column: Complaints list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading assignments...</p>
          ) : complaints.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <CheckCircle size={36} color="#10b981" style={{ margin: '0 auto 0.5rem auto' }} />
              <p style={{ fontWeight: 600, margin: '4px 0' }}>No active assignments!</p>
              <p style={{ fontSize: '0.825rem', color: '#94a3b8' }}>You have cleared your personal assignment queue.</p>
            </div>
          ) : (
            complaints.map((item) => {
              const isSelected = activeComplaint?.id === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #2563eb' : item.is_overdue ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                    padding: '1.25rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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

                      <p style={{ margin: '6px 0 2px 0', fontSize: '0.875rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={14} color="#dc2626" />
                        <span>{item.location_text}</span>
                      </p>
                    </div>

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
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <span>Category: <strong>{item.category?.name || 'General'}</strong></span>
                    {item.resolution_deadline && (
                      <span style={{ color: item.is_overdue ? '#dc2626' : '#64748b' }}>
                        Deadline: {new Date(item.resolution_deadline).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Quick Action buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        setActiveComplaint(item);
                        setActiveTab('verify');
                      }}
                      style={{
                        padding: '6px 12px',
                        background: isSelected && activeTab === 'verify' ? '#16a34a' : '#f0fdf4',
                        color: isSelected && activeTab === 'verify' ? '#ffffff' : '#15803d',
                        border: '1px solid #86efac',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle size={13} />
                      Verify Report
                    </button>

                    <button
                      onClick={() => {
                        setActiveComplaint(item);
                        setActiveTab('notes');
                      }}
                      style={{
                        padding: '6px 12px',
                        background: isSelected && activeTab === 'notes' ? '#2563eb' : '#f1f5f9',
                        color: isSelected && activeTab === 'notes' ? '#ffffff' : '#334155',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <MessageSquare size={13} />
                      Work Note
                    </button>

                    <button
                      onClick={() => {
                        setActiveComplaint(item);
                        setActiveTab('evidence');
                      }}
                      style={{
                        padding: '6px 12px',
                        background: isSelected && activeTab === 'evidence' ? '#2563eb' : '#f1f5f9',
                        color: isSelected && activeTab === 'evidence' ? '#ffffff' : '#334155',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Upload size={13} />
                      Upload Evidence
                    </button>

                    <button
                      onClick={() => {
                        setActiveComplaint(item);
                        setActiveTab('status');
                        setStatusVal(item.status);
                      }}
                      style={{
                        padding: '6px 12px',
                        background: isSelected && activeTab === 'status' ? '#2563eb' : '#f1f5f9',
                        color: isSelected && activeTab === 'status' ? '#ffffff' : '#334155',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle size={13} />
                      Update Status
                    </button>

                    <button
                      onClick={() => onSelectComplaint(item.id)}
                      style={{
                        padding: '6px 12px',
                        marginLeft: 'auto',
                        background: 'transparent',
                        color: '#2563eb',
                        border: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      Details &rarr;
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Active Action Panel */}
        {activeComplaint && (
          <div style={{
            background: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            padding: '1.5rem',
            position: 'sticky',
            top: '1rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  Field Action for #{activeComplaint.public_reference_number}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {activeComplaint.location_text}
                </span>
              </div>
              <button
                onClick={() => setActiveComplaint(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Sub-tab navigation */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
              <button
                onClick={() => setActiveTab('verify')}
                style={{
                  background: activeTab === 'verify' ? '#16a34a' : '#f0fdf4',
                  color: activeTab === 'verify' ? '#ffffff' : '#15803d',
                  border: '1px solid #86efac',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                On-Site Verification
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                style={{
                  background: activeTab === 'notes' ? '#2563eb' : '#f1f5f9',
                  color: activeTab === 'notes' ? '#ffffff' : '#334155',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add Work Note
              </button>
              <button
                onClick={() => setActiveTab('evidence')}
                style={{
                  background: activeTab === 'evidence' ? '#2563eb' : '#f1f5f9',
                  color: activeTab === 'evidence' ? '#ffffff' : '#334155',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Upload Evidence
              </button>
              <button
                onClick={() => setActiveTab('status')}
                style={{
                  background: activeTab === 'status' ? '#2563eb' : '#f1f5f9',
                  color: activeTab === 'status' ? '#ffffff' : '#334155',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Change Status
              </button>
            </div>

            {/* TAB 0: On-site Verification */}
            {activeTab === 'verify' && (
              <form onSubmit={handleStaffVerify} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.825rem', color: '#475569' }}>
                  {activeComplaint.is_staff_verified ? (
                    <span style={{ color: '#166534', fontWeight: 600 }}>
                      ✓ Verified on-site as genuine. Citizen reporter received +15 trust points.
                    </span>
                  ) : activeComplaint.status === 'REJECTED' ? (
                    <span style={{ color: '#991b1b', fontWeight: 600 }}>
                      ✕ Deemed false/fabricated report. -30 trust penalty applied to citizen.
                    </span>
                  ) : (
                    <span>
                      Inspect this ticket on-site. Verifying hands +15 trust points to the reporter and concludes verification so citizens won't be prompted. Deeming it false penalizes -30 points and rejects the ticket.
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Staff Determination:
                  </label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: '#166534' }}>
                      <input
                        type="radio"
                        name="verifyDecision"
                        checked={staffVerifyIsValid === true}
                        onChange={() => setStaffVerifyIsValid(true)}
                      />
                      Genuine Valid Report (+15 pts)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: '#dc2626' }}>
                      <input
                        type="radio"
                        name="verifyDecision"
                        checked={staffVerifyIsValid === false}
                        onChange={() => setStaffVerifyIsValid(false)}
                      />
                      False / Fabricated (-30 pts penalty)
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Inspection Findings / Notes *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder={staffVerifyIsValid ? 'e.g. Ruptured pipe confirmed at site corner, repair crew dispatched.' : 'e.g. Inspected site, no leak found; false alarm.'}
                    value={staffVerifyNotes}
                    onChange={(e) => setStaffVerifyNotes(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingStaffVerify}
                  style={{
                    padding: '8px 16px',
                    background: staffVerifyIsValid ? '#16a34a' : '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {submittingStaffVerify ? 'Submitting...' : staffVerifyIsValid ? 'Verify Report (+15 pts)' : 'Deem False (-30 pts)'}
                </button>
              </form>
            )}

            {/* TAB 1: Add Work Note */}
            {activeTab === 'notes' && (
              <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Enter field inspection findings, parts ordered, crew arrival times, or site blockers.
                </p>
                <textarea
                  rows={4}
                  required
                  placeholder="e.g. Inspected site at 10:30 AM. Valve broken, replaced with high-pressure pipe seal. Pressure tested OK."
                  value={workNoteText}
                  onChange={(e) => setWorkNoteText(e.target.value)}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box',
                    width: '100%',
                  }}
                />
                <button
                  type="submit"
                  disabled={noteSubmitting}
                  style={{
                    padding: '8px 16px',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {noteSubmitting ? 'Posting Note...' : 'Submit Work Note'}
                </button>
              </form>
            )}

            {/* TAB 2: Upload Evidence */}
            {activeTab === 'evidence' && (
              <form onSubmit={handleUploadEvidence} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Upload on-site completion photos, signed receipts, or repair validation evidence.
                </p>
                <div style={{
                  border: '2px dashed #cbd5e1',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  background: '#f8fafc',
                }}>
                  <Upload size={28} color="#94a3b8" style={{ margin: '0 auto 8px auto' }} />
                  <input
                    type="file"
                    required
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setEvidenceFile(e.target.files[0]);
                      }
                    }}
                    style={{ fontSize: '0.85rem', display: 'block', margin: '0 auto' }}
                  />
                  {evidenceFile && (
                    <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#0f172a', fontWeight: 600 }}>
                      Selected: {evidenceFile.name} ({(evidenceFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={evidenceSubmitting || !evidenceFile}
                  style={{
                    padding: '8px 16px',
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {evidenceSubmitting ? 'Uploading...' : 'Upload Resolution Evidence'}
                </button>
              </form>
            )}

            {/* TAB 3: Change Status */}
            {activeTab === 'status' && (
              <form onSubmit={handleUpdateStatus} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Status
                  </label>
                  <select
                    value={statusVal}
                    onChange={(e) => setStatusVal(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  >
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="AWAITING_INFORMATION">AWAITING_INFORMATION</option>
                    <option value="RESOLVED">RESOLVED</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Reason / Notes
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide justification or completion remarks..."
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={statusSubmitting}
                  style={{
                    padding: '8px 16px',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {statusSubmitting ? 'Updating...' : 'Commit Status Change'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
