import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import axios from 'axios';
import {
  Activity,
  AlertCircle,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Cloud,
  CloudOff,
  Database,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  GlobeLock,
  KeyRound,
  PlusCircle,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Wifi,
  WifiOff,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { API_BASE } from './api';

// ─────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────

interface SkillSummary {
  skill_id: string;
  name: string;
  category: string;
  version: string;
  description: string;
  rule_count: number;
  word_list_count: number;
}

interface SkillEngineStatus {
  cache: {
    loaded: boolean;
    skill_count: number;
    loaded_at: string | null;
    skills: Array<{
      skill_id: string;
      name: string;
      category: string;
      version: string;
      rules: number;
      word_entries: number;
    }>;
  };
  pending_events: number;
  pending_discoveries: number;
  session_id: string | null;
  contribute_anonymous: boolean;
}

interface SkillStatus {
  neon_connected: boolean;
  skill_engine: SkillEngineStatus;
  pending_updates: unknown[];
  update_count: number;
}

interface ModelOption {
  id: string;
  label: string;
  use_case: string;
  context?: string | null;
  local: boolean;
}

interface ProviderOption {
  id: 'ollama' | 'deepseek' | 'gemini' | 'openai';
  name: string;
  mode: 'local' | 'cloud';
  configured: boolean;
  default_model: string;
  models: ModelOption[];
  notes: string;
}

interface PrivacyMode {
  id: string;
  label: string;
  cloud_allowed: boolean;
}

interface AISettings {
  privacy_mode: string;
  provider: ProviderOption['id'];
  model_by_provider: Record<string, string>;
  api_keys: Record<string, string>;
  ollama_base_url: string | null;
}

interface AIStatus {
  settings: AISettings;
  active_provider: ProviderOption['id'];
  active_model: string | null;
  providers: ProviderOption[];
  privacy_modes: PrivacyMode[];
  model_sources: Record<string, string>;
}

interface ConnectionResult {
  provider: ProviderOption['id'];
  ok: boolean;
  message: string;
  models_seen: string[];
}

interface UploadResult {
  doc_id: string;
  filename: string;
  size_bytes: number;
  path: string;
  message: string;
  privacy_note: string;
  project_id?: string;
}

type PreflightScores = Record<string, number | string | null>;

interface Finding {
  word: string;
  replacement: string | null;
  severity: string;
  count: number;
}

interface ImprovementItem {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  action: string;
  evidence: string;
  requires_ai: boolean;
  chapter_id?: string;
}

interface ChapterResult {
  id: string;
  title: string;
  metrics: Record<string, number>;
  scores: PreflightScores;
  findings: Finding[];
}

interface ResearchSourceResult {
  id: string;
  name: string;
  status: 'checked' | 'unavailable' | 'skipped';
  message: string;
  matches: Array<{ title: string; url: string | null; year: string | number | null }>;
}

interface ResearchSourcesReport {
  internet_checked: boolean;
  queries: string[];
  sources: ResearchSourceResult[];
}

interface StreamEvent {
  stage: string;
  message?: string;
  scores?: PreflightScores;
  findings?: Finding[];
  limitations?: string[];
  coverage?: Record<string, unknown>;
  improvement_plan?: ImprovementItem[];
  chapters?: ChapterResult[];
  research_sources?: ResearchSourcesReport;
  formatting_plan?: Record<string, unknown>;
  count?: number;
  skill?: string;
  category?: string;
  requires_approval?: boolean;
  gate?: string;
}

interface RewriteApprovalResult {
  doc_id: string;
  approved_items: ImprovementItem[];
  active_provider: ProviderOption['id'];
  active_model: string | null;
  privacy_mode: string;
  rewrite_status: string;
  rewrite_preview: string | null;
  rewrite_note: string;
  document_actions: Record<string, unknown>;
  next_step: string;
}

interface DiagramResult {
  diagram_id: string;
  mermaid_source: string;
  themed_source: string;
  caption: string;
  figure_number: string;
  design_elements: Record<string, unknown>;
  requires_approval: boolean;
}

// ─── Project / Thread interfaces ─────────────────────────────────
interface Project {
  id: string;
  name: string;
  doc_type: string;
  norm: string;
  doc_id: string | null;
  filename: string | null;
  created_at: string;
  updated_at: string;
  skill_sync_at: string | null;
}

interface ThreadMessage {
  id: string;
  project_id: string;
  role: string;
  message_type: string;
  content: Record<string, unknown> | string;
  created_at: string;
}

interface Discovery {
  id: string;
  project_id: string;
  skill_id: string;
  description: string;
  confidence: number;
  user_approved: number;
  pushed_at: string | null;
  discovered_at: string;
}

type TabId = 'projects' | 'analyze' | 'skills' | 'community' | 'settings';

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const docTypeOptions = [
  { id: 'thesis', label: 'Thesis' },
  { id: 'dissertation', label: 'Dissertation' },
  { id: 'research_paper', label: 'Research Paper' },
  { id: 'journal_article', label: 'Journal Article' },
  { id: 'conference_paper', label: 'Conference Paper' },
  { id: 'literature_review', label: 'Literature Review' },
  { id: 'research_proposal', label: 'Research Proposal' },
  { id: 'technical_report', label: 'Technical Report' },
];

const targetFormatOptions = [
  { id: 'ugc', label: 'UGC Thesis' },
  { id: 'apa7', label: 'APA 7' },
  { id: 'ieee', label: 'IEEE' },
  { id: 'harvard', label: 'Harvard' },
  { id: 'springer', label: 'Springer' },
  { id: 'elsevier', label: 'Elsevier' },
  { id: 'european_thesis', label: 'European Thesis' },
];

const diagramStyleOptions = [
  { id: 'academic', label: 'Academic (Top-Down)' },
  { id: 'method_flow', label: 'Method Flow (Left-Right)' },
  { id: 'conceptual_model', label: 'Conceptual Model' },
];

const designThemeOptions = [
  { id: 'classic_blue', label: 'Classic Blue' },
  { id: 'mono_formal', label: 'Mono Formal' },
  { id: 'emerald_academic', label: 'Emerald Academic' },
  { id: 'maroon_submission', label: 'Maroon Submission' },
];

const THREAD_ICON: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  upload:           { icon: UploadCloud, label: 'Upload',         color: 'var(--accent-cyan)' },
  analysis_result:  { icon: Activity,    label: 'Analysis',       color: 'var(--brand-400)' },
  improvement_plan: { icon: Zap,         label: 'Plan',           color: '#f59e0b' },
  rewrite_diff:     { icon: GitBranch,   label: 'Rewrite',        color: '#8b5cf6' },
  diagram_generated:{ icon: BrainCircuit,label: 'Diagram',        color: '#10b981' },
  skill_sync:       { icon: RefreshCw,   label: 'Skill Sync',     color: 'var(--accent-green)' },
  approval:         { icon: CheckCircle2,label: 'Approved',       color: '#22c55e' },
  error:            { icon: AlertCircle, label: 'Error',          color: '#ef4444' },
};

