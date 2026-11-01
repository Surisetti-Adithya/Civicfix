import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Membership, Team } from '../types';
import { UserPlus, Shield, Briefcase, Mail, RefreshCw, Edit3, X } from 'lucide-react';

export default function StaffManagement() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add staff modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('StaffPass2026!');
  const [newRole, setNewRole] = useState<'STAFF' | 'ORG_ADMIN'>('STAFF');
  const [newTeamId, setNewTeamId] = useState<number | ''>('');
  const [addingStaff, setAddingStaff] = useState(false);

  // Edit membership modal state
  const [editingMem, setEditingMem] = useState<Membership | null>(null);
  const [editRole, setEditRole] = useState<'STAFF' | 'ORG_ADMIN' | 'CITIZEN'>('STAFF');
  const [editTeamId, setEditTeamId] = useState<number | ''>('');
  const [savingEdit, setSavingEdit] = useState(false);

  const orgId = localStorage.getItem('civicfix_org_id');

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const [mRes, tRes] = await Promise.all([
        apiRequest<{ items: Membership[] }>(`/organizations/${orgId}/memberships`),
        apiRequest<Team[]>('/teams'),
      ]);
      setMemberships(mRes.items);
      setTeams(tRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load staff list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !newEmail.trim() || !newFullName.trim()) return;
    setAddingStaff(true);
    setError('');
    setSuccess('');
    try {
      // 1. Register or get user
      const regRes = await apiRequest<any>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail.trim(),
          full_name: newFullName.trim(),
          password: newPassword,
          organization_id: Number(orgId),
          role: newRole,
        }),
      });

      // 2. If department was selected, find the newly created membership and assign team
      if (newTeamId) {
        const memList = await apiRequest<{ items: Membership[] }>(`/organizations/${orgId}/memberships`);
        const createdMem = memList.items.find((m) => m.user_id === regRes.user.id);
        if (createdMem) {
          await apiRequest(`/organizations/${orgId}/memberships/${createdMem.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ team_id: Number(newTeamId), role: newRole }),
          });
        }
      }

      setSuccess(`Staff member ${newFullName} added successfully.`);
      setShowAddModal(false);
      setNewEmail('');
      setNewFullName('');
      setNewTeamId('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create staff member.');
    } finally {
      setAddingStaff(false);
    }
  };

  const handleSaveEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMem || !orgId) return;
    setSavingEdit(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/organizations/${orgId}/memberships/${editingMem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: editRole,
          team_id: editTeamId ? Number(editTeamId) : null,
        }),
      });
      setSuccess(`Updated role & department for ${editingMem.user?.full_name || 'member'}`);
      setEditingMem(null);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update membership.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Filter for staff/admin members
  const staffList = memberships.filter((m) => m.role === 'STAFF' || m.role === 'ORG_ADMIN');
  const citizenList = memberships.filter((m) => m.role === 'CITIZEN');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            Staff & Personnel Management
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px', margin: 0 }}>
            Onboard new field technicians, govern operational roles, and assign departments.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: '8px 14px',
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
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '8px 16px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <UserPlus size={15} />
            + Add Staff Member
          </button>
        </div>
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

      {/* Staff Roster Table */}
      <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
          Staff Roster ({staffList.length})
        </h2>

        {loading ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading roster...</p>
        ) : staffList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', background: '#f8fafc', borderRadius: '6px' }}>
            No staff members configured in this organization yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '10px 12px' }}>Name & Email</th>
                  <th style={{ padding: '10px 12px' }}>Organization Role</th>
                  <th style={{ padding: '10px 12px' }}>Assigned Department</th>
                  <th style={{ padding: '10px 12px' }}>Joined Date</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((m) => {
                  const assignedTeam = teams.find((t) => t.id === m.team_id);
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          {m.user?.full_name || `User #${m.user_id}`}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Mail size={12} />
                          <span>{m.user?.email || 'N/A'}</span>
                        </div>
                      </td>

                      <td style={{ padding: '12px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: m.role === 'ORG_ADMIN' ? '#eff6ff' : '#f0fdf4',
                          color: m.role === 'ORG_ADMIN' ? '#1d4ed8' : '#15803d',
                        }}>
                          <Shield size={12} />
                          {m.role}
                        </span>
                      </td>

                      <td style={{ padding: '12px' }}>
                        {assignedTeam ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#f8fafc',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid #e2e8f0',
                            fontWeight: 600,
                            color: '#334155',
                          }}>
                            <Briefcase size={12} color="#64748b" />
                            {assignedTeam.name}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>
                            Unassigned Department
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '12px', color: '#64748b', fontSize: '0.8rem' }}>
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>

                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button
                          onClick={() => {
                            setEditingMem(m);
                            setEditRole(m.role as any);
                            setEditTeamId(m.team_id || '');
                          }}
                          style={{
                            padding: '5px 10px',
                            background: '#f1f5f9',
                            color: '#2563eb',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Edit3 size={13} />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Citizens registered in org (for quick role elevation) */}
      <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#0f172a' }}>
          Registered Citizens ({citizenList.length})
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0 0 1rem 0' }}>
          Promote active citizen volunteers to Staff roles or assign them to specialty departments.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {citizenList.slice(0, 8).map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div>
                <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>{m.user?.full_name || `Citizen #${m.user_id}`}</strong>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{m.user?.email}</div>
              </div>
              <button
                onClick={() => {
                  setEditingMem(m);
                  setEditRole('STAFF');
                  setEditTeamId(m.team_id || (teams[0]?.id ?? ''));
                }}
                style={{ padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Promote to Staff
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ADD STAFF MODAL */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Onboard New Staff Member
              </h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddStaffSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maya Inspector"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. maya@metro.gov"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Temporary Initial Password *
                </label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Role *
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="STAFF">STAFF (Field Officer / Technician)</option>
                  <option value="ORG_ADMIN">ORG_ADMIN (Department Administrator)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Department / Team Assignment
                </label>
                <select
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="">-- No Department Assigned --</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingStaff}
                  style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {addingStaff ? 'Onboarding...' : 'Onboard Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ROLE & DEPARTMENT MODAL */}
      {editingMem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Edit Role & Team: {editingMem.user?.full_name}
              </h3>
              <button onClick={() => setEditingMem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Role *
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="STAFF">STAFF</option>
                  <option value="ORG_ADMIN">ORG_ADMIN</option>
                  <option value="CITIZEN">CITIZEN</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Assigned Department / Team
                </label>
                <select
                  value={editTeamId}
                  onChange={(e) => setEditTeamId(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="">-- No Department Assigned --</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setEditingMem(null)}
                  style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
