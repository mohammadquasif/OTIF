import { useState, useCallback, type ReactNode, type CSSProperties } from 'react';
import {
  FileText, Save, FolderOpen, Download, Upload,
  Bold, Italic, Underline, Strikethrough, Highlighter, Code2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Heading3, Heading4,
  Search, Sparkles, Wand2, ShieldCheck, FileOutput,
  BookOpen, FlaskConical, Quote, Table2, Image,
  RotateCcw, RotateCw, Eye, Settings, CheckCircle2,
  type LucideIcon,
} from 'lucide-react';

type RibbonTabId = 'file' | 'write' | 'home' | 'academic' | 'review' | 'export';

interface RibbonTab {
  id: RibbonTabId;
  label: string;
  icon?: LucideIcon;
}

interface RibbonGroup {
  label: string;
  buttons: RibbonButton[];
}

interface RibbonButton {
  id?: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  dropdown?: RibbonButton[];
}

interface RibbonToolbarProps {
  activeTab?: RibbonTabId;
  onTabChange?: (tab: RibbonTabId) => void;
  // Formatting
  onBold?: () => void;
  onItalic?: () => void;
  onUnderline?: () => void;
  onStrike?: () => void;
  onHighlight?: () => void;
  onCode?: () => void;
  onBlockquote?: () => void;
  onHeading?: (level: 1 | 2 | 3 | 4) => void;
  onAlign?: (align: 'left' | 'center' | 'right' | 'justify') => void;
  onList?: (type: 'bullet' | 'ordered') => void;
  // Insert
  onInsertImage?: () => void;
  onInsertTable?: () => void;
  // History
  onUndo?: () => void;
  onRedo?: () => void;
  // File
  onSave?: () => void;
  onOpen?: () => void;
  onUpload?: () => void;
  onDownload?: () => void;
  // AI / Write
  onParaphrase?: () => void;
  onGrammarCheck?: () => void;
  onToneCheck?: () => void;
  onRewrite?: () => void;
  onRunAnalysis?: () => void;
  // Export
  onExportDocx?: () => void;
  onExportPdf?: () => void;
  // Other
  onSettings?: () => void;
  // Active states
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrike?: boolean;
  isHighlight?: boolean;
  isCode?: boolean;
  isBlockquote?: boolean;
  isHeading?: (level: number) => boolean;
  isAlign?: (align: string) => boolean;
  isBusy?: boolean;
  documentTitle?: string;
  className?: string;
  style?: CSSProperties;
}

const TABS: RibbonTab[] = [
  { id: 'file', label: 'File' },
  { id: 'write', label: 'Write' },
  { id: 'home', label: 'Home' },
  { id: 'academic', label: 'Academic' },
  { id: 'review', label: 'Review' },
  { id: 'export', label: 'Export' },
];

function RibbonBtn({
  icon: Icon, label, shortcut, onClick, disabled, active, variant = 'ghost',
}: RibbonButton & { variant?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      style={{
        display: 'inline-flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '2px', padding: '4px 8px', minWidth: '48px',
        border: active ? '1px solid var(--border-brand)' : '1px solid transparent',
        borderRadius: 'var(--r-sm)',
        background: active ? 'hsla(258, 75%, 55%, 0.15)' :
          variant === 'primary' ? 'var(--brand-500)' :
          variant === 'secondary' ? 'var(--bg-overlay)' : 'transparent',
        color: variant === 'primary' ? '#fff' :
          active ? 'var(--brand-300)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontSize: '10px', fontWeight: 500,
        transition: 'all var(--t-fast)',
      }}
    >
      <Icon size={16} />
      <span style={{ lineHeight: 1 }}>{label}</span>
    </button>
  );
}

function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--border-subtle)',
      paddingRight: '6px', marginRight: '6px',
    }}>
      <span style={{
        fontSize: '9px', color: 'var(--text-muted)',
        textAlign: 'center', marginBottom: '4px',
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-start' }}>
        {children}
      </div>
    </div>
  );
}

