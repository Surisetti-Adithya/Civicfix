import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ComplaintList from './ComplaintList';
import { TrustBadge } from '../components/TrustBadge';
import { LocationPicker } from '../components/LocationPicker';
import { Award, MapPin, CheckCircle } from 'lucide-react';

interface ProfileProps {
  onSelectComplaint: (id: number) => void;
}

export default function Profile({ onSelectComplaint }: ProfileProps) {
  const { user, role, updateProfile, logout } = useAuth();
  const [permanentLocation, setPermanentLocation] = useState(user?.permanent_location || '');
  const [homeLat, setHomeLat] = useState<number | null>(user?.home_latitude ?? 12.9716);
  const [homeLng, setHomeLng] = useState<number | null>(user?.home_longitude ?? 77.5946);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    if (user?.permanent_location) {
      setPermanentLocation(user.permanent_location);
    }
    if (user?.home_latitude && user?.home_longitude) {
      setHomeLat(user.home_latitude);
      setHomeLng(user.home_longitude);
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
      await updateProfile({
        permanent_location: permanentLocation.trim(),
        home_latitude: homeLat,
        home_longitude: homeLng,
      });
      setLocationMessage('Permanent location and home coordinates saved successfully.');
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
      {/* Profile Details & Trust Level Card */}
      <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>{user.full_name}</h1>
              <TrustBadge
                tier={user.badge_tier}
                title={user.badge_title}
                trustLevel={user.trust_level}
                showPoints={true}
                size="medium"
              />
            </div>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '6px' }}>
              {user.email} &bull; <span style={{ fontWeight: 600, color: '#2563eb' }}>{role}</span>
              {user.phone_number ? ` &bull; ${user.phone_number}` : ''}
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

        {/* Trust Metric Explanation */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Award size={18} color="#2563eb" />
              <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>Community Trust Level: {user.trust_level ?? 50} pts</strong>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
              Current Rank: <strong>{user.badge_title ?? 'Active Contributor'}</strong> ({user.badge_tier ?? 'BRONZE'}). Trust level reflects genuine contributions and social reliability across reports.
            </p>
          </div>

          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <CheckCircle size={18} color="#16a34a" />
              <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>How to Earn Trust</strong>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
              &bull; <strong>+5 pts:</strong> When fellow citizens verify your report as real.<br />
              &bull; <strong>+15 pts:</strong> When contributors enrich your report with photos or details.<br />
              &bull; <strong>+2 / +10 pts:</strong> When you verify or add helpful info to neighbor reports.
            </p>
          </div>
        </div>

        {/* Permanent Location & Map Editor */}
        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
            <MapPin size={18} color="#2563eb" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: '#1e293b' }}>
              Permanent Home Location & Coordinates
            </h3>
          </div>
          <p style={{ fontSize: '0.825rem', color: '#64748b', marginBottom: '1rem' }}>
            Your saved home location is used as the default starting cursor whenever you submit an issue on the map. Drag the pin below to set your exact home base.
          </p>

          {locationMessage && (
            <div style={{ padding: '0.6rem 0.85rem', background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
              {locationMessage}
            </div>
          )}

          {locationError && (
            <div style={{ padding: '0.6rem 0.85rem', background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
              {locationError}
            </div>
          )}

          <form onSubmit={handleSaveLocation} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Home Location on Map (Drag pin to your home)
              </label>
              <LocationPicker
                latitude={homeLat}
                longitude={homeLng}
                onChange={(lat, lng) => {
                  setHomeLat(lat);
                  setHomeLng(lng);
                }}
                height="260px"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Address / Street Text
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={permanentLocation}
                  onChange={(e) => setPermanentLocation(e.target.value)}
                  placeholder="e.g. 4th Cross, 5th Main, Indiranagar, Metro City"
                  style={{
                    flex: '1',
                    minWidth: '280px',
                    padding: '0.65rem 0.85rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                  }}
                />
                <button
                  type="submit"
                  disabled={savingLocation}
                  style={{
                    padding: '0.65rem 1.4rem',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {savingLocation ? 'Saving...' : 'Save Home Location'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* My Submissions Section */}
      <div>
        <ComplaintList
          title="My Submissions"
          scope="my"
          portal="citizen"
          onSelectComplaint={onSelectComplaint}
        />
      </div>
    </div>
  );
}
