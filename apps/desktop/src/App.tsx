import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, MouseEvent } from 'react';
import axios from 'axios';
import mermaid from 'mermaid';
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
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
  Copy,
  Database,
  Download,
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
  BadgeCheck,
  Palette,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';

import { API_BASE } from './api';
import { DocumentView } from './components/DocumentView';

type TauriCoreBridge = {
  invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
};

declare global {
  interface Window {
    __TAURI__?: {
      core?: TauriCoreBridge;
    };
    __TAURI_INTERNALS__?: TauriCoreBridge;
  }
}

function getTauriInvoke(): TauriCoreBridge['invoke'] | null {
  return window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke ?? null;
}

function isTauriDesktop(): boolean {
  return getTauriInvoke() !== null;
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const legacyInvoke = getTauriInvoke();
  if (legacyInvoke) {
    return legacyInvoke<T>(command, args);
  }
  // If @tauri-apps/api invoke is available (injected by Tauri), use it
  try {
    return await tauriInvoke<T>(command, args);
  } catch {
    throw new Error('This feature is only available in the installed OTIF Desktop app.');
  }
}

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
  neon_schema?: {
    connected?: boolean;
    configured?: boolean;
    ready: boolean;
    message: string;
    missing_tables?: string[];
  };
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
  id: 'ollama' | 'deepseek' | 'gemini' | 'openai' | 'claude';
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

interface NeonRuntimeSettings {
  configured: boolean;
  read_configured: boolean;
  write_configured: boolean;
  owner_configured: boolean;
  read_url: string;
  write_url: string;
  owner_url: string;
}


interface NeonSettingsResponse {
  settings: NeonRuntimeSettings;
  schema: {
    connected: boolean;
    configured?: boolean;
    ready: boolean;
    message: string;
    missing_tables?: string[];
  };
}

interface NeonTestResponse extends NeonSettingsResponse {
  ok: boolean;
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
  page_range?: string;
  analysis_source?: 'rules' | 'skills' | 'ai_review' | string;
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
  status: 'checked' | 'unavailable' | 'skipped' | 'needs_key';
  message: string;
  base_url?: string;
  coverage?: string;
  access_note?: string;
  docs_url?: string;
  requires_key?: boolean;
  configured?: boolean;
  cached?: boolean;
  matches: Array<{
    title: string;
    url: string | null;
    year: string | number | null;
    evidence?: {
      document_passage: string;
      overlap_percent: number;
      shared_terms: string[];
      classification: 'possible_similarity_risk' | 'citation_candidate' | 'context_match' | 'weak_context';
      note: string;
    };
  }>;
}

interface ResearchSourcesReport {
  internet_checked: boolean;
  queries: string[];
  sources: ResearchSourceResult[];
  source_count?: number;
  checked_source_count?: number;
}

interface IntegrityReport {
  title: string;
  doc_type: string;
  target_format: string;
  grade: 'defensible' | 'needs_integrity_review' | 'needs_author_revision' | string;
  scope: Record<string, unknown>;
  headline: Record<string, number | string | null>;
  evidence_summary: Record<string, number | string | null>;
  top_source_evidence: ResearchSourceResult['matches'];
  recommended_next_actions: string[];
  limitations: string[];
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
  integrity_report?: IntegrityReport;
  formatting_plan?: Record<string, unknown>;
  count?: number;
  skill?: string;
  category?: string;
  requires_approval?: boolean;
  gate?: string;
  internet_reachable?: boolean;
  research_connectivity?: Record<string, unknown>;
  ai_detection?: AIDetectionResult;
  turnitin_similarity?: TurnitinSimilarity;
  ai_review?: Record<string, unknown>;
}

interface RewriteApprovalResult {
  doc_id: string;
  approved_item_ids: string[];
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

interface EditableChapter {
  id: string;
  title: string;
  original_text: string;
  edited_text: string;
  word_count?: number;
}

interface ChapterEditorResult {
  doc_id: string;
  filename: string;
  chapters: EditableChapter[];
  scores: PreflightScores;
  approval: RewriteApprovalResult | null;
  requires_approval: boolean;
  revision_guidance: string | null;
  message: string;
}

interface FinalizedArtifact {
  format: 'docx' | 'pdf' | 'md' | string;
  filename: string;
  size_bytes: number;
  download_url: string;
}

interface FinalizeResult {
  doc_id: string;
  status: string;
  chapter_count: number;
  before_scores: PreflightScores;
  after_scores: PreflightScores;
  certificate: Record<string, unknown>;
  preservation_report?: Record<string, unknown>;
  field_update_status?: {
    requested: boolean;
    updated_by_word: boolean;
    toc: string;
    list_of_tables: string;
    list_of_figures: string;
  };
  artifacts: FinalizedArtifact[];
  limitations: string[];
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

interface AIDetectionSignals {
  perplexity_risk: number;
  burstiness_risk: number;
  template_opener_risk: number;
  passive_voice_risk: number;
  researcher_voice_reduction: number;
  repetition_risk: number;
  uniform_length_risk: number;
}

interface AIDetectionResult {
  ai_detection_score: number;        // 0-100
  confidence: 'high' | 'medium' | 'low';
  signals: AIDetectionSignals;
  verdict: string;
  turnitin_ai_equivalent: string;
}

interface PerSourceSimilarity {
  source_title: string;
  source_url: string | null;
  source_year: string | number | null;
  shingle_jaccard: number;
  char_ngram_jaccard: number;
  cosine_similarity: number;
  combined_similarity: number;
  risk_level: 'high' | 'medium' | 'low' | 'negligible';
  flagged_shingles: string[];
}

interface TurnitinSimilarity {
  similarity_index: number;           // 0-100 (like Turnitin %)
  match_count: number;
  high_risk_matches: number;
  medium_risk_matches: number;
  per_source_similarity: PerSourceSimilarity[];
  interpretation: string;
}

type DiagnosticLevel = 'info' | 'success' | 'warning' | 'error';

interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  level: DiagnosticLevel;
  action: string;
  message: string;
  details?: string;
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

const threadContent = (message: ThreadMessage): Record<string, unknown> =>
  typeof message.content === 'string' ? {} : message.content;

const isAnalysisSnapshot = (message: ThreadMessage) => {
  const content = threadContent(message);
  return message.message_type === 'analysis_result' && Boolean(content.scores);
};

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
type AnalysisStepId = 'upload' | 'live' | 'report' | 'plan' | 'download';

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

const MermaidPreview = ({ chart }: { chart: string }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
  }, []);

  useEffect(() => {
    const renderChart = async () => {
      try {
        setError(null);
        if (chart) {
          const { svg } = await mermaid.render('mermaid-preview-' + Date.now(), chart);
          setSvg(svg);
        }
      } catch (err) {
        setError(String(err));
      }
    };
    void renderChart();
  }, [chart]);

