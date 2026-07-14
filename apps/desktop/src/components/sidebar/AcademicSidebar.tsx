import { useState, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import axios from 'axios';
import {
  BookOpen, Sparkles, Star, Search, ChevronDown, ChevronRight,
  Copy, FolderOpen, FileText, ShieldCheck, AlertCircle,
  MessageSquare, Upload, ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { API_BASE } from '../../api';
import { Button } from '../shared/Button';
import type { ImprovementItem, PreflightScores } from '../../types';

// ── Types ──────────────────────────────────────────────────────

type SidebarTabId = 'phrases' | 'ai-tools' | 'references' | 'analysis' | 'comments';

interface SidebarTab {
  id: SidebarTabId;
  label: string;
  icon: LucideIcon;
}

interface PhraseCategory {
  id: string;
  title: string;
  description: string;
  phrases: Array<{ text: string; favorited: boolean }>; match_count?: number;
}

interface PhraseSection {
  id: string;
  title: string;
  description: string;
  category_ids: string[];
}

interface PhraseData {
  categories: PhraseCategory[];
  sections: PhraseSection[];
  total_phrases: number;
}

interface ReferenceDoc {
  id: string;
  filename: string;
  size_bytes: number;
  uploaded_at: string;
  doc_type: string;
}

interface AcademicSidebarProps {
  onInsertPhrase: (phrase: string) => void;
  onParaphrase?: () => void;
  isParaphrasing?: boolean;
  onGrammarCheck?: () => void;
  onToneCheck?: () => void;
  isAiBusy?: boolean;
  onRunAnalysis?: () => void;
  isAnalyzing?: boolean;
  // Analysis data
  scores?: PreflightScores | null;
  improvementPlan?: ImprovementItem[];
  approvedImprovementIds?: string[];
  onToggleApproval?: (itemId: string) => void;
  onApproveAll?: () => void;
  // Reference docs
  className?: string;
  style?: CSSProperties;
}

const TABS: SidebarTab[] = [
  { id: 'phrases', label: 'Phrases', icon: BookOpen },
  { id: 'ai-tools', label: 'AI Tools', icon: Sparkles },
  { id: 'references', label: 'References', icon: FolderOpen },
  { id: 'analysis', label: 'Analysis', icon: ShieldCheck },
  { id: 'comments', label: 'Comments', icon: MessageSquare },
];

// ── Component ──────────────────────────────────────────────────

export function AcademicSidebar({
  onInsertPhrase, onParaphrase, isParaphrasing, onGrammarCheck, onToneCheck, isAiBusy,
  onRunAnalysis, isAnalyzing,
  scores, improvementPlan, approvedImprovementIds,
  onToggleApproval, onApproveAll,
  className = '', style,
}: AcademicSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTabId>('phrases');

  // Phrasebank state
  const [phraseData, setPhraseData] = useState<PhraseData | null>(null);
  const [search, setSearch] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['introduction', 'methodology']));
  const [loadingPhrases, setLoadingPhrases] = useState(false);

  // Reference state
  const [references, setReferences] = useState<ReferenceDoc[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);

  useEffect(() => { loadPhraseBank(); loadReferences(); }, []);

  // ── Phrasebank ────────────────────────────────────────────

  const loadPhraseBank = useCallback(async (searchTerm?: string, section?: string) => {
    setLoadingPhrases(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (section) params.set('section', section);
      const qs = params.toString();
      const res = await axios.get<PhraseData>(`${API_BASE}/writing-assistant/phrasebank${qs ? `?${qs}` : ''}`);
      setPhraseData(res.data);
    } catch { /* silent */ }
    finally { setLoadingPhrases(false); }
  }, []);

  const loadReferences = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const res = await axios.get<{ references: ReferenceDoc[] }>(`${API_BASE}/documents/references`);
      setReferences(res.data.references ?? []);
    } catch { /* silent */ }
    finally { setLoadingRefs(false); }
  }, []);

  const toggleFavorite = useCallback(async (categoryId: string, phraseText: string, currentlyFavorited: boolean) => {
    try {
      if (currentlyFavorited) {
        await axios.delete(`${API_BASE}/writing-assistant/favorites`, {
          data: { category_id: categoryId, phrase_text: phraseText },
        });
      } else {
        await axios.post(`${API_BASE}/writing-assistant/favorites`, {
          category_id: categoryId, phrase_text: phraseText,
        });
      }
      if (phraseData) {
        setPhraseData({
          ...phraseData,
          categories: phraseData.categories.map((cat) => ({
            ...cat,
            phrases: cat.phrases.map((p) =>
              p.text === phraseText ? { ...p, favorited: !currentlyFavorited } : p,
            ),
          })),
        });
      }
    } catch { /* silent */ }
  }, [phraseData]);

  const handleInsert = useCallback((phraseText: string) => {
    onInsertPhrase(phraseText);
    axios.post(`${API_BASE}/writing-assistant/log-usage`, {
      phrase_category: 'academic', phrase_text: phraseText,
    }).catch(() => {});
  }, [onInsertPhrase]);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    loadPhraseBank(value || undefined, selectedSection || undefined);
  }, [loadPhraseBank, selectedSection]);

  const handleSectionSelect = useCallback((sectionId: string | null) => {
    setSelectedSection(sectionId);
    loadPhraseBank(search || undefined, sectionId || undefined);
  }, [loadPhraseBank, search]);

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  // ── Analysis metrics ───────────────────────────────────────

  const approvalCount = useMemo(() =>
    improvementPlan?.filter((item) => approvedImprovementIds?.includes(item.id)).length ?? 0,
  [improvementPlan, approvedImprovementIds]);

  const approvalPercent = useMemo(() =>
    improvementPlan?.length ? Math.round((approvalCount / improvementPlan.length) * 100) : 0,
  [improvementPlan, approvalCount]);

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className={className} style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-raised)', borderLeft: '1px solid var(--border-subtle)',
      ...style,
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-overlay)', overflowX: 'auto',
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            style={{
              flex: '1 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '4px', padding: '8px 6px', fontSize: '10px', fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--brand-500)' : '2px solid transparent',
              background: activeTab === tab.id ? 'var(--bg-raised)' : 'transparent',
              color: activeTab === tab.id ? 'var(--brand-300)' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all var(--t-fast)',
              whiteSpace: 'nowrap',
            }}
          >
            <tab.icon size={13} />
            <span style={{ display: 'none' }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab label */}
      <div style={{
        padding: '6px 10px', fontSize: '11px', fontWeight: 600,
        color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-overlay)',
      }}>
        {TABS.find((t) => t.id === activeTab)?.label}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* ── PHRASES TAB ──────────────────────────────────── */}
        {activeTab === 'phrases' && (
          <div style={{ padding: '8px' }}>
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text" value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search phrases..."
                autoFocus
                style={{
                  width: '100%', padding: '7px 8px 7px 28px',
                  fontSize: '11px', borderRadius: 'var(--r-md)',
                  background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)', outline: 'none',
                }}
              />
            </div>

            {/* Section filter pills */}
            {phraseData?.sections && phraseData.sections.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '8px' }}>
                <button onClick={() => handleSectionSelect(null)} style={sectionPill(!selectedSection)}>All</button>
                {phraseData.sections.map((s) => (
                  <button key={s.id} onClick={() => handleSectionSelect(s.id)}
                    style={sectionPill(selectedSection === s.id)} title={s.description}>
                    {s.title}
                  </button>
                ))}
              </div>
            )}

            {/* Loading */}
            {loadingPhrases && (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '11px' }}>
                Loading...
              </div>
            )}

            {/* Categories */}
            {phraseData?.categories.map((category) => (
              <div key={category.id} style={{ marginBottom: '2px' }}>
                <button onClick={() => toggleCategory(category.id)} style={catHeader}>
                  {expandedCategories.has(category.id)
                    ? <ChevronDown size={11} />
                    : <ChevronRight size={11} />}
                  <span style={{ flex: 1, textAlign: 'left' }}>{category.title}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    ({category.match_count ?? category.phrases.length})
                  </span>
                </button>
                {expandedCategories.has(category.id) && category.phrases.map((phrase, idx) => (
                  <div key={`${category.id}-${idx}`} style={phraseRow}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <button onClick={() => handleInsert(phrase.text)} title="Insert at cursor" style={iconBtn}>
                      <Copy size={10} />
                    </button>
                    <span style={{ fontSize: '11px', lineHeight: 1.5, color: 'var(--text-primary)', flex: 1 }}>
                      {phrase.text}
                    </span>
                    <button onClick={() => toggleFavorite(category.id, phrase.text, phrase.favorited)}
                      title={phrase.favorited ? 'Remove favorite' : 'Add favorite'} style={iconBtn}>
                      <Star size={10} fill={phrase.favorited ? '#f59e0b' : 'none'}
                        color={phrase.favorited ? '#f59e0b' : 'var(--text-muted)'} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {!loadingPhrases && phraseData?.categories.length === 0 && (
              <div style={emptyState}>No phrases found for "{search}"</div>
            )}
          </div>
        )}

        {/* ── AI TOOLS TAB ─────────────────────────────────── */}
        {activeTab === 'ai-tools' && (
          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              AI Writing Tools
            </div>

            {onParaphrase && (
              <Button size="sm" variant="primary" onClick={onParaphrase} loading={isParaphrasing} style={{ width: '100%' }}>
                <Sparkles size={13} /> Paraphrase Selection
              </Button>
            )}

            {onGrammarCheck && (
              <Button size="sm" variant="secondary" onClick={onGrammarCheck}
                loading={isAiBusy && !isParaphrasing} style={{ width: '100%' }}>
                <AlertCircle size={13} /> Grammar &amp; Style Check
              </Button>
            )}

            {onToneCheck && (
              <Button size="sm" variant="secondary" onClick={onToneCheck}
                loading={isAiBusy && !isParaphrasing} style={{ width: '100%' }}>
                <Star size={13} /> Improve Academic Tone
              </Button>
            )}

            <p style={helpText}>
              Select text in document, then click any tool. Citations are automatically locked.
              AI behavior (discipline, style, intensity) is set in <strong>Settings → AI Behavior</strong>.
            </p>

            <div style={toolCard}>
              <div style={toolCardTitle}>AI Rewrite Chapter</div>
              <p style={helpText}>
                Rewrites entire chapter applying approved improvements while preserving citations byte-identically.
              </p>
            </div>

            <div style={toolCard}>
              <div style={toolCardTitle}>Expand / Condense</div>
              <p style={helpText}>
                <strong>Expand:</strong> Add depth and elaboration to selected passage.<br />
                <strong>Condense:</strong> Tighten prose, remove redundancy.
              </p>
            </div>

            <div style={toolCard}>
              <div style={toolCardTitle}>Humanize</div>
              <p style={helpText}>
                Reduce AI writing signatures — vary sentence rhythm, add researcher voice markers, reduce formulaic transitions.
              </p>
            </div>

            <div style={{ marginTop: '8px', padding: '8px', ...toolCard }}>
              <div style={toolCardTitle}>💡 Pro Tip</div>
              <p style={helpText}>
                <strong>Ctrl+Shift+P</strong> — Paraphrase selection<br />
                <strong>Ctrl+Shift+R</strong> — AI Rewrite selection<br />
                <strong>Ctrl+K</strong> — Search phrasebank
              </p>
            </div>
          </div>
        )}

        {/* ── REFERENCES TAB ────────────────────────────────── */}
        {activeTab === 'references' && (
          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Reference Library
            </div>
            <p style={helpText}>
              Import PDFs, DOCXs, or research papers as reference documents.
              Search across all references while writing.
            </p>

            <Button size="sm" variant="primary" style={{ width: '100%' }}>
              <Upload size={13} /> Import Reference
            </Button>

            {loadingRefs && (
              <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>
                Loading...
              </div>
            )}

            {!loadingRefs && references.length === 0 && (
              <div style={emptyState}>
                <FolderOpen size={24} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p>No reference documents yet. Import your first reference to cross-reference while writing.</p>
              </div>
            )}

            {references.map((ref) => (
              <div key={ref.id} style={refCard}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <FileText size={14} color="var(--brand-400)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ref.filename}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {(ref.size_bytes / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button style={iconBtn} title="Open reference">
                  <ExternalLink size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── ANALYSIS TAB ──────────────────────────────────── */}
        {activeTab === 'analysis' && (
          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Document Analysis
            </div>

            {onRunAnalysis && (
              <Button size="sm" variant="primary" onClick={onRunAnalysis} loading={isAnalyzing} style={{ width: '100%' }}>
                <ShieldCheck size={13} /> {scores ? 'Re-run Analysis' : 'Run Analysis'}
              </Button>
            )}

            {/* Scores */}
            {scores && (
              <div style={toolCard}>
                <div style={toolCardTitle}>Preflight Scores</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {Object.entries(scores).slice(0, 8).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                      <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span style={{
                        fontWeight: 600,
                        color: typeof val === 'number'
                          ? val >= 75 ? 'var(--score-excellent)'
                          : val >= 50 ? 'var(--score-good)'
                          : val >= 35 ? 'var(--score-fair)'
                          : 'var(--score-critical)'
                          : 'var(--text-secondary)',
                      }}>
                        {typeof val === 'number' ? val.toFixed(1) : String(val ?? '—')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Improvement plan summary */}
            {improvementPlan && improvementPlan.length > 0 && (
              <div style={toolCard}>
                <div style={toolCardTitle}>
                  Improvement Plan ({approvalCount}/{improvementPlan.length} approved)
                </div>
                {/* Progress bar */}
                <div style={{
                  height: '4px', background: 'var(--bg-muted)',
                  borderRadius: 'var(--r-full)', margin: '6px 0', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${approvalPercent}%`,
                    background: 'var(--brand-500)',
                    borderRadius: 'var(--r-full)',
                    transition: 'width var(--t-normal)',
                  }} />
                </div>
                {onApproveAll && approvalPercent < 100 && (
                  <Button size="sm" variant="ghost" onClick={onApproveAll} style={{ width: '100%', fontSize: '10px', marginTop: '4px' }}>
                    Approve All Remaining
                  </Button>
                )}
                {/* Top 5 items */}
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflow: 'auto' }}>
                  {improvementPlan.slice(0, 10).map((item) => {
                    const isApproved = approvedImprovementIds?.includes(item.id);
                    return (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '6px',
                        padding: '4px', borderRadius: 'var(--r-sm)',
                        opacity: isApproved ? 0.5 : 1,
                        cursor: onToggleApproval ? 'pointer' : 'default',
                      }} onClick={() => onToggleApproval?.(item.id)}>
                        <input type="checkbox" checked={isApproved} readOnly
                          style={{ marginTop: '2px', accentColor: 'var(--brand-500)' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: '10px', fontWeight: 600, color: 'var(--text-primary)',
                            textDecoration: isApproved ? 'line-through' : 'none',
                          }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                            {item.evidence?.slice(0, 120)}{(item.evidence?.length ?? 0) > 120 ? '...' : ''}
                          </div>
                        </div>
                        <span style={{
                          fontSize: '9px', fontWeight: 600, padding: '1px 4px', borderRadius: 'var(--r-sm)',
                          background: item.priority === 'high' ? 'hsla(352, 85%, 62%, 0.15)'
                            : item.priority === 'medium' ? 'hsla(38, 95%, 58%, 0.15)'
                            : 'hsla(191, 90%, 55%, 0.15)',
                          color: item.priority === 'high' ? 'var(--score-critical)'
                            : item.priority === 'medium' ? 'var(--score-fair)'
                            : 'var(--score-good)',
                        }}>
                          {item.priority}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!scores && !isAnalyzing && (
              <div style={emptyState}>
                <ShieldCheck size={24} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p>Run document analysis to see preflight scores and improvement recommendations.</p>
              </div>
            )}
          </div>
        )}

        {/* ── COMMENTS TAB ──────────────────────────────────── */}
        {activeTab === 'comments' && (
          <div style={{ padding: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Comments & Notes
            </div>
            <div style={emptyState}>
              <MessageSquare size={24} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p>Academic comments and peer review notes will appear here.</p>
              <p style={{ marginTop: '8px', fontSize: '10px' }}>
                Select text in the document and click "Add Comment" to annotate.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline styles ────────────────────────────────────────────

const catHeader: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '4px',
  width: '100%', padding: '5px 6px',
  background: 'transparent', border: 'none',
  color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600,
  cursor: 'pointer', borderRadius: 'var(--r-sm)',
  transition: 'background var(--t-fast)',
};

const phraseRow: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: '4px',
  padding: '3px 6px 3px 20px', borderRadius: 'var(--r-sm)',
  cursor: 'pointer', transition: 'all var(--t-fast)',
};

const iconBtn: CSSProperties = {
  padding: '1px 3px', marginTop: '2px',
  background: 'transparent', border: 'none',
  color: 'var(--brand-400)', cursor: 'pointer',
  flexShrink: 0,
};

const emptyState: CSSProperties = {
  textAlign: 'center', padding: '24px 12px',
  color: 'var(--text-muted)', fontSize: '11px',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
};

const helpText: CSSProperties = {
  fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0,
};

const toolCard: CSSProperties = {
  padding: '8px', background: 'var(--bg-overlay)', borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-subtle)',
};

const toolCardTitle: CSSProperties = {
  fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px',
};

const refCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
  padding: '6px 8px', borderRadius: 'var(--r-sm)',
  cursor: 'pointer', transition: 'all var(--t-fast)',
};

function sectionPill(active: boolean): CSSProperties {
  return {
    padding: '2px 7px', fontSize: '9px', fontWeight: 600,
    borderRadius: 'var(--r-full)',
    border: `1px solid ${active ? 'var(--brand-500)' : 'var(--border-default)'}`,
    background: active ? 'var(--brand-500)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    cursor: 'pointer', transition: 'all var(--t-fast)',
  };
}
