import type { CSSProperties, ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function EmptyState({ icon, title, description, action, className = '', style }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)',
        ...style,
      }}
      className={className}
    >
      {icon && <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.6 }}>{icon}</div>}
      <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '16px', fontWeight: 600 }}>{title}</h3>
      {description && <p style={{ fontSize: '13px', maxWidth: '360px', lineHeight: 1.5 }}>{description}</p>}
      {action && <div style={{ marginTop: '20px' }}>{action}</div>}
    </div>
  );
}