  if (error) {
    return <div className="mermaid-error" style={{ color: 'var(--accent-rose)', fontSize: '12px', padding: '10px' }}>Syntax Error: {error}</div>;
  }
  return <div className="mermaid-preview" style={{ background: 'white', borderRadius: '8px', padding: '16px', overflowX: 'auto', marginBottom: '16px' }} dangerouslySetInnerHTML={{ __html: svg }} />;
};

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('projects');

  // ── Backend startup ────────────────────────────────────────────
  type BackendPhase = 'starting' | 'ready' | 'error';
  const [backendPhase, setBackendPhase] = useState<BackendPhase>('starting');
  const [startupMsg, setStartupMsg]   = useState('Initialising backend engine…');
  const [startupDot, setStartupDot]   = useState(0);
  const [startupLog, setStartupLog] = useState<string | null>(null);
  const [isReadingStartupLog, setIsReadingStartupLog] = useState(false);

  // ── System status ──────────────────────────────────────────────
  const [status, setStatus] = useState<SkillStatus | null>(null);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiDraft, setAiDraft] = useState<AISettings | null>(null);
  const [connectionResults, setConnectionResults] = useState<Record<string, ConnectionResult>>({});
  const [neonDraft, setNeonDraft] = useState<NeonRuntimeSettings | null>(null);
  const [neonResult, setNeonResult] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const globalSyncInFlightRef = useRef(false);
  const [isTestingNeon, setIsTestingNeon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    if (statusNotice) {
      const timer = setTimeout(() => setStatusNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [statusNotice]);

  const [contributeEnabled, setContributeEnabled] = useState(true);

  // ── Projects ───────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [showFullReviewLog, setShowFullReviewLog] = useState(false);
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
  const [completedImprovementIds, setCompletedImprovementIds] = useState<string[]>([]);
  const [approvalResult, setApprovalResult] = useState<RewriteApprovalResult | null>(null);
  const [chapterResults, setChapterResults] = useState<ChapterResult[]>([]);
  const [researchSources, setResearchSources] = useState<ResearchSourcesReport | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [drawDiagrams, setDrawDiagrams] = useState(false);
  const [diagramStyle, setDiagramStyle] = useState('academic');
  const [designTheme, setDesignTheme] = useState('classic_blue');
  const [designAccentHex, setDesignAccentHex] = useState('#1f4e79');
  const [outputFormats, setOutputFormats] = useState<string[]>(['docx', 'pdf']);
  const [diagramResult, setDiagramResult] = useState<DiagramResult | null>(null);
  const [editedMermaid, setEditedMermaid] = useState('');
  const [editingDiagram, setEditingDiagram] = useState(false);
  const [expandConnectors, setExpandConnectors] = useState(true);
  const [chapterDrafts, setChapterDrafts] = useState<EditableChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [completedChapterIds, setCompletedChapterIds] = useState<string[]>([]);
  const [_chapterGuidance, setChapterGuidance] = useState<string | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [serviceDiagnostics, setServiceDiagnostics] = useState<string | null>(null);
  const [isCheckingServices, setIsCheckingServices] = useState(false);
  const [isRestartingBackend, setIsRestartingBackend] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityLog, setActivityLog] = useState<DiagnosticLogEntry[]>([]);

  // ── New feature state ──────────────────────────────────────────
  const [aiDetection, setAiDetection] = useState<AIDetectionResult | null>(null);
  const [turnitinSimilarity, setTurnitinSimilarity] = useState<TurnitinSimilarity | null>(null);
  const [showDesignPanel, setShowDesignPanel] = useState(false);
  const [currentApprovalIndex, setCurrentApprovalIndex] = useState(0);
  const [activeAnalysisStep, setActiveAnalysisStep] = useState<AnalysisStepId>('upload');
  const [showLiveEditDrawer, setShowLiveEditDrawer] = useState(false);
  const [liveEditLog, setLiveEditLog] = useState<string[]>([]);

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
  const activeChapter = chapterDrafts.find((chapter) => chapter.id === activeChapterId) ?? chapterDrafts[0] ?? null;
  const activeImprovementPlan = useMemo(
    () => improvementPlan.filter(
      (item) =>
        !approvedImprovementIds.includes(item.id) &&
        !completedImprovementIds.includes(item.id),
    ),
    [improvementPlan, approvedImprovementIds, completedImprovementIds],
  );
  const completedImprovementPlan = useMemo(
    () => improvementPlan.filter(
      (item) =>
        approvedImprovementIds.includes(item.id) ||
        completedImprovementIds.includes(item.id),
    ),
    [improvementPlan, approvedImprovementIds, completedImprovementIds],
  );
  const approvedRewriteItemIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...approvedImprovementIds,
          ...completedImprovementIds,
          ...(approvalResult?.approved_item_ids ?? []),
        ]),
      ).filter((itemId) => improvementPlan.some((item) => item.id === itemId)),
    [approvalResult, approvedImprovementIds, completedImprovementIds, improvementPlan],
  );
  const allImprovementIds = useMemo(() => improvementPlan.map((item) => item.id), [improvementPlan]);
  const workflowRewriteItemIds = approvedRewriteItemIds.length > 0 ? approvedRewriteItemIds : allImprovementIds;
  const approvedReviewCount = new Set([
    ...approvedImprovementIds,
    ...completedImprovementIds,
    ...(approvalResult?.approved_item_ids ?? []),
  ]).size;
  const analysisHistory = useMemo(() => thread.filter(isAnalysisSnapshot), [thread]);
  const visibleThread = showFullReviewLog ? thread : thread.slice(-6);
  const completionPercent = chapterDrafts.length
    ? Math.round((completedChapterIds.length / chapterDrafts.length) * 100)
    : 0;
  const apiRoot = API_BASE.replace(/\/api\/v1$/, '');
  const apiDocsUrl = `${apiRoot}/app`;
  const activeDocId = uploadResult?.doc_id ?? currentProject?.doc_id ?? null;
  const normalizedDesignAccent = designAccentHex.trim();
  const designAccentValid = /^#?[0-9A-Fa-f]{6}$/.test(normalizedDesignAccent);
  const approvedPercent = improvementPlan.length
    ? Math.round((approvedReviewCount / improvementPlan.length) * 100)
    : 0;
  const planGroups = useMemo(() => {
    const chapterTitle = (chapterId?: string) =>
      chapterResults.find((chapter) => chapter.id === chapterId)?.title ??
      chapterDrafts.find((chapter) => chapter.id === chapterId)?.title ??
      'Whole document';
    const groups = new Map<string, { title: string; items: ImprovementItem[] }>();
    improvementPlan.forEach((item) => {
      const key = item.chapter_id ?? 'whole_document';
      if (!groups.has(key)) groups.set(key, { title: chapterTitle(item.chapter_id), items: [] });
      groups.get(key)?.items.push(item);
    });
    return Array.from(groups.values());
  }, [chapterDrafts, chapterResults, improvementPlan]);
  const analysisStepperSteps: Array<{
    id: AnalysisStepId;
    label: string;
    detail: string;
    state: 'done' | 'active' | 'todo';
  }> = [
    {
      id: 'upload',
      label: 'Upload',
      detail: uploadResult?.filename ?? currentProject?.filename ?? 'Choose document',
      state: uploadResult || currentProject?.doc_id ? 'done' : activeAnalysisStep === 'upload' ? 'active' : 'todo',
    },
    {
      id: 'live',
      label: 'Live Analysis',
      detail: isBusy ? 'Checking now' : streamEvents.length ? `${streamEvents.length} events` : 'Run checks',
      state: isBusy || activeAnalysisStep === 'live' ? 'active' : scores ? 'done' : 'todo',
    },
    {
      id: 'report',
      label: 'Report',
      detail: scores ? 'Scores ready' : 'Not ready',
      state: activeAnalysisStep === 'report' ? 'active' : scores ? 'done' : 'todo',
    },
    {
      id: 'plan',
      label: 'Improvement Plan',
      detail: improvementPlan.length ? `${approvedReviewCount}/${improvementPlan.length} approved` : scores ? 'Rebuild needed' : 'Not ready',
      state: activeAnalysisStep === 'plan' ? 'active' : improvementPlan.length ? 'done' : 'todo',
    },
    {
      id: 'download',
      label: 'Download',
      detail: finalizeResult ? `${finalizeResult.artifacts.length} file(s)` : chapterDrafts.length ? 'Ready to finalize' : 'After approval',
      state: activeAnalysisStep === 'download' ? 'active' : finalizeResult ? 'done' : 'todo',
    },
  ];

  const addActivityLog = useCallback((
    level: DiagnosticLevel,
    action: string,
    message: string,
    details?: unknown,
  ) => {
    if (level === 'error') setShowActivityLog(true);
    setActivityLog((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: new Date().toISOString(),
        level,
        action,
        message,
        details:
          typeof details === 'string'
            ? details
            : details
              ? JSON.stringify(details, null, 2)
              : undefined,
      },
      ...prev,
    ].slice(0, 200));
  }, []);

  const formatActivityLog = useCallback(() =>
    activityLog
      .map((entry) => {
        const lines = [
          `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.action}`,
          entry.message,
        ];
        if (entry.details) lines.push(entry.details);
        return lines.join('\n');
      })
      .join('\n\n---\n\n'),
  [activityLog]);

  const restoreAnalysisSnapshot = useCallback((message: ThreadMessage, silent = false) => {
    const content = threadContent(message);
    const savedPlan = Array.isArray(content.improvement_plan)
      ? content.improvement_plan as ImprovementItem[]
      : [];

    setScores((content.scores as PreflightScores | undefined) ?? null);
    setFindings(Array.isArray(content.findings) ? content.findings as Finding[] : []);
    setImprovementPlan(savedPlan);
    setChapterResults(Array.isArray(content.chapters) ? content.chapters as ChapterResult[] : []);
    setResearchSources((content.research_sources as ResearchSourcesReport | undefined) ?? null);
    setIntegrityReport((content.integrity_report as IntegrityReport | undefined) ?? null);
    setAiDetection((content.ai_detection as AIDetectionResult | undefined) ?? null);
    setTurnitinSimilarity((content.turnitin_similarity as TurnitinSimilarity | undefined) ?? null);
    setStreamEvents([]);
    setApprovedImprovementIds([]);
    setCompletedImprovementIds([]);
    setApprovalResult(null);
    setChapterDrafts([]);
    setActiveChapterId(null);
    setCompletedChapterIds([]);
    setChapterGuidance(null);
    setFinalizeResult(null);
    setCurrentApprovalIndex(0);
    setActiveAnalysisStep('plan');

    if (!silent) {
      const timestamp = new Date(message.created_at).toLocaleString();
      setStatusNotice(
        savedPlan.length
          ? `Loaded saved analysis and ${savedPlan.length} improvement items from ${timestamp}.`
          : `Loaded saved analysis scores from ${timestamp}. Re-run analysis to rebuild the missing plan.`,
      );
    }
  }, []);

  const copyActivityLog = useCallback(async () => {
    const content = formatActivityLog() || 'No activity log entries yet.';
    try {
      await navigator.clipboard.writeText(content);
      addActivityLog('success', 'activity_log.copy', 'Activity log copied to clipboard.');
    } catch (err) {
      addActivityLog('error', 'activity_log.copy', 'Could not copy activity log.', err instanceof Error ? err.message : String(err));
    }
  }, [addActivityLog, formatActivityLog]);

  const downloadActivityLog = useCallback(() => {
    const content = formatActivityLog() || 'No activity log entries yet.';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OTIF_activity_log_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
    addActivityLog('success', 'activity_log.download', 'Activity log download started.');
  }, [addActivityLog, formatActivityLog]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      addActivityLog('error', 'window.error', event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      addActivityLog('error', 'window.unhandled_rejection', 'Unhandled promise rejection.', String(event.reason));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [addActivityLog]);

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
      const neonRes = await axios.get<NeonSettingsResponse>(`${API_BASE}/skills/neon/settings`);
      setNeonDraft(neonRes.data.settings);
      setNeonResult(neonRes.data.schema.message);
    } catch {
      setError('Backend is not reachable. Start OTIF desktop backend and refresh.');
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

  const loadThread = useCallback(async (projectId: string, restoreLatest = true) => {
    try {
      const res = await axios.get<{ messages: ThreadMessage[] }>(`${API_BASE}/projects/${projectId}/thread`);
      setThread(res.data.messages);
      const latestAnalysis = [...res.data.messages].reverse().find(isAnalysisSnapshot);
      if (restoreLatest && latestAnalysis) {
        restoreAnalysisSnapshot(latestAnalysis, true);
      }
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch { /* non-fatal */ }
  }, [restoreAnalysisSnapshot]);

  const loadDiscoveries = useCallback(async (projectId: string) => {
    try {
      const res = await axios.get<{ discoveries: Discovery[] }>(`${API_BASE}/projects/${projectId}/discoveries`);
      setDiscoveries(res.data.discoveries);
    } catch { /* non-fatal */ }
  }, []);

  const viewStartupLog = useCallback(async () => {
    setIsReadingStartupLog(true);
    // In browser mode (not Tauri), read logs directly from the backend API
    if (!isTauriDesktop()) {
      try {
        const res = await axios.get<{ startup?: string; stderr?: string; stdout?: string }>(
          `${API_BASE}/diagnostics/logs`, { timeout: 3000 }
        );
        const parts: string[] = [];
        if (res.data.startup) parts.push('=== startup.log ===\n' + res.data.startup);
        if (res.data.stderr)  parts.push('=== backend.stderr.log ===\n' + res.data.stderr);
        if (res.data.stdout)  parts.push('=== backend.stdout.log ===\n' + res.data.stdout);
        setStartupLog(parts.join('\n\n') || 'No log content available.');
      } catch {
        setStartupLog(
          'Backend is running — diagnostic logs are only available through the installed OTIF Desktop App.\n\n' +
          'Default Windows location:\n%LOCALAPPDATA%\\OTIF\\startup.log\n' +
          '%LOCALAPPDATA%\\OTIF\\backend.stderr.log\n' +
          '%LOCALAPPDATA%\\OTIF\\backend.stdout.log',
        );
      } finally {
        setIsReadingStartupLog(false);
      }
      return;
    }
    try {
      const logs = await invokeDesktop<string>('read_startup_logs');
      setStartupLog(logs);
    } catch (err) {
      setStartupLog(
        `Unable to read OTIF startup logs through the desktop bridge.\n\n${err instanceof Error ? err.message : String(err)}\n\n` +
        'Default Windows location:\n%LOCALAPPDATA%\\OTIF\\startup.log\n' +
        '%LOCALAPPDATA%\\OTIF\\backend.stderr.log\n' +
        '%LOCALAPPDATA%\\OTIF\\backend.stdout.log',
      );
    } finally {
      setIsReadingStartupLog(false);
    }
  }, []);

  const checkBackendServices = useCallback(async () => {
    setIsCheckingServices(true);
    addActivityLog('info', 'backend.services.check', 'Checking backend service diagnostics.');
    try {
      const diagnostics = await invokeDesktop<string>('check_backend_services');
      setServiceDiagnostics(diagnostics);
      addActivityLog('success', 'backend.services.check', 'Backend service diagnostics completed.', diagnostics);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setServiceDiagnostics(`Service check failed.\n\n${message}`);
      addActivityLog('error', 'backend.services.check', 'Backend service diagnostics failed.', message);
    } finally {
      setIsCheckingServices(false);
    }
  }, [addActivityLog, apiRoot]);

  const restartDesktopBackend = useCallback(async () => {
    setIsRestartingBackend(true);
    setError(null);
    addActivityLog('info', 'backend.restart', 'Restart backend requested.');
    try {
      const result = await invokeDesktop<string>('restart_backend');
      setServiceDiagnostics(result);
      setBackendPhase('ready');
      await refreshData();
      await loadProjects();
      addActivityLog('success', 'backend.restart', 'Backend restart completed.', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setServiceDiagnostics(`Restart failed.\n\n${message}`);
      addActivityLog('error', 'backend.restart', 'Backend restart failed.', message);
    } finally {
      setIsRestartingBackend(false);
    }
  }, [addActivityLog, loadProjects, refreshData]);

  const openApiDocs = useCallback(async (event?: MouseEvent<HTMLAnchorElement>) => {
    event?.preventDefault();
    setStatusNotice(null);
    addActivityLog('info', 'browser.docs.open', 'Opening Browser UI in browser.', apiDocsUrl);

    if (!isTauriDesktop()) {
      // Browser mode: just open in a new tab
      window.open(apiDocsUrl, '_blank', 'noopener,noreferrer');
      addActivityLog('success', 'browser.docs.open', 'Browser UI opened in new tab.', apiDocsUrl);
      return;
    }

    // Tauri desktop mode: use native OS shell to open in default browser
    try {
      const openedUrl = await invokeDesktop<string>('open_browser_fallback');
      setStatusNotice(`Opened Browser UI in your browser: ${openedUrl}`);
      addActivityLog('success', 'browser.docs.open', 'Browser UI opened through Tauri command.', openedUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Fallback: try window.open which works in WebView2 too
      window.open(apiDocsUrl, '_blank', 'noopener,noreferrer');
      addActivityLog('warning', 'browser.docs.open', 'Tauri browser open failed; used window.open fallback.', message);
    }
  }, [addActivityLog, apiDocsUrl]);

  // ── Backend startup poll ───────────────────────────────────────
  useEffect(() => {
    const MESSAGES = [
      'Initialising backend engine…',
      'Loading academic skill rules…',
      'Connecting to research APIs…',
      'Preparing integrity services…',
      'Almost ready…',
    ];
    let attempt = 0;
    let msgIdx  = 0;
    let stopped = false;

    const dotTimer = setInterval(() => setStartupDot((d) => (d + 1) % 4), 400);
    const msgTimer = setInterval(() => {
      msgIdx = (msgIdx + 1) % MESSAGES.length;
      setStartupMsg(MESSAGES[msgIdx]);
    }, 2200);

    const poll = async () => {
      while (!stopped && attempt < 60) {
        attempt++;
        try {
          await axios.get(`${API_BASE}/health`, { timeout: 1500 });
          if (!stopped) {
            setBackendPhase('ready');
            void refreshData();
            void loadProjects();
          }
          return;
        } catch {
          // still starting — wait and retry
          await new Promise((r) => setTimeout(r, 800));
        }
      }
      if (!stopped) setBackendPhase('error');
    };

    void poll();
    return () => {
      stopped = true;
      clearInterval(dotTimer);
      clearInterval(msgTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (backendPhase !== 'ready') return;
    void refreshData();
    void loadProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendPhase]);

  useEffect(() => {
    if (currentProject) {
      void loadThread(currentProject.id);
      void loadDiscoveries(currentProject.id);
      // BUG 6 FIX: Only auto-sync when Neon is actually connected.
      // When offline (common for local-only users), this caused noisy
      // error state that required manual dismissal.
      const lastSync = currentProject.skill_sync_at;
      if (neonConnected && (!lastSync || Date.now() - new Date(lastSync).getTime() > 3_600_000)) {
        void triggerSkillSync(currentProject.id, 'project_open');
      }
    }
  }, [currentProject, loadThread, loadDiscoveries, neonConnected]);

  useEffect(() => {
    if (activeImprovementPlan.length === 0) {
      setCurrentApprovalIndex(0);
      return;
    }
    if (currentApprovalIndex > activeImprovementPlan.length - 1) {
      setCurrentApprovalIndex(activeImprovementPlan.length - 1);
    }
  }, [activeImprovementPlan.length, currentApprovalIndex]);

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
      setDocType(res.data.doc_type);
      setTargetFormat(res.data.norm);
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
    setCompletedImprovementIds([]);
    setApprovalResult(null);
    setIntegrityReport(null);
    setDiagramResult(null);
    setChapterDrafts([]);
    setActiveChapterId(null);
    setCompletedChapterIds([]);
    setChapterGuidance(null);
    setFinalizeResult(null);
    setActiveAnalysisStep(project.doc_id ? 'report' : 'upload');
    setActiveTab('analyze');
  };

  const deleteProject = async (projectId: string) => {
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
    setError(null);
    setStatusNotice(null);
    addActivityLog('info', 'skills.sync.project', 'Project skill sync started.', { projectId });
    try {
      await axios.post(`${API_BASE}/projects/${projectId}/sync-skills`);
      await refreshData();
      await loadThread(projectId, false);
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, skill_sync_at: new Date().toISOString() } : p)),
      );
      setStatusNotice('Skill sync completed for this project.');
      addActivityLog('success', 'skills.sync.project', 'Project skill sync completed.', { projectId });
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Skill sync failed.';
      setError(String(message));
      addActivityLog('error', 'skills.sync.project', 'Project skill sync failed.', message);
    } finally {
      setIsSyncing(false);
    }
  };

  const globalSync = async () => {
    if (globalSyncInFlightRef.current) return;
    globalSyncInFlightRef.current = true;
    setIsSyncing(true);
    setError(null);
    setStatusNotice(null);
    addActivityLog('info', 'skills.sync.global', 'Global skill sync started.');
    try {
      const res = await axios.post<{
        message?: string;
        status?: {
          cache?: {
            skill_count?: number;
          };
        };
        neon_schema?: {
          connected?: boolean;
          configured?: boolean;
          ready?: boolean;
          message?: string;
          missing_tables?: string[];
        };
        sync_mode?: 'local' | 'degraded' | 'neon';
        severity?: 'info' | 'warning' | 'success';
      }>(`${API_BASE}/skills/pull`);
      const schema = res.data.neon_schema;
      const offlineMode = !schema?.ready;
      const localMode = res.data.sync_mode === 'local' || (!schema?.configured && offlineMode);
      const message = res.data.message ?? schema?.message ?? 'Skill sync completed.';
      setNeonResult(message);
      setStatusNotice(message);
      await refreshData();
      if (currentProject) await loadThread(currentProject.id, false);
      if (localMode) {
        addActivityLog('info', 'skills.sync.global', message, {
          neon: {
            configured: Boolean(schema?.configured),
            connected: Boolean(schema?.connected),
            ready: Boolean(schema?.ready),
            missing_tables: schema?.missing_tables?.length ?? 0,
          },
          local_skill_count: res.data.status?.cache?.skill_count,
          sync_mode: 'local',
        });
      } else if (offlineMode) {
        addActivityLog('warning', 'skills.sync.global', message, {
          neon: {
            configured: Boolean(schema?.configured),
            connected: Boolean(schema?.connected),
            ready: Boolean(schema?.ready),
            missing_tables: schema?.missing_tables?.length ?? 0,
          },
          local_skill_count: res.data.status?.cache?.skill_count,
          sync_mode: res.data.sync_mode ?? 'degraded',
        });
      } else {
        addActivityLog('success', 'skills.sync.global', message, {
          neon: {
            connected: true,
            ready: true,
          },
          local_skill_count: res.data.status?.cache?.skill_count,
          sync_mode: res.data.sync_mode ?? 'neon',
        });
      }
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Skill sync failed.';
      setError(String(message));
      addActivityLog('error', 'skills.sync.global', 'Global skill sync failed.', message);
    } finally {
      setIsSyncing(false);
      globalSyncInFlightRef.current = false;
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
    setCompletedImprovementIds([]);
    setApprovalResult(null);
    setChapterResults([]);
    setResearchSources(null);
    setIntegrityReport(null);
    setDiagramResult(null);
    setChapterDrafts([]);
    setActiveChapterId(null);
    setCompletedChapterIds([]);
    setChapterGuidance(null);
    setFinalizeResult(null);
    setAiDetection(null);
    setTurnitinSimilarity(null);
    setCurrentApprovalIndex(0);
    setActiveAnalysisStep('live');
    addActivityLog('info', 'document.upload', 'Upload and analysis started.', {
      filename: file.name,
      sizeBytes: file.size,
      projectId: currentProject?.id ?? null,
    });

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
      addActivityLog('success', 'document.upload', 'Document uploaded.', upload.data);
      await runAnalysis(upload.data.doc_id);
      await refreshData();
      if (currentProject) {
        await loadThread(currentProject.id, false);
        await loadProjects();
      }
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : 'Upload or analysis failed.';
      setError(String(message));
      addActivityLog('error', 'document.upload', 'Upload or analysis failed.', message);
    } finally {
      setIsBusy(false);
    }
  };

  const runAnalysis = async (docId: string) => {
    setActiveAnalysisStep('live');
    addActivityLog('info', 'analysis.run', 'Analysis started.', {
      docId,
      docType,
      targetFormat,
      projectId: currentProject?.id ?? null,
    });
    const response = await fetch(`${API_BASE}/analysis/run/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_type: docType,
        norm: targetFormat,
        project_id: currentProject?.id ?? null,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      addActivityLog('error', 'analysis.run', `Analysis failed with HTTP ${response.status}.`, detail);
      throw new Error(`Analysis failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    if (!response.body) {
      addActivityLog('error', 'analysis.run', 'Analysis failed because the backend did not return a stream.');
      throw new Error('Analysis failed because the backend did not return a stream.');
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
        if (event.improvement_plan) {
          setImprovementPlan(event.improvement_plan);
          setCurrentApprovalIndex(0);
          setActiveAnalysisStep(event.improvement_plan.length ? 'plan' : 'report');
        }
        if (event.chapters) setChapterResults(event.chapters);
        if (event.research_sources) setResearchSources(event.research_sources);
        if (event.integrity_report) setIntegrityReport(event.integrity_report);
        if (event.ai_detection) setAiDetection(event.ai_detection);
        if (event.turnitin_similarity) setTurnitinSimilarity(event.turnitin_similarity);
        if (event.stage === 'internet_warning') {
          addActivityLog('warning', 'analysis.run', event.message ?? 'Open research source checks unavailable.', event);
        }
        if (event.stage === 'error') {
          addActivityLog('error', 'analysis.run', event.message ?? 'Analysis failed.', event);
          throw new Error(event.message ?? 'Analysis failed.');
        }
      }
    }
    addActivityLog('success', 'analysis.run', 'Analysis completed.', { docId });
  };

  const rebuildCurrentAnalysis = async () => {
    if (!activeDocId) {
      setError('No document is attached to this project. Upload a document first.');
      setActiveAnalysisStep('upload');
      return;
    }
    setIsBusy(true);
    setError(null);
    setStreamEvents([]);
    setScores(null);
    setFindings([]);
    setImprovementPlan([]);
    setApprovedImprovementIds([]);
    setCompletedImprovementIds([]);
    setApprovalResult(null);
    setChapterResults([]);
    setResearchSources(null);
    setIntegrityReport(null);
    setAiDetection(null);
    setTurnitinSimilarity(null);
    setFinalizeResult(null);
    setActiveAnalysisStep('live');
    try {
      await runAnalysis(activeDocId);
      await refreshData();
      if (currentProject) {
        await loadThread(currentProject.id, false);
        await loadProjects();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed.';
      setError(message);
    } finally {
      setIsBusy(false);
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

  const approveAllRemainingImprovements = () => {
    setApprovedImprovementIds((prev) =>
      Array.from(new Set([...prev, ...allImprovementIds])),
    );
    setApprovalResult(null);
  };

  const toggleOutputFormat = (format: string) => {
    setOutputFormats((prev) =>
      prev.includes(format) ? prev.filter((existing) => existing !== format) : [...prev, format],
    );
  };

  // ── One-by-one approval navigation ───────────────────────────
  const skipCurrentItem = () => {
    if (currentApprovalIndex < activeImprovementPlan.length - 1) {
      setCurrentApprovalIndex((i) => i + 1);
    }
  };

  const prevApprovalItem = () => {
    if (currentApprovalIndex > 0) {
      setCurrentApprovalIndex((i) => i - 1);
    }
  };

  const downloadReport = () => {
    if (!scores && improvementPlan.length === 0) return;
    const filename = `OTIF_Detailed_Report_${uploadResult?.filename ?? 'thesis'}_${new Date().toISOString().slice(0, 10)}.md`;
    const content = `# OTIF Comprehensive Academic Verification & Improvement Report
Generated: ${new Date().toLocaleString()}
Document: ${uploadResult?.filename ?? 'Thesis Document'} | Type: ${docType} | Target Norm: ${targetFormat.toUpperCase()}

---

## 1. Preflight Evaluation Scores
${scores ? Object.entries(scores).map(([k, v]) => `- **${k.replace(/_/g, ' ').toUpperCase()}**: ${typeof v === 'number' ? v.toFixed(1) : v}`).join('\n') : 'No scores generated yet.'}

${integrityReport ? `## 1A. Integrity Grade
- **Grade**: ${integrityReport.grade.replace(/_/g, ' ').toUpperCase()}
- **Target Format**: ${integrityReport.target_format}
- **AI Score Notice**: AI-writing risk is a writing-pattern signal, not proof of authorship.

### Evidence Summary
${Object.entries(integrityReport.evidence_summary).map(([k, v]) => `- **${k.replace(/_/g, ' ')}**: ${v ?? 'N/A'}`).join('\n')}
` : ''}

---

## 2. Open Scholarly Research & Citation Check
${researchSources ? researchSources.sources.map(s => `### 🌐 ${s.name} (${s.status})
- **Status**: ${s.message ?? 'Checked'}
- **Matches Retrieved**:
${s.matches && s.matches.length > 0 ? s.matches.map(m => `  * [${m.year ?? 'N/A'}] ${m.title} (${m.url ?? 'No link'})${m.evidence ? `\n    - Evidence class: ${m.evidence.classification}; overlap: ${m.evidence.overlap_percent}%\n    - Shared terms: ${m.evidence.shared_terms.join(', ') || 'none'}\n    - Trigger passage: ${m.evidence.document_passage || 'not available'}` : ''}`).join('\n') : '  * None found.'}
`).join('\n') : 'No open sources queried.'}

---

## 3. Chapter Signals & Structural Audit
${chapterResults.length > 0 ? chapterResults.map(c => `- **${c.title}**: Overall Preflight Score ${c.scores.overall_preflight}`).join('\n') : 'No chapters parsed.'}

---

## 4. Page-Wise & Chapter-Wise Actionable Improvement Plan
${improvementPlan.length > 0 ? improvementPlan.map((item, idx) => `### Item ${idx + 1}: ${item.title} [Priority: ${item.priority.toUpperCase()}]
- **Recommended Action**: ${item.action}
- **Original Evidence**: "${item.evidence}"
`).join('\n') : 'No improvement items generated.'}

---
*Report exported from OTIF Native Desktop Engine (Local-First Research Integrity & Verification Platform)*
`;
    // BUG 5 FIX: Tauri WebView2 blocks programmatic anchor.click() on Blob URLs.
    // Use window.open() on a blob: URL — works in both WebView2 and browsers.
    // In the installed desktop app, this opens in the OS default browser which
    // correctly triggers the download dialog.
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    // Allow a tick for the download to start before revoking
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  };

  const approveRewrite = async () => {
    if (!activeDocId) return;
    const selectedIds = workflowRewriteItemIds;
    if (selectedIds.length === 0) return;
    setIsBusy(true);
    setError(null);
    setShowLiveEditDrawer(true);
    setLiveEditLog(['🚀 Starting chapter rewrite workflow...']);
    addActivityLog('info', 'rewrite.approve', 'Approved improvement rewrite started.', {
      docId: activeDocId,
      approvedItemCount: selectedIds.length,
      drawDiagrams,
      outputFormats,
    });
    try {
      setLiveEditLog(prev => [...prev, `📋 Sending ${selectedIds.length} approved improvement(s) to AI...`]);
      const res = await axios.post<RewriteApprovalResult>(`${API_BASE}/analysis/approve-rewrite`, {
        doc_id: activeDocId,
        approved_item_ids: selectedIds,
        doc_type: docType,
        norm: targetFormat,
        draw_diagrams: drawDiagrams,
        diagram_style: diagramStyle,
        design_theme: designTheme,
        design_accent_hex: designAccentValid ? normalizedDesignAccent : null,
        output_formats: outputFormats,
        maintain_front_matter: true,
      });
      setLiveEditLog(prev => [...prev,
        `✅ Rewrite approved — ${res.data.approved_items?.length ?? selectedIds.length} item(s) processed`,
        `🤖 Provider: ${res.data.active_provider ?? 'AI'}${res.data.active_model ? ` / ${res.data.active_model}` : ''}`,
        res.data.rewrite_note ? `📝 ${res.data.rewrite_note}` : '',
        '📖 Loading chapter editor...',
      ].filter(Boolean));
      setApprovalResult(res.data);
      addActivityLog('success', 'rewrite.approve', 'Approved improvement rewrite completed.', res.data);
      setCompletedImprovementIds((prev) => Array.from(new Set([...prev, ...selectedIds])));
      setApprovedImprovementIds([]);

      // Log to thread
      if (currentProject) {
        await loadThread(currentProject.id, false);
      }

      // If diagram checkbox is ticked → generate diagram immediately
      if (drawDiagrams && improvementPlan.length > 0) {
        setLiveEditLog(prev => [...prev, '🖼️ Generating diagram...']);
        await generateDiagram();
      }
      await loadChapterEditor(false);
      setLiveEditLog(prev => [...prev, '🎉 Chapter workflow ready! You can now edit chapters and finalize.']);
      setShowLiveEditDrawer(false);
      setActiveAnalysisStep('download');
      // Scroll to the document view after render
      setTimeout(() => {
        const docView = document.querySelector('.document-workspace');
        docView?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : 'Rewrite approval failed.';
      setError(String(message));
      setLiveEditLog(prev => [...prev, `❌ Error: ${String(message)}`]);
      addActivityLog('error', 'rewrite.approve', 'Rewrite approval failed.', message);
    } finally {
      setIsBusy(false);
    }
  };

  const generateDiagram = async () => {
    if (!activeDocId) return;
    setIsBusy(true);
    setError(null);
    addActivityLog('info', 'diagram.generate', 'Diagram generation started.', {
      docId: activeDocId,
      diagramStyle,
      designTheme,
    });
    try {
      const planText = improvementPlan.map((item) => `${item.title}: ${item.action}`).join('\n');
      const res = await axios.post<DiagramResult>(`${API_BASE}/diagrams/generate`, {
        plan_text: planText,
        doc_id: activeDocId,
        project_id: currentProject?.id ?? null,
        design_theme: designTheme,
        diagram_style: diagramStyle,
        figure_start: 1,
        is_researchers_own: true,
      });
      setDiagramResult(res.data);
      setEditedMermaid(res.data.mermaid_source);
      if (currentProject) await loadThread(currentProject.id, false);
      addActivityLog('success', 'diagram.generate', 'Diagram generated.', {
        diagramId: res.data.diagram_id,
        caption: res.data.caption,
      });
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : 'Diagram generation failed.';
      setError(String(message));
      addActivityLog('error', 'diagram.generate', 'Diagram generation failed.', message);
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

  const loadChapterEditor = async (showBusy = true) => {
    if (!activeDocId) return;
    if (showBusy) setIsBusy(true);
    setError(null);
    try {
      const res = await axios.get<ChapterEditorResult>(`${API_BASE}/analysis/chapter-editor/${activeDocId}`, {
        params: { doc_type: docType, norm: targetFormat },
      });
      setChapterDrafts(res.data.chapters);
      setActiveChapterId(res.data.chapters[0]?.id ?? null);
      setChapterGuidance(res.data.revision_guidance);
      setApprovalResult(res.data.approval);
      if (res.data.approval?.approved_item_ids?.length) {
        setCompletedImprovementIds((prev) =>
          Array.from(new Set([...prev, ...res.data.approval!.approved_item_ids])),
        );
        setApprovedImprovementIds((prev) =>
          prev.filter((itemId) => !res.data.approval!.approved_item_ids.includes(itemId)),
        );
      }
      setFinalizeResult(null);
      if (res.data.requires_approval) {
        setError(res.data.message);
      }
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : 'Could not open chapter editor.';
      setError(String(message));
    } finally {
      if (showBusy) setIsBusy(false);
    }
  };

  const updateChapterDraft = (chapterId: string, value: string) => {
    setChapterDrafts((prev) =>
      prev.map((chapter) => (chapter.id === chapterId ? { ...chapter, edited_text: value } : chapter)),
    );
    setFinalizeResult(null);
  };

  const selectChapter = (chapterId: string) => {
    setActiveChapterId(chapterId);
  };

  const markActiveChapterComplete = () => {
    if (!activeChapter) return;
    setCompletedChapterIds((prev) =>
      prev.includes(activeChapter.id) ? prev.filter((id) => id !== activeChapter.id) : [...prev, activeChapter.id],
    );
  };

  const finalizeThesis = async () => {
    if (!activeDocId || chapterDrafts.length === 0) return;
    setIsFinalizing(true);
    setError(null);
    addActivityLog('info', 'thesis.finalize', 'Final thesis export started.', {
      docId: activeDocId,
      chapterCount: chapterDrafts.length,
      outputFormats,
      designTheme,
    });
    try {
      const res = await axios.post<FinalizeResult>(`${API_BASE}/analysis/finalize-thesis`, {
        doc_id: activeDocId,
        chapters: chapterDrafts,
        doc_type: docType,
        norm: targetFormat,
        design_theme: designTheme,
        design_accent_hex: designAccentValid ? normalizedDesignAccent : null,
        output_formats: outputFormats,
        diagram_source: drawDiagrams ? (editedMermaid || (diagramResult?.mermaid_source ?? null)) : null,
        diagram_caption: drawDiagrams ? (diagramResult?.caption ?? null) : null,
        project_id: currentProject?.id ?? null,
      });
      setFinalizeResult(res.data);
      setActiveAnalysisStep('download');
      if (currentProject) await loadThread(currentProject.id, false);
      addActivityLog('success', 'thesis.finalize', 'Final thesis export completed.', {
        artifactCount: res.data.artifacts?.length ?? 0,
      });
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : 'Final thesis export failed.';
      setError(String(message));
      addActivityLog('error', 'thesis.finalize', 'Final thesis export failed.', message);
    } finally {
      setIsFinalizing(false);
    }
  };

  const artifactHref = (artifact: FinalizedArtifact) =>
    artifact.download_url.startsWith('http') ? artifact.download_url : `${apiRoot}${artifact.download_url}`;

  const downloadArtifact = (artifact: FinalizedArtifact) => {
    const href = artifactHref(artifact);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = artifact.filename;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      window.open(href, '_blank', 'noopener,noreferrer');
    }, 150);
    addActivityLog('success', 'artifact.download', 'Artifact download opened in browser.', {
      format: artifact.format,
      href,
    });
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
    if (!aiDraft) {
      setError('AI settings are still loading. Try again in a moment.');
      return;
    }
    setIsBusy(true);
    setError(null);
    setStatusNotice(null);
    addActivityLog('info', 'ai.settings.save', 'Saving AI settings.', {
      provider: aiDraft.provider,
      model: aiDraft.model_by_provider[aiDraft.provider] ?? null,
    });
    try {
      const res = await axios.put<Pick<AIStatus, 'settings' | 'providers'>>(`${API_BASE}/ai/settings`, aiDraft);
      setAiStatus((prev) =>
        prev ? { ...prev, settings: res.data.settings, providers: res.data.providers } : prev,
      );
      setAiDraft(res.data.settings);
      setStatusNotice('AI settings saved.');
      addActivityLog('success', 'ai.settings.save', 'AI settings saved.', res.data.settings);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Could not save AI settings.';
      setError(String(message));
      addActivityLog('error', 'ai.settings.save', 'Could not save AI settings.', message);
    } finally {
      setIsBusy(false);
    }
  };

  const testProvider = async (provider: ProviderOption['id']) => {
    setIsBusy(true);
    setError(null);
    setStatusNotice(null);
    addActivityLog('info', 'ai.provider.test', 'Testing AI provider connection.', { provider });
    try {
      if (aiDraft) {
        const saved = await axios.put<Pick<AIStatus, 'settings' | 'providers'>>(`${API_BASE}/ai/settings`, aiDraft);
        setAiStatus((prev) =>
          prev ? { ...prev, settings: saved.data.settings, providers: saved.data.providers } : prev,
        );
        setAiDraft(saved.data.settings);
      }
      const res = await axios.post<ConnectionResult>(`${API_BASE}/ai/test/${provider}`);
      setConnectionResults((prev) => ({ ...prev, [provider]: res.data }));
      setStatusNotice(res.data.message);
      addActivityLog(res.data.ok ? 'success' : 'warning', 'ai.provider.test', res.data.message, {
        provider,
        result: res.data,
      });
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Connection test failed.';
      setError(String(message));
      addActivityLog('error', 'ai.provider.test', 'AI provider connection test failed.', {
        provider,
        message,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const testNeonConnection = async () => {
    setIsTestingNeon(true);
    setError(null);
    setStatusNotice(null);
    addActivityLog('info', 'neon.test', 'Testing Neon environment connection.');
    try {
      const res = await axios.post<NeonTestResponse>(`${API_BASE}/skills/neon/test`);
      setNeonDraft(res.data.settings);
      const message = res.data.ok ? 'Neon connected and schema is ready.' : res.data.schema.message;
      setNeonResult(message);
      setStatusNotice(message);
      await refreshData();
      addActivityLog(res.data.ok ? 'success' : 'warning', 'neon.test', message, res.data.schema);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : 'Neon connection test failed.';
      setError(String(message));
      addActivityLog('error', 'neon.test', 'Neon connection test failed.', message);
    } finally {
      setIsTestingNeon(false);
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
      title={
        neonConnected
          ? `Neon Connected — Last Synced: ${status?.skill_engine.cache.loaded_at ? new Date(status.skill_engine.cache.loaded_at).toLocaleTimeString() : 'Just now'}`
          : 'Local skill mode — bundled seed skills are active; Neon sync is optional'
      }
      disabled={isSyncing}
    >
      <div className={`sync-dot ${neonConnected ? 'online' : 'local'}`} />
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
              {Boolean(content.scores) && (
                <button className="btn btn-secondary btn-sm" onClick={() => restoreAnalysisSnapshot(msg)}>
                  Open saved plan
                </button>
              )}
            </div>
          )}
          {msg.message_type === 'skill_sync' && (
            <p className="thread-text">
              🔄 {Number(content.skill_count ?? 0)} skills active · {Number(content.new_skills ?? 0)} new
              · {neonConnected ? 'Neon' : 'Local'}
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

  /* ── Splash / startup overlay ── */
  const dots = '.'.repeat(startupDot + 1).padEnd(3, ' ');
  if (backendPhase !== 'ready') {
    return (
      <div className="splash-overlay">
        <div className="splash-card">
          {/* Logo */}
          <div className="splash-logo">
            <div className="splash-logo-icon">
              <Activity size={28} color="white" />
            </div>
            <div>
              <div className="splash-logo-title">OTIF</div>
              <div className="splash-logo-sub">OpenThesis Integrity Fabric</div>
            </div>
          </div>

          {backendPhase === 'starting' && (
            <>
              <div className="splash-spinner">
                <div className="splash-ring" />
              </div>
              <p className="splash-status">{startupMsg}{dots}</p>
              <p className="splash-hint">Starting local research engine — this takes a few seconds on first launch</p>
            </>
          )}

          {backendPhase === 'error' && (
            <>
              <div className="splash-error-icon">⚠️</div>
              <p className="splash-status" style={{ color: 'var(--accent-rose)' }}>Backend did not start</p>
              <p className="splash-hint">
                Ensure the installer completed successfully and try relaunching OTIF.
                If running from source, start the backend with{' '}
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8em' }}>npm run desktop:dev</code>.
              </p>
              <div className="splash-actions">
                <button
                  className="btn btn-primary splash-retry-btn"
                  onClick={() => { setBackendPhase('starting'); setStartupMsg('Retrying backend…'); window.location.reload(); }}
                >
                  Retry
                </button>
                <button
                  className="btn btn-secondary splash-log-btn"
                  onClick={() => void viewStartupLog()}
                  disabled={isReadingStartupLog}
                >
                  {isReadingStartupLog ? 'Reading log…' : 'View error log'}
                </button>
              </div>
              {startupLog && (
                <div className="splash-log-panel">
                  <div className="splash-log-header">
                    <span>Startup diagnostics</span>
                    <button className="splash-log-close" onClick={() => setStartupLog(null)} aria-label="Close startup diagnostics">
                      ×
                    </button>
                  </div>
                  <pre className="splash-log-output">{startupLog}</pre>
                </div>
              )}
            </>
          )}

          {/* Attribution */}
          <div className="splash-attribution">
            <div className="splash-attr-name">Mohammad Quasif</div>
            <div className="splash-attr-role">DBA in AI · Doctoral Research Project</div>
            <div className="splash-attr-meta">
              Free &amp; Open Source &nbsp;·&nbsp; Apache-2.0 &nbsp;·&nbsp;
              <a href="https://github.com/mohammadquasif/OTIF" target="_blank" rel="noreferrer" className="splash-link">
                github.com/mohammadquasif/OTIF
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              <button className="btn btn-secondary" onClick={() => void checkBackendServices()} disabled={isCheckingServices}>
                <Server size={16} />
                {isCheckingServices ? 'Checking...' : 'Services'}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={16} />
            <span>{error}</span>
            <div className="alert-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => void viewStartupLog()} disabled={isReadingStartupLog}>
                {isReadingStartupLog ? 'Reading...' : 'View log'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => void checkBackendServices()} disabled={isCheckingServices}>
                Check services
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => void restartDesktopBackend()} disabled={isRestartingBackend}>
                {isRestartingBackend ? 'Restarting...' : 'Restart backend'}
              </button>
              <a className="btn btn-secondary btn-sm" href={apiDocsUrl} target="_blank" rel="noopener noreferrer" onClick={openApiDocs}>
                Open in browser
              </a>
            </div>
          </div>
        )}

        {statusNotice && !error && (
          <div className="alert alert-success toast-notification">
            <CheckCircle2 size={16} />
            <span>{statusNotice}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setStatusNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {(showActivityLog || activeTab !== 'analyze' || Boolean(error)) && (
        <section className={`activity-log-panel ${showActivityLog ? 'expanded' : ''}`}>
          <div className="activity-log-header">
            <div className="activity-log-title">
              <Activity size={16} />
              <div>
                <strong>Activity log</strong>
                <span>
                  {activityLog.length > 0
                    ? `${activityLog.length} event${activityLog.length === 1 ? '' : 's'} captured`
                    : 'No events captured yet'}
                </span>
              </div>
            </div>
            <div className="activity-log-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowActivityLog((prev) => !prev)}>
                {showActivityLog ? 'Hide' : 'Show'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => void copyActivityLog()} disabled={activityLog.length === 0}>
                <Copy size={14} />
                Copy
              </button>
              <button className="btn btn-secondary btn-sm" onClick={downloadActivityLog} disabled={activityLog.length === 0}>
                <Download size={14} />
                Download
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setActivityLog([])} disabled={activityLog.length === 0}>
                <Trash2 size={14} />
                Clear
              </button>
            </div>
          </div>
          {!showActivityLog && activityLog[0] && (
            <div className={`activity-log-latest log-${activityLog[0].level}`}>
              <span>{new Date(activityLog[0].timestamp).toLocaleTimeString()}</span>
              <strong>{activityLog[0].action}</strong>
              <span>{activityLog[0].message}</span>
            </div>
          )}
          {showActivityLog && (
            <div className="activity-log-list">
              {activityLog.length === 0 ? (
                <div className="activity-log-empty">Run a check, sync, upload, AI test, or export to capture logs here.</div>
              ) : (
                activityLog.slice(0, 50).map((entry) => (
                  <article key={entry.id} className={`activity-log-entry log-${entry.level}`}>
                    <div className="activity-log-entry-head">
                      <span>{new Date(entry.timestamp).toLocaleString()}</span>
                      <strong>{entry.level.toUpperCase()}</strong>
                      <code>{entry.action}</code>
                    </div>
                    <p>{entry.message}</p>
                    {entry.details && <pre>{entry.details}</pre>}
                  </article>
                ))
              )}
            </div>
          )}
        </section>
        )}

        {serviceDiagnostics && (
          <div className="diagnostics-panel">
            <div className="splash-log-header">
              <span>Desktop diagnostics</span>
              <button className="splash-log-close" onClick={() => setServiceDiagnostics(null)} aria-label="Close diagnostics">
                x
              </button>
            </div>
            <pre className="splash-log-output">{serviceDiagnostics}</pre>
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

                {/* ── Slim context banner (replaces the old verbose hero) ── */}
                <div className="workflow-context-banner">
                  <div className="workflow-context-left">
                    <span className="eyebrow-label">
                      {isBusy ? 'Analyzing…' : !activeDocId ? 'Getting started' : !scores ? 'Ready to analyze' : improvementPlan.length === 0 ? 'Action needed' : activeImprovementPlan.length > 0 ? 'Approval needed' : finalizeResult ? 'Complete' : 'In progress'}
                    </span>
                    <p>
                      {!activeDocId
                        ? 'Upload a DOCX, PDF, DOC, or TXT file to begin your thesis review.'
                        : isBusy
                          ? 'Live academic checks are running — watch the stream in the Live Analysis tab.'
                          : !scores
                            ? 'Document attached. Click "Build report and plan" or switch to the Upload tab.'
                            : scores && improvementPlan.length === 0
                              ? 'Report ready — improvement plan needs rebuilding once. Re-run analysis.'
                              : activeImprovementPlan.length > 0
                                ? `${activeImprovementPlan.length} improvement items awaiting approval in the Improvement Plan tab.`
                                : chapterDrafts.length === 0
                                  ? 'All items approved. Open chapter workflow to begin edits.'
                                  : finalizeResult
                                    ? `${finalizeResult.artifacts.length} file(s) ready — go to Download tab.`
                                    : `${completionPercent}% of chapters reviewed. Finalize when done.`}
                    </p>
                  </div>
                  <div className="workflow-context-actions">
                    {!activeDocId ? (
                      <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
                        <UploadCloud size={15} /> Upload document
                      </button>
                    ) : scores && improvementPlan.length === 0 ? (
                      <button className="btn btn-primary" onClick={() => void rebuildCurrentAnalysis()} disabled={isBusy}>
                        <Activity size={15} /> Rebuild plan
                      </button>
                    ) : !scores ? (
                      <button className="btn btn-primary" onClick={() => void rebuildCurrentAnalysis()} disabled={isBusy}>
                        <Activity size={15} /> Build report &amp; plan
                      </button>
                    ) : activeImprovementPlan.length > 0 ? (
                      <button className="btn btn-primary" onClick={() => setActiveAnalysisStep('plan')}>
                        <ThumbsUp size={15} /> Review plan
                      </button>
                    ) : chapterDrafts.length === 0 ? (
                      <button className="btn btn-primary" onClick={() => void approveRewrite()} disabled={isBusy || completedImprovementPlan.length === 0 || outputFormats.length === 0 || !designAccentValid}>
                        <Bot size={15} /> Create chapter workflow
                      </button>
                    ) : finalizeResult ? (
                      <button className="btn btn-primary" onClick={() => setActiveAnalysisStep('download')}>
                        <Download size={15} /> Go to download
                      </button>
                    ) : null}
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
                      <UploadCloud size={15} /> New version
                    </button>
                  </div>
                </div>

                <section className="analysis-stepper-shell" aria-label="Document workflow">
                  <div className="analysis-stepper-tabs">
                    {analysisStepperSteps.map((step, index) => (
                      <button
                        key={step.id}
                        className={`analysis-step-tab ${activeAnalysisStep === step.id ? 'active' : ''} ${step.state}`}
                        onClick={() => setActiveAnalysisStep(step.id)}
                      >
                        <span className="step-tab-index">
                          {step.state === 'done' ? '✓' : index + 1}
                        </span>
                        <strong>{step.label}</strong>
                        <small>{step.detail}</small>
                      </button>
                    ))}
                  </div>

                  <div className="analysis-stepper-panel">
                    {/* ── STEP 1: Upload ── */}
                    {activeAnalysisStep === 'upload' && (
                      <div className="step-panel-stack">
                        <div className="step-panel-header">
                          <div>
                            <span className="eyebrow-label">Start or replace document</span>
                            <h3>{activeDocId ? 'Document attached — ready to analyze.' : 'Upload a thesis or research paper.'}</h3>
                            <p className="step-panel-copy">Choose document type and target format, then upload. OTIF will run live academic checks and build your report and improvement plan.</p>
                          </div>
                        </div>

                        {/* Doc type + format selectors */}
                        <div className="analysis-context-bar" style={{ margin: '0 0 16px 0' }}>
                          <div className="context-field">
                            <label className="settings-label" htmlFor="doc-type-step">Document type</label>
                            <select id="doc-type-step" className="settings-input full-width" value={docType} onChange={(e) => setDocType(e.target.value)} disabled={isBusy}>
                              {docTypeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                          </div>
                          <div className="context-field">
                            <label className="settings-label" htmlFor="target-format-step">Target format</label>
                            <select id="target-format-step" className="settings-input full-width" value={targetFormat} onChange={(e) => setTargetFormat(e.target.value)} disabled={isBusy}>
                              {targetFormatOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                          </div>
                          <div className="context-summary">
                            <span className="badge badge-cyan">Local preflight</span>
                            <span className="badge badge-brand">{aiStatus?.active_provider ?? 'ollama'} / {aiStatus?.active_model ?? 'model pending'}</span>
                            {currentProject?.filename
                              ? <span className="badge badge-green">📄 {currentProject.filename}</span>
                              : <span className="badge badge-amber">No document attached</span>
                            }
                          </div>
                        </div>

                        {/* Single upload zone */}
                        <button
                          id="upload-doc-btn"
                          className="upload-zone mb-6"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isBusy}
                        >
                          <UploadCloud className="upload-icon" />
                          <div className="upload-title">
                            {isBusy ? 'Verification Running…' : activeDocId ? 'Upload Replacement Document' : 'Upload Academic Document'}
                          </div>
                          <div className="upload-sub">PDF, DOCX, DOC, or TXT · stays on your machine</div>
                          <span className="btn btn-primary">{isBusy ? 'Checking…' : activeDocId ? 'Replace document' : 'Browse Local Files'}</span>
                        </button>

                        {activeDocId && (
                          <div className="step-panel-actions">
                            <button className="btn btn-primary" onClick={() => void rebuildCurrentAnalysis()} disabled={isBusy}>
                              <Activity size={16} /> Build report &amp; plan
                            </button>
                            <button className="btn btn-secondary" onClick={() => setActiveAnalysisStep('live')}>
                              <Activity size={16} /> View live stream
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── STEP 2: Live Analysis ── */}
                    {activeAnalysisStep === 'live' && (
                      <div className="step-panel-stack">
                        <div className="step-panel-header">
                          <div>
                            <span className="eyebrow-label">Live Analysis</span>
                            <h3>{isBusy ? 'OTIF is checking your document…' : streamEvents.length > 0 ? 'Analysis complete.' : 'Waiting for analysis.'}</h3>
                            <p className="step-panel-copy">Watch OTIF check local skills, open-source availability, citation signals, AI-writing risk, and chapter quality in real time.</p>
                          </div>
                          {isBusy && <div className="badge badge-amber" style={{ animation: 'pulse 1s infinite' }}>Running</div>}
                          {!isBusy && streamEvents.length > 0 && <div className="badge badge-green">Complete</div>}
                        </div>

                        {/* Full scrollable stream */}
                        <div className="analysis-stream claude-stream" style={{ maxHeight: '340px', overflowY: 'auto', marginBottom: '16px' }}>
                          {streamEvents.length > 0 ? streamEvents.map((event, index) => (
                            <div
                              key={`${event.stage}-${index}`}
                              className={`stream-line ${event.stage === 'complete' ? 'complete' : ''} ${event.stage === 'error' ? 'error' : ''} ${event.stage === 'internet_warning' ? 'warning' : ''}`}
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
                                {event.gate && <span className="gate-badge">Gate: {event.gate}</span>}
                              </div>
                            </div>
                          )) : (
                            <div className="empty-inline">
                              <Activity size={18} />
                              No events yet. Upload a document or rebuild analysis to begin.
                            </div>
                          )}
                        </div>

                        {/* Research connectors */}
                        {researchSources && (
                          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                            <div
                              style={{ padding: '12px 16px', background: 'var(--bg-overlay)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                              onClick={() => setExpandConnectors(!expandConnectors)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 600, fontSize: '14px' }}>🌐 Research Connectors</span>
                                <span className="badge badge-cyan">{researchSources.sources.length} sources</span>
                              </div>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{expandConnectors ? '▲ Collapse' : '▼ Expand'}</span>
                            </div>
                            {expandConnectors && (
                              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {researchSources.sources.map((source) => (
                                  <div key={source.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--bg-card-subtle, rgba(255,255,255,0.02))' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                      <strong style={{ fontSize: '13px' }}>🌐 {source.name}</strong>
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        <span className={`badge ${source.status === 'checked' ? 'badge-green' : source.status === 'needs_key' ? 'badge-rose' : 'badge-amber'}`}>{source.matches?.length ?? 0} results</span>
                                        <span className="badge badge-purple">{source.status}</span>
                                      </div>
                                    </div>
                                    {source.matches && source.matches.length > 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', borderLeft: '2px solid var(--accent)' }}>
                                        {source.matches.slice(0, 3).map((m, idx) => (
                                          <div key={idx} style={{ fontSize: '12px' }}>
                                            {m.url ? <a href={m.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{m.title} ↗</a> : <span>{m.title}</span>}
                                            {m.year && <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>{m.year}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {scores && (
                          <div className="step-panel-actions" style={{ marginTop: '16px' }}>
                            <button className="btn btn-primary" onClick={() => setActiveAnalysisStep('report')}>
                              <CheckCircle2 size={15} /> View report
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {activeAnalysisStep === 'report' && (
                      <div className="step-panel-stack">
                        <div className="step-panel-header">
                          <div>
                            <span className="eyebrow-label">Evidence report</span>
                            <h3>{scores ? 'Report is ready.' : 'No report loaded yet.'}</h3>
                          </div>
                          <div className="step-panel-actions compact">
                            {scores && (
                              <button className="btn btn-secondary" onClick={downloadReport}>
                                <Download size={16} /> Download report
                              </button>
                            )}
                            <button className="btn btn-primary" onClick={() => void rebuildCurrentAnalysis()} disabled={isBusy || !activeDocId}>
                              <Activity size={16} />
                              {scores ? 'Re-run analysis' : 'Build report'}
                            </button>
                          </div>
                        </div>

                        {scores ? (
                          <>
                            {/* Key score cards */}
                            <div className="quick-score-grid">
                              {Object.entries(scores).slice(0, 8).map(([key, value]) => (
                                <div className="quick-score" key={key}>
                                  <span>{key.replaceAll('_', ' ')}</span>
                                  <strong>{typeof value === 'number' ? value.toFixed(1) : String(value ?? 'n/a')}</strong>
                                </div>
                              ))}
                            </div>

                            {/* Integrity grade */}
                            {integrityReport && (
                              <div className="integrity-grade-panel" style={{ margin: '16px 0' }}>
                                <div className="settings-group-title">Integrity Grade</div>
                                <div className={`integrity-grade ${integrityReport.grade}`}>
                                  {integrityReport.grade.replaceAll('_', ' ')}
                                </div>
                                <p className="text-secondary text-sm" style={{ marginTop: '6px' }}>AI-writing risk is a writing-pattern signal. Grade is based on local checks, open scholarly sources, and configured skills.</p>
                              </div>
                            )}

                            {/* AI Detection */}
                            {aiDetection && (
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-overlay)', borderRadius: '10px', marginBottom: '12px', border: `1px solid ${aiDetection.ai_detection_score >= 50 ? '#f59e0b' : '#10b981'}` }}>
                                <svg width="60" height="60" viewBox="0 0 100 100">
                                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="12" />
                                  <circle cx="50" cy="50" r="40" fill="none" stroke={aiDetection.ai_detection_score >= 75 ? '#ef4444' : aiDetection.ai_detection_score >= 50 ? '#f59e0b' : '#10b981'} strokeWidth="12" strokeDasharray={`${aiDetection.ai_detection_score * 2.51} 251`} strokeLinecap="round" transform="rotate(-90 50 50)" />
                                  <text x="50" y="46" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--text-main)">{aiDetection.ai_detection_score}%</text>
                                  <text x="50" y="62" textAnchor="middle" fontSize="9" fill="var(--text-muted)">AI RISK</text>
                                </svg>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>AI Detection Report</div>
                                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{aiDetection.verdict}</p>
                                  <span className={`badge mt-2 ${aiDetection.ai_detection_score >= 75 ? 'badge-rose' : aiDetection.ai_detection_score >= 50 ? 'badge-amber' : 'badge-green'}`}>{aiDetection.confidence} confidence</span>
                                </div>
                              </div>
                            )}

                            {/* Turnitin similarity */}
                            {turnitinSimilarity && (
                              <div style={{ padding: '12px 16px', background: 'var(--bg-overlay)', borderRadius: '10px', marginBottom: '12px', border: `1px solid ${turnitinSimilarity.similarity_index >= 40 ? '#ef4444' : '#10b981'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <strong style={{ fontSize: '14px' }}>Similarity Index</strong>
                                  <span className={`badge ${turnitinSimilarity.similarity_index >= 40 ? 'badge-rose' : turnitinSimilarity.similarity_index >= 20 ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: '16px', fontWeight: 700 }}>{turnitinSimilarity.similarity_index.toFixed(1)}%</span>
                                </div>
                                <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${turnitinSimilarity.similarity_index}%`, background: turnitinSimilarity.similarity_index >= 40 ? '#ef4444' : '#10b981', borderRadius: '4px', transition: 'width 1s ease' }} />
                                </div>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>{turnitinSimilarity.interpretation}</p>
                              </div>
                            )}

                            {/* Chapter signals */}
                            {chapterResults.length > 0 && (
                              <>
                                <div className="divider" />
                                <div className="settings-group-title"><span>Chapter Signals</span></div>
                                <div className="chapter-signal-list">
                                  {chapterResults.slice(0, 8).map((chapter) => (
                                    <div className="chapter-signal" key={chapter.id}>
                                      <span>{chapter.title}</span>
                                      <strong>{chapter.scores.overall_preflight}</strong>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}

                            {/* Flagged phrases */}
                            {findings.length > 0 && (
                              <>
                                <div className="divider" />
                                <div className="settings-group-title">Flagged Phrases</div>
                                <div className="finding-list">
                                  {findings.map((finding) => (
                                    <div className="finding-row" key={finding.word}>
                                      <span>{finding.word}</span>
                                      {finding.replacement && <span className="finding-replacement">→ {finding.replacement}</span>}
                                      <span className="badge badge-amber">{finding.count}×</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}

                            {/* Saved analysis runs */}
                            {analysisHistory.length > 0 && (
                              <>
                                <div className="divider" />
                                <div className="saved-analysis-heading">
                                  <div>
                                    <strong>Previous Runs</strong>
                                    <span>Open any saved analysis to restore its plan.</span>
                                  </div>
                                  <span className="badge badge-cyan">{analysisHistory.length} run{analysisHistory.length === 1 ? '' : 's'}</span>
                                </div>
                                <div className="saved-analysis-list">
                                  {[...analysisHistory].reverse().slice(0, 4).map((msg) => {
                                    const content = threadContent(msg);
                                    const savedScores = content.scores as Record<string, number> | undefined;
                                    const planCount = Array.isArray(content.improvement_plan) ? content.improvement_plan.length : Number(content.improvement_plan_count ?? 0);
                                    return (
                                      <div className="saved-analysis-card" key={`saved-${msg.id}`}>
                                        <div>
                                          <strong>{new Date(msg.created_at).toLocaleString()}</strong>
                                          <span>Overall {typeof savedScores?.overall === 'number' ? savedScores.overall.toFixed(1) : 'saved'} · {planCount || 'No'} plan items</span>
                                        </div>
                                        <button className="btn btn-primary btn-sm" onClick={() => restoreAnalysisSnapshot(msg)}>Open saved plan</button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            )}

                            <div className="report-action-band">
                              <span>{improvementPlan.length ? `${improvementPlan.length} improvement item(s) ready for approval.` : 'Re-run analysis to rebuild the improvement plan.'}</span>
                              <button className="btn btn-primary btn-sm" onClick={() => improvementPlan.length ? setActiveAnalysisStep('plan') : void rebuildCurrentAnalysis()} disabled={!improvementPlan.length && (isBusy || !activeDocId)}>
                                {improvementPlan.length ? 'Open improvement plan' : 'Rebuild plan'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="empty-inline">No report yet. Run analysis for this document.</div>
                        )}
                      </div>
                    )}

                    {activeAnalysisStep === 'plan' && (
                      <div className="step-panel-stack">
                        {/* Progress header */}
                        <div className="plan-progress-header">
                          <div className="plan-progress-counts">
                            <strong>{approvedReviewCount}</strong>
                            <span>/ {improvementPlan.length} items approved</span>
                          </div>
                          <div className="plan-progress-bar-wrap">
                            <div className="plan-progress-bar-fill" style={{ width: `${approvedPercent}%` }} />
                          </div>
                          <div className="plan-download-btn-wrap">
                            {(finalizeResult || chapterDrafts.length > 0) && (
                              <button className="btn btn-secondary" onClick={() => finalizeResult ? void downloadArtifact(finalizeResult.artifacts[0]) : void finalizeThesis()} disabled={isFinalizing || outputFormats.length === 0} title="Download updated manuscript">
                                <Download size={15} /> Download manuscript
                              </button>
                            )}
                            <button className="btn btn-secondary btn-sm" onClick={approveAllRemainingImprovements} disabled={!activeImprovementPlan.length}>
                              <BadgeCheck size={14} /> Approve all
                            </button>
                            <button className="btn btn-primary" onClick={() => void approveRewrite()} disabled={isBusy || workflowRewriteItemIds.length === 0 || outputFormats.length === 0 || !designAccentValid}>
                              <Bot size={15} /> {approvedRewriteItemIds.length ? 'Create chapter workflow' : 'Approve all & open writer'}
                            </button>
                          </div>
                        </div>

                        {/* Design + Output settings embedded in plan tab */}
                        <div style={{ background: 'var(--bg-overlay)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer' }} onClick={() => setShowDesignPanel(!showDesignPanel)}>
                            <Palette size={16} style={{ color: 'var(--accent)' }} />
                            <strong style={{ fontSize: '14px' }}>Design &amp; Output Settings</strong>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{showDesignPanel ? '▲ Hide' : '▼ Expand'}</span>
                          </div>
                          {showDesignPanel && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div className="rewrite-option-grid">
                                <label className="context-field">
                                  <span className="settings-label">Design theme</span>
                                  <select className="settings-input full-width" value={designTheme} onChange={(e) => setDesignTheme(e.target.value)}>
                                    {designThemeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                  </select>
                                </label>
                                <label className="context-field">
                                  <span className="settings-label">Document accent color</span>
                                  <div className="color-input-row">
                                    <input type="color" value={designAccentValid ? (normalizedDesignAccent.startsWith('#') ? normalizedDesignAccent : `#${normalizedDesignAccent}`) : '#1f4e79'} onChange={(e) => setDesignAccentHex(e.target.value)} aria-label="Document accent color" />
                                    <input className={`settings-input full-width ${designAccentValid ? '' : 'input-error'}`} value={designAccentHex} onChange={(e) => setDesignAccentHex(e.target.value)} placeholder="#1f4e79" spellCheck={false} />
                                  </div>
                                  {!designAccentValid && <span className="field-error">Use a 6-digit hex color, e.g. #1F4E79.</span>}
                                </label>
                              </div>
                              <div className="rewrite-option-grid">
                                <label className="option-toggle" id="draw-diagrams-toggle">
                                  <input type="checkbox" checked={drawDiagrams} onChange={(e) => setDrawDiagrams(e.target.checked)} />
                                  <span>Generate diagram from plan (Mermaid)</span>
                                </label>
                                {drawDiagrams && (
                                  <label className="context-field">
                                    <span className="settings-label">Diagram style</span>
                                    <select className="settings-input full-width" value={diagramStyle} onChange={(e) => setDiagramStyle(e.target.value)}>
                                      {diagramStyleOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                    </select>
                                  </label>
                                )}
                              </div>
                              <div className="format-toggle-row">
                                <span className="settings-label">Output format:</span>
                                {['docx', 'pdf'].map((format) => (
                                  <label className="option-chip" key={format}>
                                    <input type="checkbox" checked={outputFormats.includes(format)} onChange={() => toggleOutputFormat(format)} />
                                    <span>{format.toUpperCase()}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          {!showDesignPanel && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <span className="badge badge-brand">{designThemeOptions.find(o => o.id === designTheme)?.label ?? designTheme}</span>
                              <span className="badge" style={{ background: designAccentValid ? (normalizedDesignAccent.startsWith('#') ? normalizedDesignAccent : `#${normalizedDesignAccent}`) : '#1f4e79', color: '#fff' }}>{designAccentHex}</span>
                              <span className="badge badge-cyan">{outputFormats.map(f => f.toUpperCase()).join(' + ') || 'No format selected'}</span>
                            </div>
                          )}
                        </div>

                        {improvementPlan.length ? (
                          <>
                            {/* One-by-one approval wizard */}
                            {activeImprovementPlan.length > 0 && (() => {
                              const item = activeImprovementPlan[currentApprovalIndex] ?? activeImprovementPlan[0];
                              const progress = `${Math.min(currentApprovalIndex + 1, activeImprovementPlan.length)} / ${activeImprovementPlan.length}`;
                              return item ? (
                                <div style={{ margin: '0 0 16px', border: '1px solid var(--accent)', borderRadius: '10px', overflow: 'hidden' }}>
                                  <div style={{ padding: '12px 16px', background: 'var(--bg-overlay)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                      <span style={{ fontWeight: 600, fontSize: '13px' }}>Queue {progress}</span>
                                      <span className={`badge ${item.priority === 'high' ? 'badge-amber' : 'badge-cyan'}`}>{item.priority}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <button className="btn btn-secondary btn-sm" onClick={prevApprovalItem} disabled={currentApprovalIndex === 0} style={{ padding: '4px 10px' }}>←</button>
                                      <button className="btn btn-secondary btn-sm" onClick={skipCurrentItem} disabled={currentApprovalIndex >= activeImprovementPlan.length - 1} style={{ padding: '4px 10px' }}>→</button>
                                    </div>
                                  </div>
                                  <div style={{ padding: '16px' }}>
                                    <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>{item.title}</div>
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: '1.6' }}>{item.action}</p>
                                    <div className="plan-evidence" style={{ marginBottom: '14px' }}>{item.evidence}</div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                      <button id={`approve-item-${item.id}`} className="btn btn-primary" onClick={() => toggleApprovedImprovement(item.id)} style={{ flex: 1 }}>
                                        <ThumbsUp size={14} /> Approve &amp; remove from queue
                                      </button>
                                      <button className="btn btn-secondary" onClick={skipCurrentItem} disabled={currentApprovalIndex >= activeImprovementPlan.length - 1}>Skip →</button>
                                    </div>
                                  </div>
                                </div>
                              ) : null;
                            })()}

                            {/* Chapter plan groups */}
                            <div className="chapter-plan-list">
                              {planGroups.map((group) => (
                                <div className="chapter-plan-group" key={group.title}>
                                  <div className="chapter-plan-title">
                                    <strong>📖 {group.title}</strong>
                                    <span>{group.items.filter(i => approvedImprovementIds.includes(i.id) || completedImprovementIds.includes(i.id)).length}/{group.items.length} approved</span>
                                  </div>
                                  {group.items.map((item) => {
                                    const approved = approvedImprovementIds.includes(item.id) || completedImprovementIds.includes(item.id);
                                    return (
                                      <div className={`chapter-plan-item ${approved ? 'approved' : 'pending'}`} key={item.id}>
                                        <div>
                                          <div className="chapter-plan-item-title">
                                            <span>{item.title}</span>
                                            <span className={`badge ${item.priority === 'high' ? 'badge-amber' : 'badge-cyan'}`}>{item.priority}</span>
                                            <span className={`badge ${approved ? 'badge-green' : 'badge-brand'}`}>{approved ? '✓ Approved' : 'Pending'}</span>
                                          </div>
                                          <p>{item.action}</p>
                                          <small>{item.evidence}</small>
                                        </div>
                                        {!approved && (
                                          <button className="btn btn-primary btn-sm" onClick={() => toggleApprovedImprovement(item.id)}>
                                            <ThumbsUp size={14} /> Approve
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>

                            {approvalResult?.rewrite_preview && (
                              <div className="rewrite-preview">
                                <div className="settings-group-title">Revision Preview</div>
                                <p>{approvalResult.rewrite_preview}</p>
                              </div>
                            )}

                            {/* Prominent action button at bottom of plan items */}
                            <div style={{
                              marginTop: '20px', padding: '20px',
                              background: 'linear-gradient(135deg, hsla(258,75%,55%,0.12), hsla(191,90%,55%,0.08))',
                              border: '1px solid var(--border-brand)',
                              borderRadius: 'var(--r-lg)',
                              textAlign: 'center',
                            }}>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                {approvedImprovementIds.length > 0
                                  ? `${approvedImprovementIds.length} improvement(s) approved — ready to rewrite your document.`
                                  : 'Approve the improvements above, then click below to start the AI-powered rewrite.'}
                              </div>
                              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                                Your document will be rewritten chapter-by-chapter with the selected design theme. All citations are locked and preserved.
                              </p>
                              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                <button
                                  className="btn btn-secondary"
                                  onClick={approveAllRemainingImprovements}
                                  disabled={!activeImprovementPlan.length}
                                >
                                  <BadgeCheck size={16} /> Approve All First
                                </button>
                                <button
                                  className="btn btn-primary btn-lg"
                                  onClick={() => void approveRewrite()}
                                  disabled={isBusy || workflowRewriteItemIds.length === 0 || outputFormats.length === 0 || !designAccentValid}
                                  style={{ padding: '12px 32px', fontSize: '15px' }}
                                >
                                  <Bot size={18} /> {approvedRewriteItemIds.length ? 'Rewrite My Document with AI' : 'Approve All & Open AI Writer'}
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="missing-plan-card">
                            <strong>Improvement plan not ready.</strong>
                            <p>Re-run analysis to build the full chapter-wise plan.</p>
                            <button className="btn btn-primary" onClick={() => void rebuildCurrentAnalysis()} disabled={isBusy || !activeDocId}>
                              <Activity size={16} /> Rebuild report and improvement plan
                            </button>
                          </div>
                        )}
                      </div>
                    )}


                    {activeAnalysisStep === 'download' && (
                      <div className="step-panel-stack">
                        <div className="step-panel-header">
                          <div>
                            <span className="eyebrow-label">Final manuscript package</span>
                            <h3>{finalizeResult ? 'Package ready — download your files.' : 'Finalize full thesis or paper.'}</h3>
                            <p className="step-panel-copy">Edit chapters, compile a preview, then export as DOCX and/or PDF.</p>
                          </div>
                          <div className="step-panel-actions compact">
                            <button className="btn btn-secondary" onClick={() => void loadChapterEditor()} disabled={isBusy || !activeDocId}>
                              <FileText size={16} /> Open chapter editor
                            </button>
                            <button className="btn btn-primary" onClick={() => void finalizeThesis()} disabled={isFinalizing || chapterDrafts.length === 0 || outputFormats.length === 0 || !designAccentValid}>
                              <Download size={16} /> {isFinalizing ? 'Finalizing...' : finalizeResult ? 'Regenerate DOCX/PDF' : 'Finalize and download'}
                            </button>
                          </div>
                        </div>

                        {/* Chapter Navigation + AI-Powered Document View */}
                        {chapterDrafts.length > 0 && activeChapter && (
                          <>
                            {/* Chapter tabs */}
                            <div style={{
                              display: 'flex', gap: '4px', flexWrap: 'wrap',
                              padding: '4px', background: 'var(--bg-overlay)',
                              borderRadius: 'var(--r-md)', marginBottom: '8px',
                            }}>
                              {chapterDrafts.map((chapter, index) => {
                                const completed = completedChapterIds.includes(chapter.id);
                                const isActive = activeChapter?.id === chapter.id;
                                return (
                                  <button
                                    key={chapter.id}
                                    onClick={() => selectChapter(chapter.id)}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: '6px',
                                      padding: '6px 12px', fontSize: '12px', fontWeight: 600,
                                      borderRadius: 'var(--r-sm)', border: '1px solid transparent',
                                      background: isActive ? 'var(--brand-500)' : 'transparent',
                                      color: isActive ? '#fff' : completed ? 'var(--score-excellent)' : 'var(--text-secondary)',
                                      cursor: 'pointer', transition: 'all var(--t-fast)',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {completed ? '✓' : index + 1}. {chapter.title}
                                  </button>
                                );
                              })}
                              <span style={{
                                marginLeft: 'auto', alignSelf: 'center',
                                fontSize: '11px', color: 'var(--text-muted)',
                                padding: '0 8px',
                              }}>
                                {completedChapterIds.length}/{chapterDrafts.length} done
                              </span>
                            </div>

                            <DocumentView
                              docId={activeDocId}
                              docType={docType}
                              norm={targetFormat}
                              chapter={activeChapter}
                              improvements={improvementPlan}
                              approvedImprovementIds={approvedRewriteItemIds}
                              onUpdateChapter={updateChapterDraft}
                              onToggleApproval={toggleApprovedImprovement}
                              onApproveAll={approveAllRemainingImprovements}
                              onMarkComplete={markActiveChapterComplete}
                              isComplete={completedChapterIds.includes(activeChapter.id)}
                            />
                          </>
                        )}

                        {/* Artifact download cards */}
                        {finalizeResult ? (
                          <div className="artifact-grid compact-artifacts">
                            {finalizeResult.artifacts.map((artifact) => (
                              <button key={artifact.filename} className="artifact-card" onClick={() => downloadArtifact(artifact)}>
                                <FileText size={20} />
                                <span>{artifact.format.toUpperCase()}</span>
                                <strong>{artifact.filename}</strong>
                                <small>{(artifact.size_bytes / 1024).toFixed(1)} KB</small>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="download-readiness-grid">
                            <div><strong>{chapterDrafts.length}</strong><span>chapters loaded</span></div>
                            <div><strong>{completedChapterIds.length}</strong><span>chapters complete</span></div>
                            <div><strong>{outputFormats.map((f) => f.toUpperCase()).join(' + ') || 'None'}</strong><span>selected output</span></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                {/* Diagram result — shown below stepper when available */}
                {diagramResult && (
                  <div className="card animate-scale diagram-panel" style={{ marginTop: '20px' }}>
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
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditingDiagram(!editingDiagram); setEditedMermaid(editedMermaid || diagramResult.mermaid_source); }}>{editingDiagram ? 'Close editor' : 'Edit Mermaid source'}</button>
                      <button id="save-diagram-btn" className="btn btn-primary btn-sm" onClick={() => void saveDiagram()} disabled={isBusy}><CheckCircle2 size={14} /> Save &amp; Approve</button>
                    </div>
                    <MermaidPreview chart={editedMermaid || diagramResult.mermaid_source} />
                    {editingDiagram && (
                      <textarea className="mermaid-editor" value={editedMermaid} onChange={(e) => setEditedMermaid(e.target.value)} rows={16} spellCheck={false} style={{ width: '100%', padding: '10px', background: 'var(--bg-overlay)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'monospace', marginBottom: '12px' }} />
                    )}
                  </div>
                )}

                {/* Review Log */}
                {thread.length > 0 && (
                  <div className="card thread-card" style={{ marginTop: '20px' }}>
                    <div className="card-header">
                      <div>
                        <div className="card-title">Review Log</div>
                        <div className="card-subtitle">{showFullReviewLog ? 'Showing all project events.' : 'Showing latest events.'}</div>
                      </div>
                      <div className="thread-header-actions">
                        {thread.length > 6 && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setShowFullReviewLog((v) => !v)}>{showFullReviewLog ? 'Show recent only' : `Show ${thread.length - 6} older`}</button>
                        )}
                        <div className="badge badge-brand">{thread.length} entries</div>
                      </div>
                    </div>
                    <div className="thread-scroll">
                      {visibleThread.map((msg) => <ThreadEntry key={msg.id} msg={msg} />)}
                      <div ref={threadEndRef} />
                    </div>
                  </div>
                )}

                {/* ── Live Editing Drawer ── */}
                {showLiveEditDrawer && (
                  <div className="live-edit-overlay">
                    <div className="live-edit-drawer">
                      <div className="live-edit-header">
                        <div className="live-edit-title">
                          <Bot size={20} style={{ color: 'var(--accent)' }} />
                          <strong>AI is rewriting your document</strong>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowLiveEditDrawer(false)} disabled={isBusy} style={{ opacity: isBusy ? 0.4 : 1 }}>✕ Close</button>
                      </div>
                      {isBusy && (
                        <div className="live-edit-progress">
                          <div className="live-edit-progress-bar" />
                        </div>
                      )}
                      <div className="live-edit-log">
                        {liveEditLog.map((line, i) => (
                          <div key={i} className={`live-edit-line ${line.startsWith('❌') ? 'error' : line.startsWith('🎉') ? 'success' : ''}`}>
                            <span className="live-edit-dot" />
                            {line}
                          </div>
                        ))}
                      </div>
                      {!isBusy && liveEditLog.some(l => l.startsWith('🎉')) && (
                        <div className="live-edit-footer">
                          <button className="btn btn-primary" onClick={() => { setShowLiveEditDrawer(false); setActiveAnalysisStep('download'); }}>
                            <FileText size={15} /> Open Chapter Editor →
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
            {/* BUG 2 FIX: Approve/Reject discovery silently fails without active project */}
            {!currentProject && discoveries.length > 0 && (
              <div className="alert alert-error" style={{ gridColumn: '1 / -1', marginBottom: '16px' }}>
                <AlertCircle size={16} />
                <span>Open a project from the Projects tab to approve or reject skill discoveries.</span>
              </div>
            )}
            <div className="settings-group">
              <div className="settings-group-title">
                <Database size={16} /> Neon Skill Sync
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Connection status</div>
                  <div className="settings-desc">Bundled seed skills run locally. Neon is optional for community updates.</div>
                </div>
                <span className={`badge ${neonConnected ? 'badge-green' : 'badge-cyan'}`}>
                  {neonConnected ? 'Connected' : 'Local'}
                </span>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Last Sync Time</div>
                  <div className="settings-desc">Dual storage: Neon Cloud + Local Bundled Seeds</div>
                </div>
                <strong style={{ fontSize: '13px' }}>
                  {status?.skill_engine.cache.loaded_at
                    ? new Date(status.skill_engine.cache.loaded_at).toLocaleString()
                    : 'Bundled Seed Active'}
                </strong>
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

                  <button id="save-ai-settings-btn" className="btn btn-primary" onClick={() => void saveAiSettings()} disabled={isBusy || !aiDraft}>
                    Save AI Settings
                  </button>
                </>
              )}
            </div>

            <div className="settings-group">
              <div className="settings-group-title">
                <Database size={16} /> Neon Cloud Skill Sync
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Desktop connection</div>
                  <div className="settings-desc">
                    Installed desktop uses protected app-data credentials, not the source .env file.
                  </div>
                </div>
                <span className={`badge ${neonConnected ? 'badge-green' : neonDraft?.configured ? 'badge-amber' : 'badge-cyan'}`}>
                  {neonConnected ? 'Connected' : neonDraft?.configured ? 'Configured' : 'Local'}
                </span>
              </div>
              {neonDraft && (
                <>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Read connection</div>
                      <div className="settings-desc">Auto-configured from environment — {neonDraft.read_configured ? '✓ Connected' : 'Not configured'}</div>
                    </div>
                    <span className={`badge ${neonDraft.read_configured ? 'badge-green' : 'badge-amber'}`}>
                      {neonDraft.read_configured ? 'Active' : 'Missing'}
                    </span>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Write connection</div>
                      <div className="settings-desc">{neonDraft.write_configured ? '✓ Write pool ready' : 'Not configured'}</div>
                    </div>
                    <span className={`badge ${neonDraft.write_configured ? 'badge-green' : 'badge-amber'}`}>
                      {neonDraft.write_configured ? 'Active' : 'Missing'}
                    </span>
                  </div>
                  <div className="provider-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => void testNeonConnection()} disabled={isTestingNeon}>
                      <RefreshCw size={14} className={isTestingNeon ? 'spin' : ''} />
                      {isTestingNeon ? 'Testing...' : 'Test environment connection'}
                    </button>
                    {neonResult && (
                      <span className={`connection-result ${neonConnected ? 'ok' : 'fail'}`}>
                        {neonResult}
                      </span>
                    )}
                  </div>
                  <p className="settings-desc mt-2" style={{ opacity: 0.6 }}>
                    Neon PostgreSQL credentials are loaded from environment configuration. Contact your system administrator to update credentials.
                  </p>
                </>
              )}
            </div>

            <div className="settings-group">
              <div className="settings-group-title">
                <BookOpen size={16} /> Analysis Gate Rules
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Internet research scope</div>
                  <div className="settings-desc">OTIF probes multiple open scholarly APIs. If none respond, analysis continues as local-only and marks external verification unavailable.</div>
                </div>
                <span className="badge badge-cyan">Source-aware</span>
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

      {/* Persistent browser access link in footer */}
      <footer className="app-footer">
        <span className="footer-fallback-label">🌐 Browser UI:</span>
        <a
          href={apiDocsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="footer-fallback-url"
          title={isTauriDesktop() ? 'Open OTIF in your default browser' : 'Copy this URL to open OTIF in another browser tab'}
          onClick={openApiDocs}
        >
          {apiDocsUrl}
        </a>
        <span className="footer-version">OTIF v1.1.3 · Free &amp; Open Source · Apache-2.0</span>
      </footer>
    </div>
  );
}

export default App;
