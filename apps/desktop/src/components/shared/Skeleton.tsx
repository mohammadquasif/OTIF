import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 'var(--r-sm)', className = '', style }: SkeletonProps) {
  const base: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius,
    background: 'linear-gradient(90deg, var(--bg-muted) 25%, var(--bg-overlay) 50%, var(--bg-muted) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    ...style,
  };

  return <div style={base} className={className} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ padding: 'var(--sp-5)', background: 'var(--bg-raised)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-subtle)' }}>
      <Skeleton width="60%" height={20} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} width={i === lines - 1 ? '40%' : '100%'} height={14} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
          <Skeleton width={32} height={32} borderRadius="var(--r-full)" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton width={`${60 + Math.random() * 30}%`} height={14} />
            <Skeleton width={`${30 + Math.random() * 40}%`} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}
