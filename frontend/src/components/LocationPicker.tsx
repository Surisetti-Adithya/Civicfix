import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation } from 'lucide-react';

interface LocationPickerProps {
  latitude?: number | null;
  longitude?: number | null;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  onChange?: (lat: number, lng: number) => void;
  height?: string;
  readOnly?: boolean;
}

// Self-contained SVG pin for problem location (red/blue)
const problemPinSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
  <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26c0-8.84-7.16-16-16-16z" fill="#dc2626" stroke="#991b1b" stroke-width="1.5"/>
  <circle cx="16" cy="16" r="6" fill="#ffffff"/>
</svg>
`);

const problemIcon = L.icon({
  iconUrl: `data:image/svg+xml;utf-8,${problemPinSvg}`,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -38],
});

// Self-contained SVG pin for Home location (green/teal)
const homePinSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 24 14 24s14-13.5 14-24c0-7.73-6.27-14-14-14z" fill="#16a34a" stroke="#15803d" stroke-width="1.5"/>
  <circle cx="14" cy="14" r="5" fill="#ffffff"/>
</svg>
`);

const homeIcon = L.icon({
  iconUrl: `data:image/svg+xml;utf-8,${homePinSvg}`,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -34],
});

export const LocationPicker: React.FC<LocationPickerProps> = ({
  latitude,
  longitude,
  homeLatitude,
  homeLongitude,
  onChange,
  height = '320px',
  readOnly = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const targetMarkerRef = useRef<L.Marker | null>(null);
  const homeMarkerRef = useRef<L.Marker | null>(null);

  // Fallback coords (Bangalore center) if nothing provided
  const initialLat = latitude ?? homeLatitude ?? 12.9716;
  const initialLng = longitude ?? homeLongitude ?? 77.5946;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Leaflet map
    const map = L.map(mapContainerRef.current).setView([initialLat, initialLng], 14);
    mapInstanceRef.current = map;

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // If home location is known, add a Home marker
    if (homeLatitude && homeLongitude) {
      const homeMarker = L.marker([homeLatitude, homeLongitude], {
        icon: homeIcon,
        interactive: true,
      })
        .addTo(map)
        .bindPopup('Your Saved Home Location');
      homeMarkerRef.current = homeMarker;
    }

    // Add target marker (the problem location cursor)
    const marker = L.marker([initialLat, initialLng], {
      icon: problemIcon,
      draggable: !readOnly,
    }).addTo(map);
    marker.bindPopup(readOnly ? 'Problem Location' : 'Drag this pin to problem location');
    targetMarkerRef.current = marker;

    if (!readOnly && onChange) {
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onChange(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      });

      // Also allow clicking anywhere on the map to position marker
      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        onChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
    }

    // Trigger map invalidation to ensure proper rendering inside flex/containers
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update target marker position if props change externally
  useEffect(() => {
    if (latitude && longitude && targetMarkerRef.current) {
      const cur = targetMarkerRef.current.getLatLng();
      if (Math.abs(cur.lat - latitude) > 0.0001 || Math.abs(cur.lng - longitude) > 0.0001) {
        targetMarkerRef.current.setLatLng([latitude, longitude]);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.panTo([latitude, longitude]);
        }
      }
    }
  }, [latitude, longitude]);

  const handleResetToHome = () => {
    if (homeLatitude && homeLongitude && onChange && targetMarkerRef.current) {
      targetMarkerRef.current.setLatLng([homeLatitude, homeLongitude]);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo([homeLatitude, homeLongitude]);
      }
      onChange(homeLatitude, homeLongitude);
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height,
          borderRadius: '8px',
          border: '1px solid #d1d5db',
          overflow: 'hidden',
          zIndex: 1,
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '6px',
          fontSize: '0.8rem',
          color: '#6b7280',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={14} color="#dc2626" />
          <span>
            {latitude && longitude
              ? `Selected: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
              : 'Drag pin or click map to choose location'}
          </span>
        </div>
        {!readOnly && homeLatitude && homeLongitude && (
          <button
            type="button"
            onClick={handleResetToHome}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              fontSize: '0.75rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              color: '#374151',
            }}
          >
            <Navigation size={12} color="#16a34a" />
            Reset to Home
          </button>
        )}
      </div>
    </div>
  );
};
