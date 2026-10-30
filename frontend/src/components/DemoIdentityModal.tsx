import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';

interface DemoIdItem {
  id: number;
  synthetic_id: string;
  full_name: string;
  state: string;
}

interface VerificationStatus {
  id: number;
  status: string;
  demo_identity?: DemoIdItem;
}

export default function DemoIdentityModal({ onClose }: { onClose: () => void }) {
  const [identities, setIdentities] = useState<DemoIdItem[]>([]);
  const [currentStatus, setCurrentStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadData = async () => {
    try {
      const list = await apiRequest<DemoIdItem[]>('/demo-identity');
      setIdentities(list);
      try {
        const status = await apiRequest<VerificationStatus>('/demo-identity/status');
        setCurrentStatus(status);
      } catch {
        // Not verified yet
      }
    } catch (err: any) {
      setMessage(err.message || 'Could not load demo identities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectIdentity = async (id: number) => {
    try {
      const res = await apiRequest<VerificationStatus>('/demo-identity/verify', {
        method: 'POST',
        body: JSON.stringify({ demo_identity_id: id }),
      });
      setCurrentStatus(res);
      setMessage('Synthetic identity linked successfully. State: DEMO_VERIFIED');
    } catch (err: any) {
      setMessage(err.message || 'Verification failed.');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff',
        padding: '24px',
        borderRadius: '8px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ marginBottom: '12px', fontSize: '1.25rem' }}>Synthetic Demo Identity</h2>
        <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '16px' }}>
          Notice: This system uses fictional, synthetic identities only for hackathon and demo purposes. It does not perform real identity checks or store official records.
        </p>

        {currentStatus?.demo_identity && (
          <div style={{
            background: '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <strong>Current Verified Identity:</strong> {currentStatus.demo_identity.synthetic_id} - {currentStatus.demo_identity.full_name} ({currentStatus.status})
          </div>
        )}

        {message && (
          <div style={{
            padding: '8px 12px',
            background: '#eff6ff',
            border: '1px solid #3b82f6',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '0.875rem'
          }}>
            {message}
          </div>
        )}

        {loading ? (
          <p>Loading synthetic identities...</p>
        ) : (
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '0.875rem' }}>
              Select Synthetic Profile:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {identities.map((item) => (
                <button
                  key={item.id}
                  onClick={() => selectIdentity(item.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: currentStatus?.demo_identity?.id === item.id ? '#e0f2fe' : '#f9fafb',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <strong>{item.synthetic_id}</strong>: {item.full_name}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#059669', alignSelf: 'center' }}>
                    {item.state}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4b5563',
              color: '#fff',
              border: 'none',
              borderRadius: '6px'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
