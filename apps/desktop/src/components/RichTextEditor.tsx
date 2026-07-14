import { useCallback, useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor, type Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import TiptapImage from '@tiptap/extension-image';
import type { CSSProperties } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  extensions?: Extensions;
  className?: string;
  style?: CSSProperties;
  onEditorReady?: (editor: Editor) => void;
  onSelectionChange?: (editor: Editor) => void;
}

const editorContainerStyle: CSSProperties = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-lg)',
  minHeight: '300px',
  maxHeight: '70vh',
  overflow: 'auto',
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: '15px',
  lineHeight: 1.8,
  color: 'var(--text-primary)',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2px',
  padding: '6px 8px',
  background: 'var(--bg-overlay)',
  borderBottom: '1px solid var(--border-subtle)',
  borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
  position: 'sticky',
  top: 0,
  zIndex: 10,
};

const toolbarBtnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '28px',
  padding: 0,
  border: '1px solid transparent',
  borderRadius: 'var(--r-sm)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  transition: 'all var(--t-fast)',
};

function toolbarBtn(active: boolean): CSSProperties {
  return {
    ...toolbarBtnBase,
    background: active ? 'hsla(258, 75%, 55%, 0.15)' : 'transparent',
    color: active ? 'var(--brand-300)' : 'var(--text-secondary)',
    border: active ? '1px solid var(--border-brand)' : '1px solid transparent',
  };
}

export function RichTextEditor({
  content, onChange, placeholder = 'Start writing your academic content...',
  editable = true, extensions = [], className = '', style, onEditorReady, onSelectionChange,
}: RichTextEditorProps) {
  const lastPropContentRef = useRef(content);
  const extensionList = Array.isArray(extensions) ? extensions : [extensions];
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'editor-link' } }),
      TiptapImage.configure({ inline: false, allowBase64: true }),
      ...extensionList,
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        style: 'padding: 16px 20px; outline: none; min-height: 260px;',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      onSelectionChange?.(editor);
    },
    onCreate: ({ editor }) => {
      onEditorReady?.(editor);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    if (content === lastPropContentRef.current && editor.getHTML() === content) return;
    if (editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    lastPropContentRef.current = content;
  }, [editor, content]);

  useEffect(() => {
    if (editor) onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  const toggleMark = useCallback((mark: string) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (mark) {
      case 'bold': chain.toggleBold().run(); break;
      case 'italic': chain.toggleItalic().run(); break;
      case 'underline': chain.toggleUnderline().run(); break;
      case 'strike': chain.toggleStrike().run(); break;
      case 'highlight': chain.toggleHighlight().run(); break;
      case 'code': chain.toggleCode().run(); break;
    }
  }, [editor]);

  const toggleHeading = useCallback((level: 1 | 2 | 3 | 4) => {
    editor?.chain().focus().toggleHeading({ level }).run();
  }, [editor]);

  const toggleAlign = useCallback((align: 'left' | 'center' | 'right' | 'justify') => {
    editor?.chain().focus().setTextAlign(align).run();
  }, [editor]);

  const toggleList = useCallback((type: 'bullet' | 'ordered') => {
    if (!editor) return;
    if (type === 'bullet') editor.chain().focus().toggleBulletList().run();
    else editor.chain().focus().toggleOrderedList().run();
  }, [editor]);

  const isActive = useCallback((name: string, attrs?: Record<string, unknown>) => {
    if (!editor) return false;
    return attrs ? editor.isActive(name, attrs) : editor.isActive(name);
  }, [editor]);

  if (!editor) {
    return <div style={editorContainerStyle}>Loading editor...</div>;
  }

  return (
    <div style={{ ...editorContainerStyle, ...style }} className={className}>
      {editable && (
        <div style={toolbarStyle}>
          {/* Headings */}
          {([1, 2, 3, 4] as const).map((level) => (
            <button
              key={`h${level}`}
              style={toolbarBtn(isActive('heading', { level }))}
              onClick={() => toggleHeading(level)}
              title={`Heading ${level}`}
            >
              H{level}
            </button>
          ))}
          <span style={{ width: '6px', flexShrink: 0 }} />

          {/* Marks */}
          {(['bold', 'italic', 'underline', 'strike', 'highlight', 'code'] as const).map((mark) => (
            <button
              key={mark}
              style={toolbarBtn(isActive(mark))}
              onClick={() => toggleMark(mark)}
              title={mark.charAt(0).toUpperCase() + mark.slice(1)}
            >
              {mark === 'bold' ? '𝐁' : mark === 'italic' ? '𝐼' : mark === 'underline' ? 'U̲' :
               mark === 'strike' ? 'S̶' : mark === 'highlight' ? '◼' : '<>'}
            </button>
          ))}
          <span style={{ width: '6px', flexShrink: 0 }} />

          {/* Alignment */}
          {(['left', 'center', 'right', 'justify'] as const).map((align) => (
            <button
              key={align}
              style={toolbarBtn(isActive('textAlign', { textAlign: align }))}
              onClick={() => toggleAlign(align)}
              title={`Align ${align}`}
            >
              {align === 'left' ? '≡' : align === 'center' ? '≡' : align === 'right' ? '≡' : '≡'}
            </button>
          ))}
          <span style={{ width: '6px', flexShrink: 0 }} />

          {/* Lists */}
          <button style={toolbarBtn(isActive('bulletList'))} onClick={() => toggleList('bullet')} title="Bullet List">•</button>
          <button style={toolbarBtn(isActive('orderedList'))} onClick={() => toggleList('ordered')} title="Numbered List">1.</button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

/** Insert HTML at the current cursor position */
export function insertAtCursor(editor: Editor | null, html: string): void {
  if (!editor) return;
  editor.chain().focus().insertContent(html).run();
}

/** Get selected text from the editor (plain text) */
export function getSelectedText(editor: Editor | null): { text: string; from: number; to: number } | null {
  if (!editor) return null;
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, ' ');
  return text.trim() ? { text, from, to } : null;
}

/** Replace the current selection with new HTML content */
export function replaceSelection(editor: Editor | null, html: string): void {
  if (!editor) return;
  editor.chain().focus().deleteSelection().insertContent(html).run();
}

/** Get surrounding context for AI suggestions */
export function getContextAroundCursor(editor: Editor | null, chars: number = 1200): { before: string; after: string } {
  if (!editor) return { before: '', after: '' };
  const { from, to } = editor.state.selection;
  const doc = editor.state.doc;
  const beforeStart = Math.max(0, from - chars);
  const afterEnd = Math.min(doc.content.size, to + chars);
  return {
    before: doc.textBetween(beforeStart, from, ' '),
    after: doc.textBetween(to, afterEnd, ' '),
  };
}
