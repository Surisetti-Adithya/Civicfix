import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Category, Complaint } from '../types';

interface NewComplaintProps {
  onSuccess: (complaintId: number) => void;
  onCancel: () => void;
}

export default function NewComplaint({ onSuccess, onCancel }: NewComplaintProps) {
  const [description, setDescription] = useState('');
  const [descriptionImproved, setDescriptionImproved] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [locationText, setLocationText] = useState('');
  const [baseSeverity, setBaseSeverity] = useState('MEDIUM');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // AI Assistance states (wired up for Phase 4)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCategorySuggestion, setAiCategorySuggestion] = useState<{ id: number; name: string; reason: string; confidence: string } | null>(null);
  const [aiImprovementSuggestion, setAiImprovementSuggestion] = useState<string | null>(null);

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

  const handleImproveWithAI = async () => {
    if (!description.trim()) return;
    setAiLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ improved_description: string | null; message?: string }>('/ai/improve-description', {
        method: 'POST',
        body: JSON.stringify({ description }),
      });
      if (res.improved_description) {
        setAiImprovementSuggestion(res.improved_description);
      } else {
        setError(res.message || 'AI suggestion unavailable.');
      }
    } catch (err: any) {
      setError(err.message || 'AI service unavailable. You can continue submitting your report manually.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSuggestCategoryWithAI = async () => {
    if (!description.trim()) return;
    setAiLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ category_id: number | null; category_name?: string; reason: string; confidence: string }>('/ai/suggest-category', {
        method: 'POST',
        body: JSON.stringify({ description }),
      });
      if (res.category_id) {
        setAiCategorySuggestion({
          id: res.category_id,
          name: res.category_name || `Category #${res.category_id}`,
          reason: res.reason,
          confidence: res.confidence,
        });
      } else {
        setError('No category recommendation available from AI.');
      }
    } catch (err: any) {
      setError(err.message || 'AI category suggestion unavailable.');
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
      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Submit a Community Issue</h2>
      <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Report a problem in shared spaces. Staff will review, route, and resolve it according to defined service targets.
      </p>

      {/* Immediate Danger Notice (Rule 8.13) */}
      <div style={{ background: '#fef2f2', border: '1px solid #ef4444', borderRadius: '6px', padding: '12px', marginBottom: '1.5rem', color: '#991b1b', fontSize: '0.875rem' }}>
        <strong>Notice:</strong> If there is immediate danger, contact local emergency services now. CivicFix is not an emergency service.
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
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

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={handleImproveWithAI}
              disabled={aiLoading || !description.trim()}
              style={{
                fontSize: '0.75rem',
                padding: '4px 8px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                color: '#1e293b',
              }}
            >
              {aiLoading ? 'Analyzing...' : 'AI Suggestion: Improve Clarity'}
            </button>

            <button
              type="button"
              onClick={handleSuggestCategoryWithAI}
              disabled={aiLoading || !description.trim()}
              style={{
                fontSize: '0.75rem',
                padding: '4px 8px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                color: '#1e293b',
              }}
            >
              AI Suggestion: Recommend Category
            </button>
          </div>
        </div>

        {/* AI Improvement Suggestion Panel */}
        {aiImprovementSuggestion && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>
                AI suggestion (Clarity Improvement)
              </span>
              <button
                type="button"
                onClick={() => setAiImprovementSuggestion(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.75rem' }}
              >
                Dismiss
              </button>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#14532d', marginBottom: '8px' }}>
              {aiImprovementSuggestion}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setDescription(aiImprovementSuggestion);
                  setDescriptionImproved(aiImprovementSuggestion);
                  setAiImprovementSuggestion(null);
                }}
                style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600 }}
              >
                Accept Suggestion
              </button>
              <button
                type="button"
                onClick={() => setAiImprovementSuggestion(null)}
                style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px' }}
              >
                Keep Original Text
              </button>
            </div>
          </div>
        )}

        {/* AI Category Suggestion Panel */}
        {aiCategorySuggestion && (
          <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '6px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px' }}>
                AI suggestion (Category: {aiCategorySuggestion.name})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                Confidence: {aiCategorySuggestion.confidence}
              </span>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#1e3a8a', marginBottom: '8px' }}>
              Reason: {aiCategorySuggestion.reason}
            </p>
            <button
              type="button"
              onClick={() => {
                setCategoryId(aiCategorySuggestion.id);
                setAiCategorySuggestion(null);
              }}
              style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600 }}
            >
              Apply Category ({aiCategorySuggestion.name})
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label htmlFor="category" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
              Category
            </label>
            <select
              id="category"
              value={categoryId || ''}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
            >
              <option value="">Unassigned / General</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="severity" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
              Initial Severity
            </label>
            <select
              id="severity"
              value={baseSeverity}
              onChange={(e) => setBaseSeverity(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
            >
              <option value="LOW">Low - Minor inconvenience</option>
              <option value="MEDIUM">Medium - Normal maintenance issue</option>
              <option value="HIGH">High - Significant disruption</option>
              <option value="CRITICAL">Critical - Immediate risk</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="location" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Location Description or Address *
          </label>
          <input
            id="location"
            type="text"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            required
            placeholder="e.g. Near Flat 302, Tower B or 5th Cross Road, Ward 12"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '0.6rem 1.25rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '0.6rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600 }}
          >
            {loading ? 'Submitting Report...' : 'Submit Report'}
          </button>
        </div>
      </form>
    </div>
  );
}
