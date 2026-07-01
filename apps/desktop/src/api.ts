const DESKTOP_API_BASE = 'http://127.0.0.1:18765/api/v1';
const BROWSER_API_BASE = 'http://localhost:8000/api/v1';

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

export const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (isTauriRuntime() || !import.meta.env.DEV ? DESKTOP_API_BASE : BROWSER_API_BASE);
