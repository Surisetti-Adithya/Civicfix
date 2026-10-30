import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import DemoIdentityModal from './DemoIdentityModal';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function Navbar({ currentView, onNavigate }: NavbarProps) {
  const { user, activeOrg, role, memberships, switchOrg, logout } = useAuth();
  const [showDemoModal, setShowDemoModal] = useState(false);

  return (
    <>
      <nav style={{
        backgroundColor: '#1e293b',
        color: '#f8fafc',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        borderBottom: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div
            onClick={() => onNavigate('dashboard')}
            style={{ fontSize: '1.25rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}
          >
            CivicFix
          </div>

          {user && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => onNavigate('dashboard')}
                style={{
                  background: currentView === 'dashboard' ? '#334155' : 'transparent',
                  color: '#f8fafc',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                }}
              >
                Dashboard
              </button>

              <button
                onClick={() => onNavigate('new-complaint')}
                style={{
                  background: currentView === 'new-complaint' ? '#334155' : 'transparent',
                  color: '#f8fafc',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                }}
              >
                Submit Report
              </button>

              {(role === 'STAFF' || role === 'ORG_ADMIN' || role === 'PLATFORM_ADMIN') && (
                <button
                  onClick={() => onNavigate('staff-queue')}
                  style={{
                    background: currentView === 'staff-queue' ? '#334155' : 'transparent',
                    color: '#f8fafc',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '4px',
                  }}
                >
                  Staff Queue
                </button>
              )}

              {(role === 'STAFF' || role === 'ORG_ADMIN' || role === 'PLATFORM_ADMIN') && (
                <button
                  onClick={() => onNavigate('disaster-ops')}
                  style={{
                    background: currentView === 'disaster-ops' ? '#991b1b' : '#7f1d1d',
                    color: '#fef2f2',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}
                >
                  Disaster Ops
                </button>
              )}

              {(role === 'ORG_ADMIN' || role === 'PLATFORM_ADMIN') && (
                <button
                  onClick={() => onNavigate('admin-panel')}
                  style={{
                    background: currentView === 'admin-panel' ? '#334155' : 'transparent',
                    color: '#f8fafc',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '4px',
                  }}
                >
                  Administration
                </button>
              )}

              <button
                onClick={() => onNavigate('public-metrics')}
                style={{
                  background: currentView === 'public-metrics' ? '#334155' : 'transparent',
                  color: '#f8fafc',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                }}
              >
                Public Transparency
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {activeOrg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <label htmlFor="org-select" style={{ color: '#94a3b8' }}>Organization:</label>
              <select
                id="org-select"
                value={activeOrg.id}
                onChange={(e) => switchOrg(Number(e.target.value))}
                style={{
                  background: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #475569',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                {memberships.map((m) => (
                  <option key={m.organization_id} value={m.organization_id}>
                    {m.organization?.name || `Org #${m.organization_id}`} ({m.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {role && (
            <span style={{
              background: role === 'ORG_ADMIN' ? '#0369a1' : role === 'STAFF' ? '#047857' : '#475569',
              color: '#ffffff',
              padding: '3px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}>
              {role}
            </span>
          )}

          {user && (
            <button
              onClick={() => setShowDemoModal(true)}
              style={{
                background: '#334155',
                color: '#93c5fd',
                border: '1px solid #475569',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
              }}
            >
              Demo Identity
            </button>
          )}

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>{user.full_name}</span>
              <button
                onClick={logout}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                Log Out
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => onNavigate('login')}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                Sign In
              </button>
              <button
                onClick={() => onNavigate('register')}
                style={{
                  background: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                Register
              </button>
            </div>
          )}
        </div>
      </nav>

      {showDemoModal && (
        <DemoIdentityModal onClose={() => setShowDemoModal(false)} />
      )}
    </>
  );
}
