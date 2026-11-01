import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import {
  CitizenSummary,
  CitizenDetail,
  CitizenAppealItem,
  GemmaPatternAnalysisResponse,
} from '../types';
import {
  Search,
  Sparkles,
  History,
  X,
  UserX,
  UserCheck,
  RefreshCw,
  Scale,
} from 'lucide-react';

export default function CitizenTrustManagement() {
  const [citizens, setCitizens] = useState<CitizenSummary[]>([]);
  const [appeals, setAppeals] = useState<CitizenAppealItem[]>([]);
  const [activeTab, setActiveTab] = useState<'roster' | 'appeals'>('roster');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Selected citizen detail
  const [selectedCitizenId, setSelectedCitizenId] = useState<number | null>(null);
  const [citizenDetail, setCitizenDetail] = useState<CitizenDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Gemma AI Analysis
  const [gemmaAnalysis, setGemmaAnalysis] = useState<GemmaPatternAnalysisResponse | null>(null);
  const [analyzingGemma, setAnalyzingGemma] = useState(false);

  // Restrict / Ban Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState<'ACTIVE' | 'RESTRICTED' | 'BANNED'>('RESTRICTED');
  const [statusReason, setStatusReason] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Adjust Score Modal
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [scoreDelta, setScoreDelta] = useState(0);
  const [scoreReason, setScoreReason] = useState('');
  const [adjustingScore, setAdjustingScore] = useState(false);

  // Appeal Review Modal
  const [reviewingAppeal, setReviewingAppeal] = useState<CitizenAppealItem | null>(null);
  const [appealDecision, setAppealDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [appealNotes, setAppealNotes] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchRoster = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);

      const [cRes, aRes] = await Promise.all([
        apiRequest<CitizenSummary[]>(`/trust/citizens?${params.toString()}`),
        apiRequest<CitizenAppealItem[]>('/trust/appeals'),
      ]);
      setCitizens(cRes);
      setAppeals(aRes);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch trust roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, [statusFilter]);

  const fetchCitizenDetail = async (id: number) => {
    setSelectedCitizenId(id);
    setLoadingDetail(true);
    setGemmaAnalysis(null);
    try {
      const res = await apiRequest<CitizenDetail>(`/trust/citizens/${id}`);
      setCitizenDetail(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load citizen detail.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleRunGemmaAnalysis = async (id: number) => {
    setAnalyzingGemma(true);
    setError('');
    try {
      const res = await apiRequest<GemmaPatternAnalysisResponse>(`/trust/citizens/${id}/gemma-analyze`, {
        method: 'POST',
      });
      setGemmaAnalysis(res);
    } catch (err: any) {
      setError(err.message || 'Gemma AI pattern analysis failed.');
    } finally {
      setAnalyzingGemma(false);
    }
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCitizenId || !statusReason.trim() || statusReason.trim().length < 5) {
      setError('A mandatory reason (minimum 5 characters) is required for status changes.');
      return;
    }
    setUpdatingStatus(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/trust/citizens/${selectedCitizenId}/status`, {
        method: 'POST',
        body: JSON.stringify({
          account_status: targetStatus,
          reason: statusReason.trim(),
        }),
      });
      setSuccess(`Account status updated to ${targetStatus} with audit record.`);
      setShowStatusModal(false);
      setStatusReason('');
      fetchRoster();
      fetchCitizenDetail(selectedCitizenId);
    } catch (err: any) {
      setError(err.message || 'Failed to update account status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCitizenId || !scoreReason.trim()) return;
    setAdjustingScore(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/trust/citizens/${selectedCitizenId}/adjust-score`, {
        method: 'POST',
        body: JSON.stringify({
          change_amount: scoreDelta,
          reason: scoreReason.trim(),
          rule_name: 'ADMIN_MANUAL_ADJUSTMENT',
        }),
      });
      setSuccess(`Trust score adjusted by ${scoreDelta > 0 ? '+' : ''}${scoreDelta} points.`);
      setShowScoreModal(false);
      setScoreReason('');
      setScoreDelta(0);
      fetchRoster();
      fetchCitizenDetail(selectedCitizenId);
    } catch (err: any) {
      setError(err.message || 'Failed to adjust trust score.');
    } finally {
      setAdjustingScore(false);
    }
  };

  const handleAppealReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingAppeal || !appealNotes.trim()) return;
    setSubmittingReview(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/trust/appeals/${reviewingAppeal.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status: appealDecision,
          admin_notes: appealNotes.trim(),
        }),
      });
      setSuccess(`Appeal #${reviewingAppeal.id} marked as ${appealDecision}.`);
      setReviewingAppeal(null);
      setAppealNotes('');
      fetchRoster();
      if (selectedCitizenId) fetchCitizenDetail(selectedCitizenId);
    } catch (err: any) {
      setError(err.message || 'Failed to review appeal.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const pendingAppeals = appeals.filter((a) => a.status === 'PENDING');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            Citizen Trust & Safety Management
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px', margin: 0 }}>
            Audit citizen reliability scores, review suspicious activity flags, inspect Gemma AI analysis, and adjudicate appeals.
          </p>
        </div>

        <button
          onClick={fetchRoster}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            color: '#334155',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('roster')}
          style={{
            background: activeTab === 'roster' ? '#2563eb' : '#f1f5f9',
            color: activeTab === 'roster' ? '#ffffff' : '#334155',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Citizen Roster ({citizens.length})
        </button>

        <button
          onClick={() => setActiveTab('appeals')}
          style={{
            background: activeTab === 'appeals' ? '#2563eb' : '#f1f5f9',
            color: activeTab === 'appeals' ? '#ffffff' : '#334155',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Scale size={15} />
          <span>Appeals Review</span>
          {pendingAppeals.length > 0 && (
            <span style={{
              background: '#ef4444',
              color: '#ffffff',
              padding: '1px 6px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 800,
            }}>
              {pendingAppeals.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: CITIZEN ROSTER */}
      {activeTab === 'roster' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedCitizenId ? '1fr 1.25fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Left Column: Filter & Citizens Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '9px' }} />
                <input
                  type="text"
                  placeholder="Filter name, email, or address..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchRoster()}
                  style={{ width: '100%', padding: '6px 8px 6px 32px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="RESTRICTED">RESTRICTED</option>
                <option value="BANNED">BANNED</option>
              </select>

              <button
                onClick={fetchRoster}
                style={{ padding: '6px 14px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Filter
              </button>
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading roster...</p>
            ) : citizens.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                No citizen accounts match the criteria.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {citizens.map((c) => {
                  const isSelected = selectedCitizenId === c.user_id;
                  const isRestricted = c.account_status === 'RESTRICTED';
                  const isBanned = c.account_status === 'BANNED';

                  return (
                    <div
                      key={c.user_id}
                      onClick={() => fetchCitizenDetail(c.user_id)}
                      style={{
                        background: '#ffffff',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #2563eb' : (isBanned || isRestricted) ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                        padding: '12px 14px',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                            {c.full_name}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            {c.email}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: isBanned ? '#fee2e2' : isRestricted ? '#fef3c7' : '#dcfce7',
                            color: isBanned ? '#dc2626' : isRestricted ? '#b45309' : '#15803d',
                          }}>
                            {c.account_status}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '1rem', marginTop: '8px', fontSize: '0.78rem', color: '#475569', flexWrap: 'wrap' }}>
                        <span>Trust Score: <strong>{c.trust_level} pts</strong> ({c.badge_tier})</span>
                        <span>Reports: <strong>{c.report_count}</strong></span>
                        <span>Verifications: <strong>{c.verification_count}</strong></span>
                      </div>

                      {c.suspicious_flags.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                          {c.suspicious_flags.map((f, i) => (
                            <span key={i} style={{ fontSize: '0.7rem', padding: '1px 6px', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px', fontWeight: 600 }}>
                              {f.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Citizen Inspector Panel */}
          {selectedCitizenId && (
            <div style={{
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              padding: '1.5rem',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
              position: 'sticky',
              top: '1rem',
            }}>
              {loadingDetail ? (
                <p style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading citizen dossier...</p>
              ) : citizenDetail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Top Bar with Name & Close */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                        {citizenDetail.full_name}
                      </h2>
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {citizenDetail.email} &bull; {citizenDetail.phone_number || 'No phone'}
                      </div>
                      {citizenDetail.permanent_location && (
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                          Location: {citizenDetail.permanent_location}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setSelectedCitizenId(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Trust Score & Status overview banner */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f8fafc',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                        Community Trust
                      </span>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb' }}>
                        {citizenDetail.trust_level} pts
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                        {citizenDetail.badge_title} ({citizenDetail.badge_tier})
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                        Account Status
                      </span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: citizenDetail.account_status === 'ACTIVE' ? '#16a34a' : '#dc2626' }}>
                        {citizenDetail.account_status}
                      </div>
                      {citizenDetail.status_reason && (
                        <span style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: '200px', display: 'block' }}>
                          "{citizenDetail.status_reason}"
                        </span>
                      )}
                    </div>

                    {/* Quick Admin Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <button
                        onClick={() => {
                          setTargetStatus(citizenDetail.account_status === 'ACTIVE' ? 'RESTRICTED' : 'ACTIVE');
                          setStatusReason('');
                          setShowStatusModal(true);
                        }}
                        style={{
                          padding: '6px 12px',
                          background: citizenDetail.account_status === 'ACTIVE' ? '#fee2e2' : '#dcfce7',
                          color: citizenDetail.account_status === 'ACTIVE' ? '#dc2626' : '#166534',
                          border: citizenDetail.account_status === 'ACTIVE' ? '1px solid #fca5a5' : '1px solid #86efac',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {citizenDetail.account_status === 'ACTIVE' ? <UserX size={13} /> : <UserCheck size={13} />}
                        {citizenDetail.account_status === 'ACTIVE' ? 'Restrict / Ban' : 'Reinstate Account'}
                      </button>

                      <button
                        onClick={() => {
                          setScoreDelta(0);
                          setScoreReason('');
                          setShowScoreModal(true);
                        }}
                        style={{
                          padding: '6px 12px',
                          background: '#f1f5f9',
                          color: '#334155',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Adjust Score
                      </button>
                    </div>
                  </div>

                  {/* GEMMA AI PATTERN ANALYSIS SECTION */}
                  <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                    padding: '1.25rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={18} color="#16a34a" />
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#166534' }}>
                          Gemma AI Pattern & Abuse Analysis
                        </h4>
                      </div>

                      <button
                        onClick={() => handleRunGemmaAnalysis(citizenDetail.user_id)}
                        disabled={analyzingGemma}
                        style={{
                          padding: '5px 12px',
                          background: '#16a34a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Sparkles size={12} />
                        {analyzingGemma ? 'Analyzing...' : 'Run Gemma Analysis'}
                      </button>
                    </div>

                    <p style={{ margin: '0 0 8px 0', fontSize: '0.78rem', color: '#15803d' }}>
                      Evaluates reporting frequency, duplicate attempts, and verification integrity.
                    </p>

                    {gemmaAnalysis ? (
                      <div style={{ background: '#ffffff', borderRadius: '6px', padding: '1rem', border: '1px solid #86efac' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                            Calculated Risk Level:
                          </span>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            background: gemmaAnalysis.risk_level === 'HIGH' ? '#fee2e2' : gemmaAnalysis.risk_level === 'MEDIUM' ? '#fef3c7' : '#dcfce7',
                            color: gemmaAnalysis.risk_level === 'HIGH' ? '#dc2626' : gemmaAnalysis.risk_level === 'MEDIUM' ? '#b45309' : '#15803d',
                          }}>
                            {gemmaAnalysis.risk_level} RISK
                          </span>
                        </div>

                        <p style={{ fontSize: '0.85rem', color: '#1e293b', margin: '6px 0', lineHeight: 1.4 }}>
                          {gemmaAnalysis.summary_analysis}
                        </p>

                        <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '6px', padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                          <div><strong>Recommended Action:</strong> {gemmaAnalysis.recommended_action}</div>
                          {gemmaAnalysis.recommended_trust_adjustment !== 0 && (
                            <div><strong>Suggested Adjustment:</strong> {gemmaAnalysis.recommended_trust_adjustment > 0 ? '+' : ''}{gemmaAnalysis.recommended_trust_adjustment} pts</div>
                          )}
                          <div style={{ marginTop: '2px' }}><strong>Reasoning:</strong> {gemmaAnalysis.recommendation_reason}</div>
                        </div>

                        {/* Mandatory Disclaimer */}
                        <div style={{ marginTop: '8px', padding: '6px 8px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', fontSize: '0.72rem', color: '#92400e', lineHeight: 1.3 }}>
                          <strong>Important Safeguard:</strong> {gemmaAnalysis.disclaimer}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' }}>
                        Click "Run Gemma Analysis" to perform AI inference on this citizen's historical activity.
                      </div>
                    )}
                  </div>

                  {/* AUDIT LOG: Trust Score History */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <History size={16} color="#475569" />
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                        Trust Score Audit History ({citizenDetail.trust_history.length})
                      </h4>
                    </div>

                    {citizenDetail.trust_history.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No manual or automated score adjustments recorded.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                        {citizenDetail.trust_history.map((h) => (
                          <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}>
                            <div>
                              <span style={{ fontWeight: 700, color: h.change_amount >= 0 ? '#16a34a' : '#dc2626' }}>
                                {h.change_amount >= 0 ? `+${h.change_amount}` : h.change_amount} pts
                              </span>
                              <span style={{ marginLeft: '6px', color: '#475569' }}>
                                ({h.previous_score} &rarr; {h.new_score}) &bull; {h.reason}
                              </span>
                            </div>
                            <span style={{ color: '#94a3b8' }}>{new Date(h.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* REPORT HISTORY */}
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                      Reported Complaints ({citizenDetail.reports.length})
                    </h4>
                    {citizenDetail.reports.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No submitted complaints recorded.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                        {citizenDetail.reports.map((r) => (
                          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}>
                            <div>
                              <strong>{r.public_reference_number}</strong> ({r.location_text}) &mdash; <span style={{ color: '#2563eb' }}>{r.status}</span>
                            </div>
                            <span style={{ color: '#94a3b8' }}>{new Date(r.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* VERIFICATION HISTORY */}
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                      Community Verifications Cast ({citizenDetail.verifications.length})
                    </h4>
                    {citizenDetail.verifications.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No community verifications recorded.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                        {citizenDetail.verifications.map((v) => (
                          <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}>
                            <div>
                              Complaint {v.complaint_reference}: voted <strong>{v.answer}</strong>
                            </div>
                            <span style={{ color: '#94a3b8' }}>{new Date(v.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CITIZEN APPEALS REVIEW */}
      {activeTab === 'appeals' && (
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#0f172a' }}>
            Citizen Restriction & Ban Appeals
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1.25rem 0' }}>
            Citizens facing account restrictions have the fundamental right to contest their status. Review submitted arguments and record official review findings.
          </p>

          {appeals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: '#f8fafc', borderRadius: '6px' }}>
              No appeals have been lodged.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {appeals.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: '#f8fafc',
                    borderRadius: '6px',
                    border: item.status === 'PENDING' ? '1px solid #fbbf24' : '1px solid #e2e8f0',
                    padding: '1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>
                        Appeal #{item.id} &mdash; User #{item.user_id}
                      </span>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: item.status === 'APPROVED' ? '#dcfce7' : item.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                        color: item.status === 'APPROVED' ? '#166534' : item.status === 'REJECTED' ? '#dc2626' : '#b45309',
                      }}>
                        {item.status}
                      </span>
                    </div>

                    <p style={{ margin: '6px 0', fontSize: '0.875rem', color: '#334155', fontWeight: 500 }}>
                      Citizen statement: "{item.reason}"
                    </p>

                    {item.admin_notes && (
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                        Admin resolution note: {item.admin_notes} (by {item.reviewed_by_name || 'Admin'})
                      </p>
                    )}

                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                      Submitted: {new Date(item.created_at).toLocaleString()}
                    </div>
                  </div>

                  {item.status === 'PENDING' && (
                    <button
                      onClick={() => {
                        setReviewingAppeal(item);
                        setAppealDecision('APPROVED');
                        setAppealNotes('');
                      }}
                      style={{
                        padding: '6px 14px',
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.825rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Adjudicate Appeal
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RESTRICT / BAN ACCOUNT MODAL */}
      {showStatusModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Update Citizen Account Status
              </h3>
              <button onClick={() => setShowStatusModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStatusSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Target Account Status *
                </label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as any)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="ACTIVE">ACTIVE (Normal standing)</option>
                  <option value="RESTRICTED">RESTRICTED (Cannot submit new complaints)</option>
                  <option value="BANNED">BANNED (Account fully suspended)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Mandatory Justification / Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain the verified cause for restriction, ban, or reinstatement..."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  This reason is permanently preserved in the audit trail and visible to the citizen.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingStatus}
                  style={{
                    padding: '8px 16px',
                    background: targetStatus === 'BANNED' ? '#dc2626' : '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {updatingStatus ? 'Updating...' : 'Commit Status Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST SCORE MODAL */}
      {showScoreModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', maxWidth: '440px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Adjust Trust Score
              </h3>
              <button onClick={() => setShowScoreModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleScoreSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Point Adjustment Delta (+ or -) *
                </label>
                <input
                  type="number"
                  required
                  value={scoreDelta}
                  onChange={(e) => setScoreDelta(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Mandatory Audit Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="State rule rationale or confirmed community action..."
                  value={scoreReason}
                  onChange={(e) => setScoreReason(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowScoreModal(false)}
                  style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustingScore || scoreDelta === 0}
                  style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {adjustingScore ? 'Recording...' : 'Record Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUDICATE APPEAL MODAL */}
      {reviewingAppeal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Adjudicate Appeal #{reviewingAppeal.id}
              </h3>
              <button onClick={() => setReviewingAppeal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <strong>Citizen Statement:</strong>
              <p style={{ margin: '4px 0 0 0', color: '#334155' }}>"{reviewingAppeal.reason}"</p>
            </div>

            <form onSubmit={handleAppealReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Official Determination *
                </label>
                <select
                  value={appealDecision}
                  onChange={(e) => setAppealDecision(e.target.value as any)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="APPROVED">APPROVED (Reinstate active account standing)</option>
                  <option value="REJECTED">REJECTED (Uphold account restriction)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Administrative Determination Notes *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Record formal adjudication finding explaining the decision..."
                  value={appealNotes}
                  onChange={(e) => setAppealNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setReviewingAppeal(null)}
                  style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  style={{
                    padding: '8px 16px',
                    background: appealDecision === 'APPROVED' ? '#16a34a' : '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {submittingReview ? 'Recording...' : `Confirm ${appealDecision}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
