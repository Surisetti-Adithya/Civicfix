import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  address?: {
    road?: string;
    suburb?: string;
    city?: string;
    state?: string;
    postcode?: string;
  };
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect: (lat: number, lng: number, displayName: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
  style?: React.CSSProperties;
}

/** Search Nominatim for address suggestions */
async function searchAddresses(query: string): Promise<NominatimResult[]> {
  if (!query || query.trim().length < 4) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Accept-Language': 'en' },
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch {
    // network / abort – silent
  }
  return [];
}

/** Shorten a Nominatim display_name to a readable format */
function shortenDisplayName(displayName: string): string {
  const parts = displayName.split(',').map((p) => p.trim());
  // Keep at most 4 meaningful parts
  return parts.slice(0, 4).join(', ');
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onLocationSelect,
  placeholder = 'Start typing an address or landmark...',
  required = false,
  id,
  style = {},
}) => {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 4) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchAddresses(query);
      setSuggestions(results);
      setOpen(results.length > 0);
      setLoading(false);
      setSelectedIndex(-1);
    }, 450);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    fetchSuggestions(v);
  };

  const handleSelect = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const name = shortenDisplayName(result.display_name);
    onChange(name);
    onLocationSelect(lat, lng, name);
    setSuggestions([]);
    setOpen(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          required={required}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            width: '100%',
            padding: '0.6rem 2.2rem 0.6rem 0.6rem',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            fontSize: '0.875rem',
            boxSizing: 'border-box',
            ...style,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <MapPin size={14} />}
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            listStyle: 'none',
            margin: 0,
            padding: '4px 0',
            maxHeight: '240px',
            overflowY: 'auto',
          }}
        >
          {suggestions.map((result, idx) => (
            <li
              key={result.place_id}
              onMouseDown={() => handleSelect(result)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                lineHeight: 1.4,
                background: idx === selectedIndex ? '#eff6ff' : 'transparent',
                borderLeft: idx === selectedIndex ? '3px solid #2563eb' : '3px solid transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div style={{ fontWeight: 500, color: '#0f172a' }}>
                {shortenDisplayName(result.display_name)}
              </div>
              <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '1px' }}>
                {result.display_name.split(',').slice(4, 6).join(', ')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
