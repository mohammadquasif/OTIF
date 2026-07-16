import { useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import {
  AudioLines,
  Bot,
  BookMarked,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileSearch,
  FileWarning,
  FileCheck2,
  Image,
  LayoutDashboard,
  LibraryBig,
  Lightbulb,
  Loader2,
  ListTree,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  SpellCheck2,
  Sparkles,
  Table2,
  TextQuote,
  Wand2,
  X,
} from 'lucide-react';
import { buildDiff } from '../utils/diff';
import type {
  AIDetectionResult,
  FrontMatterPreview,
  ImprovementItem,
  PreflightScores,
  TrackChangesChapter,
  TurnitinSimilarity,
} from '../types';
import type { DiffSegment } from '../utils/diff';
import { Badge } from './shared/Badge';
import { RichTextEditor } from './RichTextEditor';

interface TrackChangesDocumentProps {
  chapters: TrackChangesChapter[];
  approvedChapterIds: Set<string>;
  onRewriteChapter: (chapterId: string, instruction?: string) => Promise<void>;
  onApproveChapter: (chapterId: string) => void;
  onRejectChapter: (chapterId: string) => void;
  onRewriteAll: (instruction?: string) => Promise<void>;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onUpdateChapter: (chapterId: string, text: string) => void;
  isBusy: boolean;
  rewritingChapterId: string | null;
  rewriteAuthorized: boolean;
  targetFormat: string;
  onRecheckFrontMatter: () => Promise<FrontMatterPreview>;
  scores?: PreflightScores | null;
  improvementPlan?: ImprovementItem[];
  aiPatternCheck?: AIDetectionResult | null;
  openSourceSimilarity?: TurnitinSimilarity | null;
  onOpenSettings?: () => void;
  docTitle?: string;
  filename?: string;
  onExport: (format: 'docx' | 'pdf') => void;
  className?: string;
  style?: CSSProperties;
}

function renderDiffText(segments: DiffSegment[]): ReactElement {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === 'same') {
          return <span key={index} className="tc-diff-same">{segment.text}</span>;
        }
        if (segment.type === 'added') {
          return <span key={index} className="tc-diff-add">{segment.text}</span>;
        }
        return <span key={index} className="tc-diff-remove">{segment.text}</span>;
      })}
    </>
  );
}

function renderPlainText(text: string): ReactElement {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        const h2Match = trimmed.match(/^##\s+(.+)/);
        if (h2Match) return <h2 key={index} className="tc-subheading-2">{h2Match[1]}</h2>;
        const h3Match = trimmed.match(/^###\s+(.+)/);
        if (h3Match) return <h3 key={index} className="tc-subheading-3">{h3Match[1]}</h3>;
        return <p key={index} className="tc-paragraph">{trimmed}</p>;
      })}
    </>
  );
}

function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');
}

function htmlToPlainText(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  return Array.from(container.querySelectorAll('h1,h2,h3,h4,p,li,blockquote'))
    .map((node) => node.textContent?.trim() || '')
    .filter(Boolean)
    .join('\n\n');
}

function chapterContent(chapter: TrackChangesChapter): ReactElement {
  if (!chapter.rewritten_text) return renderPlainText(chapter.original_text);
  return (
    <div className="tc-chapter-content has-changes">
      {renderDiffText(buildDiff(chapter.original_text, chapter.rewritten_text))}
    </div>
  );
}

