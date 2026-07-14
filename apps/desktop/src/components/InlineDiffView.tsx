import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from './shared/Button';
import { Badge } from './shared/Badge';

interface DiffSegment {
  type: 'same' | 'added' | 'removed';
  text: string;
}

export interface InlineChange {
  id: string;
  type: 'removal' | 'addition' | 'modification';
  originalText: string;
  newText: string;
  reason: string;
  applied: boolean;
  rejected?: boolean;
}

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

/** Build word-level diff segments between original and revised text. */
function buildDiff(original: string, revised: string): DiffSegment[] {
  const a = original.match(/\S+|\s+/g) ?? [];
  const b = revised.match(/\S+|\s+/g) ?? [];
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      segments.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      segments.push({ type: 'removed', text: a[i] });
      i++;
    } else {
      segments.push({ type: 'added', text: b[j] });
      j++;
    }
  }

  while (i < a.length) {
    segments.push({ type: 'removed', text: a[i] });
    i++;
  }
  while (j < b.length) {
    segments.push({ type: 'added', text: b[j] });
    j++;
  }

  return segments;
}

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
export function extractChanges(original: string, revised: string, reason: string): InlineChange[] {
  const segments = buildDiff(original, revised);
  const changes: InlineChange[] = [];
  let changeIdx = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.type === 'removed') {
      let removedText = segment.text;
      let addedText = '';
      while (i + 1 < segments.length && (segments[i + 1].type === 'removed' || segments[i + 1].type === 'added')) {
        i++;
        if (segments[i].type === 'removed') removedText += segments[i].text;
        else addedText += segments[i].text;
      }
      changes.push({
        id: `change-${changeIdx++}`,
        type: addedText ? 'modification' : 'removal',
        originalText: removedText.trim(),
        newText: addedText.trim(),
        reason,
        applied: false,
        rejected: false,
      });
    } else if (segment.type === 'added') {
      let addedText = segment.text;
      while (i + 1 < segments.length && segments[i + 1].type === 'added') {
        i++;
        addedText += segments[i].text;
      }
      changes.push({
        id: `change-${changeIdx++}`,
        type: 'addition',
        originalText: '',
        newText: addedText.trim(),
        reason,
        applied: false,
        rejected: false,
      });
    }
  }

  return changes;
}

/** Compose the chapter text after rejected AI changes are reverted to the original wording. */
export function composeReviewedText(original: string, revised: string, changes: InlineChange[]): string {
  const segments = buildDiff(original, revised);
  const rejectedIds = new Set(changes.filter((change) => change.rejected).map((change) => change.id));
  const output: string[] = [];
  let changeIdx = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.type === 'same') {
      output.push(segment.text);
      continue;
    }

    let removedText = '';
    let addedText = '';
    while (i < segments.length && segments[i].type !== 'same') {
      if (segments[i].type === 'removed') removedText += segments[i].text;
      if (segments[i].type === 'added') addedText += segments[i].text;
      i++;
    }
    i--;

    const changeId = `change-${changeIdx++}`;
    output.push(rejectedIds.has(changeId) ? removedText : addedText);
  }

  return output.join('').trim();
}
