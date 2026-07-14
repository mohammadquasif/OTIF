import type { CSSProperties } from 'react';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
  style?: CSSProperties;
}

const colors: Record<string, { bg: string; text: string; border: string }> = {
  default: { bg: 'hsla(258, 75%, 55%, 0.15)', text: 'var(--brand-400)', border: 'hsla(258, 75%, 55%, 0.3)' },
  success: { bg: 'hsla(145, 75%, 55%, 0.12)', text: 'var(--score-excellent)', border: 'hsla(145, 75%, 55%, 0.25)' },
  warning: { bg: 'hsla(38, 95%, 58%, 0.12)', text: 'var(--score-fair)', border: 'hsla(38, 95%, 58%, 0.25)' },
  error: { bg: 'hsla(352, 85%, 62%, 0.12)', text: 'var(--score-critical)', border: 'hsla(352, 85%, 62%, 0.25)' },
  info: { bg: 'hsla(191, 90%, 55%, 0.12)', text: 'var(--score-good)', border: 'hsla(191, 90%, 55%, 0.25)' },
  neutral: { bg: 'var(--bg-overlay)', text: 'var(--text-secondary)', border: 'var(--border-default)' },
};

export function Badge({ label, variant = 'default', size = 'sm', className = '', style }: BadgeProps) {
  const c = colors[variant];
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: size === 'sm' ? '2px 8px' : '4px 12px',
    fontSize: size === 'sm' ? '11px' : '12px',
    fontWeight: 600,
    borderRadius: 'var(--r-full)',
    background: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
    ...style,
  };

  return <span style={base} className={className}>{label}</span>;
}
