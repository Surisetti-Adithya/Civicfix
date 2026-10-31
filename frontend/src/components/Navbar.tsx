import { useAuth } from '../context/AuthContext';
import { TrustBadge } from './TrustBadge';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function Navbar({ currentView, onNavigate }: NavbarProps) {
  const { user, activeOrg, role, memberships, switchOrg } = useAuth();

  const navBtnStyle = (viewName: string) => ({
    background: currentView === viewName ? '#334155' : 'transparent',
    color: '#f8fafc',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: currentView === viewName ? 600 : 500,
    transition: 'background 0.15s ease',
  });

  return (
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
      {/* Navigation bar from left to right: CivicFix logo, Profile, Dashboard, Reports, Organization */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {/* 1. CivicFix Logo */}
        <div
          onClick={() => onNavigate('dashboard')}
          style={{ fontSize: '1.25rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.05em', color: '#60a5fa' }}
        >
          CivicFix
        </div>

        {/* 2. Profile option (right next to CivicFix logo) */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            Profile / Sign In
          </button>
        )}

        {/* 3. Dashboard */}
        <button
          onClick={() => onNavigate('dashboard')}
          style={navBtnStyle('dashboard')}
        >
          Dashboard
        </button>

        {/* 4. Reports (Requirement 9, 10) */}
        <button
          onClick={() => onNavigate('reports')}
          style={navBtnStyle('reports')}
        >
          Reports
        </button>

        {/* Staff / Admin additional options if applicable */}
        {(role === 'STAFF' || role === 'ORG_ADMIN' || role === 'PLATFORM_ADMIN') && (
          <button
            onClick={() => onNavigate('staff-queue')}
            style={navBtnStyle('staff-queue')}
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
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Disaster Ops
          </button>
        )}

        {(role === 'ORG_ADMIN' || role === 'PLATFORM_ADMIN') && (
          <button
            onClick={() => onNavigate('admin-panel')}
            style={navBtnStyle('admin-panel')}
          >
            Admin
          </button>
        )}
      </div>

      {/* 5. Organization Option on the Navigation bar (Requirement 6, 10) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {activeOrg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <label htmlFor="nav-org-select" style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Organization:</label>
            <select
              id="nav-org-select"
              value={activeOrg.id}
              onChange={(e) => switchOrg(Number(e.target.value))}
              style={{
                background: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #475569',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '0.875rem',
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
