const DESKTOP_API_BASE = 'http://127.0.0.1:18765/api/v1';

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

// Always point at the local backend sidecar.
// In Tauri desktop: backend is on 18765.
// In browser dev mode: same backend (started via npm run web:dev or desktop:dev) is on 18765.
// VITE_API_BASE env var can override for custom setups.
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? DESKTOP_API_BASE;

export { isTauriRuntime };

