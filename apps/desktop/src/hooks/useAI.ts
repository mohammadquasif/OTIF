import { useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import type { AISettings, AIStatus, ProviderOption, ConnectionResult } from '../types';

export function useAI() {
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiDraft, setAiDraft] = useState<AISettings | null>(null);
  const [connectionResults, setConnectionResults] = useState<Record<string, ConnectionResult>>({});
  const [isBusy, setIsBusy] = useState(false);

  const activeProvider = useMemo(
    () => aiStatus?.providers.find((p: ProviderOption) => p.id === aiDraft?.provider) ?? null,
    [aiStatus, aiDraft],
  );

  const inactiveProviders = useMemo(
    () => aiStatus?.providers.filter((p: ProviderOption) => p.id !== aiDraft?.provider) ?? [],
    [aiStatus, aiDraft],
  );

  const refreshAI = useCallback(async () => {
    try {
      const aiRes = await axios.get<AIStatus>(`${API_BASE}/ai/status`);
      setAiStatus(aiRes.data);
      setAiDraft(aiRes.data.settings);
    } catch { /* backend not ready */ }
  }, []);

  const saveAiSettings = useCallback(async () => {
    if (!aiDraft) return;
    setIsBusy(true);
    try {
      const res = await axios.put<Pick<AIStatus, 'settings' | 'providers'>>(`${API_BASE}/ai/settings`, aiDraft);
      setAiStatus((prev: AIStatus | null) => prev ? { ...prev, settings: res.data.settings, providers: res.data.providers } : prev);
      setAiDraft(res.data.settings);
      return { success: true };
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Could not save AI settings.';
      return { success: false, message: String(message) };
    } finally {
      setIsBusy(false);
    }
  }, [aiDraft]);

  const testProvider = useCallback(async (providerId: ProviderOption['id']) => {
    try {
      const res = await axios.post<ConnectionResult>(`${API_BASE}/ai/test/${providerId}`);
      setConnectionResults((prev) => ({ ...prev, [providerId]: res.data }));
      return res.data;
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.message : 'Connection test failed.';
      const result: ConnectionResult = { provider: providerId, ok: false, message: String(message), models_seen: [] };
      setConnectionResults((prev) => ({ ...prev, [providerId]: result }));
      return result;
    }
  }, []);

  return {
    aiStatus, setAiStatus, aiDraft, setAiDraft, connectionResults,
    activeProvider, inactiveProviders, isBusy, refreshAI, saveAiSettings, testProvider,
  };
}
