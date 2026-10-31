import React from 'react';
import { Shield } from 'lucide-react';

interface TrustBadgeProps {
  tier?: string;
  title?: string;
  trustLevel?: number;
  showPoints?: boolean;
  size?: 'small' | 'medium';
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({
  tier = 'BRONZE',
  title = 'Active Contributor',
  trustLevel,
  showPoints = false,
  size = 'small',
}) => {
  const getColors = (t: string) => {
    switch (t?.toUpperCase()) {
      case 'PLATINUM':
        return { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc', icon: '#0284c7' };
      case 'GOLD':
        return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', icon: '#d97706' };
      case 'SILVER':
        return { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1', icon: '#64748b' };
      case 'BRONZE':
        return { bg: '#ffedd5', text: '#9a3412', border: '#fdba74', icon: '#c2410c' };
      default:
        return { bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db', icon: '#9ca3af' };
    }
  };

  const colors = getColors(tier);
  const isSmall = size === 'small';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? '4px' : '6px',
        padding: isSmall ? '2px 8px' : '4px 12px',
        borderRadius: '9999px',
        fontSize: isSmall ? '0.75rem' : '0.85rem',
        fontWeight: 600,
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        lineHeight: 1.2,
      }}
      title={`Trust Level: ${trustLevel ?? 'N/A'} - ${title}`}
    >
      <Shield size={isSmall ? 12 : 15} color={colors.icon} />
      <span>{title}</span>
      {showPoints && trustLevel !== undefined && (
        <span style={{ opacity: 0.85, fontWeight: 500, fontSize: isSmall ? '0.7rem' : '0.75rem' }}>
          ({trustLevel} pts)
        </span>
      )}
    </span>
  );
};
