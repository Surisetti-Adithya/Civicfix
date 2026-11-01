import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import NewComplaint from './pages/NewComplaint';
import ComplaintList from './pages/ComplaintList';
import ComplaintDetail from './pages/ComplaintDetail';
import DisasterOps from './pages/DisasterOps';
import Reports from './pages/Reports';

// Staff Portal Pages
import StaffDashboard from './pages/StaffDashboard';
import StaffComplaints from './pages/StaffComplaints';
import MyAssignments from './pages/MyAssignments';

// Admin Portal Pages
import AdminDashboard from './pages/AdminDashboard';
import AdminComplaints from './pages/AdminComplaints';
import StaffManagement from './pages/StaffManagement';
import CitizenTrustManagement from './pages/CitizenTrustManagement';
import AdminSettings from './pages/AdminSettings';

function MainContent() {
  const { user, role, loading } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedComplaintId, setSelectedComplaintId] = useState<number | null>(null);
  const [staffFilter, setStaffFilter] = useState<{ status?: string; overdue?: boolean; assignedToMe?: boolean } | undefined>();

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
        Loading CivicFix...
      </div>
    );
  }

  const navigateToComplaint = (id: number) => {
    setSelectedComplaintId(id);
    setCurrentView('complaint-detail');
  };

  const handleStaffNavigateToComplaints = (filter?: { status?: string; overdue?: boolean; assignedToMe?: boolean }) => {
    if (filter?.assignedToMe) {
      setCurrentView('my-assignments');
    } else {
      setStaffFilter(filter);
      setCurrentView('staff-complaints');
    }
  };

  const isAdmin = role === 'ORG_ADMIN' || role === 'PLATFORM_ADMIN';
  const isStaff = role === 'STAFF';

  return (
    <div>
      <Navbar currentView={currentView} onNavigate={(v) => { setCurrentView(v); setSelectedComplaintId(null); }} />

      <main style={{ maxWidth: '1200px', margin: '1.5rem auto', padding: '0 1rem' }}>
        {currentView === 'login' && (
          <Login
            onRegisterClick={() => setCurrentView('register')}
            onSuccess={() => {
              if (isAdmin) setCurrentView('admin-dashboard');
              else if (isStaff) setCurrentView('staff-dashboard');
              else setCurrentView('dashboard');
            }}
          />
        )}

        {currentView === 'register' && (
          <Register
            onLoginClick={() => setCurrentView('login')}
            onSuccess={() => setCurrentView('dashboard')}
          />
        )}

        {/* Profile View (Supports viewing/updating info, and citizen appeals) */}
        {currentView === 'profile' && (
          <Profile onSelectComplaint={navigateToComplaint} />
        )}

        {/* New Report View */}
        {currentView === 'new-complaint' && (
          <NewComplaint
            onSuccess={(id) => navigateToComplaint(id)}
            onCancel={() => {
              if (isAdmin) setCurrentView('admin-dashboard');
              else if (isStaff) setCurrentView('staff-dashboard');
              else setCurrentView('dashboard');
            }}
          />
        )}

        {/* Detail View */}
        {currentView === 'complaint-detail' && selectedComplaintId && (
          <ComplaintDetail
            complaintId={selectedComplaintId}
            onBack={() => {
              if (isAdmin) setCurrentView('admin-complaints');
              else if (isStaff) setCurrentView('staff-complaints');
              else setCurrentView('dashboard');
            }}
          />
        )}

        {/* ================= STAFF PORTAL VIEWS ================= */}
        {currentView === 'staff-dashboard' && (
          <StaffDashboard
            onNavigateToComplaints={handleStaffNavigateToComplaints}
            onSelectComplaint={navigateToComplaint}
          />
        )}

        {currentView === 'staff-complaints' && (
          <StaffComplaints
            onSelectComplaint={navigateToComplaint}
            initialFilter={staffFilter}
          />
        )}

        {currentView === 'my-assignments' && (
          <MyAssignments
            onSelectComplaint={navigateToComplaint}
          />
        )}

        {/* ================= ADMIN PORTAL VIEWS ================= */}
        {currentView === 'admin-dashboard' && (
          <AdminDashboard
            onNavigate={(v) => setCurrentView(v)}
            onSelectComplaint={navigateToComplaint}
          />
        )}

        {currentView === 'admin-complaints' && (
          <AdminComplaints
            onSelectComplaint={navigateToComplaint}
          />
        )}

        {currentView === 'staff-management' && (
          <StaffManagement />
        )}

        {currentView === 'citizen-trust' && (
          <CitizenTrustManagement />
        )}

        {currentView === 'admin-settings' && (
          <AdminSettings />
        )}

        {/* Disaster Ops (Admin only) */}
        {currentView === 'disaster-ops' && (
          isAdmin ? (
            <DisasterOps onSelectComplaint={navigateToComplaint} />
          ) : (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
              <strong>Access Denied:</strong> Disaster Operations is accessible only to authorized administrators.
            </div>
          )
        )}

        {/* Reports / Analytics View */}
        {(currentView === 'reports' || currentView === 'public-metrics') && (
          <Reports />
        )}

        {/* Default Dashboard */}
        {currentView === 'dashboard' && (
          <div>
            {!user ? (
              <div style={{ background: '#ffffff', padding: '2.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '0.75rem', fontWeight: 800 }}>Welcome to CivicFix</h1>
                <p style={{ color: '#475569', maxWidth: '600px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
                  An accountable, verifiable issue management system for municipalities and residential communities. Submit issues, track transparent progress, and verify resolutions.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                  <button
                    onClick={() => setCurrentView('login')}
                    style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => setCurrentView('register')}
                    style={{ padding: '10px 20px', background: '#ffffff', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Register Account
                  </button>
                </div>
              </div>
            ) : isStaff ? (
              <StaffDashboard
                onNavigateToComplaints={handleStaffNavigateToComplaints}
                onSelectComplaint={navigateToComplaint}
              />
            ) : isAdmin ? (
              <AdminDashboard
                onNavigate={(v) => setCurrentView(v)}
                onSelectComplaint={navigateToComplaint}
              />
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                      Nearby Reports
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px' }}>
                      Community and nearby issues reported in your neighborhood.
                    </p>
                  </div>

                  <button
                    onClick={() => setCurrentView('new-complaint')}
                    style={{ padding: '8px 18px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
                  >
                    + Submit New Report
                  </button>
                </div>

                <ComplaintList
                  title="Nearby Reports"
                  scope="nearby"
                  portal="citizen"
                  onSelectComplaint={navigateToComplaint}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
