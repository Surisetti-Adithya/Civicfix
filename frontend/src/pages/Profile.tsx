import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ComplaintList from './ComplaintList';
import { TrustBadge } from '../components/TrustBadge';
import { LocationPicker } from '../components/LocationPicker';
import { Award, CheckCircle, ShieldAlert, Send } from 'lucide-react';
import { apiRequest } from '../api/client';
import { CitizenAppealItem } from '../types';

interface ProfileProps {
  onSelectComplaint: (id: number) => void;
}

export default function Profile({ onSelectComplaint }: ProfileProps) {
  const { user, role, updateProfile, logout } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
  const [permanentLocation, setPermanentLocation] = useState(user?.permanent_location || '');
  const [homeLat, setHomeLat] = useState<number | null>(user?.home_latitude ?? 12.9716);
  const [homeLng, setHomeLng] = useState<number | null>(user?.home_longitude ?? 77.5946);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  // Appeals state for restricted/banned accounts
  const [myAppeals, setMyAppeals] = useState<CitizenAppealItem[]>([]);
  const [appealReason, setAppealReason] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [appealMessage, setAppealMessage] = useState('');
  const [appealError, setAppealError] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setPhoneNumber(user.phone_number || '');
      setPermanentLocation(user.permanent_location || '');
      if (user.home_latitude && user.home_longitude) {
        setHomeLat(user.home_latitude);
        setHomeLng(user.home_longitude);
      }
    }
  }, [user]);

  const fetchMyAppeals = async () => {
    try {
      const res = await apiRequest<CitizenAppealItem[]>('/trust/my-appeals');
      setMyAppeals(res);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (user && (user.account_status === 'RESTRICTED' || user.account_status === 'BANNED')) {
      fetchMyAppeals();
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setProfileError('Full name cannot be empty.');
      return;
    }
    setSavingProfile(true);
    setProfileMessage('');
    setProfileError('');
    try {
      await updateProfile({
        full_name: fullName.trim(),
        phone_number: phoneNumber.trim() || undefined,
        permanent_location: permanentLocation.trim() || undefined,
        home_latitude: homeLat,
        home_longitude: homeLng,
      });
      setProfileMessage('Profile information saved successfully.');
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealReason.trim() || appealReason.trim().length < 10) {
      setAppealError('Please provide a detailed explanation (minimum 10 characters).');
      return;
    }
    setSubmittingAppeal(true);
    setAppealMessage('');
    setAppealError('');
    try {
      await apiRequest('/trust/appeals', {
        method: 'POST',
        body: JSON.stringify({ reason: appealReason.trim() }),
      });
      setAppealMessage('Your appeal has been submitted for administrative review.');
      setAppealReason('');
      fetchMyAppeals();
    } catch (err: any) {
      setAppealError(err.message || 'Failed to submit appeal.');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  if (!user) {
    return (
      <div style={{ maxWidth: '800px', margin: '2rem auto', textAlign: 'center', padding: '2rem', background: '#fff', borderRadius: '8px' }}>
        <p>Please log in to view your profile.</p>
      </div>
    );
  }

  const isRestrictedOrBanned = user.account_status === 'RESTRICTED' || user.account_status === 'BANNED';

  return (
    <div style={{ maxWidth: '1000px', margin: '1.5rem auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Account Status Alert if Restricted or Banned */}
      {isRestrictedOrBanned && (
        <div style={{
          background: user.account_status === 'BANNED' ? '#fef2f2' : '#fffbeb',
          border: user.account_status === 'BANNED' ? '2px solid #ef4444' : '2px solid #f59e0b',
          borderRadius: '8px',
          padding: '1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <ShieldAlert size={24} color={user.account_status === 'BANNED' ? '#dc2626' : '#d97706'} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: user.account_status === 'BANNED' ? '#991b1b' : '#92400e' }}>
              Account Status: {user.account_status}
            </h2>
          </div>
          <p style={{ margin: '4px 0 12px 0', fontSize: '0.9rem', color: '#475569' }}>
            <strong>Reason provided:</strong> {user.status_reason || 'Administrative restriction applied.'}
          </p>

          {/* Appeal Form */}
          <div style={{ background: '#ffffff', borderRadius: '6px', padding: '1rem', border: '1px solid #cbd5e1' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
              File an Official Appeal
            </h4>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 10px 0' }}>
              You may challenge this restriction by explaining your situation. An organization administrator will review your appeal and the audit records.
            </p>

            {appealMessage && (
              <div style={{ padding: '8px 12px', background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: '4px', marginBottom: '10px', fontSize: '0.85rem' }}>
                {appealMessage}
              </div>
            )}
            {appealError && (
              <div style={{ padding: '8px 12px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '4px', marginBottom: '10px', fontSize: '0.85rem' }}>
                {appealError}
              </div>
            )}

            <form onSubmit={handleCreateAppeal} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <textarea
                rows={3}
                placeholder="Explain why your account status should be restored..."
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                required
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
              <button
                type="submit"
                disabled={submittingAppeal}
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 16px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Send size={14} />
                {submittingAppeal ? 'Submitting Appeal...' : 'Submit Appeal'}
              </button>
            </form>

            {/* Past Appeals */}
            {myAppeals.length > 0 && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Your Appeal History:</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  {myAppeals.map((a) => (
                    <div key={a.id} style={{ fontSize: '0.8rem', padding: '6px 8px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>{a.appeal_type}</strong> &mdash; Status: <strong style={{ color: a.status === 'APPROVED' ? '#16a34a' : a.status === 'REJECTED' ? '#dc2626' : '#d97706' }}>{a.status}</strong></span>
                        <span style={{ color: '#94a3b8' }}>{new Date(a.created_at).toLocaleDateString()}</span>
                      </div>
                      <p style={{ margin: '4px 0 2px 0', color: '#475569' }}>"{a.reason}"</p>
                      {a.admin_notes && (
                        <p style={{ margin: '2px 0', color: '#1e293b', fontStyle: 'italic' }}>
                          Admin response: {a.admin_notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
              {user.account_status && user.account_status !== 'ACTIVE' && (
                <span style={{ marginLeft: '8px', color: '#dc2626', fontWeight: 700 }}>
                  [{user.account_status}]
                </span>
              )}
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

        {/* Profile Edit Form */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
            Basic Profile Information
          </h3>

          {profileMessage && (
            <div style={{ padding: '0.6rem 0.85rem', background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
              {profileMessage}
            </div>
          )}
          {profileError && (
            <div style={{ padding: '0.6rem 0.85rem', background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
              {profileError}
            </div>
          )}

          <form onSubmit={handleSaveProfile} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 555-0199"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Address / Permanent Location
              </label>
              <input
                type="text"
                value={permanentLocation}
                onChange={(e) => setPermanentLocation(e.target.value)}
                placeholder="Street address or ward location"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Home Base Location (Pin on Map)
              </label>
              <LocationPicker
                latitude={homeLat}
                longitude={homeLng}
                onChange={(lat, lng) => {
                  setHomeLat(lat);
                  setHomeLng(lng);
                }}
                height="220px"
              />
            </div>

            <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
              <button
                type="submit"
                disabled={savingProfile}
                style={{
                  padding: '8px 20px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {savingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Trust Metric Explanation */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Award size={18} color="#2563eb" />
              <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>Community Trust Level: {user.trust_level ?? 50} pts</strong>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
              Current Rank: <strong>{user.badge_title ?? 'Active Contributor'}</strong> ({user.badge_tier ?? 'BRONZE'}). Transparent rules reward accurate reporting and community verification.
            </p>
          </div>

          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <CheckCircle size={18} color="#16a34a" />
              <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>Transparent Score Rules</strong>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
              &bull; <strong>+15 pts:</strong> High-quality initial report.<br />
              &bull; <strong>+10 pts:</strong> Helpful contribution / duplicate merge info.<br />
              &bull; <strong>+5 pts:</strong> Confirmed community verification.<br />
              &bull; <em>Citizens are never penalized for unresolved or unverified complaints.</em>
            </p>
          </div>
        </div>
      </div>

      {/* My Submissions Section (for Citizens) */}
      {role === 'CITIZEN' && (
        <div>
          <ComplaintList
            title="My Submissions"
            scope="my"
            portal="citizen"
            onSelectComplaint={onSelectComplaint}
          />
        </div>
      )}
    </div>
  );
}
