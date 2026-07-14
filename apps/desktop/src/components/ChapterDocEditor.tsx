import { useState, useCallback, useRef, type CSSProperties } from 'react';
import type { Editor } from '@tiptap/react';
import axios from 'axios';
import { RichTextEditor, insertAtCursor, getSelectedText, replaceSelection, getContextAroundCursor } from './RichTextEditor';
import { API_BASE } from '../api';
import type { EditableChapter } from '../types';
import { Button } from './shared/Button';
import { Badge } from './shared/Badge';

interface ChapterDocEditorProps {
  chapter: EditableChapter;
  onUpdate: (chapterId: string, html: string) => void;
  onMarkComplete?: (chapterId: string) => void;
  isComplete?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ChapterDocEditor({
  chapter, onUpdate, onMarkComplete, isComplete, className = '', style,
}: ChapterDocEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const [isParaphrasing, setIsParaphrasing] = useState(false);
  const [paraphraseResult, setParaphraseResult] = useState<string | null>(null);
  const [paraphraseError, setParaphraseError] = useState<string | null>(null);

  const handleChange = useCallback((html: string) => {
    onUpdate(chapter.id, html);
  }, [chapter.id, onUpdate]);

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  const handleSelectionChange = useCallback((_editor: Editor) => {
    // Clear previous paraphrase when selection changes
    setParaphraseResult(null);
    setParaphraseError(null);
  }, []);

  const handleParaphrase = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = getSelectedText(editor);
    if (!selection?.text) {
      setParaphraseError('Select text in the editor first, then click Paraphrase.');
      return;
    }

    setIsParaphrasing(true);
    setParaphraseResult(null);
    setParaphraseError(null);

    const ctx = getContextAroundCursor(editor);
    try {
      const res = await axios.post(`${API_BASE}/writing-assistant/paraphrase`, {
        text_selection: selection.text,
        context: `${ctx.before}\n\n${ctx.after}`,
        tone: 'academic',
      });
      setParaphraseResult(res.data.paraphrased_text);
    } catch (err) {
      setParaphraseError(axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Paraphrase failed.');
    } finally {
      setIsParaphrasing(false);
    }
  }, []);

  const applyParaphrase = useCallback(() => {
    if (!paraphraseResult || !editorRef.current) return;
    replaceSelection(editorRef.current, `<p>${paraphraseResult}</p>`);
    setParaphraseResult(null);
  }, [paraphraseResult]);

  const insertPhrase = useCallback((phrase: string) => {
    insertAtCursor(editorRef.current, `<p>${phrase}</p>`);
  }, []);

  // Convert HTML content for storage if needed
  const htmlContent = chapter.edited_text.startsWith('<')
    ? chapter.edited_text
    : chapter.edited_text.split('\n').map((p) => p.trim() ? `<p>${p}</p>` : '<p></p>').join('');

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '12px', ...style }}>
      {/* Chapter header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {chapter.title}
          </h3>
          {isComplete && <Badge label="Complete" variant="success" />}
          {chapter.word_count != null && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {chapter.word_count} words
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <Button size="sm" variant="secondary" onClick={handleParaphrase} loading={isParaphrasing} disabled={isParaphrasing}>
            ✨ Paraphrase Selection
          </Button>
          {onMarkComplete && (
            <Button
              size="sm"
              variant={isComplete ? 'secondary' : 'primary'}
              onClick={() => onMarkComplete(chapter.id)}
            >
              {isComplete ? '✓ Complete' : 'Mark Complete'}
            </Button>
          )}
        </div>
      </div>

      {/* Paraphrase result */}
      {paraphraseResult && (
        <div style={{
          background: 'hsla(145, 75%, 45%, 0.1)',
          border: '1px solid hsla(145, 75%, 55%, 0.3)',
          borderRadius: 'var(--r-md)',
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--score-excellent)' }}>
            ✨ AI Paraphrase Suggestion
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            {paraphraseResult}
          </p>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Button size="sm" variant="primary" onClick={applyParaphrase}>Apply</Button>
            <Button size="sm" variant="ghost" onClick={() => setParaphraseResult(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      {paraphraseError && (
        <div style={{
          padding: '8px 12px', borderRadius: 'var(--r-sm)',
          background: 'hsla(352, 85%, 62%, 0.1)', border: '1px solid hsla(352, 85%, 62%, 0.25)',
          fontSize: '12px', color: 'var(--accent-rose)',
        }}>
          {paraphraseError}
        </div>
      )}

      {/* Rich text editor */}
      <RichTextEditor
        content={htmlContent}
        onChange={handleChange}
        placeholder={`Write or edit the "${chapter.title}" section...`}
        onEditorReady={handleEditorReady}
        onSelectionChange={handleSelectionChange}
        editable={!isComplete}
      />

      {/* Quick phrase insert */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '4px',
        padding: '8px', background: 'var(--bg-overlay)', borderRadius: 'var(--r-md)',
      }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, marginRight: '8px', alignSelf: 'center' }}>
          QUICK INSERT:
        </span>
        {[
          'However,', 'Therefore,', 'Furthermore,', 'In contrast,', 'Similarly,',
          'For example,', 'According to', 'This suggests that', 'It is important to note that',
          'The findings indicate that',
        ].map((phrase) => (
          <button
            key={phrase}
            onClick={() => insertPhrase(phrase)}
            style={{
              padding: '2px 8px', fontSize: '11px', borderRadius: 'var(--r-sm)',
              background: 'var(--bg-muted)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', cursor: 'pointer',
              transition: 'all var(--t-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--brand-500)';
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.borderColor = 'var(--brand-500)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-muted)';
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
            }}
          >
            {phrase}
          </button>
        ))}
      </div>
    </div>
  );
}
