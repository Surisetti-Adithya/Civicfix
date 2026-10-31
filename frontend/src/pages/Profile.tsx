import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ComplaintList from './ComplaintList';

interface ProfileProps {
  onSelectComplaint: (id: number) => void;
}

export default function Profile({ onSelectComplaint }: ProfileProps) {
  const { user, role, updateProfile, logout } = useAuth();
  const [permanentLocation, setPermanentLocation] = useState(user?.permanent_location || '');
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    if (user?.permanent_location) {
      setPermanentLocation(user.permanent_location);
    }
  }, [user]);

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permanentLocation.trim()) {
      setLocationError('Please enter a valid permanent location.');
      return;
    }
    setSavingLocation(true);
    setLocationMessage('');
    setLocationError('');
    try {
      await updateProfile({ permanent_location: permanentLocation.trim() });
      setLocationMessage('Permanent location updated successfully.');
    } catch (err: any) {
      setLocationError(err.message || 'Failed to update permanent location.');
    } finally {
      setSavingLocation(false);
    }
  };

  if (!user) {
    return (
      <div style={{ maxWidth: '800px', margin: '2rem auto', textAlign: 'center', padding: '2rem', background: '#fff', borderRadius: '8px' }}>
        <p>Please log in to view your profile.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '1.5rem auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Profile Details Card */}
      <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>{user.full_name}</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px' }}>
              {user.email} • <span style={{ fontWeight: 600, color: '#2563eb' }}>{role}</span>
            </p>
          </div>

          <button
            onClick={logout}
            style={{
              padding: '8px 18px',
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>

        {/* Permanent Location Editor */}
        <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1e293b' }}>
            Permanent Location / Address
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
            This location is automatically pre-filled when you submit new civic reports.
          </p>

          {locationMessage && (
            <div style={{ padding: '0.5rem 0.75rem', background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
              {locationMessage}
            </div>
          )}

          {locationError && (
            <div style={{ padding: '0.5rem 0.75rem', background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
              {locationError}
            </div>
          )}

          <form onSubmit={handleSaveLocation} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              value={permanentLocation}
              onChange={(e) => setPermanentLocation(e.target.value)}
              placeholder="e.g. 4th Cross, 5th Main, Indiranagar, Metro City"
              style={{
                flex: '1',
                minWidth: '280px',
                padding: '0.6rem 0.75rem',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            />
            <button
              type="submit"
              disabled={savingLocation}
              style={{
                padding: '0.6rem 1.25rem',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {savingLocation ? 'Saving...' : 'Update Location'}
            </button>
          </form>
        </div>
      </div>

      {/* My Submissions Section (Requirement 7) */}
      <div>
        <ComplaintList
          title="My Submissions"
          scope="my"
          onSelectComplaint={onSelectComplaint}
        />
      </div>
    </div>
  );
}