export function TrackChangesDocument({
  chapters,
  approvedChapterIds,
  onRewriteChapter,
  onApproveChapter,
  onRejectChapter,
  onRewriteAll,
  onApproveAll,
  onRejectAll,
  onUpdateChapter,
  isBusy,
  rewritingChapterId,
  rewriteAuthorized,
  targetFormat,
  onRecheckFrontMatter,
  scores,
  improvementPlan = [],
  aiPatternCheck,
  openSourceSimilarity,
  onOpenSettings,
  docTitle,
  filename,
  onExport,
  className = '',
  style,
}: TrackChangesDocumentProps) {
  type ToolId =
    | 'search'
    | 'similarity'
    | 'dashboard'
    | 'phrasebank'
    | 'ideas'
    | 'word_ideas'
    | 'proofread'
    | 'paraphrase'
    | 'ai_detector'
    | 'humanizer'
    | 'settings'
    | 'full_report';
  const [command, setCommand] = useState('');
  const [activeChapterId, setActiveChapterId] = useState(chapters[0]?.id ?? '');
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [frontMatter, setFrontMatter] = useState<FrontMatterPreview | null>(null);
  const [frontMatterView, setFrontMatterView] = useState<'toc' | 'tables' | 'figures' | null>(null);
  const [frontMatterBusy, setFrontMatterBusy] = useState(false);
  const [frontMatterError, setFrontMatterError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>('dashboard');
  const [dockOpen, setDockOpen] = useState(false);
  const approvedCount = approvedChapterIds.size;
  const proposedCount = chapters.filter((chapter) => Boolean(chapter.rewritten_text)).length;
  const allProposalsApproved = proposedCount > 0 && approvedCount === proposedCount;
  const progressPct = proposedCount > 0 ? Math.round((approvedCount / proposedCount) * 100) : 0;
  const activeChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0],
    [activeChapterId, chapters],
  );
  const verifiedSources = useMemo(() => {
    const seen = new Set<string>();
    return improvementPlan.flatMap((item) => item.source_suggestions ?? []).filter((source) => {
      const key = source.evidence_id || source.url || source.title;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [improvementPlan]);
  const toolItems: Array<{
    id: ToolId;
    label: string;
    icon: typeof Search;
    accent: string;
  }> = [
    { id: 'search', label: 'Search Sources', icon: Search, accent: '#e4572e' },
    { id: 'similarity', label: 'Similarity Check', icon: ShieldAlert, accent: '#b45309' },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, accent: '#dc2626' },
    { id: 'phrasebank', label: 'Academic Phrase Bank', icon: LibraryBig, accent: '#7c3aed' },
    { id: 'ideas', label: 'Writing Ideas', icon: Lightbulb, accent: '#f59e0b' },
    { id: 'word_ideas', label: 'Phrase / Word Ideas', icon: TextQuote, accent: '#f97316' },
    { id: 'proofread', label: 'Academic Proofread', icon: SpellCheck2, accent: '#2563eb' },
    { id: 'paraphrase', label: 'Paraphrase Tool', icon: BookMarked, accent: '#4f46e5' },
    { id: 'ai_detector', label: 'AI Pattern Check', icon: Bot, accent: '#0891b2' },
    { id: 'humanizer', label: 'Researcher Voice', icon: AudioLines, accent: '#e11d48' },
    { id: 'settings', label: 'Settings', icon: Settings, accent: '#475569' },
    { id: 'full_report', label: 'Full Integrity Report', icon: FileWarning, accent: '#991b1b' },
  ];
  const quickPhrases = [
    'The evidence indicates that',
    'A key limitation of this study is',
    'These findings extend prior research by',
    'From a methodological perspective',
    'The practical implication is that',
    'Taken together, the results suggest',
  ];

  const activateTool = (tool: ToolId) => {
    if (tool === 'settings') {
      onOpenSettings?.();
      return;
    }
    const commandPresets: Partial<Record<ToolId, string>> = {
      proofread: 'Proofread this chapter for academic grammar, clarity, terminology consistency, and citation-safe corrections.',
      paraphrase: 'Paraphrase the selected chapter in a precise academic style while preserving meaning, claims, data, and citations.',
      humanizer: 'Improve authentic researcher voice, sentence variation, specificity, and natural hedging without changing the evidence.',
      ideas: 'Suggest stronger argument development, transitions, evidence placement, and contribution statements for this chapter.',
      word_ideas: 'Improve academic word choice and replace vague or repetitive phrases without changing the meaning.',
    };
    if (commandPresets[tool]) setCommand(commandPresets[tool]!);
    setActiveTool(tool);
    setDockOpen(true);
  };

  const runActiveTool = () => {
    if (!activeChapter || !command.trim()) return;
    void onRewriteChapter(activeChapter.id, command);
  };

  const renderDockContent = () => {
    if (activeTool === 'dashboard') {
      const entries = Object.entries(scores ?? {}).filter(([, value]) => typeof value === 'number').slice(0, 10);
      return (
        <div className="otif-dock-score-grid">
          {entries.length ? entries.map(([key, value]) => (
            <div key={key} className="otif-dock-score">
              <span>{key.replace(/_/g, ' ')}</span>
              <strong>{Number(value).toFixed(1)}</strong>
            </div>
          )) : <p>Run analysis to populate the academic dashboard.</p>}
        </div>
      );
    }
    if (activeTool === 'search') {
      return verifiedSources.length ? (
        <div className="otif-source-results">
          {verifiedSources.map((source) => (
            <a key={source.evidence_id} href={source.url || undefined} target="_blank" rel="noreferrer">
              <FileSearch size={15} />
              <span>
                <strong>{source.title}</strong>
                <small>{source.source_name}{source.year ? ` · ${source.year}` : ''}</small>
              </span>
            </a>
          ))}
        </div>
      ) : <p>No verified source suggestions are attached yet. Run analysis and open source-backed improvement items.</p>;
    }
    if (activeTool === 'similarity') {
      return (
        <div className="otif-dock-summary-card">
          <strong>
            {Number.isFinite(openSourceSimilarity?.similarity_index)
              ? `${openSourceSimilarity!.similarity_index.toFixed(1)}% open-source similarity`
              : 'Similarity result unavailable'}
          </strong>
          <p>{openSourceSimilarity?.interpretation || 'Run the full analysis to compare against returned public scholarly records.'}</p>
          <small>This is not a Turnitin or institutional private-corpus report.</small>
        </div>
      );
    }
    if (activeTool === 'ai_detector') {
      return (
        <div className="otif-dock-summary-card">
          <strong>
            {Number.isFinite(aiPatternCheck?.ai_detection_score)
              ? `${aiPatternCheck!.ai_detection_score}% local AI-pattern signal`
              : 'AI-pattern result unavailable'}
          </strong>
          <p>{aiPatternCheck?.verdict || 'Run analysis to inspect style, burstiness, repetition, and researcher-voice signals.'}</p>
          <small>A pattern score is not proof of authorship.</small>
        </div>
      );
    }
    if (activeTool === 'phrasebank' || activeTool === 'word_ideas') {
      return (
        <div className="otif-phrase-grid">
          {quickPhrases.map((phrase) => (
            <button
              key={phrase}
              onClick={() => setCommand((current) => current ? `${current} Use phrasing such as: "${phrase}".` : phrase)}
            >
              {phrase}
            </button>
          ))}
        </div>
      );
    }
    if (activeTool === 'full_report' || activeTool === 'ideas') {
      return improvementPlan.length ? (
        <div className="otif-plan-results">
          {improvementPlan.slice(0, 10).map((item) => (
            <div key={item.id}>
              <span className={`otif-priority ${item.priority}`}>{item.priority}</span>
              <strong>{item.title}</strong>
              <p>{item.action}</p>
            </div>
          ))}
        </div>
      ) : <p>No improvement plan is available yet.</p>;
    }
    return (
      <div className="otif-tool-action">
        <p>{command || 'Choose an academic action from the ribbon.'}</p>
        <button
          className="tc-btn tc-btn-primary"
          disabled={!rewriteAuthorized || isBusy || !activeChapter || !command.trim()}
          onClick={runActiveTool}
        >
          <Wand2 size={14} /> Apply to {activeChapter?.title || 'active chapter'}
        </button>
      </div>
    );
  };

  const showFrontMatter = async (view: 'toc' | 'tables' | 'figures') => {
    setFrontMatterView(view);
    setFrontMatterBusy(true);
    setFrontMatterError(null);
    try {
      setFrontMatter(await onRecheckFrontMatter());
    } catch (error) {
      setFrontMatterError(error instanceof Error ? error.message : 'Could not recheck front matter.');
    } finally {
      setFrontMatterBusy(false);
    }
  };

  return (
    <div className={`track-changes-wrap ${className}`.trim()} style={style}>
      <div className="otif-office-shell">
        <div className="otif-office-tabs">
          <span>File</span>
          <span>Home</span>
          <span>Insert</span>
          <span>Layout</span>
          <span>References</span>
          <strong>OTIF ACADEMIC</strong>
          <span>Review</span>
          <span>View</span>
        </div>
        <div className="otif-academic-ribbon">
          {toolItems.map((tool, index) => {
            const ToolIcon = tool.icon;
            return (
              <button
                key={tool.id}
                className={`${activeTool === tool.id ? 'active' : ''} ${index === 3 || index === 6 || index === 10 ? 'group-start' : ''}`}
                onClick={() => activateTool(tool.id)}
                title={tool.label}
              >
                <span className="otif-ribbon-icon" style={{ color: tool.accent }}>
                  <ToolIcon size={25} strokeWidth={1.8} />
                </span>
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="tc-ai-ribbon">
        <div className="tc-ribbon-title">
          <Sparkles size={17} />
          <strong>AI command</strong>
          <span>{targetFormat} · citation-safe tracked review</span>
        </div>
        <div className="tc-command-box">
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Tell AI what to improve: strengthen argument, reduce repetition, fix citations..."
            disabled={!rewriteAuthorized || isBusy}
          />
          <button
            className="tc-btn tc-btn-ghost"
            disabled={!rewriteAuthorized || isBusy || !activeChapter}
            onClick={() => activeChapter && void onRewriteChapter(activeChapter.id, command)}
          >
            <Wand2 size={14} />
            Rewrite chapter
          </button>
          <button
            className="tc-btn tc-btn-primary"
            disabled={!rewriteAuthorized || isBusy}
            onClick={() => void onRewriteAll(command)}
          >
            {isBusy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            Rewrite whole document
          </button>
        </div>
        <div className="tc-front-matter-actions">
          <span>Document agents</span>
          <button className="tc-btn tc-btn-ghost" onClick={() => void showFrontMatter('toc')}>
            <ListTree size={14} /> Recheck TOC
          </button>
          <button className="tc-btn tc-btn-ghost" onClick={() => void showFrontMatter('tables')}>
            <Table2 size={14} /> List of tables
          </button>
          <button className="tc-btn tc-btn-ghost" onClick={() => void showFrontMatter('figures')}>
            <Image size={14} /> List of figures
          </button>
        </div>
        {!rewriteAuthorized && (
          <div className="tc-authorization-note">
            Select and approve improvement-plan items below to enable AI rewriting.
          </div>
        )}
      </div>

      {frontMatterView && (
        <div className="tc-front-matter-panel">
          <div className="tc-front-matter-panel-head">
            <strong>
              {frontMatterView === 'toc'
                ? 'Table of Contents'
                : frontMatterView === 'tables'
                  ? 'List of Tables'
                  : 'List of Figures'}
            </strong>
            <button className="tc-btn tc-btn-ghost" onClick={() => setFrontMatterView(null)}>
              <X size={14} /> Close
            </button>
          </div>
          {frontMatterBusy ? (
            <div className="tc-front-matter-loading"><Loader2 size={16} className="spin" /> Rechecking page data...</div>
          ) : frontMatterError ? (
            <div className="tc-front-matter-loading">{frontMatterError}</div>
          ) : (
            <>
              <pre>
                {frontMatterView === 'toc'
                  ? frontMatter?.toc_text
                  : frontMatterView === 'tables'
                    ? frontMatter?.list_of_tables_text
                    : frontMatter?.list_of_figures_text}
              </pre>
              <p>{frontMatter?.note}</p>
            </>
          )}
        </div>
      )}

      {dockOpen && (
        <div className="otif-results-dock">
          <div className="otif-results-dock-head">
            <div>
              <strong>{toolItems.find((tool) => tool.id === activeTool)?.label}</strong>
              <span>{activeChapter?.title || 'Document results'}</span>
            </div>
            <button onClick={() => setDockOpen(false)} title="Collapse results panel">
              <X size={15} />
            </button>
          </div>
          <div className="otif-results-tabs">
            {toolItems
              .filter((tool) => !['settings'].includes(tool.id))
              .slice(0, 10)
              .map((tool) => (
                <button
                  key={tool.id}
                  className={activeTool === tool.id ? 'active' : ''}
                  onClick={() => activateTool(tool.id)}
                >
                  {tool.label}
                </button>
              ))}
          </div>
          <div className="otif-results-content">
            {renderDockContent()}
          </div>
        </div>
      )}

      {proposedCount > 0 && <div className="tc-approval-bar-top">
        <div className="tc-approval-progress">
          <span className="tc-progress-label">
            {proposedCount === 0
              ? 'No AI proposals generated yet'
              : `${approvedCount} of ${proposedCount} proposals approved`}
          </span>
          <div className="tc-progress-track">
            <div
              className={`tc-progress-fill ${allProposalsApproved ? 'complete' : ''}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <div className="tc-top-actions">
          {proposedCount > 0 && approvedCount < proposedCount && (
            <button className="tc-btn tc-btn-primary" onClick={onApproveAll} disabled={isBusy}>
              <FileCheck2 size={14} /> Accept all proposals
            </button>
          )}
          {proposedCount > 0 && (
            <button className="tc-btn tc-btn-ghost" onClick={onRejectAll} disabled={isBusy}>
              <RotateCcw size={14} /> Reset all
            </button>
          )}
          {approvedCount > 0 && (
            <>
              <button className="tc-btn tc-btn-export" onClick={() => onExport('docx')}>
                <Download size={14} /> DOCX
              </button>
              <button className="tc-btn tc-btn-export" onClick={() => onExport('pdf')}>
                <Download size={14} /> PDF
              </button>
            </>
          )}
        </div>
      </div>}

      <div className="tc-doc-paper">
        {docTitle && <h1 className="tc-doc-title">{docTitle}</h1>}
        {filename && <p className="tc-doc-filename">{filename}</p>}

        {chapters.map((chapter) => {
          const isApproved = approvedChapterIds.has(chapter.id);
          const isRewriting = rewritingChapterId === chapter.id;
          const hasProposal = Boolean(chapter.rewritten_text);
          const isEditing = editingChapterId === chapter.id;

          return (
            <article
              key={chapter.id}
              className={`tc-chapter ${isApproved ? 'approved' : ''} ${activeChapterId === chapter.id ? 'active' : ''}`}
              onClick={() => setActiveChapterId(chapter.id)}
            >
              <h2 className="tc-chapter-title">{chapter.title}</h2>
              {isEditing && chapter.rewritten_text ? (
                <div className="tc-inline-editor" onClick={(event) => event.stopPropagation()}>
                  <RichTextEditor
                    content={plainTextToHtml(chapter.rewritten_text)}
                    onChange={(html) => onUpdateChapter(chapter.id, htmlToPlainText(html))}
                    placeholder={`Edit the revised ${chapter.title} text...`}
                  />
                </div>
              ) : chapterContent(chapter)}

              <div className={`tc-chapter-bar ${isApproved ? 'approved' : ''}`}>
                <div className="tc-chapter-status">
                  {isApproved ? (
                    <>
                      <CheckCircle2 size={16} className="tc-icon-approved" />
                      <span className="tc-status-text approved">Approved</span>
                    </>
                  ) : (
                    <>
                      <Clock size={16} className="tc-icon-pending" />
                      <span className="tc-status-text pending">
                        {hasProposal ? 'Proposal ready for review' : 'Original text'}
                      </span>
                    </>
                  )}
                  <Badge label={`${chapter.word_count} words`} variant="info" />
                  {hasProposal && <Badge label="AI proposal" variant="success" />}
                </div>

                <div className="tc-chapter-actions">
                  {!hasProposal && (
                    <button
                      className="tc-btn tc-btn-approve"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onRewriteChapter(chapter.id, command);
                      }}
                      disabled={!rewriteAuthorized || isBusy || isRewriting}
                    >
                      {isRewriting ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />}
                      {isRewriting ? 'Rewriting...' : 'Generate improvement'}
                    </button>
                  )}
                  {hasProposal && !isApproved && (
                    <>
                      <button
                        className="tc-btn tc-btn-ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingChapterId(isEditing ? null : chapter.id);
                        }}
                      >
                        {isEditing ? <X size={14} /> : <Edit3 size={14} />}
                        {isEditing ? 'Close editor' : 'Edit proposal'}
                      </button>
                      <button
                        className="tc-btn tc-btn-ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRejectChapter(chapter.id);
                        }}
                      >
                        <RotateCcw size={14} /> Reject
                      </button>
                      <button
                        className="tc-btn tc-btn-approve"
                        onClick={(event) => {
                          event.stopPropagation();
                          onApproveChapter(chapter.id);
                        }}
                      >
                        <CheckCircle2 size={14} /> Approve chapter
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {activeChapter?.rewritten_text && !approvedChapterIds.has(activeChapter.id) && (
        <button
          className="tc-floating-approval"
          onClick={() => onApproveChapter(activeChapter.id)}
        >
          <CheckCircle2 size={17} />
          Approve {activeChapter.title}
        </button>
      )}
    </div>
  );
}
