import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from './shared/Button';
import { Badge } from './shared/Badge';
import { buildDiff, composeReviewedText } from '../utils/diff';
import type { InlineChange } from '../utils/diff';

interface InlineDiffViewProps {
  originalText: string;
  revisedText: string;
  changes: InlineChange[];
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  className?: string;
  style?: CSSProperties;
}

type ReviewView = 'diff' | 'final' | 'original';

const viewLabels: Record<ReviewView, string> = {
  diff: 'Review & Approve',
  final: 'Improved Text',
  original: 'Original Text',
};

export function InlineDiffView({
  originalText,
  revisedText,
  changes,
  onAcceptChange,
  onRejectChange,
  onAcceptAll,
  onRejectAll,
  className = '',
  style,
}: InlineDiffViewProps) {
  const [selectedView, setSelectedView] = useState<ReviewView>('diff');
  const reviewedText = useMemo(
    () => composeReviewedText(originalText, revisedText, changes),
    [originalText, revisedText, changes],
  );
  const segments = useMemo(() => buildDiff(originalText, reviewedText), [originalText, reviewedText]);
  const pendingChanges = changes.filter((change) => !change.applied && !change.rejected);
  const acceptedChanges = changes.filter((change) => change.applied && !change.rejected);
  const rejectedCount = changes.filter((change) => change.rejected).length;

  return (
    <section className={`review-approve-panel ${className}`.trim()} style={style}>
      <div className="review-approve-titlebar">
        <div>
          <div className="review-approve-title">Review &amp; approve AI rewrite</div>
          <div className="review-approve-subtitle">Red text will be removed. Green text will be added.</div>
        </div>
        <div className="review-approve-badges">
          <Badge label={`${pendingChanges.length} pending`} variant={pendingChanges.length ? 'warning' : 'success'} />
          <Badge label={`${acceptedChanges.length} accepted`} variant="success" />
          {rejectedCount > 0 && <Badge label={`${rejectedCount} rejected`} variant="error" />}
        </div>
      </div>

      <div className="review-approve-tabs">
        {(['diff', 'final', 'original'] as const).map((view) => (
          <button
            key={view}
            className={`review-approve-tab ${selectedView === view ? 'active' : ''}`}
            onClick={() => setSelectedView(view)}
          >
            {viewLabels[view]}
          </button>
        ))}
        <span className="review-approve-spacer" />
        <span className="review-legend"><span className="legend-dot remove" /> remove</span>
        <span className="review-legend"><span className="legend-dot add" /> add</span>
        <div className="review-approve-actions">
          <Button size="sm" variant="primary" onClick={onAcceptAll}>
            {pendingChanges.length > 0 ? 'Accept All & Apply' : 'Apply Accepted'}
          </Button>
          <Button size="sm" variant="danger" onClick={onRejectAll}>Reject All</Button>
        </div>
      </div>

      {pendingChanges.length > 0 && selectedView === 'diff' && (
        <div className="review-change-strip">
          {pendingChanges.slice(0, 6).map((change) => (
            <div className="review-change-pill" key={change.id}>
              <Badge
                label={change.type === 'removal' ? 'Remove' : change.type === 'addition' ? 'Add' : 'Replace'}
                variant={change.type === 'removal' ? 'error' : change.type === 'addition' ? 'success' : 'warning'}
              />
              <span className="review-change-reason">{change.reason}</span>
              <Button size="sm" variant="ghost" onClick={() => onRejectChange(change.id)}>Reject</Button>
              <Button size="sm" variant="primary" onClick={() => onAcceptChange(change.id)}>Accept</Button>
            </div>
          ))}
        </div>
      )}

      <div className="review-text-pane">
        {selectedView === 'original' && (
          <p className="review-text-original">{originalText}</p>
        )}
        {selectedView === 'final' && (
          <p className="review-text-final">{reviewedText}</p>
        )}
        {selectedView === 'diff' && segments.map((segment, index) => (
          <span key={index} className={`review-diff-token ${segment.type}`}>
            {segment.text}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Create change objects from a diff between original and revised text. */
export { buildDiff, extractChanges, composeReviewedText, type InlineChange, type DiffSegment } from '../utils/diff';
