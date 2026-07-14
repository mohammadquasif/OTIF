import { useState, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import type { Editor } from '@tiptap/react';
import axios from 'axios';
import { Sparkles, Wand2 } from 'lucide-react';
import { DocumentWorkspace } from './DocumentWorkspace';
import { RichTextEditor, getSelectedText, replaceSelection, insertAtCursor } from './RichTextEditor';
import { InlineDiffView, composeReviewedText, extractChanges, type InlineChange } from './InlineDiffView';
import { WritingAssistantPanel } from './WritingAssistantPanel';
import { ImprovementAnnotations } from './ImprovementAnnotations';
import { Button } from './shared/Button';
import { Badge } from './shared/Badge';
import { OnlyOfficeSetupBanner } from './OnlyOfficeLaunch';
import { API_BASE } from '../api';
import type { EditableChapter, ImprovementItem } from '../types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function plainTextToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('') || '<p></p>';
}

interface DocumentViewProps {
  docId: string | null;
  docType: string;
  norm: string;
  chapter: EditableChapter;
  improvements: ImprovementItem[];
  approvedImprovementIds: string[];
  onUpdateChapter: (chapterId: string, html: string) => void;
  onToggleApproval: (itemId: string) => void;
  onApproveAll: () => void;
  onMarkComplete?: (chapterId: string) => void;
  isComplete?: boolean;
  className?: string;
  style?: CSSProperties;
}

type ViewMode = 'edit' | 'review';
type ProposalScope = 'chapter' | 'selection' | null;

