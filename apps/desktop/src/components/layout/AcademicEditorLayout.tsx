import { useState, type ReactNode, type CSSProperties } from 'react';
import {
  PanelLeftClose, PanelLeft, BookOpen,
} from 'lucide-react';
import { RibbonToolbar, type RibbonTabId } from './RibbonToolbar';
import { StatusBar } from './StatusBar';
import { AcademicSidebar } from '../sidebar/AcademicSidebar';
import type { ImprovementItem, PreflightScores } from '../../types';

interface AcademicEditorLayoutProps {
  // Document metadata
  documentTitle?: string;
  chapterTitle?: string;
  wordCount?: number;

  // Sidebar callbacks
  onInsertPhrase?: (phrase: string) => void;
  onParaphrase?: () => void;
  isParaphrasing?: boolean;
  onGrammarCheck?: () => void;
  onToneCheck?: () => void;
  isAiBusy?: boolean;
  onRunAnalysis?: () => void;
  isAnalyzing?: boolean;

  // Ribbon extra formatting
  onStrike?: () => void;
  onHighlight?: () => void;
  onCode?: () => void;
  onBlockquote?: () => void;
  onInsertImage?: () => void;
  onInsertTable?: () => void;
  isStrike?: boolean;
  isHighlight?: boolean;
  isCode?: boolean;
  isBlockquote?: boolean;

  // Analysis data (passed through to sidebar)
  scores?: PreflightScores | null;
  improvementPlan?: ImprovementItem[];
  approvedImprovementIds?: string[];
  onToggleApproval?: (itemId: string) => void;
  onApproveAll?: () => void;

  // Ribbon callbacks
  onBold?: () => void;
  onItalic?: () => void;
  onUnderline?: () => void;
  onHeading?: (level: 1 | 2 | 3 | 4) => void;
  onAlign?: (align: 'left' | 'center' | 'right' | 'justify') => void;
  onList?: (type: 'bullet' | 'ordered') => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onOpen?: () => void;
  onUpload?: () => void;
  onExportDocx?: () => void;
  onExportPdf?: () => void;
  onRewrite?: () => void;
  onSettings?: () => void;

  // Editor state
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isHeading?: (level: number) => boolean;
  isAlign?: (align: string) => boolean;
  isBusy?: boolean;

  // Status bar
  autoSaveStatus?: 'saved' | 'saving' | 'idle';
  lastSavedAt?: string | null;
  aiProvider?: string;
  aiModel?: string | null;
  isOnline?: boolean;
  skillCount?: number;

  // Document
  activeDocId?: string | null;

  // Children (the editor content)
  children: ReactNode;

  className?: string;
  style?: CSSProperties;
}

