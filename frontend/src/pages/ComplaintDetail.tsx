import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Complaint, Team } from '../types';
import { useAuth } from '../context/AuthContext';

interface ComplaintDetailProps {
  complaintId: number;
  onBack: () => void;
}

export default function ComplaintDetail({ complaintId, onBack }: ComplaintDetailProps) {
  const { user, role } = useAuth();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Status update state
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Assignment state
  const [assignTeamId, setAssignTeamId] = useState<number | undefined>(undefined);
  const [assignNotes, setAssignNotes] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  // Reopen state
  const [reopenReason, setReopenReason] = useState('');
  const [reopenSubmitting, setReopenSubmitting] = useState(false);

  // Evidence upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const fetchComplaint = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<Complaint>(`/complaints/${complaintId}`);
      setComplaint(data);
      if (role === 'STAFF' || role === 'ORG_ADMIN' || role === 'PLATFORM_ADMIN') {
        const teamsData = await apiRequest<Team[]>('/teams');
        setTeams(teamsData);
        if (teamsData.length > 0) setAssignTeamId(teamsData[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load complaint details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaint();
  }, [complaintId]);

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatus) return;
    setStatusSubmitting(true);
    setError('');
    setActionSuccess('');
    try {
      const updated = await apiRequest<Complaint>(`/complaints/${complaintId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, notes: statusNotes || undefined }),
      });
      setComplaint(updated);
      setNewStatus('');
      setStatusNotes('');
      setActionSuccess('Status updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to update status.');
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTeamId) return;
    setAssignSubmitting(true);
    setError('');
    setActionSuccess('');
    try {
      const updated = await apiRequest<Complaint>(`/complaints/${complaintId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ team_id: assignTeamId, notes: assignNotes || undefined }),
      });
      setComplaint(updated);
      setAssignNotes('');
      setActionSuccess('Complaint assigned successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to assign complaint.');
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) return;
    setReopenSubmitting(true);
    setError('');
    setActionSuccess('');
    try {
      const updated = await apiRequest<Complaint>(`/complaints/${complaintId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason: reopenReason }),
      });
      setComplaint(updated);
      setReopenReason('');
      setActionSuccess('Issue marked as unresolved and reopened.');
    } catch (err: any) {
      setError(err.message || 'Failed to reopen complaint.');
    } finally {
      setReopenSubmitting(false);
    }
  };

  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploadingFile(true);
    setError('');
    setActionSuccess('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const token = localStorage.getItem('civicfix_token');
      const orgId = localStorage.getItem('civicfix_org_id');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (orgId) headers['X-Organization-Id'] = orgId;

      const res = await fetch(`/api/complaints/${complaintId}/evidence`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || 'Upload failed');
      }

      setSelectedFile(null);
      setActionSuccess('Evidence file uploaded successfully.');
      fetchComplaint();
    } catch (err: any) {
      setError(err.message || 'Failed to upload file.');
    } finally {
      setUploadingFile(false);
    }
  };

  const downloadFile = (evidenceId: number) => {
    const token = localStorage.getItem('civicfix_token');
    const orgId = localStorage.getItem('civicfix_org_id');
    const url = `/api/complaints/${complaintId}/evidence/${evidenceId}/download`;

    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Organization-Id': orgId || '',
      },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = `evidence-${evidenceId}`;
        link.click();
      })
      .catch(() => setError('Failed to download file.'));
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading issue details...</div>;
  }

  if (!complaint) {
    return (
      <div style={{ padding: '2rem' }}>
        <button onClick={onBack} style={{ marginBottom: '1rem' }}>&larr; Back</button>
        <p>Complaint not found.</p>
      </div>
    );
  }

  const isReporter = user?.id === complaint.reporter_id;
  const isStaffOrAdmin = role === 'STAFF' || role === 'ORG_ADMIN' || role === 'PLATFORM_ADMIN';

  return (
    <div style={{ maxWidth: '900px', margin: '1rem auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 12px',
          background: '#f1f5f9',
          border: '1px solid #cbd5e1',
          borderRadius: '4px',
          fontSize: '0.875rem',
        }}
      >
        &larr; Back to List
      </button>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px', borderRadius: '4px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {actionSuccess && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px', borderRadius: '4px', fontSize: '0.875rem' }}>
          {actionSuccess}
        </div>
      )}

      {/* Main Details Card */}
      <div style={{ background: '#ffffff', padding: '1.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
              {complaint.public_reference_number}
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
              Reported on {new Date(complaint.created_at).toLocaleString()}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 10px', borderRadius: '4px', background: '#3b82f6', color: '#ffffff', fontSize: '0.8rem', fontWeight: 700 }}>
              Status: {complaint.status}
            </span>
            <span style={{ padding: '4px 10px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.8rem', fontWeight: 700 }}>
              Priority: {complaint.current_priority}
            </span>
            <button
              type="button"
              onClick={() => {
                const token = localStorage.getItem('civicfix_token');
                const orgId = localStorage.getItem('civicfix_org_id');
                fetch(`/api/exports/complaints/${complaintId}/pdf`, {
                  headers: { Authorization: `Bearer ${token}`, 'X-Organization-Id': orgId || '' }
                })
                  .then(r => r.blob())
                  .then(blob => {
                    const link = document.createElement('a');
                    link.href = window.URL.createObjectURL(blob);
                    link.download = `evidence_pack_${complaint.public_reference_number}.pdf`;
                    link.click();
                  })
                  .catch(() => setError('Export failed.'));
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                background: '#047857',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Export Evidence Pack (PDF)
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          <div><strong>Category:</strong> {complaint.category?.name || 'Unassigned'}</div>
          <div><strong>Routing:</strong> {complaint.routing_result || 'Pending'}</div>
          <div><strong>Assigned Team:</strong> {complaint.assigned_team?.name || 'Unassigned'}</div>
          <div><strong>Location:</strong> {complaint.location_text}</div>
          <div><strong>Response Target:</strong> {complaint.response_deadline ? new Date(complaint.response_deadline).toLocaleString() : 'N/A'}</div>
          <div>
            <strong>Resolution Target:</strong> {complaint.resolution_deadline ? new Date(complaint.resolution_deadline).toLocaleString() : 'N/A'}
            {complaint.is_overdue && <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: '4px' }}>[Target Missed]</span>}
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Description</h3>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#1e293b' }}>
            {complaint.description_original}
          </p>

          {complaint.description_improved && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>
                AI suggestion (Clarity Improvement Accepted)
              </span>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#166534' }}>
                {complaint.description_improved}
              </p>
            </div>
          )}
        </div>

        {/* Reopen Action for Resolved Complaints */}
        {complaint.status === 'RESOLVED' && (isReporter || isStaffOrAdmin) && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#92400e', marginBottom: '0.5rem' }}>
              Is this issue still unresolved?
            </h4>
            <form onSubmit={handleReopen} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                type="text"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Explain why the problem still persists..."
                required
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              />
              <button
                type="submit"
                disabled={reopenSubmitting}
                style={{ alignSelf: 'flex-start', padding: '6px 12px', background: '#d97706', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem' }}
              >
                {reopenSubmitting ? 'Reopening...' : 'Mark as Unresolved (Reopen)'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Staff Actions Panel */}
      {isStaffOrAdmin && (
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Staff & Administrative Actions</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Update Status Form */}
            <form onSubmit={handleStatusUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label htmlFor="new-status" style={{ fontSize: '0.875rem', fontWeight: 600 }}>Update Status</label>
              <select
                id="new-status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                required
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              >
                <option value="">Select Target Status</option>
                <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                <option value="ASSIGNED">ASSIGNED</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="AWAITING_INFORMATION">AWAITING_INFORMATION</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="CLOSED">CLOSED</option>
              </select>

              <input
                type="text"
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Reason or update notes..."
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              />

              <button
                type="submit"
                disabled={statusSubmitting || !newStatus}
                style={{ alignSelf: 'flex-start', padding: '6px 14px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem' }}
              >
                {statusSubmitting ? 'Updating...' : 'Apply Status'}
              </button>
            </form>

            {/* Reassign Team Form */}
            <form onSubmit={handleAssign} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label htmlFor="assign-team" style={{ fontSize: '0.875rem', fontWeight: 600 }}>Assign Responsible Team</label>
              <select
                id="assign-team"
                value={assignTeamId || ''}
                onChange={(e) => setAssignTeamId(Number(e.target.value))}
                required
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              >
                <option value="">Select Team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              <input
                type="text"
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="Assignment notes..."
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              />

              <button
                type="submit"
                disabled={assignSubmitting || !assignTeamId}
                style={{ alignSelf: 'flex-start', padding: '6px 14px', background: '#4338ca', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem' }}
              >
                {assignSubmitting ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Evidence Files Section */}
      <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Evidence and Attachments</h3>

        {complaint.evidence_files && complaint.evidence_files.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {complaint.evidence_files.map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  <strong>{file.original_name}</strong>
                  <span style={{ color: '#64748b', marginLeft: '8px' }}>
                    ({(file.size_bytes / 1024).toFixed(1)} KB) - Hash: {file.file_hash.slice(0, 10)}...
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => downloadFile(file.id)}
                  style={{ padding: '4px 8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.75rem' }}
                >
                  Download File
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
            No evidence files attached to this report yet.
          </p>
        )}

        {(isReporter || isStaffOrAdmin) && (
          <form onSubmit={handleUploadEvidence} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,.txt"
              onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
              required
              style={{ fontSize: '0.875rem' }}
            />
            <button
              type="submit"
              disabled={uploadingFile || !selectedFile}
              style={{ padding: '6px 12px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem' }}
            >
              {uploadingFile ? 'Uploading...' : 'Upload Evidence'}
            </button>
          </form>
        )}
      </div>

      {/* History Timeline */}
      <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Audit Timeline and Event History</h3>

        {complaint.history && complaint.history.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {complaint.history.map((h) => (
              <div
                key={h.id}
                style={{
                  borderLeft: '3px solid #3b82f6',
                  paddingLeft: '1rem',
                  paddingTop: '2px',
                  paddingBottom: '2px',
                }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {h.field.toUpperCase()}: {h.old_value ? `${h.old_value} -> ` : ''}{h.new_value}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {new Date(h.created_at).toLocaleString()} by {h.actor?.full_name || 'System / Auto'}
                </div>
                {h.notes && (
                  <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '2px' }}>
                    Notes: {h.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No history records found.</p>
        )}
      </div>
    </div>
  );
}
