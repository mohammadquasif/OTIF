import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import type { Editor } from '@tiptap/react';
import axios from 'axios';
import { Search, ExternalLink, Plus, X, Loader2, BookOpen } from 'lucide-react';
import { createCitationAttrs } from '../../editor/extensions/CitationInline';
import { Button } from '../shared/Button';
import { API_BASE } from '../../api';

interface CitationResult {
  doi: string;
  title: string;
  authors: string;
  year: string;
  journal: string;
  url: string;
  source: 'crossref' | 'openalex' | 'semantic_scholar';
}

interface CitationManagerProps {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

export function CitationManager({ editor, isOpen, onClose, className = '', style }: CitationManagerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CitationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery(''); setResults([]); setError(null); setSelectedIndex(0);
    }
  }, [isOpen]);

  // ── Search CrossRef + OpenAlex ──────────────────────────
  const searchCitations = useCallback(async (searchTerm: string) => {
    if (!searchTerm.trim() || searchTerm.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ q: searchTerm.trim(), limit: '15' });
      const res = await axios.get<{ results: CitationResult[] }>(
        `${API_BASE}/writing-assistant/search-citations?${params}`,
      );
      setResults(res.data.results ?? []);
      setSelectedIndex(0);
    } catch (err) {
      // Fallback: search CrossRef directly from client
      try {
        const crossRefRes = await axios.get(
          `https://api.crossref.org/works?query=${encodeURIComponent(searchTerm.trim())}&rows=10`,
        );
        const items = crossRefRes.data?.message?.items ?? [];
        const mapped: CitationResult[] = items.map((item: Record<string, unknown>) => {
          const author = item.author as Array<{ given?: string; family?: string }> | undefined;
          const authorStr = author?.map((a) => `${a.family ?? ''}, ${a.given ?? ''}`.trim()).join('; ') ?? 'Unknown';
          const published = item['published-print'] as { 'date-parts'?: number[][] } | undefined;
          const year = published?.['date-parts']?.[0]?.[0]?.toString() ?? 'n.d.';
          return {
            doi: (item.DOI as string) ?? '',
            title: ((item.title as string[]) ?? ['Untitled'])[0] ?? 'Untitled',
            authors: authorStr,
            year,
            journal: ((item['container-title'] as string[]) ?? [''])[0] ?? '',
            url: (item.URL as string) ?? `https://doi.org/${item.DOI as string}`,
            source: 'crossref' as const,
          };
        });
        setResults(mapped);
      } catch {
        setError('Could not search citations. Check your internet connection.');
      }
    } finally { setLoading(false); }
  }, []);

  // Debounced search
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCitations(value), 350);
  }, [searchCitations]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      insertCitation(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [results, selectedIndex, onClose]);

  // ── Insert citation into editor ─────────────────────────
  const insertCitation = useCallback((result: CitationResult) => {
    if (!editor) return;
    const attrs = createCitationAttrs({
      doi: result.doi,
      title: result.title,
      authors: result.authors,
      year: result.year,
      journal: result.journal,
      url: result.url,
    });

    editor.chain().focus().insertContent({
      type: 'citationInline',
      attrs: attrs as unknown as Record<string, unknown>,
    }).run();

    onClose();
  }, [editor, onClose]);

  // ── Insert manual citation ──────────────────────────────
  const insertManualCitation = useCallback(() => {
    if (!editor) return;
    const attrs = createCitationAttrs({
      title: query.trim() || 'Manual citation',
      authors: '',
      year: new Date().getFullYear().toString(),
    });
    editor.chain().focus().insertContent({
      type: 'citationInline',
      attrs: attrs as unknown as Record<string, unknown>,
    }).run();
    onClose();
  }, [editor, query, onClose]);

  if (!isOpen) return null;

  return (
    <div className={className} style={{
      position: 'fixed', inset: 0, zIndex: 10001,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '12vh',
      background: 'hsla(225, 25%, 5%, 0.6)', backdropFilter: 'blur(2px)',
      ...style,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-raised)', borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border-default)',
        width: '560px', maxWidth: '95vw', maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <BookOpen size={16} color="var(--brand-400)" />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
            Insert Citation
          </span>
          <button onClick={onClose} style={closeBtn}><X size={16} /></button>
        </div>

        {/* Search input */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by title, author, DOI, or keyword..."
              style={{
                width: '100%', padding: '10px 12px 10px 34px',
                fontSize: '13px', borderRadius: 'var(--r-md)',
                background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Searches CrossRef, OpenAlex, and Semantic Scholar
          </div>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
              <Loader2 size={16} className="spin" /> Searching...
            </div>
          )}

          {error && (
            <div style={{ padding: '16px', color: 'var(--score-critical)', fontSize: '12px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {!loading && !error && results.length === 0 && query.length >= 2 && (
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                No results found for "{query}"
              </p>
              <Button size="sm" variant="ghost" onClick={insertManualCitation}>
                <Plus size={12} /> Insert as manual citation
              </Button>
            </div>
          )}

          {!loading && results.length === 0 && query.length < 2 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              <BookOpen size={32} style={{ opacity: 0.2, marginBottom: '12px' }} />
              <p>Type at least 2 characters to search academic databases.</p>
              <p style={{ marginTop: '8px', fontSize: '10px' }}>
                Or <button onClick={insertManualCitation} style={{
                  background: 'none', border: 'none', color: 'var(--brand-400)',
                  cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: '10px',
                }}>insert a manual citation</button> directly.
              </p>
            </div>
          )}

          {results.map((result, idx) => (
            <div
              key={result.doi || idx}
              onClick={() => insertCitation(result)}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '10px 12px', borderRadius: 'var(--r-md)',
                cursor: 'pointer',
                background: idx === selectedIndex ? 'var(--bg-overlay)' : 'transparent',
                border: idx === selectedIndex ? '1px solid var(--border-brand)' : '1px solid transparent',
                transition: 'all var(--t-fast)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {result.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {result.authors} ({result.year})
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px',
                }}>
                  <span style={{
                    fontSize: '9px', padding: '1px 5px', borderRadius: 'var(--r-sm)',
                    background: 'hsla(258, 75%, 55%, 0.1)', color: 'var(--brand-400)',
                  }}>
                    {result.source}
                  </span>
                  {result.journal && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.journal}
                    </span>
                  )}
                </div>
              </div>
              {result.doi && (
                <a href={`https://doi.org/${result.doi}`} target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Open DOI in browser"
                  style={{ color: 'var(--text-muted)', padding: '4px' }}>
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid var(--border-subtle)',
          fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '16px',
        }}>
          <span>↑↓ Navigate</span>
          <span>↵ Insert</span>
          <span>Esc Close</span>
          <span style={{ flex: 1 }} />
          <span>Double-click citation to open DOI</span>
        </div>
      </div>
    </div>
  );
}

const closeBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '28px', height: '28px', padding: 0,
  background: 'transparent', border: 'none', borderRadius: 'var(--r-sm)',
  color: 'var(--text-muted)', cursor: 'pointer',
};
