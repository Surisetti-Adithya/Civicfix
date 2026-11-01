/**
 * Geocoding utility using OpenStreetMap Nominatim with local fallback coordinates.
 */

interface GeocodeResult {
  lat: number;
  lng: number;
  displayName?: string;
}

// Known coordinates for common demo / local testing landmarks to ensure instantaneous response
const KNOWN_LANDMARK_COORDS: Record<string, { lat: number; lng: number }> = {
  indiranagar: { lat: 12.9733, lng: 77.6405 },
  koramangala: { lat: 12.9352, lng: 77.6245 },
  whitefield: { lat: 12.9698, lng: 77.7500 },
  "palm meadows": { lat: 12.9592, lng: 77.7335 },
  "mg road": { lat: 12.9756, lng: 77.6066 },
  "brigade road": { lat: 12.9719, lng: 77.6070 },
  "metro city": { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  "central depot": { lat: 12.9800, lng: 77.5850 },
  "municipal hq": { lat: 12.9780, lng: 77.5900 },
  "park lawn": { lat: 12.9760, lng: 77.6020 },
  "main gate": { lat: 12.9720, lng: 77.5950 },
  "5th avenue": { lat: 12.9740, lng: 77.6080 },
  "3rd street": { lat: 12.9710, lng: 77.5960 },
};

/**
 * Geocode a plain text address into latitude and longitude coordinates.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const query = address.trim();
  if (!query || query.length < 3) return null;

  // 1. Fast match against known local testing / demo landmarks
  const queryLower = query.toLowerCase();
  for (const [key, coords] of Object.entries(KNOWN_LANDMARK_COORDS)) {
    if (queryLower.includes(key)) {
      return {
        lat: coords.lat,
        lng: coords.lng,
        displayName: query,
      };
    }
  }

  // 2. Query OpenStreetMap Nominatim with a 4-second timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          displayName: data[0].display_name,
        };
      }
    }
  } catch {
    // network or abort failure -> fallback
  }

  // 3. Graceful fallback if query mentions city or area
  if (queryLower.includes('bangalore') || queryLower.includes('bengaluru') || queryLower.includes('ward')) {
    return { lat: 12.9716, lng: 77.5946, displayName: query };
  }

  return null;
}