export function AcademicEditorLayout({
  documentTitle, chapterTitle, wordCount,
  onInsertPhrase, onParaphrase, isParaphrasing, onGrammarCheck, onToneCheck, isAiBusy,
  onRunAnalysis, isAnalyzing,
  scores, improvementPlan, approvedImprovementIds,
  onToggleApproval, onApproveAll,
  onBold, onItalic, onUnderline, onStrike, onHighlight, onCode, onBlockquote,
  onHeading, onAlign, onList,
  onInsertImage, onInsertTable,
  onUndo, onRedo, onSave, onOpen, onUpload,
  onExportDocx, onExportPdf, onRewrite, onSettings,
  isBold, isItalic, isUnderline, isStrike, isHighlight, isCode, isBlockquote,
  isHeading, isAlign, isBusy,
  autoSaveStatus, lastSavedAt, aiProvider, aiModel,
  isOnline, skillCount,
  activeDocId: _activeDocId,
  children, className = '', style,
}: AcademicEditorLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTabId>('home');

  return (
    <div className={className} style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: 'var(--bg-base)', overflow: 'hidden',
      ...style,
    }}>
      {/* ── Ribbon ──────────────────────────────────────── */}
      <RibbonToolbar
        activeTab={activeRibbonTab}
        onTabChange={setActiveRibbonTab}
        onBold={onBold} onItalic={onItalic} onUnderline={onUnderline}
        onStrike={onStrike} onHighlight={onHighlight} onCode={onCode} onBlockquote={onBlockquote}
        onHeading={onHeading} onAlign={onAlign} onList={onList}
        onInsertImage={onInsertImage} onInsertTable={onInsertTable}
        onUndo={onUndo} onRedo={onRedo}
        onSave={onSave} onOpen={onOpen} onUpload={onUpload}
        onParaphrase={onParaphrase} onGrammarCheck={onGrammarCheck} onToneCheck={onToneCheck}
        onRewrite={onRewrite}
        onRunAnalysis={onRunAnalysis}
        onExportDocx={onExportDocx} onExportPdf={onExportPdf} onSettings={onSettings}
        isBold={isBold} isItalic={isItalic} isUnderline={isUnderline}
        isStrike={isStrike} isHighlight={isHighlight} isCode={isCode} isBlockquote={isBlockquote}
        isHeading={isHeading} isAlign={isAlign}
        isBusy={isBusy}
        documentTitle={documentTitle}
      />

      {/* ── Main Body: Editor + Sidebar ──────────────────── */}
      <div style={{
        display: 'flex', flex: 1, overflow: 'hidden',
      }}>
        {/* Document area */}
        <div style={{
          flex: 1, overflow: 'auto',
          background: 'var(--bg-base)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Toolbar strip above document */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 16px',
            background: 'var(--bg-raised)',
            borderBottom: '1px solid var(--border-subtle)',
            minHeight: '32px',
          }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '2px 8px', fontSize: '11px', fontWeight: 500,
                background: 'transparent', border: 'none',
                borderRadius: 'var(--r-sm)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
              {sidebarOpen ? 'Hide' : 'Sidebar'}
            </button>

            <span style={{ flex: 1 }} />

            {/* Chapter indicator */}
            {chapterTitle && (
              <span style={{
                fontSize: '11px', color: 'var(--text-muted)',
                padding: '2px 8px', background: 'var(--bg-overlay)',
                borderRadius: 'var(--r-sm)',
              }}>
                <BookOpen size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                {chapterTitle}
              </span>
            )}
          </div>

          {/* Scrollable editor content */}
          <div style={{
            flex: 1, overflow: 'auto',
            padding: '24px 32px',
          }}>
            {/* Paper-like container */}
            <div style={{
              maxWidth: '816px', margin: '0 auto',
              background: '#ffffff',
              boxShadow: '0 1px 6px hsla(225, 30%, 5%, 0.5)',
              borderRadius: '2px',
              minHeight: 'calc(100% - 48px)',
              color: '#1a1a1a',
            }}>
              {children}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div style={{
            width: '320px', minWidth: '280px', maxWidth: '360px',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <AcademicSidebar
              onInsertPhrase={onInsertPhrase ?? (() => {})}
              onParaphrase={onParaphrase}
              isParaphrasing={isParaphrasing}
              onGrammarCheck={onGrammarCheck}
              onToneCheck={onToneCheck}
              isAiBusy={isAiBusy}
              onRunAnalysis={onRunAnalysis}
              isAnalyzing={isAnalyzing}
              scores={scores}
              improvementPlan={improvementPlan}
              approvedImprovementIds={approvedImprovementIds}
              onToggleApproval={onToggleApproval}
              onApproveAll={onApproveAll}
            />
          </div>
        )}
      </div>

      {/* ── Status Bar ───────────────────────────────────── */}
      <StatusBar
        wordCount={wordCount}
        chapterTitle={chapterTitle}
        autoSaveStatus={autoSaveStatus}
        lastSavedAt={lastSavedAt}
        aiProvider={aiProvider}
        aiModel={aiModel}
        isOnline={isOnline}
        skillCount={skillCount}
      />
    </div>
  );
}
