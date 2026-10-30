import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login({ onRegisterClick, onSuccess }: { onRegisterClick: () => void; onSuccess: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '420px', margin: '3rem auto', padding: '2rem', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', textAlign: 'center' }}>Sign in to CivicFix</h2>

      {error && (
        <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
          />
        </div>

        <div>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
          />
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
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
        Do not have an account?{' '}
        <button
          onClick={onRegisterClick}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, padding: 0 }}
        >
          Register here
        </button>
      </div>
    </div>
  );
}
