import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import NewComplaint from './pages/NewComplaint';
import ComplaintList from './pages/ComplaintList';
import ComplaintDetail from './pages/ComplaintDetail';
import DisasterOps from './pages/DisasterOps';
import AdminPanel from './pages/AdminPanel';
import PublicMetrics from './pages/PublicMetrics';

function MainContent() {
  const { user, role, loading } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedComplaintId, setSelectedComplaintId] = useState<number | null>(null);

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

  return (
    <div>
      <Navbar currentView={currentView} onNavigate={(v) => { setCurrentView(v); setSelectedComplaintId(null); }} />

      <main style={{ maxWidth: '1200px', margin: '1.5rem auto', padding: '0 1rem' }}>
        {currentView === 'login' && (
          <Login
            onRegisterClick={() => setCurrentView('register')}
            onSuccess={() => setCurrentView('dashboard')}
          />
        )}

        {currentView === 'register' && (
          <Register
            onLoginClick={() => setCurrentView('login')}
            onSuccess={() => setCurrentView('dashboard')}
          />
        )}

        {currentView === 'new-complaint' && (
          <NewComplaint
            onSuccess={(id) => navigateToComplaint(id)}
            onCancel={() => setCurrentView('dashboard')}
          />
        )}

        {currentView === 'complaint-detail' && selectedComplaintId && (
          <ComplaintDetail
            complaintId={selectedComplaintId}
            onBack={() => setCurrentView('dashboard')}
          />
        )}

        {currentView === 'staff-queue' && (
          <ComplaintList
            title="Staff Operational Queue"
            onSelectComplaint={navigateToComplaint}
          />
        )}

        {currentView === 'disaster-ops' && (
          <DisasterOps onSelectComplaint={navigateToComplaint} />
        )}

        {currentView === 'admin-panel' && (
          <AdminPanel />
        )}

        {currentView === 'public-metrics' && (
          <PublicMetrics />
        )}

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
                    style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600 }}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => setCurrentView('register')}
                    style={{ padding: '10px 20px', background: '#ffffff', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '6px', fontWeight: 600 }}
                  >
                    Register Account
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {role === 'CITIZEN' ? 'My Reported Issues' : 'Organization Workspace'}
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                      {role === 'CITIZEN'
                        ? 'Track and monitor issues you have submitted.'
                        : 'Review reports, route to teams, and update statuses.'}
                    </p>
                  </div>

                  <button
                    onClick={() => setCurrentView('new-complaint')}
                    style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.875rem' }}
                  >
                    + Submit New Report
                  </button>
                </div>

                <ComplaintList
                  title={role === 'CITIZEN' ? 'My Submissions' : 'All Open Reports'}
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
