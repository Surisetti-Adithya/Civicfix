import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Category, Team, TrustRulesConfig } from '../types';
import { Shield, RefreshCw } from 'lucide-react';

interface DeadlineRuleItem {
  id: number;
  category_id?: number | null;
  response_hours: number;
  resolution_hours: number;
  mode: string;
}

interface EscalationRuleItem {
  id: number;
  level_order: number;
  target_role_or_channel: string;
  trigger: string;
}

export default function AdminSettings() {
  const [tab, setTab] = useState<'categories' | 'departments' | 'deadlines' | 'escalations' | 'trust-rules'>('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [deadlineRules, setDeadlineRules] = useState<DeadlineRuleItem[]>([]);
  const [escalationRules, setEscalationRules] = useState<EscalationRuleItem[]>([]);
  const [, setTrustRules] = useState<TrustRulesConfig | null>(null);

  // Forms
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');

  const [respHours, setRespHours] = useState(24);
  const [resolHours, setResolHours] = useState(72);
  const [ruleMode, setRuleMode] = useState('NORMAL');

  const [escLevel, setEscLevel] = useState(1);
  const [escTarget, setEscTarget] = useState('');

  // Trust rules form
  const [reportBonus, setReportBonus] = useState(15);
  const [dupBonus, setDupBonus] = useState(10);
  const [veriBonus, setVeriBonus] = useState(5);
  const [abusePenalty, setAbusePenalty] = useState(30);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [c, t, d, e, tr] = await Promise.all([
        apiRequest<Category[]>('/categories'),
        apiRequest<Team[]>('/teams'),
        apiRequest<DeadlineRuleItem[]>('/deadlines/rules'),
        apiRequest<EscalationRuleItem[]>('/escalations/rules'),
        apiRequest<TrustRulesConfig>('/trust/rules'),
      ]);
      setCategories(c);
      setTeams(t);
      setDeadlineRules(d);
      setEscalationRules(e);
      setTrustRules(tr);
      if (tr) {
        setReportBonus(tr.report_quality_bonus);
        setDupBonus(tr.duplicate_extension_bonus);
        setVeriBonus(tr.verification_outcome_bonus);
        setAbusePenalty(tr.confirmed_abuse_penalty);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load organization settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setError('');
    setSuccess('');
    try {
      await apiRequest('/categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName.trim(), description: catDesc.trim() || undefined }),
      });
      setCatName('');
      setCatDesc('');
      setSuccess('Complaint category added.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to add category.');
    }
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    setError('');
    setSuccess('');
    try {
      await apiRequest('/teams', {
        method: 'POST',
        body: JSON.stringify({ name: teamName.trim(), description: teamDesc.trim() || undefined }),
      });
      setTeamName('');
      setTeamDesc('');
      setSuccess('Operational department added.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to add team.');
    }
  };

  const handleAddDeadlineRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await apiRequest('/deadlines/rules', {
        method: 'POST',
        body: JSON.stringify({
          response_hours: respHours,
          resolution_hours: resolHours,
          mode: ruleMode,
        }),
      });
      setSuccess('Deadline target rule added.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to add deadline rule.');
    }
  };

  const handleAddEscalationRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escTarget.trim()) return;
    setError('');
    setSuccess('');
    try {
      await apiRequest('/escalations/rules', {
        method: 'POST',
        body: JSON.stringify({
          level_order: escLevel,
          target_role_or_channel: escTarget.trim(),
          trigger: 'RESOLUTION_OVERDUE',
        }),
      });
      setEscTarget('');
      setSuccess('Escalation tier configured.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to add escalation rule.');
    }
  };

  const handleSaveTrustRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const updated = await apiRequest<TrustRulesConfig>('/trust/rules', {
        method: 'POST',
        body: JSON.stringify({
          report_quality_bonus: reportBonus,
          duplicate_extension_bonus: dupBonus,
          verification_outcome_bonus: veriBonus,
          confirmed_abuse_penalty: abusePenalty,
          unresolved_unverified_penalty: 0,
        }),
      });
      setTrustRules(updated);
      setSuccess('Transparent trust score rules updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to update trust rules.');
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '1rem auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
              Organization Settings & Governance
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px', margin: 0 }}>
              Manage complaint categories, department routing, response targets, and transparent trust score rules.
            </p>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: '6px 12px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              color: '#334155',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {(['categories', 'departments', 'deadlines', 'escalations', 'trust-rules'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? '#2563eb' : '#f1f5f9',
                color: tab === t ? '#ffffff' : '#334155',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '4px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t.replace('-', ' ')}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 14px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {success}
          </div>
        )}

        {/* CATEGORIES TAB */}
        {tab === 'categories' && (
          <div>
            <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Category Name (e.g. Street Lighting)"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                required
                style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', flex: 1, minWidth: '180px' }}
              />
              <input
                type="text"
                placeholder="Description"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', flex: 2, minWidth: '220px' }}
              />
              <button
                type="submit"
                style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
              >
                + Add Category
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {categories.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
                  <strong>{c.name}</strong>
                  <span style={{ color: '#64748b' }}>{c.description || 'No description provided'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DEPARTMENTS TAB */}
        {tab === 'departments' && (
          <div>
            <form onSubmit={handleAddTeam} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Department Name (e.g. Drainage Response Team)"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
                style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', flex: 1, minWidth: '180px' }}
              />
              <input
                type="text"
                placeholder="Department Scope & Operational Responsibility"
                value={teamDesc}
                onChange={(e) => setTeamDesc(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', flex: 2, minWidth: '220px' }}
              />
              <button
                type="submit"
                style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
              >
                + Add Department
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {teams.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
                  <strong>{t.name}</strong>
                  <span style={{ color: '#64748b' }}>{t.description || 'No description'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DEADLINES TAB */}
        {tab === 'deadlines' && (
          <div>
            <form onSubmit={handleAddDeadlineRule} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', color: '#475569', marginBottom: '2px' }}>
                  Response Target (Hours)
                </label>
                <input
                  type="number"
                  value={respHours}
                  onChange={(e) => setRespHours(Number(e.target.value))}
                  style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '120px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', color: '#475569', marginBottom: '2px' }}>
                  Resolution Target (Hours)
                </label>
                <input
                  type="number"
                  value={resolHours}
                  onChange={(e) => setResolHours(Number(e.target.value))}
                  style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '120px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', color: '#475569', marginBottom: '2px' }}>
                  Operating Mode
                </label>
                <select
                  value={ruleMode}
                  onChange={(e) => setRuleMode(e.target.value)}
                  style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value="NORMAL">NORMAL</option>
                  <option value="DISASTER">DISASTER</option>
                </select>
              </div>

              <button
                type="submit"
                style={{ marginTop: '1.15rem', padding: '7px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                + Save Target SLA
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {deadlineRules.map((dr) => (
                <div key={dr.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
                  <span>Operating Mode: <strong>{dr.mode}</strong></span>
                  <span>Initial Response: <strong>{dr.response_hours} hrs</strong></span>
                  <span>Target Resolution: <strong>{dr.resolution_hours} hrs</strong></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ESCALATIONS TAB */}
        {tab === 'escalations' && (
          <div>
            <form onSubmit={handleAddEscalationRule} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', color: '#475569', marginBottom: '2px' }}>
                  Escalation Level
                </label>
                <input
                  type="number"
                  value={escLevel}
                  onChange={(e) => setEscLevel(Number(e.target.value))}
                  style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '80px' }}
                />
              </div>

              <div style={{ flex: 1, minWidth: '220px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', color: '#475569', marginBottom: '2px' }}>
                  Target Authority / Channel
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ward Supervisor or Regional Director"
                  value={escTarget}
                  onChange={(e) => setEscTarget(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <button
                type="submit"
                style={{ marginTop: '1.15rem', padding: '7px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                + Add Tier
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {escalationRules.map((er) => (
                <div key={er.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
                  <span>Tier: <strong>Level {er.level_order}</strong></span>
                  <span>Target: <strong>{er.target_role_or_channel}</strong></span>
                  <span style={{ color: '#64748b' }}>Trigger: {er.trigger}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TRUST SCORE RULES TAB */}
        {tab === 'trust-rules' && (
          <div>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Shield size={18} color="#16a34a" />
                <strong style={{ fontSize: '0.95rem', color: '#166534' }}>Transparent Trust Score Principles</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.825rem', color: '#15803d', lineHeight: 1.4 }}>
                Trust scores reward accurate, high-quality community participation. Configurable rules govern score bonuses and penalties for verified bad behavior. Citizens are <strong>never penalized</strong> for unresolved or unverified complaints.
              </p>
            </div>

            <form onSubmit={handleSaveTrustRules} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Report Quality Bonus (pts)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={reportBonus}
                    onChange={(e) => setReportBonus(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Awarded for detailed report submission with photo/location.</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Contribution / Extension Bonus (pts)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={dupBonus}
                    onChange={(e) => setDupBonus(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Awarded for adding evidence or details to existing ticket.</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Community Verification Bonus (pts)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={veriBonus}
                    onChange={(e) => setVeriBonus(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Awarded when neighbors verify the issue on ground.</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Confirmed Abuse Penalty (pts)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={abusePenalty}
                    onChange={(e) => setAbusePenalty(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Deducted upon verified spam or fabricated reporting.</span>
                </div>
              </div>

              {/* Locked rule: Unresolved / Unverified penalty */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>Unresolved / Unverified Report Penalty</span>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Explicitly prohibited from penalizing citizens for unresolved or unverified issues.</div>
                </div>
                <span style={{ fontWeight: 800, color: '#16a34a', fontSize: '0.9rem', padding: '2px 8px', background: '#dcfce7', borderRadius: '4px' }}>
                  0 pts (LOCKED)
                </span>
              </div>

              <button
                type="submit"
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 20px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Save Trust Rules
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
