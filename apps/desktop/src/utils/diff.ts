/** Shared word-level diff utilities extracted from InlineDiffView. */

export interface DiffSegment {
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

/** Build word-level diff segments between original and revised text. */
export function buildDiff(original: string, revised: string): DiffSegment[] {
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
