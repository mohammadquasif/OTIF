import type { CSSProperties, ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

const variantStyles: Record<string, CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, var(--brand-500), var(--brand-600))',
    color: '#fff',
    border: 'none',
    boxShadow: '0 2px 8px hsla(258, 75%, 55%, 0.25)',
  },
  secondary: {
    background: 'var(--bg-overlay)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'hsla(352, 85%, 45%, 0.2)',
    color: 'var(--accent-rose)',
    border: '1px solid hsla(352, 85%, 62%, 0.3)',
  },
};

const sizeStyles: Record<string, CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: '12px', borderRadius: 'var(--r-sm)' },
  md: { padding: '8px 16px', fontSize: '13px', borderRadius: 'var(--r-md)' },
  lg: { padding: '12px 24px', fontSize: '14px', borderRadius: 'var(--r-md)' },
};

export function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled = false, loading = false, icon, className = '', style, type = 'button', title,
}: ButtonProps) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: 600,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : loading ? 0.8 : 1,
    transition: 'all var(--t-fast)',
    whiteSpace: 'nowrap',
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...style,
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={base}
      className={className}
      title={title}
    >
      {loading && <span className="spinner" style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
      {!loading && icon}
      {children}
    </button>
  );
}
