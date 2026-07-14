import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Badge } from './shared/Badge';
import { Button } from './shared/Button';
import type { ImprovementItem } from '../types';

interface ImprovementAnnotationsProps {
  improvements: ImprovementItem[];
  approvedIds: string[];
  onToggleApproval: (itemId: string) => void;
  onApproveAll: () => void;
  className?: string;
  style?: CSSProperties;
}

const priorityColors: Record<string, { bg: string; border: string; text: string }> = {
  high: { bg: 'hsla(352, 85%, 62%, 0.08)', border: 'hsla(352, 85%, 62%, 0.3)', text: 'var(--score-critical)' },
  medium: { bg: 'hsla(38, 95%, 58%, 0.08)', border: 'hsla(38, 95%, 58%, 0.3)', text: 'var(--score-fair)' },
  low: { bg: 'hsla(191, 80%, 55%, 0.08)', border: 'hsla(191, 80%, 55%, 0.3)', text: 'var(--sev-low)' },
};

export function ImprovementAnnotations({
  improvements, approvedIds, onToggleApproval, onApproveAll,
  className = '', style,
}: ImprovementAnnotationsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pending = improvements.filter((i) => !approvedIds.includes(i.id));
  const approved = improvements.filter((i) => approvedIds.includes(i.id));

  if (improvements.length === 0) {
    return (
      <div className={className} style={{
        textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px',
        ...style,
      }}>
        No improvement suggestions yet. Run analysis first.
      </div>
    );
  }

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '8px', ...style }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Improvement Plan
        </span>
        <Badge label={`${pending.length} pending`} variant={pending.length > 0 ? 'warning' : 'success'} />
        {approved.length > 0 && <Badge label={`${approved.length} approved`} variant="success" />}
        {pending.length > 0 && (
          <span style={{ flex: 1, textAlign: 'right' }}>
            <Button size="sm" variant="ghost" onClick={onApproveAll}>
              Approve All
            </Button>
          </span>
        )}
      </div>

      {/* Pending improvements */}
      {pending.map((item) => {
        const colors = priorityColors[item.priority] || priorityColors.low;
        const isExpanded = expandedId === item.id;

        return (
          <div
            key={item.id}
            style={{
              padding: '10px 12px', borderRadius: 'var(--r-md)',
              background: colors.bg, border: `1px solid ${colors.border}`,
              cursor: 'pointer', transition: 'all var(--t-fast)',
            }}
            onClick={() => setExpandedId(isExpanded ? null : item.id)}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <Badge label={item.priority.toUpperCase()} variant={item.priority === 'high' ? 'error' : item.priority === 'medium' ? 'warning' : 'info'} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                {item.title}
              </span>
              <input
                type="checkbox"
                checked={approvedIds.includes(item.id)}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleApproval(item.id);
                }}
                style={{ cursor: 'pointer', accentColor: 'var(--brand-500)' }}
              />
            </div>

            {isExpanded && (
              <div style={{ marginTop: '8px', paddingLeft: '4px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 6px' }}>
                  <strong>Action:</strong> {item.action}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
                  "{item.evidence}"
                </p>
                {item.chapter_id && (
                  <p style={{ fontSize: '10px', color: 'var(--text-disabled)', margin: '6px 0 0' }}>
                    📍 Applies to: {item.chapter_id}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Approved improvements (collapsed) */}
      {approved.length > 0 && (
        <div style={{
          marginTop: '4px', padding: '8px 12px',
          background: 'hsla(145, 75%, 55%, 0.06)',
          border: '1px solid hsla(145, 75%, 55%, 0.15)',
          borderRadius: 'var(--r-md)',
        }}>
          <details>
            <summary style={{
              fontSize: '11px', fontWeight: 600, color: 'var(--score-excellent)',
              cursor: 'pointer',
            }}>
              ✓ {approved.length} approved improvement{approved.length !== 1 ? 's' : ''}
            </summary>
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {approved.map((item) => (
                <div key={item.id} style={{ fontSize: '11px', color: 'var(--text-secondary)', paddingLeft: '4px' }}>
                  ✓ {item.title}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
