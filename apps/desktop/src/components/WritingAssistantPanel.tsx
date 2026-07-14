import { useState, useCallback, useEffect } from 'react';
import type { CSSProperties } from 'react';
import axios from 'axios';
import { Search, Star, Clock, BookOpen, Sparkles, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { API_BASE } from '../api';
import { Button } from './shared/Button';

interface Category {
  id: string;
  title: string;
  description: string;
  phrases: Array<{ text: string; favorited: boolean }>;
}

interface Section {
  id: string;
  title: string;
  description: string;
  category_ids: string[];
}

interface PhraseData {
  categories: Category[];
  sections: Section[];
  total_phrases: number;
}

type AssistantTab = 'phrases' | 'favorites' | 'ai-tools' | 'recent';

interface WritingAssistantPanelProps {
  onInsertPhrase: (phrase: string) => void;
  onParaphrase?: () => void;
  isParaphrasing?: boolean;
  onGrammarCheck?: () => void;
  onToneCheck?: () => void;
  isAiBusy?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function WritingAssistantPanel({
  onInsertPhrase, onParaphrase, isParaphrasing, onGrammarCheck, onToneCheck, isAiBusy,
  className = '', style,
}: WritingAssistantPanelProps) {
  const [activeTab, setActiveTab] = useState<AssistantTab>('phrases');
  const [data, setData] = useState<PhraseData | null>(null);
  const [search, setSearch] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['introduction', 'methodology']));
  const [favorites, setFavorites] = useState<Array<{ id: string; category_id: string; phrase_text: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPhraseBank();
    loadFavorites();
  }, []);

  const loadPhraseBank = useCallback(async (searchTerm?: string, section?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (section) params.set('section', section);
      const qs = params.toString();
      const res = await axios.get(`${API_BASE}/writing-assistant/phrasebank${qs ? `?${qs}` : ''}`);
      setData(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const res = await axios.get<{ favorites: Array<{ id: string; category_id: string; phrase_text: string }> }>(
        `${API_BASE}/writing-assistant/favorites`,
      );
      setFavorites(res.data.favorites);
    } catch { /* silent */ }
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
      await loadFavorites();
      // Refresh phrasebank to update star status
      if (data) {
        const updated = {
          ...data,
          categories: data.categories.map((cat) => ({
            ...cat,
            phrases: cat.phrases.map((p) =>
              p.text === phraseText ? { ...p, favorited: !currentlyFavorited } : p,
            ),
          })),
        };
        setData(updated);
      }
    } catch { /* silent */ }
  }, [data, loadFavorites]);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    loadPhraseBank(value || undefined, selectedSection || undefined);
  }, [loadPhraseBank, selectedSection]);

  const handleSectionSelect = useCallback((sectionId: string | null) => {
    setSelectedSection(sectionId);
    loadPhraseBank(search || undefined, sectionId || undefined);
  }, [loadPhraseBank, search]);

  const handleInsert = useCallback((phraseText: string) => {
    onInsertPhrase(phraseText);
    // Log usage
    axios.post(`${API_BASE}/writing-assistant/log-usage`, {
      phrase_category: 'academic',
      phrase_text: phraseText,
    }).catch(() => {});
  }, [onInsertPhrase]);

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const tabs: Array<{ id: AssistantTab; label: string; icon: React.ReactNode }> = [
    { id: 'phrases', label: 'Phrases', icon: <BookOpen size={13} /> },
    { id: 'favorites', label: 'Favorites', icon: <Star size={13} /> },
    { id: 'ai-tools', label: 'AI Tools', icon: <Sparkles size={13} /> },
    { id: 'recent', label: 'Recent', icon: <Clock size={13} /> },
  ];

  return (
    <div className={className} style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      ...style,
    }}>
      {/* Tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-overlay)',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '4px', padding: '8px 6px', fontSize: '11px', fontWeight: 600,
              border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--brand-500)' : '2px solid transparent',
              background: activeTab === tab.id ? 'var(--bg-raised)' : 'transparent',
              color: activeTab === tab.id ? 'var(--brand-300)' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all var(--t-fast)',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        {/* ── PHRASES TAB ────────────────────────────────── */}
        {activeTab === 'phrases' && (
          <>
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search phrases..."
                style={{
                  width: '100%', padding: '8px 10px 8px 32px',
                  fontSize: '12px', borderRadius: 'var(--r-md)',
                  background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)', outline: 'none',
                }}
              />
            </div>

            {/* Section filter pills (Ref-N-Write style) */}
            {data?.sections && data.sections.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                <button
                  onClick={() => handleSectionSelect(null)}
                  style={{
                    padding: '3px 8px', fontSize: '10px', fontWeight: 600,
                    borderRadius: 'var(--r-full)', border: '1px solid var(--border-default)',
                    background: !selectedSection ? 'var(--brand-500)' : 'transparent',
                    color: !selectedSection ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer', transition: 'all var(--t-fast)',
                  }}
                >
                  All
                </button>
                {data.sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => handleSectionSelect(section.id)}
                    title={section.description}
                    style={{
                      padding: '3px 8px', fontSize: '10px', fontWeight: 600,
                      borderRadius: 'var(--r-full)', border: '1px solid var(--border-default)',
                      background: selectedSection === section.id ? 'var(--brand-500)' : 'transparent',
                      color: selectedSection === section.id ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all var(--t-fast)',
                    }}
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            )}

            {/* Categories */}
            {loading && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px' }}>Loading...</div>}
            {data?.categories.map((category) => (
              <div key={category.id} style={{ marginBottom: '4px' }}>
                <button
                  onClick={() => toggleCategory(category.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    width: '100%', padding: '6px 8px',
                    background: 'transparent', border: 'none',
                    color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600,
                    cursor: 'pointer', borderRadius: 'var(--r-sm)',
                  }}
                >
                  {expandedCategories.has(category.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {category.title}
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    ({category.phrases.length})
                  </span>
                </button>

                {expandedCategories.has(category.id) && (
                  <div style={{ paddingLeft: '20px' }}>
                    {category.phrases.map((phrase, idx) => (
                      <div
                        key={`${category.id}-${idx}`}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: '4px',
                          padding: '4px 6px', borderRadius: 'var(--r-sm)',
                          cursor: 'pointer', transition: 'all var(--t-fast)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg-overlay)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <button
                          onClick={() => handleInsert(phrase.text)}
                          title="Insert at cursor"
                          style={{
                            padding: '1px 4px', marginTop: '2px',
                            background: 'transparent', border: 'none',
                            color: 'var(--brand-400)', cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <Copy size={11} />
                        </button>
                        <span style={{
                          fontSize: '11px', lineHeight: 1.5, color: 'var(--text-primary)',
                          flex: 1,
                        }}>
                          {phrase.text}
                        </span>
                        <button
                          onClick={() => toggleFavorite(category.id, phrase.text, phrase.favorited)}
                          title={phrase.favorited ? 'Remove from favorites' : 'Add to favorites'}
                          style={{
                            padding: '1px', marginTop: '2px',
                            background: 'transparent', border: 'none',
                            color: phrase.favorited ? '#f59e0b' : 'var(--text-muted)',
                            cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          <Star size={11} fill={phrase.favorited ? '#f59e0b' : 'none'} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!loading && data?.categories.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px' }}>
                No phrases found for "{search}"
              </div>
            )}
          </>
        )}

        {/* ── FAVORITES TAB ──────────────────────────────── */}
        {activeTab === 'favorites' && (
          <>
            {favorites.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)', fontSize: '12px' }}>
                <Star size={24} style={{ marginBottom: '8px', opacity: 0.3 }} />
                <p>No favorites yet. Star phrases from the Phrases tab to save them here.</p>
              </div>
            ) : (
              favorites.map((fav) => (
                <div
                  key={fav.id}
                  onClick={() => handleInsert(fav.phrase_text)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 8px', borderRadius: 'var(--r-sm)',
                    cursor: 'pointer', fontSize: '11px', color: 'var(--text-primary)',
                    transition: 'all var(--t-fast)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Star size={10} fill="#f59e0b" color="#f59e0b" />
                  {fav.phrase_text}
                </div>
              ))
            )}
          </>
        )}

        {/* ── AI TOOLS TAB ────────────────────────────────── */}
        {activeTab === 'ai-tools' && (
          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
              AI Writing Tools
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 4px' }}>
              Select text in the editor, then run any tool below. Citations are automatically locked.
            </p>

            {/* Paraphrase */}
            {onParaphrase && (
              <Button size="sm" variant="primary" onClick={onParaphrase}
                loading={isParaphrasing} style={{ width: '100%' }}>
                <Sparkles size={13} />
                Paraphrase Selection
              </Button>
            )}

            {/* Grammar Check */}
            {onGrammarCheck && (
              <Button size="sm" variant="secondary" onClick={onGrammarCheck}
                loading={isAiBusy && !isParaphrasing} style={{ width: '100%' }}>
                <BookOpen size={13} />
                Grammar &amp; Style Check
              </Button>
            )}

            {/* Tone Improvement */}
            {onToneCheck && (
              <Button size="sm" variant="secondary" onClick={onToneCheck}
                loading={isAiBusy && !isParaphrasing} style={{ width: '100%' }}>
                <Star size={13} />
                Improve Academic Tone
              </Button>
            )}

            <div style={{ marginTop: '8px', padding: '10px', background: 'var(--bg-overlay)', borderRadius: 'var(--r-md)' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Pro Tip
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                AI behavior (discipline, writing style, rewrite intensity) is configured in{' '}
                <strong>Settings → AI Behavior</strong>. These settings apply to all tools above.
              </p>
            </div>
          </div>
        )}

        {/* ── RECENT TAB ──────────────────────────────────── */}
        {activeTab === 'recent' && (
          <div style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            <Clock size={24} style={{ marginBottom: '8px', opacity: 0.3 }} />
            <p>Recently used phrases will appear here as you write.</p>
          </div>
        )}
      </div>
    </div>
  );
}
