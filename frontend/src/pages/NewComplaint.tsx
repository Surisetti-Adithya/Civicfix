import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Category, Complaint } from '../types';

interface NewComplaintProps {
  onSuccess: (complaintId: number) => void;
  onCancel: () => void;
}

export default function NewComplaint({ onSuccess, onCancel }: NewComplaintProps) {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [descriptionImproved, setDescriptionImproved] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [locationText, setLocationText] = useState('');
  const [baseSeverity, setBaseSeverity] = useState('MEDIUM');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // AI Assistance states
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState('');

  // 1. Automatically fill address for citizen portal demo identity / user profile
  useEffect(() => {
    const defaultAddress = user?.permanent_location || '4th Cross, 5th Main, Indiranagar, Metro City';
    setLocationText(defaultAddress);
  }, [user]);

  useEffect(() => {
    apiRequest<Category[]>('/categories')
      .then((data) => {
        setCategories(data);
        if (data.length > 0) {
          setCategoryId(data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // 4. Single "Done" button that triggers both clarity improvement and category recommendation
  const handleDoneWithAI = async () => {
    if (!description.trim()) {
      setError('Please type a description before clicking Done.');
      return;
    }
    setAiLoading(true);
    setError('');
    setAiSuccessMessage('');

    try {
      const [improveRes, categoryRes] = await Promise.allSettled([
        apiRequest<{ improved_description: string | null; message?: string }>('/ai/improve-description', {
          method: 'POST',
          body: JSON.stringify({ description }),
        }),
        apiRequest<{ category_id: number | null; category_name?: string; reason: string; confidence: string }>('/ai/suggest-category', {
          method: 'POST',
          body: JSON.stringify({ description }),
        }),
      ]);

      let improvedApplied = false;
      let categoryApplied = false;

      if (improveRes.status === 'fulfilled' && improveRes.value.improved_description) {
        setDescription(improveRes.value.improved_description);
        setDescriptionImproved(improveRes.value.improved_description);
        improvedApplied = true;
      }

      if (categoryRes.status === 'fulfilled' && categoryRes.value.category_id) {
        setCategoryId(categoryRes.value.category_id);
        categoryApplied = true;
      }

      if (improvedApplied || categoryApplied) {
        setAiSuccessMessage('AI refined your description and selected the matching category. You can continue editing both below.');
      }
    } catch {
      // Graceful fallback: do not block user
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please provide a description.');
      return;
    }
    if (!locationText.trim()) {
      setError('Please provide a location.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        description: description.trim(),
        description_improved: descriptionImproved,
        category_id: categoryId,
        location_text: locationText.trim(),
        base_severity: baseSeverity,
      };

      const result = await apiRequest<Complaint>('/complaints', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      onSuccess(result.id);
    } catch (err: any) {
      setError(err.message || 'Failed to submit complaint.');
    } finally {
      setLoading(false);
    }
  };

  const maxChars = 1500;
  const charsRemaining = maxChars - description.length;

  return (
    <div style={{ maxWidth: '750px', margin: '2rem auto', background: '#ffffff', padding: '2rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 700 }}>Submit a Community Issue</h2>
      <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Report a problem in shared spaces. Staff will review, route, and resolve it according to defined service targets.
      </p>

      {/* Immediate Danger Notice */}
      <div style={{ background: '#fef2f2', border: '1px solid #ef4444', borderRadius: '6px', padding: '12px', marginBottom: '1.5rem', color: '#991b1b', fontSize: '0.875rem' }}>
        <strong>Notice:</strong> If there is immediate danger, contact local emergency services now. CivicFix is not an emergency service.
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {aiSuccessMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px 12px', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {aiSuccessMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <label htmlFor="description" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              Issue Description *
            </label>
            <span style={{ fontSize: '0.75rem', color: charsRemaining < 100 ? '#dc2626' : '#64748b' }}>
              {description.length} / {maxChars} characters ({charsRemaining} remaining)
            </span>
          </div>

          <textarea
            id="description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, maxChars))}
            required
            placeholder="Describe what is broken, where it is located, and any safety hazards..."
            style={{ width: '100%', padding: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.875rem' }}
          />

          {/* Single "Done" button (Requirement 4) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={handleDoneWithAI}
              disabled={aiLoading || !description.trim()}
              style={{
                fontSize: '0.875rem',
                padding: '6px 14px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: description.trim() ? 'pointer' : 'not-allowed',
                opacity: description.trim() ? 1 : 0.6,
              }}
            >
              {aiLoading ? 'Processing with AI...' : 'Done'}
            </button>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Click Done to refine clarity and automatically select the appropriate category.
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="category" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Category *
          </label>
          <select
            id="category"
            value={categoryId || ''}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            required
            style={{ width: '100%', padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.875rem' }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.description ? ` - ${c.description}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="location" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Location / Address *
          </label>
          <input
            id="location"
            type="text"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            required
            placeholder="Street address, flat number, or landmark..."
            style={{ width: '100%', padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.875rem' }}
          />
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
            Pre-filled from your registered permanent location. You can modify it for this specific report if needed.
          </span>
        </div>

        <div>
          <label htmlFor="severity" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Initial Severity
          </label>
          <select
            id="severity"
            value={baseSeverity}
            onChange={(e) => setBaseSeverity(e.target.value)}
            style={{ width: '100%', padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.875rem' }}
          >
            <option value="LOW">Low (Cosmetic, minor inconvenience)</option>
            <option value="MEDIUM">Medium (Normal civic issue)</option>
            <option value="HIGH">High (Active disruption, hazardous conditions)</option>
            <option value="CRITICAL">Critical (Immediate safety risk)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Submitting Report...' : 'Submit Report'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
