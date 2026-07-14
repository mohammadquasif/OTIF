import { useState, type ReactNode, type CSSProperties } from 'react';
import { BookOpen, PanelLeftClose, PanelLeft, Sparkles, FileText } from 'lucide-react';
import { Button } from './shared/Button';

interface DocumentWorkspaceProps {
  children: ReactNode;
  sidebar: ReactNode;
  title?: string;
  wordCount?: number;
  chapterTitle?: string;
  onSave?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function DocumentWorkspace({
  children, sidebar, title = 'Untitled Document',
  wordCount = 0, chapterTitle, onSave, className = '', style,
}: DocumentWorkspaceProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className={className} style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-base)', borderRadius: 'var(--r-lg)',
      border: '1px solid var(--border-default)',
      overflow: 'hidden', ...style,
    }}>
      {/* ── Office Toolbar ─────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2px',
        padding: '4px 8px', background: 'var(--bg-overlay)',
        borderBottom: '1px solid var(--border-subtle)',
        minHeight: '40px',
      }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', padding: '0 8px' }}>
          {title}
        </span>
        {chapterTitle && (
          <span style={{
            fontSize: '11px', color: 'var(--text-muted)', padding: '2px 8px',
            background: 'var(--bg-muted)', borderRadius: 'var(--r-sm)',
          }}>
            {chapterTitle}
          </span>
        )}
        <span style={{ flex: 1 }} />

        {/* Word count */}
        <span style={{
          fontSize: '11px', color: 'var(--text-muted)', padding: '0 8px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {wordCount.toLocaleString()} words
        </span>

        {/* Toolbar buttons */}
        <Button
          size="sm" variant="ghost"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? 'Hide Assistant Panel' : 'Show Assistant Panel'}
        >
          {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
          {sidebarOpen ? 'Hide' : 'Assistant'}
        </Button>

        {onSave && (
          <Button size="sm" variant="primary" onClick={onSave}>
            <FileText size={14} />
            Save
          </Button>
        )}
      </div>

      {/* ── Document Body ──────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Main document area */}
        <div style={{
          flex: 1, overflow: 'auto', padding: '24px 32px',
          background: 'var(--bg-base)',
        }}>
          {/* Paper-like container */}
          <div style={{
            maxWidth: '800px', margin: '0 auto',
            background: 'var(--bg-raised)',
            boxShadow: '0 1px 4px hsla(225, 30%, 3%, 0.3)',
            borderRadius: '2px',
            minHeight: 'calc(100% - 48px)',
          }}>
            {children}
          </div>
        </div>

        {/* Side panel */}
        {sidebarOpen && (
          <div style={{
            width: '320px', minWidth: '280px',
            background: 'var(--bg-raised)',
            borderLeft: '1px solid var(--border-subtle)',
            overflow: 'auto',
            display: 'flex', flexDirection: 'column',
          }}>
            {sidebar}
          </div>
        )}
      </div>

      {/* ── Status Bar ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px',
        padding: '3px 12px', background: 'var(--bg-overlay)',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '11px', color: 'var(--text-muted)',
        minHeight: '26px',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <BookOpen size={12} />
          Ready
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Sparkles size={12} />
          AI-Powered Editing
        </span>
      </div>
    </div>
  );
}
