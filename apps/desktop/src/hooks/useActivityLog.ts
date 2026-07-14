import { useState, useCallback } from 'react';

type DiagnosticLevel = 'info' | 'success' | 'warning' | 'error';

interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  level: DiagnosticLevel;
  action: string;
  message: string;
  details?: string;
}

export function useActivityLog() {
  const [showLog, setShowLog] = useState(false);
  const [entries, setEntries] = useState<DiagnosticLogEntry[]>([]);

  const addEntry = useCallback((level: DiagnosticLevel, action: string, message: string, details?: unknown) => {
    if (level === 'error') setShowLog(true);
    const entry: DiagnosticLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      level,
      action,
      message,
      details: typeof details === 'string' ? details : details ? JSON.stringify(details, null, 2) : undefined,
    };
    setEntries((prev) => [entry, ...prev].slice(0, 200));
  }, []);

  const formatLog = useCallback(() =>
    entries.map((e) => {
      const lines = [`[${e.timestamp}] ${e.level.toUpperCase()} ${e.action}`, e.message];
      if (e.details) lines.push(e.details);
      return lines.join('\n');
    }).join('\n\n---\n\n'),
  [entries]);

  const copyLog = useCallback(async () => {
    const content = formatLog() || 'No activity log entries yet.';
    try {
      await navigator.clipboard.writeText(content);
      addEntry('success', 'activity_log.copy', 'Activity log copied to clipboard.');
    } catch (err) {
      addEntry('error', 'activity_log.copy', 'Could not copy activity log.', err instanceof Error ? err.message : String(err));
    }
  }, [addEntry, formatLog]);

  const downloadLog = useCallback(() => {
    const content = formatLog() || 'No activity log entries yet.';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OTIF_activity_log_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    addEntry('success', 'activity_log.download', 'Activity log download started.');
  }, [addEntry, formatLog]);

  return { showLog, setShowLog, entries, addEntry, formatLog, copyLog, downloadLog };
}
