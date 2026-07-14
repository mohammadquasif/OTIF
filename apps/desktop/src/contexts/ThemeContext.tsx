import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  toggle: () => {},
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem('otif-theme');
      return stored === 'light' ? 'light' : 'dark';
    } catch { return 'dark'; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem('otif-theme', mode); } catch { /* noop */ }
  }, [mode]);

  const toggle = useCallback(() => setModeState((m) => (m === 'dark' ? 'light' : 'dark')), []);
  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);

  return (
    <ThemeContext.Provider value={{ mode, toggle, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
