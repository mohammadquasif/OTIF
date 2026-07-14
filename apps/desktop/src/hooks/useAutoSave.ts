import { useEffect, useRef, useCallback } from 'react';

interface AutoSaveOptions {
  content: string;
  documentTitle: string;
  docId: string | null;
  delay?: number;    // ms debounce, default 2000
  enabled?: boolean;
  onSave?: () => void;
  onStatusChange?: (status: 'saved' | 'saving' | 'idle') => void;
}

const STORAGE_KEY = 'otif-autosave';

interface SavedState {
  content: string;
  title: string;
  docId: string | null;
  savedAt: string;
  wordCount: number;
}

export function useAutoSave({
  content, documentTitle, docId,
  delay = 2000, enabled = true,
  onSave, onStatusChange,
}: AutoSaveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastContentRef = useRef(content);

  const save = useCallback(() => {
    if (!enabled) return;
    onStatusChange?.('saving');

    const state: SavedState = {
      content,
      title: documentTitle,
      docId,
      savedAt: new Date().toISOString(),
      wordCount: content.split(/\s+/).filter(Boolean).length,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      onStatusChange?.('saved');
      onSave?.();
      setTimeout(() => onStatusChange?.('idle'), 2500);
      lastContentRef.current = content;
    } catch (err) {
      console.warn('Auto-save failed:', err);
      onStatusChange?.('idle');
    }
  }, [content, documentTitle, docId, enabled, onSave, onStatusChange]);

  useEffect(() => {
    if (!enabled) return;
    if (content === lastContentRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, delay, enabled, save]);

  // Force save immediately
  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    save();
  }, [save]);

  return { save, saveNow };
}

export function loadAutoSave(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as SavedState;
    // Only restore if saved within last 7 days
    const age = Date.now() - new Date(state.savedAt).getTime();
    if (age > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearAutoSave() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
