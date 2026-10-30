import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Category, Team } from '../types';

interface MemberItem {
  id: number;
  user_id: number;
  role: string;
  user?: { email: string; full_name: string };
}

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

interface DuplicateGroupItem {
  id: number;
  primary_complaint_id: number;
  primary_complaint?: { public_reference_number: string; location_text: string };
  links: Array<{ complaint_id: number; complaint?: { public_reference_number: string } }>;
}

export default function AdminPanel() {
  const [tab, setTab] = useState<'categories' | 'teams' | 'deadlines' | 'escalations' | 'members' | 'duplicates'>('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [deadlineRules, setDeadlineRules] = useState<DeadlineRuleItem[]>([]);
  const [escalationRules, setEscalationRules] = useState<EscalationRuleItem[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroupItem[]>([]);

  // Category form
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Team form
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');

  // Deadline rule form
  const [respHours, setRespHours] = useState(24);
  const [resolHours, setResolHours] = useState(72);
  const [ruleMode, setRuleMode] = useState('NORMAL');

  // Escalation rule form
  const [escLevel, setEscLevel] = useState(1);
  const [escTarget, setEscTarget] = useState('');

  const [, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const orgId = localStorage.getItem('civicfix_org_id');
      const [c, t, d, e, dups] = await Promise.all([
        apiRequest<Category[]>('/categories'),
        apiRequest<Team[]>('/teams'),
        apiRequest<DeadlineRuleItem[]>('/deadlines/rules'),
        apiRequest<EscalationRuleItem[]>('/escalations/rules'),
        apiRequest<DuplicateGroupItem[]>('/duplicates/groups'),
      ]);
      setCategories(c);
      setTeams(t);
      setDeadlineRules(d);
      setEscalationRules(e);
      setDuplicateGroups(dups);

      if (orgId) {
        const m = await apiRequest<{ items: MemberItem[] }>(`/organizations/${orgId}/memberships`);
        setMembers(m.items);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load configuration data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
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
      setSuccess('Category created successfully.');
      loadAll();
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
      setSuccess('Team created successfully.');
      loadAll();
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
      setSuccess('Deadline target rule created.');
      loadAll();
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
      setSuccess('Escalation tier created.');
      loadAll();
    } catch (err: any) {
      setError(err.message || 'Failed to add escalation rule.');
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '1rem auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Organization Administration</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Configure categories, operational response teams, deadline targets, escalation rules, and reviewed duplicates.
        </p>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {(['categories', 'teams', 'deadlines', 'escalations', 'members', 'duplicates'] as const).map((t) => (
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
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {success}
          </div>
        )}

        {/* Categories Tab */}
        {tab === 'categories' && (
          <div>
            <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Category Name (e.g. Drainage)"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                required
                style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', flex: 1 }}
              />
              <input
                type="text"
                placeholder="Description"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', flex: 2 }}
              />
              <button
                type="submit"
                style={{ padding: '6px 14px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem' }}
              >
                + Add Category
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {categories.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
                  <strong>{c.name}</strong>
                  <span style={{ color: '#64748b' }}>{c.description || 'No description'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teams Tab */}
        {tab === 'teams' && (
          <div>
            <form onSubmit={handleAddTeam} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Team Name (e.g. Electrical Squad)"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
                style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', flex: 1 }}
              />
              <input
                type="text"
                placeholder="Team Scope & Description"
                value={teamDesc}
                onChange={(e) => setTeamDesc(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', flex: 2 }}
              />
              <button
                type="submit"
                style={{ padding: '6px 14px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem' }}
              >
                + Add Team
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {teams.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
                  <strong>{t.name}</strong>
                  <span style={{ color: '#64748b' }}>{t.description || 'No description'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deadlines Tab */}
        {tab === 'deadlines' && (
          <div>
            <form onSubmit={handleAddDeadlineRule} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', color: '#64748b' }}>Response Hours</label>
                <input
                  type="number"
                  value={respHours}
                  onChange={(e) => setRespHours(Number(e.target.value))}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', color: '#64748b' }}>Resolution Hours</label>
                <input
                  type="number"
                  value={resolHours}
                  onChange={(e) => setResolHours(Number(e.target.value))}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', color: '#64748b' }}>Mode</label>
                <select
                  value={ruleMode}
                  onChange={(e) => setRuleMode(e.target.value)}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value="NORMAL">NORMAL</option>
                  <option value="DISASTER">DISASTER</option>
                </select>
              </div>

              <button
                type="submit"
                style={{ marginTop: '1.25rem', padding: '6px 14px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem' }}
              >
                + Save Target Rule
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {deadlineRules.map((dr) => (
                <div key={dr.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
                  <span>Mode: <strong>{dr.mode}</strong></span>
                  <span>Response Target: {dr.response_hours} hrs</span>
                  <span>Resolution Target: {dr.resolution_hours} hrs</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Escalations Tab */}
        {tab === 'escalations' && (
          <div>
            <form onSubmit={handleAddEscalationRule} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', color: '#64748b' }}>Level Order</label>
                <input
                  type="number"
                  value={escLevel}
                  onChange={(e) => setEscLevel(Number(e.target.value))}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '80px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', color: '#64748b' }}>Target Authority / Role</label>
                <input
                  type="text"
                  placeholder="e.g. Ward Supervisor or Regional Director"
                  value={escTarget}
                  onChange={(e) => setEscTarget(e.target.value)}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '300px' }}
                />
              </div>

              <button
                type="submit"
                style={{ marginTop: '1.25rem', padding: '6px 14px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem' }}
              >
                + Add Escalation Tier
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {escalationRules.map((er) => (
                <div key={er.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
                  <span>Tier: <strong>Level {er.level_order}</strong></span>
                  <span>Target: {er.target_role_or_channel}</span>
                  <span style={{ color: '#64748b' }}>Trigger: {er.trigger}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members Tab */}
        {tab === 'members' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {members.map((m) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
                <div>
                  <strong>{m.user?.full_name || `User #${m.user_id}`}</strong> ({m.user?.email})
                </div>
                <span style={{ fontWeight: 600, color: '#2563eb' }}>{m.role}</span>
              </div>
            ))}
          </div>
        )}

        {/* Duplicate Groups Tab */}
        {tab === 'duplicates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {duplicateGroups.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No duplicate link groups formed.</p>
            ) : (
              duplicateGroups.map((g) => (
                <div key={g.id} style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>
                    Primary Report: {g.primary_complaint?.public_reference_number} ({g.primary_complaint?.location_text})
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                    Linked Duplicate Submissions: {g.links.length}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
