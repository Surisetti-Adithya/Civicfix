interface PieSegment {
  label: string;
  count: number;
  color: string;
}

interface PieChartProps {
  title: string;
  subtitle?: string;
  segments: PieSegment[];
  size?: number;
}

export default function PieChart({ title, subtitle, segments, size = 200 }: PieChartProps) {
  const total = segments.reduce((acc, s) => acc + s.count, 0);

  const center = size / 2;
  const radius = (size / 2) - 16;

  // Helper to compute SVG arc coordinates
  const getCoordinatesForPercent = (percent: number) => {
    const x = center + radius * Math.cos(2 * Math.PI * percent);
    const y = center + radius * Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  let cumulativePercent = 0;

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flex: 1,
      minWidth: '280px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#1e293b', textAlign: 'center' }}>
        {title}
      </h3>
      {subtitle && (
        <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', marginBottom: '1rem', textAlign: 'center' }}>
          {subtitle}
        </p>
      )}

      {total === 0 ? (
        <div style={{ height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
          No recorded reports in this region
        </div>
      ) : (
        <div style={{ position: 'relative', width: size, height: size, marginTop: '0.5rem' }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
            {segments.map((seg, idx) => {
              if (seg.count === 0) return null;
              const percent = seg.count / total;

              // If a single slice is 100%, draw full circle
              if (percent >= 0.999) {
                return (
                  <circle
                    key={idx}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill={seg.color}
                  />
                );
              }

              const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
              cumulativePercent += percent;
              const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
              const largeArcFlag = percent > 0.5 ? 1 : 0;

              const pathData = [
                `M ${center} ${center}`,
                `L ${startX} ${startY}`,
                `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                'Z',
              ].join(' ');

              return (
                <path
                  key={idx}
                  d={pathData}
                  fill={seg.color}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              );
            })}
          </svg>
        </div>
      )}

      {/* Legend & Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%', marginTop: '1.25rem' }}>
        {segments.map((seg, idx) => {
          const pct = total > 0 ? ((seg.count / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.825rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: seg.color }} />
                <span style={{ color: '#334155', fontWeight: 500 }}>{seg.label}</span>
              </div>
              <span style={{ color: '#0f172a', fontWeight: 700 }}>
                {seg.count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>

      {/* Total Box */}
      <div style={{
        marginTop: '1rem',
        paddingTop: '0.75rem',
        borderTop: '1px solid #f1f5f9',
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.875rem',
      }}>
        <span style={{ color: '#64748b', fontWeight: 500 }}>Total Reports Given:</span>
        <span style={{ color: '#0f172a', fontWeight: 800 }}>{total}</span>
      </div>
    </div>
  );
}
