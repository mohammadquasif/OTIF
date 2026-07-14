import { Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// ── Types ────────────────────────────────────────────────────

export interface CitationAttrs {
  doi?: string;
  title?: string;
  authors?: string;
  year?: string;
  journal?: string;
  url?: string;
  citationKey: string;   // e.g. "smith2023"
  formattedText: string; // e.g. "(Smith et al., 2023)"
}

// ── Plugin Key ───────────────────────────────────────────────

const citationClickKey = new PluginKey('citationClick');

// ── Node Definition ──────────────────────────────────────────

export const CitationInline = Node.create({
  name: 'citationInline',

  group: 'inline',
  inline: true,
  atom: true,       // single unit — cannot edit inside
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      doi: { default: null },
      title: { default: null },
      authors: { default: null },
      year: { default: null },
      journal: { default: null },
      url: { default: null },
      citationKey: { default: '' },
      formattedText: { default: '[Citation]' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-citation]' }];
  },

  renderHTML({ node }) {
    const attrs = node.attrs as CitationAttrs;
    return [
      'span',
      {
        'data-citation': attrs.citationKey,
        'data-doi': attrs.doi ?? '',
        'data-title': attrs.title ?? '',
        'data-authors': attrs.authors ?? '',
        'data-year': attrs.year ?? '',
        title: attrs.title
          ? `${attrs.title} (${attrs.authors ?? 'Unknown'}, ${attrs.year ?? 'n.d.'})`
          : attrs.formattedText,
        class: 'citation-inline',
        style: 'background: hsla(258, 75%, 55%, 0.1); color: hsl(258, 75%, 55%); ' +
               'border-bottom: 1px dashed hsla(258, 75%, 55%, 0.4); ' +
               'padding: 0 2px; border-radius: 2px; cursor: pointer; ' +
               'font-weight: 500; white-space: nowrap;',
      },
      attrs.formattedText,
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: citationClickKey,
        props: {
          handleClick(_view, pos, event) {
            const target = event.target as HTMLElement;
            const citationEl = target.closest('[data-citation]');
            if (!citationEl) return false;

            const doi = citationEl.getAttribute('data-doi');
            const title = citationEl.getAttribute('data-title');

            // Dispatch custom event for the CitationManager to handle
            const detail = {
              doi, title,
              authors: citationEl.getAttribute('data-authors'),
              year: citationEl.getAttribute('data-year'),
              pos,
            };
            window.dispatchEvent(new CustomEvent('citation-click', { detail }));

            // If DOI exists, optionally open in new tab on double-click
            if (doi && event.detail === 2) {
              window.open(`https://doi.org/${doi}`, '_blank', 'noopener,noreferrer');
            }

            return true;
          },
        },
      }),
    ];
  },
});

// ── Helper: Create citation node attributes ──────────────────

export function createCitationAttrs(data: {
  doi?: string;
  title?: string;
  authors?: string;
  year?: string;
  journal?: string;
  url?: string;
}): CitationAttrs {
  const citationKey = data.doi
    ? `doi:${data.doi.split('/').pop()?.slice(0, 20) ?? Date.now()}`
    : `ref:${Date.now()}`;

  const authorShort = data.authors
    ? data.authors.split(',')[0].trim().split(' ').pop() ?? data.authors.split(',')[0].trim()
    : 'Unknown';

  const year = data.year ?? 'n.d.';
  const formattedText = `(${authorShort} et al., ${year})`;

  return {
    doi: data.doi ?? undefined,
    title: data.title ?? undefined,
    authors: data.authors ?? undefined,
    year: data.year ?? undefined,
    journal: data.journal ?? undefined,
    url: data.url ?? undefined,
    citationKey,
    formattedText,
  };
}
