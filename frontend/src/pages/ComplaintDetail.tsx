import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Complaint, Team, VerificationSummary } from '../types';
import { useAuth } from '../context/AuthContext';
import { TrustBadge } from '../components/TrustBadge';
import { LocationPicker } from '../components/LocationPicker';
import { CheckCircle2, ShieldCheck, PlusCircle, MapPin, Clock, Image as ImageIcon, Sparkles } from 'lucide-react';

interface ComplaintDetailProps {
  complaintId: number;
  onBack: () => void;
}

export default function ComplaintDetail({ complaintId, onBack }: ComplaintDetailProps) {
  const { user, role } = useAuth();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [verification, setVerification] = useState<VerificationSummary | null>(null);
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

  // Verification state
  const [verifying, setVerifying] = useState(false);

  // Priority update state for Staff / Admin
  const [editingPriority, setEditingPriority] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState('');
  const [priorityNotes, setPriorityNotes] = useState('');
  const [savingPriority, setSavingPriority] = useState(false);

  // Staff verification state
  const [showStaffVerifyModal, setShowStaffVerifyModal] = useState(false);
  const [staffVerifyIsValid, setStaffVerifyIsValid] = useState(true);
  const [staffVerifyNotes, setStaffVerifyNotes] = useState('');
  const [submittingStaffVerify, setSubmittingStaffVerify] = useState(false);

  // Extra info contribution state
  const [extraInfoText, setExtraInfoText] = useState('');
  const [extraLocationText, setExtraLocationText] = useState('');
  const [extraLat, setExtraLat] = useState<number | null>(null);
  const [extraLng, setExtraLng] = useState<number | null>(null);
  const [extraFile, setExtraFile] = useState<File | null>(null);
  const [submittingExtra, setSubmittingExtra] = useState(false);
  const [showExtraForm, setShowExtraForm] = useState(false);

  // Standalone Evidence upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Loaded image thumbnail URLs for photos
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    if (complaint?.evidence_files) {
      const token = localStorage.getItem('civicfix_token');
      const orgId = localStorage.getItem('civicfix_org_id');
      complaint.evidence_files.forEach((file) => {
        if (file.content_type?.startsWith('image/')) {
          fetch(`/api/complaints/${complaint.id}/evidence/${file.id}/download`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Organization-Id': orgId || '',
            },
          })
            .then((r) => {
              if (r.ok) return r.blob();
              throw new Error('Image download failed');
            })
            .then((blob) => {
              const url = URL.createObjectURL(blob);
              setImageUrls((prev) => ({ ...prev, [file.id]: url }));
            })
            .catch(() => {});
        }
      });
    }
  }, [complaint]);

  const fetchComplaint = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<Complaint>(`/complaints/${complaintId}`);
      setComplaint(data);
      if (data.latitude) setExtraLat(data.latitude);
      if (data.longitude) setExtraLng(data.longitude);
      if (data.location_text) setExtraLocationText(data.location_text);

      // Fetch verification summary
      try {
        const verData = await apiRequest<VerificationSummary>(`/complaints/${complaintId}/verifications`);
        setVerification(verData);
      } catch {
        // non-blocking
      }

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

  const handleVerify = async () => {
    setVerifying(true);
    setError('');
    setActionSuccess('');
    try {
      const updatedSummary = await apiRequest<VerificationSummary>(`/complaints/${complaintId}/verifications`, {
        method: 'POST',
        body: JSON.stringify({ answer: 'VERIFIED_REAL', notes: 'Verified as authentic by community citizen.' }),
      });
      setVerification(updatedSummary);
      setActionSuccess('Report verified! Author received +5 trust points, and you received +2 trust points.');
      // Refresh complaint to reflect author's updated trust level
      const updatedComplaint = await apiRequest<Complaint>(`/complaints/${complaintId}`);
      setComplaint(updatedComplaint);
    } catch (err: any) {
      setError(err.message || 'Failed to verify report.');
    } finally {
      setVerifying(false);
    }
  };

  const handleUpdatePriority = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPriority) return;
    setSavingPriority(true);
    setError('');
    setActionSuccess('');
    try {
      const updated = await apiRequest<Complaint>(`/complaints/${complaintId}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: selectedPriority, notes: priorityNotes.trim() || undefined }),
      });
      setComplaint(updated);
      setEditingPriority(false);
      setPriorityNotes('');
      setActionSuccess(`Priority updated to ${selectedPriority} by staff.`);
    } catch (err: any) {
      setError(err.message || 'Failed to update priority.');
    } finally {
      setSavingPriority(false);
    }
  };

  const handleStaffVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffVerifyNotes.trim()) return;
    setSubmittingStaffVerify(true);
    setError('');
    setActionSuccess('');
    try {
      const updated = await apiRequest<Complaint>(`/complaints/${complaintId}/staff-verify`, {
        method: 'POST',
        body: JSON.stringify({ is_valid: staffVerifyIsValid, notes: staffVerifyNotes.trim() }),
      });
      setComplaint(updated);
      setShowStaffVerifyModal(false);
      setStaffVerifyNotes('');
      setActionSuccess(
        staffVerifyIsValid
          ? '✓ Report verified as authentic by staff. +15 Trust Points awarded to citizen reporter!'
          : '✕ Report deemed false/fabricated. -30 Trust Points penalty applied and report rejected.'
      );
    } catch (err: any) {
      setError(err.message || 'Staff verification failed.');
    } finally {
      setSubmittingStaffVerify(false);
    }
  };

  const handleAddExtraInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraInfoText.trim() && !extraFile && !extraLocationText.trim()) {
      setError('Please provide text information, an updated location, or attach a photo.');
      return;
    }
    setSubmittingExtra(true);
    setError('');
    setActionSuccess('');

    try {
      // 1. Submit text and location updates
      const updatedComplaint = await apiRequest<Complaint>(`/complaints/${complaintId}/extra-info`, {
        method: 'POST',
        body: JSON.stringify({
          information: extraInfoText.trim() || 'Contributed additional details / media.',
          updated_location: extraLocationText.trim() || undefined,
          latitude: extraLat ?? undefined,
          longitude: extraLng ?? undefined,
        }),
      });
      setComplaint(updatedComplaint);

      // 2. Submit evidence file if attached
      if (extraFile) {
        const formData = new FormData();
        formData.append('file', extraFile);
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
          throw new Error(errJson.message || 'Evidence upload failed');
        }
      }

      setExtraInfoText('');
      setExtraFile(null);
      setShowExtraForm(false);
      setActionSuccess('Extra information contributed! Original reporter received +15 trust points, and you received +10 trust points.');
      fetchComplaint();
    } catch (err: any) {
      setError(err.message || 'Failed to submit additional information.');
    } finally {
      setSubmittingExtra(false);
    }
  };

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
      setActionSuccess('Evidence file uploaded successfully! Trust points updated.');
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
  const isAdmin = role === 'ORG_ADMIN' || role === 'PLATFORM_ADMIN';
  const isVerificationDone = Boolean(complaint.is_staff_verified || complaint.status === 'REJECTED' || complaint.status === 'CLOSED' || complaint.status === 'RESOLVED');
  const hasUserVerified = verification?.user_answer === 'VERIFIED_REAL' || verification?.user_answer === 'STILL_EXISTS';
  const verifiedCount = verification?.verified_count ?? 0;

  // Requirement 3: Unified chronological progression of all pictures, locations, and text (Newer at top)
  const timelineItems = (() => {
    if (complaint.timeline_entries && complaint.timeline_entries.length > 0) {
      return complaint.timeline_entries;
    }
    const list: any[] = [];
    if (complaint.created_at) {
      list.push({
        id: `initial-${complaint.id}`,
        entry_type: 'INITIAL_REPORT',
        timestamp: complaint.created_at,
        author_name: complaint.reporter?.full_name || 'Citizen Reporter',
        author_id: complaint.reporter_id,
        author_trust_level: complaint.reporter?.trust_level,
        author_badge_title: complaint.reporter?.badge_title,
        author_badge_tier: complaint.reporter?.badge_tier,
        text: complaint.description_original,
        location_text: complaint.location_text,
        latitude: complaint.latitude,
        longitude: complaint.longitude,
        photos: [],
        notes: complaint.description_improved,
      });
    }
    if (complaint.extensions) {
      complaint.extensions.forEach((ext) => {
        list.push({
          id: `ext-${ext.id}`,
          entry_type: ext.is_ai_merged ? 'AI_MERGED_EXTENSION' : 'COMMUNITY_CONTRIBUTION',
          timestamp: ext.created_at,
          author_name: ext.user?.full_name || 'Community Contributor',
          author_id: ext.user_id,
          author_trust_level: ext.user?.trust_level,
          author_badge_title: ext.user?.badge_title,
          author_badge_tier: ext.user?.badge_tier,
          text: ext.text,
          location_text: ext.location_text,
          latitude: ext.latitude,
          longitude: ext.longitude,
          photos: [],
          notes: ext.similarity_reason,
        });
      });
    }
    if (complaint.evidence_files) {
      complaint.evidence_files.forEach((ef) => {
        list.push({
          id: `ev-${ef.id}`,
          entry_type: 'EVIDENCE_PHOTO',
          timestamp: ef.uploaded_at,
          author_name: ef.uploader?.full_name || 'Contributor',
          author_id: ef.uploader_id,
          author_trust_level: ef.uploader?.trust_level,
          author_badge_title: ef.uploader?.badge_title,
          author_badge_tier: ef.uploader?.badge_tier,
          text: `Uploaded photo: ${ef.original_name}`,
          photos: [ef],
        });
      });
    }
    if (complaint.history) {
      complaint.history.forEach((h) => {
        if (h.field === 'status') {
          list.push({
            id: `hist-${h.id}`,
            entry_type: 'STATUS_UPDATE',
            timestamp: h.created_at,
            author_name: h.actor?.full_name || 'Staff / System',
            author_id: h.actor_id,
            author_trust_level: h.actor?.trust_level,
            author_badge_title: h.actor?.badge_title,
            author_badge_tier: h.actor?.badge_tier,
            text: `Status changed: ${h.old_value || 'None'} -> ${h.new_value}`,
            notes: h.notes,
          });
        }
      });
    }
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  })();

  return (
    <div style={{ maxWidth: '950px', margin: '1rem auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 12px',
          background: '#f1f5f9',
          border: '1px solid #cbd5e1',
          borderRadius: '4px',
          fontSize: '0.875rem',
          cursor: 'pointer',
        }}
      >
        &larr; Back to List
      </button>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 14px', borderRadius: '6px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {actionSuccess && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: '6px', fontSize: '0.875rem' }}>
          {actionSuccess}
        </div>
      )}

      {/* Main Details Card */}
      <div style={{ background: '#ffffff', padding: '1.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                {complaint.public_reference_number}
              </h1>
              {complaint.reporter && (
                <TrustBadge
                  tier={complaint.reporter.badge_tier}
                  title={complaint.reporter.badge_title}
                  trustLevel={complaint.reporter.trust_level}
                  showPoints={true}
                  size="small"
                />
              )}
            </div>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px' }}>
              Reported by <strong>{complaint.reporter?.full_name || 'Citizen'}</strong> on {new Date(complaint.created_at).toLocaleString()}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ padding: '4px 10px', borderRadius: '4px', background: '#3b82f6', color: '#ffffff', fontSize: '0.8rem', fontWeight: 700 }}>
              Status: {complaint.status}
            </span>

            {/* Priority with editable staff toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ padding: '4px 10px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.8rem', fontWeight: 700 }}>
                Priority: {complaint.current_priority}
              </span>
              {isStaffOrAdmin && (
                <button
                  type="button"
                  onClick={() => { setSelectedPriority(complaint.current_priority); setEditingPriority(!editingPriority); }}
                  style={{ padding: '4px 8px', background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {editingPriority ? 'Cancel' : 'Edit Priority'}
                </button>
              )}
            </div>

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

        {/* Staff Priority Edit Form */}
        {editingPriority && (
          <form onSubmit={handleUpdatePriority} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1.25rem', padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#334155' }}>Staff Priority Override:</span>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 600 }}
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
            <input
              type="text"
              placeholder="Reason for adjusting priority..."
              value={priorityNotes}
              onChange={(e) => setPriorityNotes(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', flex: 1, minWidth: '180px' }}
            />
            <button
              type="submit"
              disabled={savingPriority}
              style={{ padding: '5px 12px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
            >
              {savingPriority ? 'Saving...' : 'Save Priority'}
            </button>
          </form>
        )}

        {/* STAFF PORTAL VIEW: Field Staff Verification */}
        {isStaffOrAdmin ? (
          <div
            style={{
              padding: '12px 16px',
              background: complaint.is_staff_verified ? '#f0fdf4' : complaint.status === 'REJECTED' ? '#fef2f2' : '#eff6ff',
              border: `1px solid ${complaint.is_staff_verified ? '#86efac' : complaint.status === 'REJECTED' ? '#fca5a5' : '#bfdbfe'}`,
              borderRadius: '6px',
              marginBottom: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                Field Staff Verification & Inspection
              </div>
              {complaint.is_staff_verified ? (
                <div style={{ fontSize: '0.8rem', color: '#166534', marginTop: '2px' }}>
                  ✓ Verified as genuine report by field staff. +15 Trust Points handed to citizen reporter.
                  {complaint.staff_verification_notes && <span> ("{complaint.staff_verification_notes}")</span>}
                </div>
              ) : complaint.status === 'REJECTED' ? (
                <div style={{ fontSize: '0.8rem', color: '#991b1b', marginTop: '2px' }}>
                  ✕ Deemed false/fabricated report by field staff inspection. -30 Trust Points penalty applied.
                  {complaint.staff_verification_notes && <span> ("{complaint.staff_verification_notes}")</span>}
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                  Inspect on-site and verify whether this issue is genuine or false/fabricated. No community verification required from staff.
                </div>
              )}
            </div>

            {!complaint.is_staff_verified && complaint.status !== 'REJECTED' && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => { setStaffVerifyIsValid(true); setStaffVerifyNotes(''); setShowStaffVerifyModal(true); }}
                  style={{ padding: '6px 14px', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  ✓ Verify as Genuine (+15 pts)
                </button>
                <button
                  type="button"
                  onClick={() => { setStaffVerifyIsValid(false); setStaffVerifyNotes(''); setShowStaffVerifyModal(true); }}
                  style={{ padding: '6px 14px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  ✕ Deem False / Fabricated (-30 pts)
                </button>
              </div>
            )}
          </div>
        ) : (
          /* CITIZEN PORTAL VIEW: Community Verification & Trust Bar */
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              padding: '12px 16px',
              background: complaint.is_staff_verified ? '#f0fdf4' : hasUserVerified ? '#f0fdf4' : '#f8fafc',
              border: `1px solid ${complaint.is_staff_verified || hasUserVerified ? '#86efac' : '#e2e8f0'}`,
              borderRadius: '6px',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={22} color={complaint.is_staff_verified || hasUserVerified ? '#16a34a' : '#2563eb'} />
              <div>
                {complaint.is_staff_verified ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#166534' }}>
                      ✓ Verified On-Site by Municipal Staff
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                      Report confirmed authentic by field staff. Citizen verification concluded.
                    </div>
                  </>
                ) : complaint.status === 'REJECTED' ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#dc2626' }}>
                      ✕ Closed by Staff Inspection
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                      Report was investigated by staff and deemed invalid or fabricated.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>
                      {verifiedCount} Citizen{verifiedCount === 1 ? '' : 's'} Verified This Report
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      Community verification elevates ticket priority and increases reporter trust level.
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {complaint.is_staff_verified || complaint.status === 'REJECTED' ? (
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                  Verification closed
                </span>
              ) : isReporter ? (
                <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '4px' }}>
                  Your report (community verification open to neighbors)
                </span>
              ) : hasUserVerified ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    background: '#dcfce7',
                    color: '#15803d',
                    border: '1px solid #86efac',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  <CheckCircle2 size={16} /> Verified by You
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 16px',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  <ShieldCheck size={16} />
                  {verifying ? 'Verifying...' : 'Verify Report (+2 pts)'}
                </button>
              )}

              {!isVerificationDone && (
              <button
                type="button"
                onClick={() => setShowExtraForm(!showExtraForm)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  color: '#334155',
                }}
              >
                <PlusCircle size={16} color="#0284c7" />
                {showExtraForm ? 'Hide Contribution' : 'Add Extra Info / Photo (+10 pts)'}
              </button>
              )}
            </div>
          </div>
        )}

        {/* Extra Information Form */}
        {showExtraForm && !isVerificationDone && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e3a8a', marginBottom: '0.35rem' }}>
              Enrich this Report with Extra Information, Photos, or Updated Location
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#3b82f6', marginBottom: '1rem' }}>
              Contributing extra verified details awards +15 trust points to the author and +10 trust points to you!
            </p>

            <form onSubmit={handleAddExtraInfo} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Additional Information / Updates
                </label>
                <textarea
                  rows={3}
                  value={extraInfoText}
                  onChange={(e) => setExtraInfoText(e.target.value)}
                  placeholder="Provide additional details, what changed, or specific repair landmarks..."
                  style={{ width: '100%', padding: '0.65rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.875rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Attach Photo / Document (Optional)
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,.txt"
                  onChange={(e) => setExtraFile(e.target.files ? e.target.files[0] : null)}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Adjust Problem Location on Map (Optional)
                </label>
                <LocationPicker
                  latitude={extraLat ?? complaint.latitude}
                  longitude={extraLng ?? complaint.longitude}
                  onChange={(lat, lng) => {
                    setExtraLat(lat);
                    setExtraLng(lng);
                  }}
                  height="220px"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Updated Address / Landmark Text (Optional)
                </label>
                <input
                  type="text"
                  value={extraLocationText}
                  onChange={(e) => setExtraLocationText(e.target.value)}
                  placeholder="Street address or exact spot description..."
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={submittingExtra}
                  style={{
                    padding: '8px 18px',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  {submittingExtra ? 'Submitting Contribution...' : 'Submit Contribution'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowExtraForm(false)}
                  style={{
                    padding: '8px 14px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Metadata summary */}
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

        {/* Location Map View */}
        {complaint.latitude && complaint.longitude && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
              <MapPin size={18} color="#dc2626" />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Incident Location Map</h3>
            </div>
            <LocationPicker
              latitude={complaint.latitude}
              longitude={complaint.longitude}
              readOnly={true}
              height="240px"
            />
          </div>
        )}

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

      {/* Requirement 3: All pictures, locations, and text uploaded across time from different people (Newer data at top) */}
      <div style={{ background: '#ffffff', padding: '1.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={20} color="#2563eb" />
              Problem Updates & Chronological Evolution
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              All pictures, locations, and text uploaded about this request from different people. <strong>Newer updates are displayed at the top</strong> to give staff clear visibility into how the issue has changed over time.
            </p>
          </div>
          <span style={{ fontSize: '0.78rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '4px 12px', borderRadius: '999px', fontWeight: 700 }}>
            {timelineItems.length} Chronological Record{timelineItems.length === 1 ? '' : 's'} (Latest First)
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {timelineItems.map((item, idx) => {
            const isInitial = item.entry_type === 'INITIAL_REPORT';
            const isAiMerged = item.entry_type === 'AI_MERGED_EXTENSION';
            const isPhotoOnly = item.entry_type === 'EVIDENCE_PHOTO';
            const isStatus = item.entry_type === 'STATUS_UPDATE';
            const itemPhotos = item.photos && item.photos.length > 0 ? item.photos : [];

            return (
              <div
                key={item.id || idx}
                style={{
                  border: isAiMerged ? '2px solid #93c5fd' : '1px solid #e2e8f0',
                  background: isAiMerged ? '#f8faff' : isInitial ? '#fafafa' : '#ffffff',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                  position: 'relative',
                }}
              >
                {/* Header row: Author + Trust Badge + Type Badge + Timestamp */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                      {item.author_name}
                    </span>
                    {item.author_badge_tier && (
                      <TrustBadge
                        tier={item.author_badge_tier}
                        title={item.author_badge_title}
                        trustLevel={item.author_trust_level}
                        showPoints={true}
                        size="small"
                      />
                    )}
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: isAiMerged ? '#dbeafe' : isInitial ? '#f1f5f9' : isStatus ? '#fef3c7' : '#dcfce7',
                        color: isAiMerged ? '#1e40af' : isInitial ? '#475569' : isStatus ? '#92400e' : '#166534',
                        border: isAiMerged ? '1px solid #bfdbfe' : isInitial ? '1px solid #cbd5e1' : isStatus ? '1px solid #fde68a' : '1px solid #bbf7d0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {isAiMerged && <Sparkles size={12} />}
                      {isAiMerged
                        ? 'Gemma AI Merged Post / Extension'
                        : isInitial
                        ? 'Initial Report'
                        : isStatus
                        ? 'Status Update'
                        : isPhotoOnly
                        ? 'Evidence Upload'
                        : 'Community Contribution'}
                    </span>
                  </div>

                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                    {new Date(item.timestamp).toLocaleString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Text uploaded */}
                {item.text && (
                  <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.55, marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>
                    {item.text}
                  </div>
                )}

                {/* Location uploaded */}
                {item.location_text && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', color: '#334155', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <MapPin size={14} color="#dc2626" />
                    <strong>Reported Location:</strong>
                    <span>{item.location_text}</span>
                    {item.latitude && item.longitude && (
                      <span style={{ fontSize: '0.72rem', color: '#2563eb', background: '#eff6ff', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        Mapped ({item.latitude.toFixed(4)}, {item.longitude.toFixed(4)})
                      </span>
                    )}
                  </div>
                )}

                {/* Pictures / Photos uploaded */}
                {itemPhotos.length > 0 && (
                  <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ImageIcon size={14} color="#475569" /> Photos Uploaded at this Step:
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {itemPhotos.map((p: any) => (
                        <div
                          key={p.id}
                          style={{
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            background: '#f8fafc',
                            maxWidth: '220px',
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          {imageUrls[p.id] ? (
                            <img
                              src={imageUrls[p.id]}
                              alt={p.original_name}
                              style={{ width: '100%', height: '140px', objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{ height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', color: '#64748b', fontSize: '0.75rem', padding: '10px', textAlign: 'center' }}>
                              Photo Document ({p.original_name})
                            </div>
                          )}
                          <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }} title={p.original_name}>
                              {p.original_name}
                            </span>
                            <button
                              type="button"
                              onClick={() => downloadFile(p.id)}
                              style={{ padding: '3px 8px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                            >
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes or AI similarity reason */}
                {item.notes && (
                  <div style={{ fontSize: '0.78rem', color: isAiMerged ? '#1e40af' : '#475569', background: isAiMerged ? '#eff6ff' : '#f8fafc', borderLeft: `3px solid ${isAiMerged ? '#3b82f6' : '#cbd5e1'}`, padding: '6px 10px', borderRadius: '0 4px 4px 0', marginTop: '0.5rem' }}>
                    {isAiMerged ? <strong>Gemma AI Deduplication Note: </strong> : null}
                    {item.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

            {/* Reassign Team Form — Admin only; staff handle team assignment in person */}
            {isAdmin && (
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
            )}
          </div>
        </div>
      )}

      {/* Evidence Files Section */}
      <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Evidence and Photo Attachments</h3>
        </div>

        {complaint.evidence_files && complaint.evidence_files.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {complaint.evidence_files.map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong>{file.original_name}</strong>
                    {file.uploader && (
                      <TrustBadge
                        tier={file.uploader.badge_tier}
                        title={file.uploader.badge_title}
                        trustLevel={file.uploader.trust_level}
                        size="small"
                      />
                    )}
                  </div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                    Uploaded by {file.uploader?.full_name || 'Contributor'} &bull; {(file.size_bytes / 1024).toFixed(1)} KB &bull; SHA: {file.file_hash.slice(0, 10)}...
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => downloadFile(file.id)}
                  style={{ padding: '5px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  Download File
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
            No photos or evidence files attached yet.
          </p>
        )}

        {/* Evidence upload form: hidden for citizens once staff has verified */}
        {(!isVerificationDone || isStaffOrAdmin) && (
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
            style={{ padding: '6px 14px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
          >
            {uploadingFile ? 'Uploading...' : 'Upload Evidence Photo (+10 pts)'}
          </button>
        </form>
        )}
        {isVerificationDone && !isStaffOrAdmin && (
          <p style={{ color: '#64748b', fontSize: '0.825rem', fontStyle: 'italic', marginTop: '0.5rem' }}>
            This report has been verified on-site by staff. Additional evidence uploads are no longer required.
          </p>
        )}
      </div>

      {/* History Timeline */}
      <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Audit Timeline & Community Contributions</h3>

        {complaint.history && complaint.history.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {complaint.history.map((h) => (
              <div
                key={h.id}
                style={{
                  borderLeft: h.field === 'extra_info' ? '3px solid #10b981' : '3px solid #3b82f6',
                  paddingLeft: '1rem',
                  paddingTop: '3px',
                  paddingBottom: '3px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {h.field === 'extra_info' ? 'COMMUNITY EXTRA INFORMATION' : h.field.toUpperCase()}: {h.old_value ? `${h.old_value} -> ` : ''}{h.new_value}
                  </span>
                  {h.actor && (
                    <TrustBadge
                      tier={h.actor.badge_tier}
                      title={h.actor.badge_title}
                      trustLevel={h.actor.trust_level}
                      size="small"
                    />
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {new Date(h.created_at).toLocaleString()} by {h.actor?.full_name || 'System / Auto'}
                </div>
                {h.notes && (
                  <div style={{ fontSize: '0.825rem', color: '#334155', marginTop: '2px', background: '#f8fafc', padding: '4px 8px', borderRadius: '4px' }}>
                    {h.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No history records found.</p>
        )}
      </div>

      {/* Staff Verification Modal */}
      {showStaffVerifyModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', maxWidth: '440px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem', fontWeight: 700, color: staffVerifyIsValid ? '#166534' : '#991b1b' }}>
              {staffVerifyIsValid ? 'Verify Report as Genuine' : 'Deem Report as False / Fabricated'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem', lineHeight: 1.4 }}>
              {staffVerifyIsValid
                ? 'Confirms the reported issue exists on-site. Citizen reporter receives +15 trust points and community verification is concluded.'
                : 'Marks report as fabricated/spam. Applies a -30 point trust penalty to the citizen reporter and marks the ticket REJECTED.'}
            </p>

            <form onSubmit={handleStaffVerify} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Inspection Findings / Determination Notes *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder={staffVerifyIsValid ? 'e.g. Field inspection confirmed valve rupture on site.' : 'e.g. Site inspected, no water leak found; reported address is vacant lot.'}
                  value={staffVerifyNotes}
                  onChange={(e) => setStaffVerifyNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowStaffVerifyModal(false)}
                  style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingStaffVerify}
                  style={{
                    padding: '6px 14px',
                    background: staffVerifyIsValid ? '#16a34a' : '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {submittingStaffVerify ? 'Submitting...' : staffVerifyIsValid ? 'Confirm Valid (+15 pts)' : 'Confirm False (-30 pts)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
