import { useMemo, type CSSProperties } from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import type { ImprovementItem } from '../../types';

interface MarginAnnotationsProps {
  improvements: ImprovementItem[];
  approvedIds: string[];
  onToggleApproval?: (itemId: string) => void;
  onScrollTo?: (itemId: string) => void;
  className?: string;
  style?: CSSProperties;
}

const PRIORITY_CONFIG: Record<string, { color: string; bg: string; icon: typeof AlertCircle }> = {
  high:   { color: 'var(--score-critical)', bg: 'hsla(352, 85%, 62%, 0.08)', icon: AlertCircle },
  medium: { color: 'var(--score-fair)',     bg: 'hsla(38, 95%, 58%, 0.08)',  icon: AlertTriangle },
  low:    { color: 'var(--score-good)',     bg: 'hsla(191, 90%, 55%, 0.08)', icon: Info },
};

export function MarginAnnotations({
  improvements, approvedIds, onToggleApproval, onScrollTo,
  className = '', style,
}: MarginAnnotationsProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, ImprovementItem[]>();
    improvements.forEach((item) => {
      const key = item.chapter_id ?? 'global';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return map;
  }, [improvements]);

  if (improvements.length === 0) {
    return (
      <div className={className} style={{
        padding: '16px', textAlign: 'center',
        color: 'var(--text-muted)', fontSize: '11px',
        ...style,
      }}>
        <AlertCircle size={20} style={{ opacity: 0.3, marginBottom: '8px' }} />
        <p>Run analysis to see margin annotations.</p>
      </div>
    );
  }

  return (
    <div className={className} style={{
      display: 'flex', flexDirection: 'column', gap: '2px',
      padding: '6px 4px', overflow: 'auto',
      fontFamily: 'var(--font-sans)',
      ...style,
    }}>
      {Array.from(grouped.entries()).map(([chapterId, items]) => (
        <div key={chapterId}>
          {/* Chapter label */}
          {chapterId !== 'global' && (
            <div style={{
              fontSize: '9px', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.5px', color: 'var(--text-muted)',
              padding: '8px 6px 4px',
            }}>
              {chapterId}
            </div>
          )}

          {items.map((item) => {
            const isApproved = approvedIds.includes(item.id);
            const config = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.low;
            const Icon = config.icon;

            return (
              <div
                key={item.id}
                onClick={() => {
                  onToggleApproval?.(item.id);
                  onScrollTo?.(item.id);
                }}
                title={item.evidence}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '6px',
                  padding: '6px 8px', borderRadius: 'var(--r-sm)',
                  cursor: 'pointer', transition: 'all var(--t-fast)',
                  background: isApproved ? 'transparent' : config.bg,
                  opacity: isApproved ? 0.4 : 1,
                  borderLeft: `3px solid ${isApproved ? 'transparent' : config.color}`,
                }}
              >
                {/* Priority icon */}
                <Icon size={11} color={config.color} style={{ marginTop: '1px', flexShrink: 0 }} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '10px', fontWeight: 600,
                    color: isApproved ? 'var(--text-muted)' : 'var(--text-primary)',
                    textDecoration: isApproved ? 'line-through' : 'none',
                    lineHeight: 1.3, marginBottom: '2px',
                  }}>
                    {item.title}
                  </div>
                  {item.evidence && (
                    <div style={{
                      fontSize: '9px', color: 'var(--text-muted)',
                      lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {item.evidence.slice(0, 150)}
                    </div>
                  )}
                  {item.page_range && (
                    <div style={{ fontSize: '8px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {item.page_range}
                    </div>
                  )}
                </div>

                {/* Mark approved/skip */}
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleApproval?.(item.id); }}
                  style={{
                    padding: '2px 6px', fontSize: '9px', fontWeight: 600,
                    borderRadius: 'var(--r-sm)', border: 'none',
                    background: isApproved ? 'var(--bg-overlay)' : 'var(--bg-muted)',
                    color: isApproved ? 'var(--text-muted)' : 'var(--text-secondary)',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {isApproved ? '↩' : '✓'}
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {/* Summary footer */}
      <div style={{
        marginTop: '8px', padding: '8px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '10px', color: 'var(--text-muted)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{improvements.length} findings</span>
        <span>{approvedIds.length} approved</span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          color: 'var(--brand-400)', fontWeight: 600,
        }}>
          {improvements.length - approvedIds.length} remaining <ChevronRight size={10} />
        </span>
      </div>
    </div>
  );
}