// ─────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('projects');

  // ── System status ──────────────────────────────────────────────
  const [status, setStatus] = useState<SkillStatus | null>(null);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiDraft, setAiDraft] = useState<AISettings | null>(null);
  const [connectionResults, setConnectionResults] = useState<Record<string, ConnectionResult>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contributeEnabled, setContributeEnabled] = useState(true);

  // ── Projects ───────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDocType, setNewProjectDocType] = useState('thesis');
  const [newProjectNorm, setNewProjectNorm] = useState('apa7');
  const [showCreateProject, setShowCreateProject] = useState(false);

  // ── Analysis state (within a project) ─────────────────────────
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [scores, setScores] = useState<PreflightScores | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [docType, setDocType] = useState('thesis');
  const [targetFormat, setTargetFormat] = useState('ugc');
  const [improvementPlan, setImprovementPlan] = useState<ImprovementItem[]>([]);
  const [approvedImprovementIds, setApprovedImprovementIds] = useState<string[]>([]);
  const [approvalResult, setApprovalResult] = useState<RewriteApprovalResult | null>(null);
  const [chapterResults, setChapterResults] = useState<ChapterResult[]>([]);
  const [researchSources, setResearchSources] = useState<ResearchSourcesReport | null>(null);
  const [drawDiagrams, setDrawDiagrams] = useState(false);
  const [diagramStyle, setDiagramStyle] = useState('academic');
  const [designTheme, setDesignTheme] = useState('classic_blue');
  const [outputFormats, setOutputFormats] = useState<string[]>(['docx', 'pdf']);
  const [diagramResult, setDiagramResult] = useState<DiagramResult | null>(null);
  const [editedMermaid, setEditedMermaid] = useState('');
  const [editingDiagram, setEditingDiagram] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // ─────────────────────────────────────────────────────────────
  // Computed
  // ─────────────────────────────────────────────────────────────

  const skillCount = status?.skill_engine.cache.skill_count ?? skills.length;
  const ruleCount = useMemo(
    () => status?.skill_engine.cache.skills.reduce((sum, skill) => sum + skill.rules, 0) ?? 0,
    [status],
  );
  const wordListCount = useMemo(
    () => status?.skill_engine.cache.skills.reduce((sum, skill) => sum + skill.word_entries, 0) ?? 0,
    [status],
  );
  const activeProvider = aiStatus?.providers.find((p) => p.id === aiDraft?.provider) ?? null;
  const inactiveProviders = aiStatus?.providers.filter((p) => p.id !== aiDraft?.provider) ?? [];
  const neonConnected = status?.neon_connected ?? false;

  // ─────────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────────

  const refreshData = useCallback(async () => {
    setError(null);
    try {
      const [statusRes, skillsRes] = await Promise.all([
        axios.get<SkillStatus>(`${API_BASE}/skills/status`),
        axios.get<{ skills: SkillSummary[] }>(`${API_BASE}/skills/`),
      ]);
      setStatus(statusRes.data);
      setSkills(skillsRes.data.skills);
      const aiRes = await axios.get<AIStatus>(`${API_BASE}/ai/status`);
      setAiStatus(aiRes.data);
      setAiDraft(aiRes.data.settings);
    } catch {
      setError('Backend is not reachable. Start FastAPI on port 8000 and refresh.');
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const res = await axios.get<{ projects: Project[] }>(`${API_BASE}/projects/`);
      setProjects(res.data.projects);
    } catch {
      // silently fail — backend may be starting
    }
  }, []);

  const loadThread = useCallback(async (projectId: string) => {
    try {
      const res = await axios.get<{ messages: ThreadMessage[] }>(`${API_BASE}/projects/${projectId}/thread`);
      setThread(res.data.messages);
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch { /* non-fatal */ }
  }, []);

  const loadDiscoveries = useCallback(async (projectId: string) => {
    try {
      const res = await axios.get<{ discoveries: Discovery[] }>(`${API_BASE}/projects/${projectId}/discoveries`);
      setDiscoveries(res.data.discoveries);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    void refreshData();
    void loadProjects();
  }, [refreshData, loadProjects]);

  useEffect(() => {
    if (currentProject) {
      void loadThread(currentProject.id);
      void loadDiscoveries(currentProject.id);
      // Auto-sync skills if last sync > 1h or never
      const lastSync = currentProject.skill_sync_at;
      if (!lastSync || Date.now() - new Date(lastSync).getTime() > 3_600_000) {
        void triggerSkillSync(currentProject.id, 'project_open');
      }
    }
  }, [currentProject, loadThread, loadDiscoveries]);

  // ─────────────────────────────────────────────────────────────
  // Project actions
  // ─────────────────────────────────────────────────────────────

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    setIsBusy(true);
    try {
      const res = await axios.post<Project>(`${API_BASE}/projects/`, {
        name: newProjectName.trim(),
        doc_type: newProjectDocType,
        norm: newProjectNorm,
      });
      setProjects((prev) => [res.data, ...prev]);
      setCurrentProject(res.data);
      setThread([]);
      setNewProjectName('');
      setShowCreateProject(false);
      setActiveTab('analyze');
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Create project failed.';
      setError(String(msg));
    } finally {
      setIsBusy(false);
    }
  };

  const openProject = (project: Project) => {
    setCurrentProject(project);
    setDocType(project.doc_type);
    setTargetFormat(project.norm);
    // Reset analysis state
    setUploadResult(null);
    setStreamEvents([]);
    setScores(null);
    setFindings([]);
    setImprovementPlan([]);
    setApprovedImprovementIds([]);
    setApprovalResult(null);
    setDiagramResult(null);
    setActiveTab('analyze');
  };

  const deleteProject = async (projectId: string) => {
    if (!window.confirm('Delete this project and all its data? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_BASE}/projects/${projectId}`);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (currentProject?.id === projectId) {
        setCurrentProject(null);
        setThread([]);
        setActiveTab('projects');
      }
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Delete failed.';
      setError(String(msg));
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Skill Sync
  // ─────────────────────────────────────────────────────────────

  const triggerSkillSync = async (projectId: string, _source = 'manual') => {
    setIsSyncing(true);
    try {
      await axios.post(`${API_BASE}/projects/${projectId}/sync-skills`);
      await refreshData();
      await loadThread(projectId);
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, skill_sync_at: new Date().toISOString() } : p)),
      );
    } catch { /* non-fatal */ } finally {
      setIsSyncing(false);
    }
  };

  const globalSync = async () => {
    setIsSyncing(true);
    try {
      await axios.post(`${API_BASE}/skills/pull`);
      await refreshData();
      if (currentProject) await loadThread(currentProject.id);
    } catch { /* non-fatal */ } finally {
      setIsSyncing(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Upload + Analysis
  // ─────────────────────────────────────────────────────────────

  const uploadAndAnalyze = async (file: File) => {
    setIsBusy(true);
    setError(null);
    setUploadResult(null);
    setStreamEvents([]);
    setScores(null);
    setFindings([]);
    setImprovementPlan([]);
    setApprovedImprovementIds([]);
    setApprovalResult(null);
    setChapterResults([]);
    setResearchSources(null);
    setDiagramResult(null);

    try {
      const form = new FormData();
      form.append('file', file);
      const uploadUrl = currentProject
        ? `${API_BASE}/documents/upload?project_id=${currentProject.id}`
        : `${API_BASE}/documents/upload`;

      const upload = await axios.post<UploadResult>(uploadUrl, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadResult(upload.data);
      await runAnalysis(upload.data.doc_id);
      await refreshData();
      if (currentProject) {
        await loadThread(currentProject.id);
        await loadProjects();
      }
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : 'Upload or analysis failed.';
      setError(String(message));
    } finally {
      setIsBusy(false);
    }
  };

  const runAnalysis = async (docId: string) => {
    const response = await fetch(`${API_BASE}/analysis/run/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_type: docType,
        norm: targetFormat,
        project_id: currentProject?.id ?? null,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Analysis failed with HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as StreamEvent;
        setStreamEvents((prev) => [...prev, event]);
        if (event.scores) setScores(event.scores);
        if (event.findings) setFindings(event.findings);
        if (event.improvement_plan) setImprovementPlan(event.improvement_plan);
        if (event.chapters) setChapterResults(event.chapters);
        if (event.research_sources) setResearchSources(event.research_sources);
        if (event.stage === 'error') throw new Error(event.message ?? 'Analysis failed.');
      }
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Approvals, Rewrites, Diagrams
  // ─────────────────────────────────────────────────────────────

  const toggleApprovedImprovement = (itemId: string) => {
    setApprovedImprovementIds((prev) =>
      prev.includes(itemId) ? prev.filter((existing) => existing !== itemId) : [...prev, itemId],
    );
    setApprovalResult(null);
  };

  const toggleOutputFormat = (format: string) => {
    setOutputFormats((prev) =>
      prev.includes(format) ? prev.filter((existing) => existing !== format) : [...prev, format],
    );
  };

  const approveRewrite = async () => {
    if (!uploadResult) return;
    setIsBusy(true);
    setError(null);
    try {
      const res = await axios.post<RewriteApprovalResult>(`${API_BASE}/analysis/approve-rewrite`, {
        doc_id: uploadResult.doc_id,
        approved_item_ids: approvedImprovementIds,
        doc_type: docType,
        norm: targetFormat,
        draw_diagrams: drawDiagrams,
        diagram_style: diagramStyle,
        design_theme: designTheme,
        output_formats: outputFormats,
        maintain_front_matter: true,
      });
      setApprovalResult(res.data);

      // Log to thread
      if (currentProject) {
        await loadThread(currentProject.id);
      }

      // If diagram checkbox is ticked → generate diagram immediately
      if (drawDiagrams && improvementPlan.length > 0) {
        await generateDiagram();
      }
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : 'Rewrite approval failed.';
      setError(String(message));
    } finally {
      setIsBusy(false);
    }
  };

  const generateDiagram = async () => {
    if (!uploadResult) return;
    setIsBusy(true);
    try {
      const planText = improvementPlan.map((item) => `${item.title}: ${item.action}`).join('\n');
      const res = await axios.post<DiagramResult>(`${API_BASE}/diagrams/generate`, {
        plan_text: planText,
        doc_id: uploadResult.doc_id,
        project_id: currentProject?.id ?? null,
        design_theme: designTheme,
        diagram_style: diagramStyle,
        figure_start: 1,
        is_researchers_own: true,
      });
      setDiagramResult(res.data);
      setEditedMermaid(res.data.mermaid_source);
      if (currentProject) await loadThread(currentProject.id);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : 'Diagram generation failed.';
      setError(String(message));
    } finally {
      setIsBusy(false);
    }
  };

  const saveDiagram = async () => {
    if (!diagramResult) return;
    setIsBusy(true);
    try {
      await axios.post(`${API_BASE}/diagrams/save`, {
        diagram_id: diagramResult.diagram_id,
        approved_source: editedMermaid,
        caption: diagramResult.caption,
        project_id: currentProject?.id ?? null,
      });
      setEditingDiagram(false);
    } catch { /* non-fatal */ } finally {
      setIsBusy(false);
    }
  };

  const approveDiscovery = async (discoveryId: string) => {
    if (!currentProject) return;
    try {
      await axios.post(`${API_BASE}/projects/${currentProject.id}/discoveries/${discoveryId}/approve`, {
        auto_push: contributeEnabled,
      });
      setDiscoveries((prev) => prev.filter((d) => d.id !== discoveryId));
    } catch { /* non-fatal */ }
  };

  const rejectDiscovery = async (discoveryId: string) => {
    if (!currentProject) return;
    try {
      await axios.post(`${API_BASE}/projects/${currentProject.id}/discoveries/${discoveryId}/reject`);
      setDiscoveries((prev) => prev.filter((d) => d.id !== discoveryId));
    } catch { /* non-fatal */ }
  };

  // ─────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────

  const saveAiSettings = async () => {
    if (!aiDraft) return;
    setIsBusy(true);
    setError(null);
    try {
      const res = await axios.put<Pick<AIStatus, 'settings' | 'providers'>>(`${API_BASE}/ai/settings`, aiDraft);
      setAiStatus((prev) =>
        prev ? { ...prev, settings: res.data.settings, providers: res.data.providers } : prev,
      );
      setAiDraft(res.data.settings);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Could not save AI settings.';
      setError(String(message));
    } finally {
      setIsBusy(false);
    }
  };

  const testProvider = async (provider: ProviderOption['id']) => {
    setIsBusy(true);
    setError(null);
    try {
      const res = await axios.post<ConnectionResult>(`${API_BASE}/ai/test/${provider}`);
      setConnectionResults((prev) => ({ ...prev, [provider]: res.data }));
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Connection test failed.';
      setError(String(message));
    } finally {
      setIsBusy(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void uploadAndAnalyze(file);
    event.target.value = '';
  };

  // ─────────────────────────────────────────────────────────────
  // Sub-components
  // ─────────────────────────────────────────────────────────────

  const NavItem = ({ id, icon: Icon, label }: { id: TabId; icon: LucideIcon; label: string }) => (
    <button className={`nav-item ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
      <Icon className="nav-icon" size={18} />
      <span>{label}</span>
    </button>
  );

  const SyncButton = () => (
    <button
      id="global-sync-btn"
      className={`sync-button ${isSyncing ? 'syncing' : ''}`}
      onClick={() => {
        if (currentProject) void triggerSkillSync(currentProject.id);
        else void globalSync();
      }}
      title={neonConnected ? 'Sync skills from Neon' : 'Neon offline'}
      disabled={isSyncing}
    >
      <div className={`sync-dot ${neonConnected ? 'online' : 'offline'}`} />
      <RefreshCw size={13} className={isSyncing ? 'spin' : ''} />
      <span>{isSyncing ? 'Syncing…' : `${skillCount} Skills`}</span>
    </button>
  );

  // Render a single thread message
  const ThreadEntry = ({ msg }: { msg: ThreadMessage }) => {
    const meta = THREAD_ICON[msg.message_type] ?? { icon: Activity, label: msg.message_type, color: '#888' };
    const Icon = meta.icon;
    const content = msg.content as Record<string, unknown>;
    const ts = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <div className="thread-entry">
        <div className="thread-icon" style={{ color: meta.color }}>
          <Icon size={16} />
        </div>
        <div className="thread-body">
          <div className="thread-header">
            <span className="thread-type-label" style={{ color: meta.color }}>{meta.label}</span>
            <span className="thread-time">{ts}</span>
          </div>
          {msg.message_type === 'upload' && (
            <p className="thread-text">📄 <strong>{String(content.filename ?? '')}</strong> uploaded ({Number(content.size_bytes ?? 0).toLocaleString()} bytes)</p>
          )}
          {msg.message_type === 'analysis_result' && (
            <div className="thread-scores">
              {content.scores ? Object.entries(content.scores as Record<string, number>).slice(0, 6).map(([k, v]) => (
                <span key={k} className="thread-score-badge">
                  {k.replace(/_/g, ' ')}: <strong>{typeof v === 'number' ? v.toFixed(1) : String(v ?? '—')}</strong>
                </span>
              )) : null}
              <span className="thread-text">{String(content.message ?? '')}</span>
            </div>
          )}
          {msg.message_type === 'skill_sync' && (
            <p className="thread-text">
              🔄 {Number(content.skill_count ?? 0)} skills active · {Number(content.new_skills ?? 0)} new
              · {neonConnected ? '☁️ Neon' : '📦 local'}
            </p>
          )}
          {!['upload', 'analysis_result', 'skill_sync'].includes(msg.message_type) && (
            <p className="thread-text">{String(content.message ?? msg.message_type)}</p>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">
            <Activity size={20} color="white" />
          </div>
          <div>
            <div className="logo-text">OTIF</div>
            <div className="logo-sub">Integrity Fabric</div>
          </div>
        </div>

        {/* Always-visible Neon Sync Button */}
        <div className="sidebar-sync">
          <SyncButton />
        </div>

        <nav className="nav animate-in delay-1">
          <div className="nav-section-label">Workspace</div>
          <NavItem id="projects" icon={FolderOpen} label="Projects" />
          <NavItem id="analyze" icon={FileText} label="Analyze" />

          <div className="nav-section-label">Living Engine</div>
          <NavItem id="skills" icon={BrainCircuit} label="Skill Registry" />
          <NavItem id="community" icon={Database} label="Community DB" />

          <div className="nav-section-label">System</div>
          <NavItem id="settings" icon={Settings} label="Settings" />
        </nav>

        {/* Current project indicator */}
        {currentProject && (
          <div className="sidebar-project-indicator">
            <div className="project-indicator-label">Active Project</div>
            <div className="project-indicator-name">{currentProject.name}</div>
            <div className="project-indicator-meta">
              {currentProject.filename
                ? `📄 ${currentProject.filename}`
                : '📂 No document yet'}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content">
        <header className="page-header animate-up">
          <div className="header-row">
            <div>
              <h1 className="page-title">
                {activeTab === 'projects' && 'Projects'}
                {activeTab === 'analyze' && (currentProject ? currentProject.name : 'Analyze Document')}
                {activeTab === 'skills' && 'Skill Registry'}
                {activeTab === 'community' && 'Community Database'}
                {activeTab === 'settings' && 'Platform Settings'}
              </h1>
              <p className="page-subtitle">
                {activeTab === 'projects' && 'Create or open a project workspace. Each project holds one document.'}
                {activeTab === 'analyze' && (currentProject
                  ? `${docTypeOptions.find(o => o.id === currentProject.doc_type)?.label} · ${targetFormatOptions.find(o => o.id === currentProject.norm)?.label}`
                  : 'Open or create a project first.')}
                {activeTab === 'skills' && 'Intelligence rules currently loaded into the engine.'}
                {activeTab === 'community' && 'Skill sync, privacy settings and discovery contributions.'}
                {activeTab === 'settings' && 'AI model and system configuration.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Internet + AI Status Indicators */}
              <div className="status-pills">
                <span className="status-pill" title="Internet status">
                  {researchSources?.internet_checked
                    ? <><Wifi size={12} /><span className="pill-label online">Online</span></>
                    : streamEvents.some(e => e.gate === 'internet')
                      ? <><WifiOff size={12} /><span className="pill-label offline">Offline</span></>
                      : <><Globe size={12} /><span className="pill-label">{aiStatus ? 'Ready' : '…'}</span></>
                  }
                </span>
                <span className="status-pill" title="AI model status">
                  {aiStatus?.active_model
                    ? <><Bot size={12} /><span className="pill-label online">{aiStatus.active_provider}</span></>
                    : streamEvents.some(e => e.gate === 'ai_model')
                      ? <><CloudOff size={12} /><span className="pill-label offline">No AI</span></>
                      : <><Cloud size={12} /><span className="pill-label">{aiStatus?.active_provider ?? '…'}</span></>
                  }
                </span>
              </div>
              <button id="global-refresh-btn" className="btn btn-secondary" onClick={() => void refreshData()}>
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* ── PROJECTS TAB ── */}
        {activeTab === 'projects' && (
          <div className="animate-up delay-1">
            {/* Stats strip */}
            <div className="score-gauge-grid mb-8">
              <div className="score-gauge-card" style={{ '--gauge-color': 'var(--brand-400)' } as CSSProperties}>
                <div className="score-label">Active Skills</div>
                <div className="score-value">{skillCount}</div>
                <div className="score-grade">{ruleCount} rules · {wordListCount} words</div>
              </div>
              <div className="score-gauge-card" style={{ '--gauge-color': 'var(--accent-cyan)' } as CSSProperties}>
                <div className="score-label">Projects</div>
                <div className="score-value">{projects.length}</div>
                <div className="score-grade">1 document per project</div>
              </div>
              <div className="score-gauge-card" style={{ '--gauge-color': 'var(--accent-green)' } as CSSProperties}>
                <div className="score-label">Neon Sync</div>
                <div className="score-value">{neonConnected ? 'Live' : 'Local'}</div>
                <div className="score-grade">
                  <Server size={12} />
                  {neonConnected ? 'Connected' : 'Seed skills active'}
                </div>
              </div>
            </div>

            {/* Create project */}
            <div className="card mb-6">
              <div className="card-header">
                <div className="card-title icon-title"><PlusCircle size={18} /> New Project</div>
              </div>
              {showCreateProject ? (
                <div className="create-project-form">
                  <input
                    id="new-project-name"
                    className="settings-input full-width"
                    placeholder="Project name (e.g. 'My PhD Thesis Chapter 3')"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void createProject()}
                  />
                  <div className="create-project-row">
                    <select
                      className="settings-input"
                      value={newProjectDocType}
                      onChange={(e) => setNewProjectDocType(e.target.value)}
                    >
                      {docTypeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <select
                      className="settings-input"
                      value={newProjectNorm}
                      onChange={(e) => setNewProjectNorm(e.target.value)}
                    >
                      {targetFormatOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <button id="create-project-btn" className="btn btn-primary" onClick={() => void createProject()} disabled={isBusy || !newProjectName.trim()}>
                      Create
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowCreateProject(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button id="show-create-project-btn" className="btn btn-primary mt-2" onClick={() => setShowCreateProject(true)}>
                  <PlusCircle size={16} /> Start a New Project
                </button>
              )}
            </div>

            {/* Project list */}
            {projects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-title">No projects yet</div>
                <div className="empty-desc">Create a project to start analysing a document.</div>
              </div>
            ) : (
              <div className="project-list">
                {projects.map((project) => (
                  <div key={project.id} className="project-card">
                    <div className="project-card-info">
                      <div className="project-card-name">{project.name}</div>
                      <div className="project-card-meta">
                        <span className="badge badge-brand">{project.doc_type}</span>
                        <span className="badge badge-cyan">{project.norm.toUpperCase()}</span>
                        {project.filename && <span className="badge badge-amber">📄 {project.filename}</span>}
                        <span className="project-date">{new Date(project.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="project-card-actions">
                      <button
                        id={`open-project-${project.id}`}
                        className="btn btn-primary btn-sm"
                        onClick={() => openProject(project)}
                      >
                        <ChevronRight size={14} /> Open
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void deleteProject(project.id)}
                        title="Delete project"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ANALYZE TAB ── */}
        {activeTab === 'analyze' && (
          <div className="animate-up delay-1">
            {!currentProject ? (
              <div className="empty-state">
                <div className="empty-title">No active project</div>
                <div className="empty-desc">Go to Projects and create or open a project first.</div>
                <button className="btn btn-primary mt-4" onClick={() => setActiveTab('projects')}>
                  <FolderOpen size={16} /> Go to Projects
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  className="hidden-input"
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={handleFileChange}
                />

                {/* Project thread */}
                {thread.length > 0 && (
                  <div className="card thread-card mb-6">
                    <div className="card-header">
                      <div className="card-title">Review Log</div>
                      <div className="badge badge-brand">{thread.length} entries</div>
                    </div>
                    <div className="thread-scroll">
                      {thread.map((msg) => <ThreadEntry key={msg.id} msg={msg} />)}
                      <div ref={threadEndRef} />
                    </div>
                  </div>
                )}

                {/* Analysis console */}
                <div className="analysis-console">
                  <div className="analysis-context-bar">
                    <div className="context-field">
                      <label className="settings-label" htmlFor="doc-type">Document</label>
                      <select
                        id="doc-type"
                        className="settings-input full-width"
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        disabled={isBusy}
                      >
                        {docTypeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    </div>
                    <div className="context-field">
                      <label className="settings-label" htmlFor="target-format">Target Format</label>
                      <select
                        id="target-format"
                        className="settings-input full-width"
                        value={targetFormat}
                        onChange={(e) => setTargetFormat(e.target.value)}
                        disabled={isBusy}
                      >
                        {targetFormatOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    </div>
                    <div className="context-summary">
                      <span className="badge badge-cyan">Local preflight</span>
                      <span className="badge badge-brand">
                        {aiStatus?.active_provider ?? 'ollama'} / {aiStatus?.active_model ?? 'model pending'}
                      </span>
                      {currentProject.filename
                        ? <span className="badge badge-green">📄 {currentProject.filename}</span>
                        : <span className="badge badge-amber">No document attached</span>
                      }
                    </div>
                  </div>

                  {/* Gated upload: only show if no doc attached OR allow re-analysis */}
                  {!currentProject.doc_id || !uploadResult ? (
                    <button
                      id="upload-doc-btn"
                      className="upload-zone mb-6 compact-upload"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isBusy}
                    >
                      <UploadCloud className="upload-icon" />
                      <div className="upload-title">
                        {isBusy ? 'Verification Running…' : currentProject.doc_id ? 'Upload Replacement Document' : 'Upload Academic Document'}
                      </div>
                      <div className="upload-sub">PDF, DOCX, DOC, or TXT · stays on your machine</div>
                      <span className="btn btn-primary">{isBusy ? 'Checking…' : 'Browse Local Files'}</span>
                    </button>
                  ) : null}

                  {/* Stream + Results */}
                  {(uploadResult || streamEvents.length > 0) && (
                    <div className="analysis-workspace">
                      <div className="card animate-scale verification-panel">
                        <div className="card-header">
                          <div>
                            <div className="card-title">Verification Stream</div>
                            <div className="card-subtitle">
                              {docTypeOptions.find((o) => o.id === docType)?.label} →{' '}
                              {targetFormatOptions.find((o) => o.id === targetFormat)?.label}
                            </div>
                          </div>
                          <div className={`badge ${scores ? 'badge-green' : 'badge-amber'}`}>
                            {scores ? 'Complete' : 'Running'}
                          </div>
                        </div>
                        {uploadResult && <div className="file-pill">{uploadResult.filename}</div>}
                        <div className="analysis-stream claude-stream">
                          {streamEvents.map((event, index) => (
                            <div
                              key={`${event.stage}-${index}`}
                              className={`stream-line ${event.stage === 'complete' ? 'complete' : ''} ${event.stage === 'error' ? 'error' : ''}`}
                            >
                              {event.stage === 'complete' || event.stage === 'approval_required' ? (
                                <CheckCircle2 size={14} />
                              ) : event.stage === 'error' ? (
                                <AlertCircle size={14} />
                              ) : (
                                <Activity size={14} />
                              )}
                              <div>
                                <div className="stream-stage">{event.stage.replaceAll('_', ' ')}</div>
                                <span>{event.message ?? event.skill ?? event.stage}</span>
                                {event.gate && (
                                  <span className="gate-badge">Gate: {event.gate}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Scores + findings */}
                      <div className="card animate-scale result-panel">
                        <div className="card-header">
                          <div>
                            <div className="card-title">Analysis Results</div>
                            <div className="card-subtitle">Scored by {skillCount} active skill rules</div>
                          </div>
                          <div className="badge badge-cyan">Document only</div>
                        </div>
                        {scores ? (
                          <div className="score-list">
                            {Object.entries(scores).map(([key, value]) => (
                              <div className="score-row" key={key}>
                                <span>{key.replaceAll('_', ' ')}</span>
                                <strong>{typeof value === 'number' ? value.toFixed(1) : String(value ?? '—')}</strong>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state compact">
                            <div className="empty-title">Waiting for results</div>
                          </div>
                        )}

                        {researchSources && (
                          <>
                            <div className="divider" />
                            <div className="settings-group-title">Open Research Sources</div>
                            <div className="source-check-grid">
                              {researchSources.sources.map((source) => (
                                <div className="source-check" key={source.id}>
                                  <span>{source.name}</span>
                                  <span className={`badge ${source.status === 'checked' ? 'badge-green' : 'badge-amber'}`}>
                                    {source.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {chapterResults.length > 0 && (
                          <>
                            <div className="divider" />
                            <div className="settings-group-title">Chapter Signals</div>
                            <div className="chapter-signal-list">
                              {chapterResults.slice(0, 6).map((chapter) => (
                                <div className="chapter-signal" key={chapter.id}>
                                  <span>{chapter.title}</span>
                                  <strong>{chapter.scores.overall_preflight}</strong>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {findings.length > 0 && (
                          <>
                            <div className="divider" />
                            <div className="settings-group-title">Flagged Phrases</div>
                            <div className="finding-list">
                              {findings.map((finding) => (
                                <div className="finding-row" key={finding.word}>
                                  <span>{finding.word}</span>
                                  {finding.replacement && (
                                    <span className="finding-replacement">→ {finding.replacement}</span>
                                  )}
                                  <span className="badge badge-amber">{finding.count}×</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Improvement plan */}
                      {improvementPlan.length > 0 && (
                        <div className="card animate-scale improvement-plan-panel">
                          <div className="card-header">
                            <div>
                              <div className="card-title">Improvement Plan</div>
                              <div className="card-subtitle">Tick items to approve for AI rewrite</div>
                            </div>
                            <div className="badge badge-amber">{approvedImprovementIds.length} selected</div>
                          </div>

                          <div className="plan-list">
                            {improvementPlan.map((item) => (
                              <label className="plan-item" key={item.id}>
                                <input
                                  type="checkbox"
                                  id={`plan-item-${item.id}`}
                                  checked={approvedImprovementIds.includes(item.id)}
                                  onChange={() => toggleApprovedImprovement(item.id)}
                                />
                                <div className="plan-copy">
                                  <div className="plan-title-row">
                                    <span>{item.title}</span>
                                    <span className={`badge ${item.priority === 'high' ? 'badge-amber' : 'badge-cyan'}`}>
                                      {item.priority}
                                    </span>
                                  </div>
                                  <p>{item.action}</p>
                                  <div className="plan-evidence">{item.evidence}</div>
                                </div>
                              </label>
                            ))}
                          </div>

                          {/* Diagram toggle */}
                          <div className="rewrite-options">
                            <label className="option-toggle" id="draw-diagrams-toggle">
                              <input
                                type="checkbox"
                                checked={drawDiagrams}
                                onChange={(e) => setDrawDiagrams(e.target.checked)}
                              />
                              <span>Generate diagram from plan (Mermaid · themed)</span>
                            </label>

                            {drawDiagrams && (
                              <div className="rewrite-option-grid">
                                <label className="context-field">
                                  <span className="settings-label">Diagram style</span>
                                  <select
                                    className="settings-input full-width"
                                    value={diagramStyle}
                                    onChange={(e) => setDiagramStyle(e.target.value)}
                                  >
                                    {diagramStyleOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                  </select>
                                </label>
                                <label className="context-field">
                                  <span className="settings-label">Design theme</span>
                                  <select
                                    className="settings-input full-width"
                                    value={designTheme}
                                    onChange={(e) => setDesignTheme(e.target.value)}
                                  >
                                    {designThemeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                  </select>
                                </label>
                              </div>
                            )}

                            <div className="format-toggle-row">
                              {['docx', 'pdf'].map((format) => (
                                <label className="option-chip" key={format}>
                                  <input
                                    type="checkbox"
                                    checked={outputFormats.includes(format)}
                                    onChange={() => toggleOutputFormat(format)}
                                  />
                                  <span>{format.toUpperCase()}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="approval-actions">
                            <button
                              id="approve-rewrite-btn"
                              className="btn btn-primary"
                              onClick={() => void approveRewrite()}
                              disabled={isBusy || approvedImprovementIds.length === 0 || outputFormats.length === 0}
                            >
                              <Bot size={16} />
                              Approve selected for AI rewrite
                              {drawDiagrams && ' + Diagram'}
                            </button>
                            {approvalResult && (
                              <div className="approval-result">
                                ✅ Approved {approvalResult.approved_items.length} item(s) ·{' '}
                                {approvalResult.active_provider}
                                {approvalResult.active_model ? ` / ${approvalResult.active_model}` : ''}.{' '}
                                {approvalResult.rewrite_note}
                              </div>
                            )}
                          </div>

                          {approvalResult?.rewrite_preview && (
                            <div className="rewrite-preview">
                              <div className="settings-group-title">Rewrite Preview</div>
                              <p>{approvalResult.rewrite_preview}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Diagram result */}
                      {diagramResult && (
                        <div className="card animate-scale diagram-panel">
                          <div className="card-header">
                            <div>
                              <div className="card-title">📐 Generated Diagram</div>
                              <div className="card-subtitle">{diagramResult.caption}</div>
                            </div>
                            <div className="badge badge-green">Mermaid · {designTheme.replace('_', ' ')}</div>
                          </div>

                          <div className="diagram-mermaid-block">
                            <pre className="mermaid-source">{diagramResult.themed_source}</pre>
                          </div>

                          <div className="diagram-actions">
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => { setEditingDiagram(!editingDiagram); setEditedMermaid(diagramResult.mermaid_source); }}
                            >
                              {editingDiagram ? 'Close editor' : 'Edit Mermaid source'}
                            </button>
                            <button
                              id="save-diagram-btn"
                              className="btn btn-primary btn-sm"
                              onClick={() => void saveDiagram()}
                              disabled={isBusy}
                            >
                              <CheckCircle2 size={14} /> Save & Approve
                            </button>
                          </div>

                          {editingDiagram && (
                            <textarea
                              className="mermaid-editor"
                              value={editedMermaid}
                              onChange={(e) => setEditedMermaid(e.target.value)}
                              rows={16}
                              spellCheck={false}
                            />
                          )}

                          <div className="diagram-caption-row">
                            <span className="settings-desc">
                              📌 Caption: <strong>{diagramResult.caption}</strong>
                            </span>
                            <span className="settings-desc">
                              ℹ️ Edit the Mermaid source above if needed, then Save & Approve to lock it for export.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SKILLS TAB ── */}
        {activeTab === 'skills' && (
          <div className="grid-2 animate-up delay-1">
            {skills.map((skill, idx) => (
              <div key={skill.skill_id} className={`skill-card delay-${(idx % 4) + 1}`}>
                <div className="skill-card-header">
                  <div className="skill-icon"><BrainCircuit /></div>
                  <div className="skill-meta">
                    <div className="skill-name">{skill.name}</div>
                    <div className="skill-category badge badge-brand mt-1">{skill.category}</div>
                  </div>
                </div>
                <p className="text-secondary text-sm">{skill.description}</p>
                <div className="skill-stats">
                  <div>
                    <div className="skill-stat-value">{skill.rule_count}</div>
                    <div className="skill-stat-label">Rules</div>
                  </div>
                  <div>
                    <div className="skill-stat-value">{skill.word_list_count}</div>
                    <div className="skill-stat-label">Words</div>
                  </div>
                  <div>
                    <div className="skill-stat-value">v{skill.version}</div>
                    <div className="skill-stat-label">Version</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── COMMUNITY TAB ── */}
        {activeTab === 'community' && (
          <div className="grid-2 animate-up delay-1">
            <div className="settings-group">
              <div className="settings-group-title">
                <Database size={16} /> Neon Skill Sync
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Connection status</div>
                  <div className="settings-desc">Falls back to seed skills when offline.</div>
                </div>
                <span className={`badge ${neonConnected ? 'badge-green' : 'badge-amber'}`}>
                  {neonConnected ? 'Connected' : 'Offline'}
                </span>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Active skills</div>
                  <div className="settings-desc">{ruleCount} rules · {wordListCount} word entries</div>
                </div>
                <strong>{skillCount}</strong>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Pending community updates</div>
                </div>
                <strong>{status?.update_count ?? 0}</strong>
              </div>
              <button
                id="force-sync-btn"
                className="btn btn-secondary mt-2"
                onClick={() => currentProject ? void triggerSkillSync(currentProject.id) : void globalSync()}
                disabled={isSyncing}
              >
                <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
                {isSyncing ? 'Syncing…' : 'Force Skill Sync'}
              </button>
            </div>

            {/* Contribution opt-in */}
            <div className="settings-group">
              <div className="settings-group-title">
                <ShieldCheck size={16} /> Skill Contribution
              </div>
              <div className="contribution-callout">
                <p className="contribution-message">
                  🔬 <strong>Contribute to OTIF research quality.</strong><br />
                  When you approve an improvement, OTIF can share <em>only the structural skill pattern</em> (rule code + confidence delta) with the community database — never your thesis, citations, or any personal data. This helps other researchers benefit from the same patterns being detected in your work.
                </p>
                <label className="option-toggle contribution-toggle" id="contribution-toggle">
                  <input
                    type="checkbox"
                    checked={contributeEnabled}
                    onChange={(e) => setContributeEnabled(e.target.checked)}
                  />
                  <span>
                    {contributeEnabled
                      ? '✅ Contribution enabled — skill patterns (not text) are shared when you approve'
                      : '❌ Contribution disabled — no data will be pushed to Neon'}
                  </span>
                </label>
                <p className="settings-desc mt-2">
                  This is a research project. We never collect thesis content, author identity, citations, or private data. Only anonymous skill rule performance signals are shared.
                </p>
              </div>
            </div>

            {/* Pending discoveries */}
            {discoveries.length > 0 && (
              <div className="settings-group" style={{ gridColumn: '1 / -1' }}>
                <div className="settings-group-title">
                  <Zap size={16} /> Pending Skill Discoveries ({discoveries.length})
                </div>
                <p className="settings-desc mb-4">
                  These patterns were detected during analysis. Approve to contribute the rule signal to Neon.
                </p>
                {discoveries.map((disc) => (
                  <div key={disc.id} className="discovery-row">
                    <div className="discovery-info">
                      <div className="discovery-skill">{disc.skill_id}</div>
                      <div className="discovery-desc">{disc.description}</div>
                      <div className="discovery-confidence">Confidence: {(disc.confidence * 100).toFixed(0)}%</div>
                    </div>
                    <div className="discovery-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => void approveDiscovery(disc.id)}
                      >
                        <CheckCircle2 size={13} /> Approve
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void rejectDiscovery(disc.id)}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="settings-stack animate-up delay-1">
            <div className="settings-group">
              <div className="settings-group-title">
                <Bot size={16} /> AI Model Connection
              </div>
              {aiDraft && aiStatus && (
                <>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Privacy mode</div>
                      <div className="settings-desc">Cloud providers stay disabled unless this allows selected text.</div>
                    </div>
                    <select
                      id="privacy-mode-select"
                      className="settings-input"
                      value={aiDraft.privacy_mode}
                      onChange={(e) => setAiDraft({ ...aiDraft, privacy_mode: e.target.value })}
                    >
                      {aiStatus.privacy_modes.map((mode) => (
                        <option key={mode.id} value={mode.id}>{mode.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Active provider</div>
                      <div className="settings-desc">Only this provider can connect at one time.</div>
                    </div>
                    <select
                      id="provider-select"
                      className="settings-input"
                      value={aiDraft.provider}
                      onChange={(e) => {
                        setAiDraft({ ...aiDraft, provider: e.target.value as ProviderOption['id'] });
                        setConnectionResults({});
                      }}
                    >
                      {aiStatus.providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.mode === 'local' ? '(local)' : '(cloud)'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeProvider && (
                    <div className="provider-grid single-provider">
                      <div className="provider-card active-provider" key={activeProvider.id}>
                        <div className="provider-card-header">
                          <div>
                            <div className="provider-name">{activeProvider.name}</div>
                            <div className="settings-desc">{activeProvider.notes}</div>
                          </div>
                          <span className={`badge ${activeProvider.configured ? 'badge-green' : 'badge-amber'}`}>
                            {activeProvider.mode === 'local' ? 'Active local' : activeProvider.configured ? 'Key set ✓' : 'Needs key'}
                          </span>
                        </div>

                        <label className="settings-label" htmlFor={`${activeProvider.id}-model`}>Model</label>
                        <select
                          id={`${activeProvider.id}-model`}
                          className="settings-input full-width"
                          value={aiDraft.model_by_provider[activeProvider.id] ?? activeProvider.default_model}
                          onChange={(e) =>
                            setAiDraft({
                              ...aiDraft,
                              model_by_provider: { ...aiDraft.model_by_provider, [activeProvider.id]: e.target.value },
                            })
                          }
                        >
                          {activeProvider.models.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label} — {model.use_case}
                            </option>
                          ))}
                        </select>

                        {activeProvider.id === 'ollama' ? (
                          <input
                            className="settings-input full-width"
                            value={aiDraft.ollama_base_url ?? 'http://localhost:11434'}
                            onChange={(e) => setAiDraft({ ...aiDraft, ollama_base_url: e.target.value })}
                          />
                        ) : (
                          <input
                            className="settings-input full-width"
                            type="password"
                            placeholder={`${activeProvider.name} API key`}
                            value={aiDraft.api_keys[activeProvider.id] ?? ''}
                            onChange={(e) =>
                              setAiDraft({
                                ...aiDraft,
                                api_keys: { ...aiDraft.api_keys, [activeProvider.id]: e.target.value },
                              })
                            }
                          />
                        )}

                        <div className="provider-actions">
                          <button
                            id={`test-${activeProvider.id}-btn`}
                            className="btn btn-secondary btn-sm"
                            onClick={() => void testProvider(activeProvider.id)}
                            disabled={isBusy}
                          >
                            <KeyRound size={14} /> Test active connection
                          </button>
                          {connectionResults[activeProvider.id] && (
                            <span className={`connection-result ${connectionResults[activeProvider.id].ok ? 'ok' : 'fail'}`}>
                              {connectionResults[activeProvider.id].message}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="inactive-provider-list">
                    {inactiveProviders.map((p) => (
                      <div className="inactive-provider" key={p.id}>
                        <span>{p.name}</span>
                        <span className="settings-desc">Inactive — select as active provider to configure</span>
                      </div>
                    ))}
                  </div>

                  <button id="save-ai-settings-btn" className="btn btn-primary" onClick={() => void saveAiSettings()} disabled={isBusy}>
                    Save AI Settings
                  </button>
                </>
              )}
            </div>

            <div className="settings-group">
              <div className="settings-group-title">
                <BookOpen size={16} /> Analysis Gate Rules
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">🌐 Internet gate</div>
                  <div className="settings-desc">Analysis is blocked if internet (CrossRef) is unreachable.</div>
                </div>
                <span className="badge badge-amber">Strict — always ON</span>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">🤖 AI model gate</div>
                  <div className="settings-desc">Both analysis and rewrite are blocked if no AI provider is active.</div>
                </div>
                <span className="badge badge-amber">Strict — always ON</span>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Document scope</div>
                  <div className="settings-desc">Each project holds exactly one document (1:1).</div>
                </div>
                <span className="badge badge-cyan">1 project = 1 doc</span>
              </div>
            </div>

            {/* Contribution toggle in Settings too */}
            <div className="settings-group">
              <div className="settings-group-title">
                <GlobeLock size={16} /> Skill Contribution
              </div>
              <label className="option-toggle" id="settings-contribution-toggle">
                <input
                  type="checkbox"
                  checked={contributeEnabled}
                  onChange={(e) => setContributeEnabled(e.target.checked)}
                />
                <span>
                  Contribute anonymous skill patterns to community database (default: enabled)
                </span>
              </label>
              <p className="settings-desc mt-2">
                Only structural skill patterns (rule codes, confidence deltas) are shared. No thesis content, citations, author names, or private data is ever collected or transmitted.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
