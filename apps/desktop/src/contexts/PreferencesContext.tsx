import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';

interface PreferencesContextValue {
  get: (key: string, fallback?: string) => string;
  set: (key: string, value: string) => Promise<void>;
  getAll: () => Record<string, string>;
  loadFromServer: () => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  get: () => '',
  set: async () => {},
  getAll: () => ({}),
  loadFromServer: async () => {},
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('otif-preferences');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  const persist = useCallback((updated: Record<string, string>) => {
    setPrefs(updated);
    try { localStorage.setItem('otif-preferences', JSON.stringify(updated)); } catch { /* noop */ }
  }, []);

  const get = useCallback((key: string, fallback = '') => prefs[key] ?? fallback, [prefs]);

  const set = useCallback(async (key: string, value: string) => {
    const updated = { ...prefs, [key]: value };
    persist(updated);
    try { await axios.put(`${API_BASE}/writing-assistant/preferences/${key}?value=${encodeURIComponent(value)}`); } catch { /* non-critical */ }
  }, [prefs, persist]);

  const getAll = useCallback(() => prefs, [prefs]);

  const loadFromServer = useCallback(async () => {
    try {
      const res = await axios.get<{ preferences: Record<string, string> }>(`${API_BASE}/writing-assistant/preferences`);
      if (res.data.preferences && Object.keys(res.data.preferences).length > 0) {
        persist({ ...prefs, ...res.data.preferences });
      }
    } catch { /* non-critical */ }
  }, [prefs, persist]);

  return (
    <PreferencesContext.Provider value={{ get, set, getAll, loadFromServer }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