function QuickAccessBar({
  onSave, onUndo, onRedo, onSettings, documentTitle,
}: Pick<RibbonToolbarProps, 'onSave' | 'onUndo' | 'onRedo' | 'onSettings' | 'documentTitle'>) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '2px 12px', minHeight: '28px',
      background: 'var(--bg-base)', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        paddingRight: '12px', borderRight: '1px solid var(--border-subtle)',
      }}>
        <FileText size={16} color="var(--brand-400)" />
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>OTIF</span>
      </div>
      <button onClick={onSave} title="Save (Ctrl+S)" style={quickBtn}><Save size={14} /></button>
      <button onClick={onUndo} title="Undo (Ctrl+Z)" style={quickBtn}><RotateCcw size={14} /></button>
      <button onClick={onRedo} title="Redo (Ctrl+Y)" style={quickBtn}><RotateCw size={14} /></button>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
        {documentTitle || 'Untitled Document'}
      </span>
      <span style={{ flex: 1 }} />
      <button title="Settings" onClick={onSettings} style={quickBtn}><Settings size={14} /></button>
    </div>
  );
}

const quickBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '28px', height: '24px', padding: 0,
  background: 'transparent', border: 'none', borderRadius: 'var(--r-sm)',
  color: 'var(--text-secondary)', cursor: 'pointer',
};