export function DocumentView({
  docId, docType, norm, chapter, improvements, approvedImprovementIds,
  onUpdateChapter, onToggleApproval, onApproveAll,
  onMarkComplete, isComplete, className = '', style,
}: DocumentViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [editorRef, setEditorRef] = useState<Editor | null>(null);
  const [isParaphrasing, setIsParaphrasing] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [rewriteNotice, setRewriteNotice] = useState<string | null>(null);
  const [proposalScope, setProposalScope] = useState<ProposalScope>(null);

  // Diff state
  const [originalSnapshot, setOriginalSnapshot] = useState(chapter.original_text);
  const [revisedText, setRevisedText] = useState(chapter.edited_text);
  const [changes, setChanges] = useState<InlineChange[]>([]);
  const [showDiff, setShowDiff] = useState(false);

  const htmlContent = useMemo(() => {
    if (chapter.edited_text.startsWith('<')) return chapter.edited_text;
    return chapter.edited_text.split('\n').map((p) => p.trim() ? `<p>${p}</p>` : '<p></p>').join('');
  }, [chapter.edited_text]);

  const plainText = useMemo(() => {
    const div = document.createElement('div');
    div.innerHTML = htmlContent;
    return div.textContent || div.innerText || '';
  }, [htmlContent]);

  useEffect(() => {
    setOriginalSnapshot(chapter.original_text || chapter.edited_text);
    setRevisedText(chapter.edited_text);
    setChanges([]);
    setShowDiff(false);
    setRewriteError(null);
    setRewriteNotice(null);
    setProposalScope(null);
  }, [chapter.id, chapter.original_text, chapter.edited_text]);

  // ── AI Paraphrase ──────────────────────────────────────────
  const handleParaphrase = useCallback(async () => {
    if (!editorRef) return;
    const selection = getSelectedText(editorRef);
    if (!selection?.text) return;

    setIsParaphrasing(true);
    setRewriteError(null);
    setRewriteNotice(null);
    try {
      const docEl = editorRef.view.dom;
      const fullText = docEl.textContent || '';
      const selStart = Math.max(0, selection.from - 600);
      const selEnd = Math.min(fullText.length, selection.to + 600);
      const context = fullText.slice(selStart, selEnd);

      const res = await axios.post(`${API_BASE}/writing-assistant/paraphrase`, {
        text_selection: selection.text,
        context,
        tone: 'academic',
      });

      // Show inline diff before applying
      const extractedChanges = extractChanges(selection.text, res.data.paraphrased_text, 'AI paraphrase — improved academic tone and clarity');
      setOriginalSnapshot(selection.text);
      setRevisedText(res.data.paraphrased_text);
      setChanges(extractedChanges);
      setProposalScope('selection');
      setShowDiff(true);
    } catch (err) {
      setRewriteError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : 'Paraphrase failed.');
    }
    finally { setIsParaphrasing(false); }
  }, [editorRef]);

  // ── AI Chapter Rewrite ─────────────────────────────────────
  const handleChapterRewrite = useCallback(async () => {
    if (!chapter || !docId) return;
    setIsRewriting(true);
    setRewriteError(null);
    setRewriteNotice(null);

    try {
      const approvedIds = improvements
        .filter((i) => approvedImprovementIds.includes(i.id))
        .map((i) => i.id);

      const res = await axios.post(`${API_BASE}/analysis/chapter-rewrite-proposal`, {
        doc_id: docId,
        chapter_id: chapter.id,
        title: chapter.title,
        text: plainText,
        approved_item_ids: approvedIds,
        doc_type: docType,
        norm,
      });

      const originalSnapshot = plainText;
      const revised = res.data.proposed_text;
      const extractedChanges = extractChanges(originalSnapshot, revised, 'AI chapter rewrite — applied approved improvements');

      setOriginalSnapshot(originalSnapshot);
      setRevisedText(revised);
      setChanges(extractedChanges);
      setProposalScope('chapter');
      setShowDiff(true);
      setRewriteNotice(res.data.provider_warning ?? null);
    } catch (err) {
      setRewriteError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : 'Chapter rewrite failed.');
    }
    finally { setIsRewriting(false); }
  }, [chapter, docId, docType, improvements, norm, approvedImprovementIds, plainText]);

  // ── Diff accept/reject ─────────────────────────────────────
  const handleAcceptChange = useCallback((changeId: string) => {
    setChanges((prev) => prev.map((c) => c.id === changeId ? { ...c, applied: true, rejected: false } : c));
  }, []);

  const handleRejectChange = useCallback((changeId: string) => {
    setChanges((prev) => prev.map((c) => c.id === changeId ? { ...c, applied: false, rejected: true } : c));
  }, []);

  const handleAcceptAll = useCallback(() => {
    const reviewedText = composeReviewedText(originalSnapshot, revisedText, changes);
    let nextHtml = reviewedText;
    if (editorRef && reviewedText) {
      if (originalSnapshot === plainText) {
        nextHtml = plainTextToHtml(reviewedText);
        editorRef.commands.setContent(nextHtml);
      } else {
        replaceSelection(editorRef, plainTextToHtml(reviewedText));
        nextHtml = editorRef.getHTML();
      }
    }
    onUpdateChapter(chapter.id, nextHtml);
    if (proposalScope === 'chapter' && onMarkComplete && !isComplete) {
      onMarkComplete(chapter.id);
    }
    setShowDiff(false);
    setChanges([]);
    setRewriteNotice(null);
    setProposalScope(null);
  }, [editorRef, originalSnapshot, plainText, revisedText, changes, chapter.id, onUpdateChapter, proposalScope, onMarkComplete, isComplete]);

  const handleRejectAll = useCallback(() => {
    setShowDiff(false);
    setChanges([]);
    setRevisedText(originalSnapshot);
    setProposalScope(null);
  }, [originalSnapshot]);

  // ── Insert phrase ──────────────────────────────────────────
  const handleInsertPhrase = useCallback((phrase: string) => {
    insertAtCursor(editorRef, `<span>${phrase}</span>`);
    if (editorRef) {
      const html = editorRef.getHTML();
      onUpdateChapter(chapter.id, html);
    }
  }, [editorRef, chapter.id, onUpdateChapter]);

  // ── Sidebar content ────────────────────────────────────────
  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Mode toggle */}
      <div style={{
        display: 'flex', padding: '8px', gap: '4px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-overlay)',
      }}>
        {([
          { id: 'edit' as const, label: '✏️ Edit', icon: null },
          { id: 'review' as const, label: '📋 Review', icon: null },
        ]).map((mode) => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            style={{
              flex: 1, padding: '6px 8px', fontSize: '11px', fontWeight: 600,
              borderRadius: 'var(--r-sm)', border: '1px solid var(--border-subtle)',
              background: viewMode === mode.id ? 'var(--brand-500)' : 'transparent',
              color: viewMode === mode.id ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all var(--t-fast)',
            }}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Content based on mode */}
      {viewMode === 'edit' && (
        <WritingAssistantPanel
          onInsertPhrase={handleInsertPhrase}
          onParaphrase={handleParaphrase}
          isParaphrasing={isParaphrasing}
        />
      )}

      {viewMode === 'review' && (
        <div style={{ padding: '8px', overflow: 'auto', flex: 1 }}>
          <ImprovementAnnotations
            improvements={improvements}
            approvedIds={approvedImprovementIds}
            onToggleApproval={onToggleApproval}
            onApproveAll={onApproveAll}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '12px', ...style }}>
      {/* ── Action Bar ──────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        padding: '8px 12px', background: 'var(--bg-overlay)',
        borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {chapter.title}
        </span>
        {isComplete && <Badge label="Complete" variant="success" />}

        <span style={{ flex: 1 }} />

        <Button size="sm" variant="secondary" onClick={handleParaphrase} loading={isParaphrasing}>
          <Sparkles size={13} /> Paraphrase
        </Button>

        <Button
          size="sm" variant="primary"
          onClick={handleChapterRewrite}
          loading={isRewriting}
          disabled={!docId || approvedImprovementIds.length === 0}
          title={!docId ? 'Open a document first' : approvedImprovementIds.length === 0 ? 'Approve improvements first' : 'AI rewrite with approved improvements'}
        >
          <Wand2 size={13} /> Rewrite Chapter
        </Button>

        {changes.length > 0 && (
          <Button size="sm" variant={showDiff ? 'secondary' : 'primary'} onClick={() => setShowDiff((visible) => !visible)}>
            {showDiff ? 'Hide Review' : 'Review & Approve'}
          </Button>
        )}

        {onMarkComplete && (
          <Button size="sm" variant={isComplete ? 'secondary' : 'ghost'} onClick={() => onMarkComplete(chapter.id)}>
            {isComplete ? '✓ Done' : 'Mark Done'}
          </Button>
        )}
      </div>

      {rewriteError && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--r-md)',
          border: '1px solid hsla(352, 85%, 62%, 0.35)',
          background: 'hsla(352, 85%, 62%, 0.08)',
          color: 'var(--score-critical)',
          fontSize: '12px',
        }}>
          {rewriteError}
        </div>
      )}

      {/* ── Inline Diff View ────────────────────────────────── */}
      {/* ── Document Workspace ──────────────────────────────── */}
      {rewriteNotice && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--r-md)',
          border: '1px solid hsla(38, 95%, 58%, 0.35)',
          background: 'hsla(38, 95%, 58%, 0.08)',
          color: 'var(--score-fair)',
          fontSize: '12px',
        }}>
          {rewriteNotice}
        </div>
      )}

      {showDiff && changes.length > 0 && (
        <InlineDiffView
          originalText={originalSnapshot}
          revisedText={revisedText}
          changes={changes}
          onAcceptChange={handleAcceptChange}
          onRejectChange={handleRejectChange}
          onAcceptAll={handleAcceptAll}
          onRejectAll={handleRejectAll}
        />
      )}

      {/* Hide editor while reviewing diff to avoid double-editor */}
      {!showDiff && (
        <DocumentWorkspace
          title={chapter.title}
          chapterTitle={`Chapter ${chapter.id}`}
          wordCount={plainText.split(/\s+/).filter(Boolean).length}
          sidebar={sidebarContent}
        >
          <RichTextEditor
            content={htmlContent}
            onChange={(html: string) => onUpdateChapter(chapter.id, html)}
            placeholder={`Write or edit the "${chapter.title}" section...`}
            onEditorReady={setEditorRef}
            editable={!isComplete}
          />
        </DocumentWorkspace>
      )}

      {/* ONLYOFFICE Info */}
      <OnlyOfficeSetupBanner />
    </div>
  );
}
