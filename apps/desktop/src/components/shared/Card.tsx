import type { CSSProperties, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  variant?: 'default' | 'glass' | 'elevated';
  padding?: string | number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

const variants: Record<string, CSSProperties> = {
  default: {
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--r-lg)',
  },
  glass: {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--r-lg)',
    backdropFilter: 'blur(20px)',
  },
  elevated: {
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--r-lg)',
    boxShadow: 'var(--shadow-md)',
  },
};

export function Card({ children, variant = 'default', padding = 'var(--sp-5)', className = '', style, onClick }: CardProps) {
  const base: CSSProperties = {
    ...variants[variant],
    padding: typeof padding === 'number' ? `${padding}px` : padding,
    cursor: onClick ? 'pointer' : undefined,
    transition: 'all var(--t-fast)',
    ...style,
  };

  return (
    <div style={base} className={className} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      {children}
    </div>
  );
}
