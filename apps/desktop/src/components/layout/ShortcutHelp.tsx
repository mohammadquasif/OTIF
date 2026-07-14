import type { CSSProperties } from 'react';
import { X, Keyboard } from 'lucide-react';

interface Shortcut {
  key: string;
  description: string;
  category: string;
}

const SHORTCUTS: Shortcut[] = [
  // Editor
  { key: 'Ctrl+B', description: 'Bold', category: 'Formatting' },
  { key: 'Ctrl+I', description: 'Italic', category: 'Formatting' },
  { key: 'Ctrl+U', description: 'Underline', category: 'Formatting' },
  { key: 'Ctrl+Shift+H', description: 'Highlight', category: 'Formatting' },
  { key: 'Ctrl+Alt+1', description: 'Heading 1', category: 'Formatting' },
  { key: 'Ctrl+Alt+2', description: 'Heading 2', category: 'Formatting' },
  { key: 'Ctrl+Alt+3', description: 'Heading 3', category: 'Formatting' },
  { key: 'Ctrl+Shift+7', description: 'Numbered list', category: 'Formatting' },
  { key: 'Ctrl+Shift+8', description: 'Bullet list', category: 'Formatting' },
  // Editing
  { key: 'Ctrl+Z', description: 'Undo', category: 'Editing' },
  { key: 'Ctrl+Y', description: 'Redo', category: 'Editing' },
  { key: 'Ctrl+S', description: 'Save document', category: 'Editing' },
  { key: 'Ctrl+F', description: 'Find in document', category: 'Editing' },
  // AI / Academic
  { key: 'Ctrl+Shift+P', description: 'Paraphrase selection', category: 'AI Academic' },
  { key: 'Ctrl+Shift+R', description: 'AI Rewrite with improvements', category: 'AI Academic' },
  { key: 'Ctrl+Shift+C', description: 'Insert citation', category: 'AI Academic' },
  { key: 'Ctrl+K', description: 'Search phrasebank', category: 'AI Academic' },
  // Review
  { key: 'Ctrl+Shift+A', description: 'Accept all suggestions', category: 'Review' },
  { key: 'Ctrl+Shift+E', description: 'Reject all suggestions', category: 'Review' },
  // UI
  { key: 'Ctrl+/', description: 'Keyboard shortcuts help', category: 'General' },
  { key: 'Escape', description: 'Close dialog / modal', category: 'General' },
];

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

export function ShortcutHelp({ isOpen, onClose, className = '', style }: ShortcutHelpProps) {
  if (!isOpen) return null;

  const categories = [...new Set(SHORTCUTS.map((s) => s.category))];

  return (
    <div className={className} style={{
      position: 'fixed', inset: 0, zIndex: 10002,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'hsla(225, 25%, 5%, 0.6)', backdropFilter: 'blur(2px)',
      ...style,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-raised)', borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border-default)',
        width: '520px', maxWidth: '95vw', maxHeight: '75vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <Keyboard size={16} color="var(--brand-400)" />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
            Keyboard Shortcuts
          </span>
          <button onClick={onClose} style={closeBtn}><X size={16} /></button>
        </div>

        {/* Shortcuts list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {categories.map((category) => (
            <div key={category} style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.5px', color: 'var(--text-muted)',
                marginBottom: '6px', paddingBottom: '4px',
                borderBottom: '1px solid var(--border-subtle)',
              }}>
                {category}
              </div>
              {SHORTCUTS.filter((s) => s.category === category).map((shortcut) => (
                <div key={shortcut.key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 0', fontSize: '12px',
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{shortcut.description}</span>
                  <kbd style={{
                    padding: '2px 8px', fontSize: '11px', fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--bg-overlay)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--r-sm)', color: 'var(--text-primary)',
                    boxShadow: '0 1px 0 var(--border-strong)',
                    minWidth: '80px', textAlign: 'center',
                    display: 'inline-block',
                  }}>
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid var(--border-subtle)',
          fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center',
        }}>
          Press <kbd style={{
            padding: '1px 5px', fontFamily: 'var(--font-mono)', fontSize: '10px',
            background: 'var(--bg-overlay)', borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border-default)',
          }}>Ctrl+/</kbd> anytime to show this help
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
