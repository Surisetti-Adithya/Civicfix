import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';
import { Organization, PaginatedResponse } from '../types';
import { Eye, EyeOff } from 'lucide-react';
import { LocationPicker } from '../components/LocationPicker';
import { AddressAutocomplete } from '../components/AddressAutocomplete';

export default function Register({ onLoginClick, onSuccess }: { onLoginClick: () => void; onSuccess: () => void }) {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [permanentLocation, setPermanentLocation] = useState('');
  const [regLat, setRegLat] = useState<number>(12.9716);
  const [regLng, setRegLng] = useState<number>(77.5946);
  const [geoStatus, setGeoStatus] = useState('');
  const [orgId, setOrgId] = useState<number | undefined>(undefined);
  const [role, setRole] = useState('CITIZEN');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest<PaginatedResponse<Organization>>('/organizations')
      .then((res) => {
        setOrganizations(res.items);
        if (res.items.length > 0) {
          setOrgId(res.items[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // No debounced geocode needed – AddressAutocomplete handles it via suggestion selection

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password, fullName, orgId, role, permanentLocation, regLat, regLng);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your information.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '520px', margin: '2rem auto', padding: '2rem', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', textAlign: 'center' }}>Create a CivicFix Account</h2>

      {error && (
        <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label htmlFor="reg-name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Full Name
          </label>
          <input
            id="reg-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <label htmlFor="reg-location" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              Permanent Location / Address
            </label>
            {geoStatus && (
              <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                {geoStatus}
              </span>
            )}
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <AddressAutocomplete
              id="reg-location"
              value={permanentLocation}
              onChange={setPermanentLocation}
              onLocationSelect={(lat, lng, name) => {
                setRegLat(lat);
                setRegLng(lng);
                setGeoStatus(`📍 ${name.split(',')[0]}`);
              }}
              placeholder="e.g., 4th Cross, 5th Main, Indiranagar"
              required
            />
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: '0.5rem' }}>
            Type your address to see suggestions and auto-move the map pin. You can also drag the pin directly.
          </span>
          <div style={{ borderRadius: '6px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
            <LocationPicker
              latitude={regLat}
              longitude={regLng}
              onChange={(lat, lng) => {
                setRegLat(lat);
                setRegLng(lng);
                setGeoStatus(`📍 Pinned to: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
              }}
              height="180px"
            />
          </div>
        </div>

        <div>
          <label htmlFor="reg-email" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Email Address
          </label>
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label htmlFor="reg-password" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Password (at least 8 characters)
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={{ width: '100%', padding: '0.5rem 2.5rem 0.5rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {organizations.length > 0 && (
          <div>
            <label htmlFor="reg-org" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
              Primary Organization
            </label>
            <select
              id="reg-org"
              value={orgId || ''}
              onChange={(e) => setOrgId(Number(e.target.value))}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.type})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="reg-role" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Role
          </label>
          <select
            id="reg-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
          >
            <option value="CITIZEN">Citizen / Resident</option>
            <option value="STAFF">Organization Staff</option>
            <option value="ORG_ADMIN">Organization Administrator</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.75rem',
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 600,
            marginTop: '0.5rem',
          }}
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
        Already have an account?{' '}
        <button
          onClick={onLoginClick}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, padding: 0 }}
        >
          Sign in here
        </button>
      </div>
    </div>
  );
}