export function RibbonToolbar({
  activeTab = 'home', onTabChange,
  onBold, onItalic, onUnderline, onStrike, onHighlight, onCode, onBlockquote,
  onHeading, onAlign, onList,
  onInsertImage, onInsertTable,
  onUndo, onRedo, onSave, onOpen, onUpload,
  onParaphrase, onGrammarCheck, onToneCheck, onRewrite, onRunAnalysis,
  onExportDocx, onExportPdf, onSettings,
  isBold, isItalic, isUnderline, isStrike, isHighlight, isCode, isBlockquote,
  isHeading, isAlign,
  isBusy, documentTitle, className = '', style,
}: RibbonToolbarProps) {
  const [tab, setTab] = useState<RibbonTabId>(activeTab);

  const switchTab = useCallback((newTab: RibbonTabId) => {
    setTab(newTab);
    onTabChange?.(newTab);
  }, [onTabChange]);

  const headingActive = isHeading ?? (() => false);
  const alignActive = isAlign ?? (() => false);

  return (
    <div className={className} style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-raised)',
      borderBottom: '1px solid var(--border-default)',
      ...style,
    }}>
      <QuickAccessBar onSave={onSave} onUndo={onUndo} onRedo={onRedo} documentTitle={documentTitle} onSettings={onSettings} />

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, padding: '0 8px',
        background: 'var(--bg-overlay)', borderBottom: '1px solid var(--border-subtle)',
      }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => switchTab(t.id)} style={{
            padding: '6px 16px', fontSize: '12px', fontWeight: 600,
            border: 'none', borderBottom: tab === t.id ? '2px solid var(--brand-500)' : '2px solid transparent',
            background: tab === t.id ? 'var(--bg-raised)' : 'transparent',
            color: tab === t.id ? 'var(--brand-300)' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all var(--t-fast)',
          }}>
            {t.label}
          </button>
        ))}
        <span style={{ flex: 1, borderBottom: '2px solid transparent' }} />
      </div>

      {/* Ribbon content */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '4px',
        padding: '8px 12px', minHeight: '76px', background: 'var(--bg-raised)',
        overflowX: 'auto',
      }}>

        {/* ── FILE TAB ──────────────────────────────────── */}
        {tab === 'file' && (
          <>
            <RibbonGroup label="Document">
              <RibbonBtn icon={FolderOpen} label="Open" onClick={onOpen} />
              <RibbonBtn icon={Save} label="Save" shortcut="Ctrl+S" onClick={onSave} />
              <RibbonBtn icon={Upload} label="Import" onClick={onUpload} />
            </RibbonGroup>
            <RibbonGroup label="Export">
              <RibbonBtn icon={Download} label="DOCX" onClick={onExportDocx} />
              <RibbonBtn icon={FileOutput} label="PDF" onClick={onExportPdf} />
            </RibbonGroup>
          </>
        )}

        {/* ── WRITE TAB (document creation + insert) ────── */}
        {tab === 'write' && (
          <>
            <RibbonGroup label="Document">
              <RibbonBtn icon={FileText} label="New Doc" onClick={onOpen} />
              <RibbonBtn icon={FolderOpen} label="Open" onClick={onOpen} />
              <RibbonBtn icon={Upload} label="Import" onClick={onUpload} />
            </RibbonGroup>
            <RibbonGroup label="AI Write">
              <RibbonBtn icon={Sparkles} label="Write with AI" variant="primary" disabled={isBusy} onClick={onOpen} />
              <RibbonBtn icon={Wand2} label="Expand" disabled={isBusy} onClick={onParaphrase} />
            </RibbonGroup>
            <RibbonGroup label="Insert">
              <RibbonBtn icon={Image} label="Image" onClick={onInsertImage} />
              <RibbonBtn icon={Table2} label="Table" onClick={onInsertTable} />
              <RibbonBtn icon={Quote} label="Blockquote" onClick={onBlockquote} active={isBlockquote} />
            </RibbonGroup>
            <RibbonGroup label="Structure">
              <RibbonBtn icon={Heading1} label="Abstract" onClick={() => onHeading?.(1)} />
              <RibbonBtn icon={Heading2} label="Chapter" onClick={() => onHeading?.(2)} />
              <RibbonBtn icon={Heading3} label="Section" onClick={() => onHeading?.(3)} />
              <RibbonBtn icon={Heading4} label="Sub-sec" onClick={() => onHeading?.(4)} />
            </RibbonGroup>
            <RibbonGroup label="Lists">
              <RibbonBtn icon={List} label="Bullets" onClick={() => onList?.('bullet')} />
              <RibbonBtn icon={ListOrdered} label="Numbered" onClick={() => onList?.('ordered')} />
            </RibbonGroup>
          </>
        )}

        {/* ── HOME TAB (all formatting wired) ───────────── */}
        {tab === 'home' && (
          <>
            <RibbonGroup label="File">
              <RibbonBtn icon={FolderOpen} label="Open" onClick={onOpen} />
              <RibbonBtn icon={Save} label="Save" shortcut="Ctrl+S" onClick={onSave} />
              <RibbonBtn icon={Upload} label="Import" onClick={onUpload} />
            </RibbonGroup>
            <RibbonGroup label="Format">
              <RibbonBtn icon={Bold} label="Bold" shortcut="Ctrl+B" onClick={onBold} active={isBold} />
              <RibbonBtn icon={Italic} label="Italic" shortcut="Ctrl+I" onClick={onItalic} active={isItalic} />
              <RibbonBtn icon={Underline} label="Underline" shortcut="Ctrl+U" onClick={onUnderline} active={isUnderline} />
              <RibbonBtn icon={Strikethrough} label="Strike" onClick={onStrike} active={isStrike} />
              <RibbonBtn icon={Highlighter} label="Highlight" onClick={onHighlight} active={isHighlight} />
              <RibbonBtn icon={Code2} label="Code" onClick={onCode} active={isCode} />
            </RibbonGroup>
            <RibbonGroup label="Headings">
              <RibbonBtn icon={Heading1} label="H1" onClick={() => onHeading?.(1)} active={headingActive(1)} />
              <RibbonBtn icon={Heading2} label="H2" onClick={() => onHeading?.(2)} active={headingActive(2)} />
              <RibbonBtn icon={Heading3} label="H3" onClick={() => onHeading?.(3)} active={headingActive(3)} />
              <RibbonBtn icon={Heading4} label="H4" onClick={() => onHeading?.(4)} active={headingActive(4)} />
            </RibbonGroup>
            <RibbonGroup label="Paragraph">
              <RibbonBtn icon={AlignLeft} label="Left" onClick={() => onAlign?.('left')} active={alignActive('left')} />
              <RibbonBtn icon={AlignCenter} label="Center" onClick={() => onAlign?.('center')} active={alignActive('center')} />
              <RibbonBtn icon={AlignRight} label="Right" onClick={() => onAlign?.('right')} active={alignActive('right')} />
              <RibbonBtn icon={AlignJustify} label="Justify" onClick={() => onAlign?.('justify')} active={alignActive('justify')} />
              <RibbonBtn icon={List} label="Bullets" onClick={() => onList?.('bullet')} />
              <RibbonBtn icon={ListOrdered} label="Numbered" onClick={() => onList?.('ordered')} />
              <RibbonBtn icon={Quote} label="Blockquote" onClick={onBlockquote} active={isBlockquote} />
            </RibbonGroup>
            <RibbonGroup label="Insert">
              <RibbonBtn icon={Image} label="Image" onClick={onInsertImage} />
              <RibbonBtn icon={Table2} label="Table" onClick={onInsertTable} />
            </RibbonGroup>
          </>
        )}

        {/* ── ACADEMIC TAB ──────────────────────────────── */}
        {tab === 'academic' && (
          <>
            <RibbonGroup label="AI Tools">
              <RibbonBtn icon={Sparkles} label="Paraphrase" shortcut="Ctrl+Shift+P"
                onClick={onParaphrase} variant="primary" disabled={isBusy} />
              <RibbonBtn icon={Wand2} label="Rewrite" onClick={onRewrite} disabled={isBusy} />
              <RibbonBtn icon={BookOpen} label="Grammar" onClick={onGrammarCheck} disabled={isBusy} />
              <RibbonBtn icon={FlaskConical} label="Tone" onClick={onToneCheck} disabled={isBusy} />
            </RibbonGroup>
            <RibbonGroup label="Analysis">
              <RibbonBtn icon={ShieldCheck} label="Run Analysis"
                onClick={onRunAnalysis} variant="secondary" disabled={isBusy} />
              <RibbonBtn icon={Search} label="Similarity" disabled={isBusy} />
              <RibbonBtn icon={Sparkles} label="AI Detection" disabled={isBusy} />
            </RibbonGroup>
          </>
        )}

        {/* ── REVIEW TAB ────────────────────────────────── */}
        {tab === 'review' && (
          <>
            <RibbonGroup label="Changes">
              <RibbonBtn icon={CheckCircle2} label="Accept All" variant="primary" />
              <RibbonBtn icon={RotateCcw} label="Reject All" />
            </RibbonGroup>
            <RibbonGroup label="Comments">
              <RibbonBtn icon={Quote} label="Comment" />
              <RibbonBtn icon={Eye} label="Show All" />
            </RibbonGroup>
            <RibbonGroup label="AI Review">
              <RibbonBtn icon={Sparkles} label="AI Review" onClick={onRunAnalysis} disabled={isBusy} />
              <RibbonBtn icon={FileText} label="Compare" />
            </RibbonGroup>
          </>
        )}

        {/* ── EXPORT TAB ────────────────────────────────── */}
        {tab === 'export' && (
          <>
            <RibbonGroup label="Formats">
              <RibbonBtn icon={FileOutput} label="DOCX" onClick={onExportDocx} variant="primary" />
              <RibbonBtn icon={FileOutput} label="PDF" onClick={onExportPdf} variant="secondary" />
            </RibbonGroup>
            <RibbonGroup label="Options">
              <RibbonBtn icon={CheckCircle2} label="+ Certificate" />
              <RibbonBtn icon={ShieldCheck} label="+ Audit Trail" />
              <RibbonBtn icon={BookOpen} label="+ TOC/LOT" />
            </RibbonGroup>
          </>
        )}
      </div>
    </div>
  );
}

export { TABS };
export type { RibbonTabId, RibbonToolbarProps };
