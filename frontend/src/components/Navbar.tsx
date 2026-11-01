import { useAuth } from '../context/AuthContext';
import { TrustBadge } from './TrustBadge';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function Navbar({ currentView, onNavigate }: NavbarProps) {
  const { user, activeOrg, role, memberships, switchOrg } = useAuth();

  const isStaff = role === 'STAFF';
  const isAdmin = role === 'ORG_ADMIN' || role === 'PLATFORM_ADMIN';

  const navBtnStyle = (viewName: string) => ({
    background: currentView === viewName ? '#334155' : 'transparent',
    color: '#f8fafc',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: currentView === viewName ? 700 : 500,
    transition: 'background 0.15s ease',
  });

  return (
    <nav style={{
      backgroundColor: '#1e293b',
      color: '#f8fafc',
      padding: '0.65rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '0.75rem',
      borderBottom: '1px solid #334155',
    }}>
      {/* Brand & Main Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
        {/* CivicFix Logo */}
        <div
          onClick={() => onNavigate('dashboard')}
          style={{ fontSize: '1.25rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.05em', color: '#60a5fa', marginRight: '0.5rem' }}
        >
          CivicFix
        </div>

        {/* Profile */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => onNavigate('profile')}
              style={navBtnStyle('profile')}
            >
              Profile
            </button>
            <TrustBadge
              tier={user.badge_tier}
              title={user.badge_title}
              trustLevel={user.trust_level}
              size="small"
            />
          </div>
        ) : (
          <button
            onClick={() => onNavigate('login')}
            style={navBtnStyle('login')}
          >
            Sign In
          </button>
        )}

        {/* CITIZEN VIEWS */}
        {(!user || role === 'CITIZEN') && (
          <>
            <button
              onClick={() => onNavigate('dashboard')}
              style={navBtnStyle('dashboard')}
            >
              Dashboard
            </button>
          </>
        )}

        {/* STAFF VIEWS */}
        {isStaff && (
          <>
            <button
              onClick={() => onNavigate('staff-dashboard')}
              style={navBtnStyle('staff-dashboard')}
            >
              Dashboard
            </button>
            <button
              onClick={() => onNavigate('staff-complaints')}
              style={navBtnStyle('staff-complaints')}
            >
              Complaints
            </button>
            <button
              onClick={() => onNavigate('my-assignments')}
              style={navBtnStyle('my-assignments')}
            >
              My Assignments
            </button>
          </>
        )}

        {/* ADMIN VIEWS */}
        {isAdmin && (
          <>
            <button
              onClick={() => onNavigate('admin-dashboard')}
              style={navBtnStyle('admin-dashboard')}
            >
              Admin Dashboard
            </button>
            <button
              onClick={() => onNavigate('admin-complaints')}
              style={navBtnStyle('admin-complaints')}
            >
              Complaints
            </button>
            <button
              onClick={() => onNavigate('staff-management')}
              style={navBtnStyle('staff-management')}
            >
              Staff Mgmt
            </button>
            <button
              onClick={() => onNavigate('citizen-trust')}
              style={navBtnStyle('citizen-trust')}
            >
              Citizen Trust
            </button>
            <button
              onClick={() => onNavigate('admin-settings')}
              style={navBtnStyle('admin-settings')}
            >
              Settings
            </button>
            <button
              onClick={() => onNavigate('disaster-ops')}
              style={{
                background: currentView === 'disaster-ops' ? '#991b1b' : '#7f1d1d',
                color: '#fef2f2',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Disaster Ops
            </button>
          </>
        )}

        {/* Shared Reports */}
        <button
          onClick={() => onNavigate('reports')}
          style={navBtnStyle('reports')}
        >
          Reports
        </button>
      </div>

      {/* Organization Switcher & Current User Role */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {user && role && (
          <span style={{
            fontSize: '0.72rem',
            padding: '3px 8px',
            borderRadius: '4px',
            background: '#334155',
            color: '#93c5fd',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}>
            {role.replace('_', ' ')}
          </span>
        )}

        {activeOrg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <label htmlFor="nav-org-select" style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Org:</label>
            <select
              id="nav-org-select"
              value={activeOrg.id}
              onChange={(e) => switchOrg(Number(e.target.value))}
              style={{
                background: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #475569',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.825rem',
                cursor: 'pointer',
              }}
            >
              {memberships.map((m) => (
                <option key={m.organization_id} value={m.organization_id}>
                  {m.organization?.name || `Org #${m.organization_id}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </nav>
  );
}
