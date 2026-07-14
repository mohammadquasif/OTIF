import type { CSSProperties } from 'react';
import {
  BookOpen, Wifi, WifiOff, Sparkles, Save, CheckCircle2,
  Clock, FileText, type LucideIcon,
} from 'lucide-react';

interface StatusBarProps {
  wordCount?: number;
  chapterTitle?: string;
  autoSaveStatus?: 'saved' | 'saving' | 'idle';
  lastSavedAt?: string | null;
  aiProvider?: string;
  aiModel?: string | null;
  isOnline?: boolean;
  skillCount?: number;
  className?: string;
  style?: CSSProperties;
}

function StatusItem({ icon: Icon, label, value }: { icon: LucideIcon; label?: string; value: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '11px', color: 'var(--text-muted)',
      padding: '0 8px',
    }}>
      <Icon size={12} />
      {label && <span style={{ opacity: 0.7 }}>{label}</span>}
      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{value}</span>
    </span>
  );
}

export function StatusBar({
  wordCount = 0, chapterTitle, autoSaveStatus = 'idle',
  lastSavedAt, aiProvider, aiModel, isOnline = true,
  skillCount = 0, className = '', style,
}: StatusBarProps) {
  const saveIcon: LucideIcon = autoSaveStatus === 'saving' ? Clock :
    autoSaveStatus === 'saved' ? CheckCircle2 : Save;
  const saveLabel = autoSaveStatus === 'saving' ? 'Saving...' :
    autoSaveStatus === 'saved' ? 'Saved' : '';

  const providerLabel = aiModel
    ? `${aiProvider ?? 'AI'}/${aiModel}`
    : (aiProvider ?? 'No AI');

  return (
    <div className={className} style={{
      display: 'flex', alignItems: 'center', gap: '2px',
      padding: '2px 8px',
      background: 'var(--bg-overlay)',
      borderTop: '1px solid var(--border-subtle)',
      minHeight: '24px', maxHeight: '26px',
      fontSize: '11px', color: 'var(--text-muted)',
      userSelect: 'none',
      ...style,
    }}>
      {/* Left */}
      <StatusItem icon={FileText} value={chapterTitle ?? 'Document'} />
      <span style={{ color: 'var(--border-strong)', margin: '0 2px' }}>|</span>
      <StatusItem icon={BookOpen} value={`${wordCount.toLocaleString()} words`} />

      <span style={{ flex: 1 }} />

      {/* Center-right */}
      {autoSaveStatus !== 'idle' && (
        <>
          <StatusItem icon={saveIcon} label={saveLabel} value={lastSavedAt ?? ''} />
          <span style={{ color: 'var(--border-strong)', margin: '0 2px' }}>|</span>
        </>
      )}

      <StatusItem icon={Sparkles} value={providerLabel} />

      <span style={{ color: 'var(--border-strong)', margin: '0 2px' }}>|</span>

      {/* Right */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: '11px', padding: '0 8px',
      }}>
        {isOnline ? (
          <Wifi size={12} color="var(--score-excellent)" />
        ) : (
          <WifiOff size={12} color="var(--text-muted)" />
        )}
        <span style={{ color: isOnline ? 'var(--score-excellent)' : 'var(--text-muted)', fontWeight: 500 }}>
          {isOnline ? `${skillCount} skills` : 'Offline'}
        </span>
      </span>
    </div>
  );
}
