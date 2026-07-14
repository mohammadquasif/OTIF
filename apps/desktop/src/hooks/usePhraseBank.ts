import { useState, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import type { PhraseBankResponse } from '../types';

interface PhraseFavorite {
  id: string;
  category_id: string;
  phrase_text: string;
  created_at: string;
}

export function usePhraseBank() {
  const [phraseBank, setPhraseBank] = useState<PhraseBankResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<PhraseFavorite[]>([]);

  const loadPhraseBank = useCallback(async (search?: string, category?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      const qs = params.toString();
      const res = await axios.get<PhraseBankResponse>(`${API_BASE}/writing-assistant/phrasebank${qs ? `?${qs}` : ''}`);
      setPhraseBank(res.data);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Failed to load phrase bank.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const res = await axios.get<{ favorites: PhraseFavorite[] }>(`${API_BASE}/writing-assistant/favorites`);
      setFavorites(res.data.favorites);
    } catch { /* non-fatal */ }
  }, []);

  const addFavorite = useCallback(async (categoryId: string, phraseText: string) => {
    try {
      await axios.post(`${API_BASE}/writing-assistant/favorites`, { category_id: categoryId, phrase_text: phraseText });
      await loadFavorites();
      return true;
    } catch { return false; }
  }, [loadFavorites]);

  const removeFavorite = useCallback(async (categoryId: string, phraseText: string) => {
    try {
      await axios.delete(`${API_BASE}/writing-assistant/favorites`, { data: { category_id: categoryId, phrase_text: phraseText } });
      await loadFavorites();
      return true;
    } catch { return false; }
  }, [loadFavorites]);

  const logPhraseUsage = useCallback(async (category: string, text: string) => {
    try {
      await axios.post(`${API_BASE}/writing-assistant/log-usage`, { phrase_category: category, phrase_text: text });
    } catch { /* fire and forget */ }
  }, []);

  return {
    phraseBank, isLoading, error, favorites,
    loadPhraseBank, loadFavorites, addFavorite, removeFavorite, logPhraseUsage,
  };
}
