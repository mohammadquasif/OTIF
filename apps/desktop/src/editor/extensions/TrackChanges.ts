import { Mark } from '@tiptap/core';

// ── Types ────────────────────────────────────────────────────

export type SuggestionType = 'insertion' | 'deletion' | 'format_change';

export interface SuggestionAttrs {
  id: string;
  type: SuggestionType;
  author: string;
  timestamp: string;
  accepted: boolean;
  rejected: boolean;
}

// ── Mark Definition ──────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    suggestion: {
      /** Add a tracked suggestion mark to the selected text */
      addSuggestion: (attrs: Partial<SuggestionAttrs>) => ReturnType;
    };
  }
}

export const TrackChangesMark = Mark.create({
  name: 'suggestion',

  addAttributes() {
    return {
      id: { default: '' },
      type: { default: 'insertion' as SuggestionType },
      author: { default: 'OTIF AI' },
      timestamp: { default: new Date().toISOString() },
      accepted: { default: false },
      rejected: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-suggestion]' }];
  },

  renderHTML({ mark }) {
    const type = (mark.attrs.type as SuggestionType) ?? 'insertion';
    const id = String(mark.attrs.id ?? '');
    const author = String(mark.attrs.author ?? 'OTIF AI');
    const timestamp = String(mark.attrs.timestamp ?? '');
    const accepted = Boolean(mark.attrs.accepted);
    const rejected = Boolean(mark.attrs.rejected);
    const titleText = `${type === 'insertion' ? 'Added' : type === 'deletion' ? 'Removed' : 'Changed'} by ${author} — ${new Date(timestamp).toLocaleString()}`;

    if (accepted || rejected) {
      if (type === 'deletion' && accepted) return ['span', {}, 0];
      return ['span', {}, 0];
    }

    const style =
      type === 'insertion'
        ? 'background: hsla(145, 75%, 45%, 0.1); border-bottom: 2px solid hsla(145, 75%, 55%, 0.6); padding: 0 2px;'
        : type === 'deletion'
          ? 'text-decoration: line-through; color: hsla(352, 85%, 62%, 0.7); background: hsla(352, 85%, 62%, 0.05); padding: 0 2px;'
          : 'background: hsla(38, 95%, 55%, 0.08); border-bottom: 2px dashed hsla(38, 95%, 58%, 0.5); padding: 0 2px;';

    return ['span', {
      'data-suggestion': id,
      'data-suggestion-type': type,
      'data-author': author,
      'data-accepted': String(accepted),
      'data-rejected': String(rejected),
      title: titleText,
      style,
    }, 0];
  },

  addCommands() {
    return {
      addSuggestion:
        (attrs: Partial<SuggestionAttrs>) =>
        ({ commands }) => {
          const fullAttrs: SuggestionAttrs = {
            id: attrs.id ?? `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: attrs.type ?? 'insertion',
            author: attrs.author ?? 'OTIF AI',
            timestamp: attrs.timestamp ?? new Date().toISOString(),
            accepted: false,
            rejected: false,
          };
          return commands.setMark('suggestion', fullAttrs as unknown as Record<string, unknown>);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-A': () => {
        // Accept all: iterate and mark accepted
        const { state, view } = this.editor;
        const { tr } = state;
        state.doc.descendants((node, pos) => {
          if (!node.isInline) return;
          node.marks.forEach((mark) => {
            if (mark.type.name === 'suggestion' && !mark.attrs.accepted) {
              tr.addMark(pos, pos + node.nodeSize, mark.type.create({ ...mark.attrs, accepted: true }));
            }
          });
        });
        view.dispatch(tr);
        return true;
      },
    };
  },
});

// ── Helpers ──────────────────────────────────────────────────

export function createInsertionSuggestion(author = 'OTIF AI'): SuggestionAttrs {
  return {
    id: `ins_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'insertion', author,
    timestamp: new Date().toISOString(),
    accepted: false, rejected: false,
  };
}

export function createDeletionSuggestion(author = 'OTIF AI'): SuggestionAttrs {
  return {
    id: `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'deletion', author,
    timestamp: new Date().toISOString(),
    accepted: false, rejected: false,
  };
}
