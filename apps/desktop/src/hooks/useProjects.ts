import { useState, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import type { Project, ThreadMessage, Discovery } from '../types';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const res = await axios.get<{ projects: Project[] }>(`${API_BASE}/projects/`);
      setProjects(res.data.projects);
    } catch { /* backend may be starting */ }
  }, []);

  const loadThread = useCallback(async (projectId: string, onRestoreSnapshot?: (msg: ThreadMessage) => void) => {
    try {
      const res = await axios.get<{ messages: ThreadMessage[] }>(`${API_BASE}/projects/${projectId}/thread`);
      setThread(res.data.messages);
      const latestAnalysis = [...res.data.messages].reverse().find(
        (m) => m.message_type === 'analysis_result' && typeof m.content === 'object' && m.content !== null && 'scores' in m.content,
      );
      if (latestAnalysis && onRestoreSnapshot) {
        onRestoreSnapshot(latestAnalysis);
      }
    } catch { /* non-fatal */ }
  }, []);

  const loadDiscoveries = useCallback(async (projectId: string) => {
    try {
      const res = await axios.get<{ discoveries: Discovery[] }>(`${API_BASE}/projects/${projectId}/discoveries`);
      setDiscoveries(res.data.discoveries);
    } catch { /* non-fatal */ }
  }, []);

  const createProject = useCallback(async (name: string, docType: string, norm: string) => {
    setIsBusy(true);
    try {
      const res = await axios.post<Project>(`${API_BASE}/projects/`, { name, doc_type: docType, norm });
      setProjects((prev) => [res.data, ...prev]);
      return res.data;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    await axios.delete(`${API_BASE}/projects/${projectId}`);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }, []);

  return {
    projects, setProjects, currentProject, setCurrentProject,
    thread, setThread, discoveries, setDiscoveries, isBusy,
    loadProjects, loadThread, loadDiscoveries, createProject, deleteProject,
  };
}
