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
  BarChart2,
  ExternalLink,
  Layers,
  Palette,
  Percent,
  ScanSearch,
  ThumbsUp,
  ThumbsDown,
  type LucideIcon,
} from 'lucide-react';

import { API_BASE } from './api';

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
  ai_detection?: AIDetectionResult;
  turnitin_similarity?: TurnitinSimilarity;
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

interface ChapterRewriteProposal {
  doc_id: string;
  chapter_id: string;
  title: string;
  provider: ProviderOption['id'];
  model: string | null;
  privacy_mode: string;
  proposed_text: string;
  citation_lock: {
    locked_count: number;
    all_restored: boolean;
    missing_tokens: string[];
  };
  requires_user_apply: boolean;
  message: string;
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

interface PerChapterDesign {
  chapterId: string;
  theme: string;
  accentHex: string;
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
  const [chapterGuidance, setChapterGuidance] = useState<string | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isRewritingChapter, setIsRewritingChapter] = useState(false);
  const [chapterProposal, setChapterProposal] = useState<ChapterRewriteProposal | null>(null);
  const [showCompiledPreview, setShowCompiledPreview] = useState(true);
  const [serviceDiagnostics, setServiceDiagnostics] = useState<string | null>(null);
  const [isCheckingServices, setIsCheckingServices] = useState(false);
  const [isRestartingBackend, setIsRestartingBackend] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityLog, setActivityLog] = useState<DiagnosticLogEntry[]>([]);

  // ── New feature state ──────────────────────────────────────────
  const [aiDetection, setAiDetection] = useState<AIDetectionResult | null>(null);
  const [turnitinSimilarity, setTurnitinSimilarity] = useState<TurnitinSimilarity | null>(null);
  const [perChapterDesigns, setPerChapterDesigns] = useState<PerChapterDesign[]>([]);
  const [showDesignPanel, setShowDesignPanel] = useState(false);
  const [showTurnitinDetail, setShowTurnitinDetail] = useState(false);
  const [approvalMode, setApprovalMode] = useState<'one-by-one' | 'batch'>('one-by-one');
  const [currentApprovalIndex, setCurrentApprovalIndex] = useState(0);

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
    () => improvementPlan.filter((item) => !completedImprovementIds.includes(item.id)),
    [improvementPlan, completedImprovementIds],
  );
  const completedImprovementPlan = useMemo(
    () => improvementPlan.filter((item) => completedImprovementIds.includes(item.id)),
    [improvementPlan, completedImprovementIds],
  );
  const approvedScopeIds = approvalResult?.approved_item_ids ?? approvedImprovementIds;
  const changedChapterCount = useMemo(
    () => chapterDrafts.filter((chapter) => chapter.edited_text !== chapter.original_text).length,
    [chapterDrafts],
  );
  const completionPercent = chapterDrafts.length
    ? Math.round((completedChapterIds.length / chapterDrafts.length) * 100)
    : 0;
  const visibleThread = showFullReviewLog ? thread : thread.slice(-6);
  const compiledPreview = useMemo(
    () =>
      chapterDrafts
        .map((chapter, index) => `${index + 1}. ${chapter.title}\n\n${chapter.edited_text}`)
        .join('\n\n'),
    [chapterDrafts],
  );
  const apiRoot = API_BASE.replace(/\/api\/v1$/, '');
  const apiDocsUrl = `${apiRoot}/app`;
  const normalizedDesignAccent = designAccentHex.trim();
  const designAccentValid = /^#?[0-9A-Fa-f]{6}$/.test(normalizedDesignAccent);
  const approvedReviewCount = new Set([...approvedImprovementIds, ...completedImprovementIds]).size;
  const sourceCheckedCount =
    researchSources?.checked_source_count ?? researchSources?.sources.filter((source) => source.status === 'checked').length ?? 0;
  const sourceNeedsKeyCount = researchSources?.sources.filter((source) => source.status === 'needs_key').length ?? 0;
  const sourceMatchCount =
    researchSources?.sources.reduce((total, source) => total + (source.matches?.length ?? 0), 0) ?? 0;
  const workflowSteps = [
    {
      label: 'Upload',
      detail: uploadResult?.filename ?? currentProject?.filename ?? 'Waiting for document',
      state: uploadResult || currentProject?.doc_id ? 'done' : 'todo',
    },
    {
      label: 'Analyze',
      detail: scores ? `${sourceCheckedCount}/${researchSources?.source_count ?? researchSources?.sources.length ?? 0} sources checked` : 'Run AI + skill audit',
      state: scores ? 'done' : isBusy ? 'active' : 'todo',
    },
    {
      label: 'Approve',
      detail: improvementPlan.length ? `${approvedReviewCount}/${improvementPlan.length} plan items` : 'Plan not ready',
      state: improvementPlan.length && approvedReviewCount >= improvementPlan.length ? 'done' : improvementPlan.length ? 'active' : 'todo',
    },
    {
      label: 'Revise',
      detail: chapterDrafts.length ? `${completedChapterIds.length}/${chapterDrafts.length} chapters complete` : 'Open chapter workflow',
      state: chapterDrafts.length && completedChapterIds.length >= chapterDrafts.length ? 'done' : chapterDrafts.length ? 'active' : 'todo',
    },
    {
      label: 'Export',
      detail: finalizeResult ? `${finalizeResult.artifacts.length} file(s) ready` : 'DOCX/PDF pending',
      state: finalizeResult ? 'done' : 'todo',
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
    try {
      const openedUrl = await invokeDesktop<string>('open_browser_fallback');
      setStatusNotice(`Opened Browser UI in your browser: ${openedUrl}`);
      addActivityLog('success', 'browser.docs.open', 'Browser UI opened through Tauri command.', openedUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.open(apiDocsUrl, '_blank', 'noopener,noreferrer');
      setError(`Open this URL in your browser: ${apiDocsUrl}. ${message}`);
      addActivityLog('error', 'browser.docs.open', 'Tauri browser open failed; used browser fallback.', message);
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
    setCompletedImprovementIds([]);
    setApprovalResult(null);
    setIntegrityReport(null);
    setDiagramResult(null);
    setChapterDrafts([]);
    setActiveChapterId(null);
    setCompletedChapterIds([]);
    setChapterGuidance(null);
    setChapterProposal(null);
    setFinalizeResult(null);
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
    setError(null);
    setStatusNotice(null);
    addActivityLog('info', 'skills.sync.project', 'Project skill sync started.', { projectId });
    try {
      await axios.post(`${API_BASE}/projects/${projectId}/sync-skills`);
      await refreshData();
      await loadThread(projectId);
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
      }>(`${API_BASE}/skills/pull`);
      const schema = res.data.neon_schema;
      const offlineMode = !schema?.ready;
      const message = res.data.message ?? schema?.message ?? 'Skill sync completed.';
      setNeonResult(message);
      setStatusNotice(message);
      await refreshData();
      if (currentProject) await loadThread(currentProject.id);
      if (offlineMode) {
        addActivityLog('warning', 'skills.sync.global', message, {
          neon: {
            configured: Boolean(schema?.configured),
            connected: Boolean(schema?.connected),
            ready: Boolean(schema?.ready),
            missing_tables: schema?.missing_tables?.length ?? 0,
          },
          local_skill_count: res.data.status?.cache?.skill_count,
        });
      } else {
        addActivityLog('success', 'skills.sync.global', message, {
          neon: {
            connected: true,
            ready: true,
          },
          local_skill_count: res.data.status?.cache?.skill_count,
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
    setChapterProposal(null);
    setFinalizeResult(null);
    setAiDetection(null);
    setTurnitinSimilarity(null);
    setPerChapterDesigns([]);
    setCurrentApprovalIndex(0);
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
        await loadThread(currentProject.id);
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
        }
        if (event.chapters) setChapterResults(event.chapters);
        if (event.research_sources) setResearchSources(event.research_sources);
        if (event.integrity_report) setIntegrityReport(event.integrity_report);
        if (event.ai_detection) setAiDetection(event.ai_detection);
        if (event.turnitin_similarity) setTurnitinSimilarity(event.turnitin_similarity);
        if (event.stage === 'error') {
          addActivityLog('error', 'analysis.run', event.message ?? 'Analysis failed.', event);
          throw new Error(event.message ?? 'Analysis failed.');
        }
      }
    }
    addActivityLog('success', 'analysis.run', 'Analysis completed.', { docId });
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
    setApprovedImprovementIds(activeImprovementPlan.map((item) => item.id));
    setApprovalResult(null);
  };

  const toggleOutputFormat = (format: string) => {
    setOutputFormats((prev) =>
      prev.includes(format) ? prev.filter((existing) => existing !== format) : [...prev, format],
    );
  };

  // ── Per-chapter design helpers ──────────────────────────────
  const getChapterDesign = (chapterId: string) =>
    perChapterDesigns.find((d) => d.chapterId === chapterId) ?? null;

  const setChapterDesign = (chapterId: string, theme: string, accentHex: string) => {
    setPerChapterDesigns((prev) => {
      const without = prev.filter((d) => d.chapterId !== chapterId);
      return [...without, { chapterId, theme, accentHex }];
    });
  };

  const clearChapterDesign = (chapterId: string) => {
    setPerChapterDesigns((prev) => prev.filter((d) => d.chapterId !== chapterId));
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

  const downloadCreditStatement = async () => {
    if (!uploadResult) return;
    try {
      const res = await axios.get(`${API_BASE}/analysis/credit-statement/${uploadResult.doc_id}`, {
        params: { project_id: currentProject?.id },
      });
      const statement = res.data.credit_statement;
      const blob = new Blob([statement], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CRediT_AI_Disclosure_${uploadResult.filename ?? 'thesis'}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to generate CRediT statement.');
    }
  };

  const approveRewrite = async () => {
    if (!uploadResult) return;
    const selectedIds = approvedImprovementIds.filter((itemId) =>
      activeImprovementPlan.some((item) => item.id === itemId),
    );
    if (selectedIds.length === 0) return;
    setIsBusy(true);
    setError(null);
    addActivityLog('info', 'rewrite.approve', 'Approved improvement rewrite started.', {
      docId: uploadResult.doc_id,
      approvedItemCount: selectedIds.length,
      drawDiagrams,
      outputFormats,
    });
    try {
      const res = await axios.post<RewriteApprovalResult>(`${API_BASE}/analysis/approve-rewrite`, {
        doc_id: uploadResult.doc_id,
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
      setApprovalResult(res.data);
      addActivityLog('success', 'rewrite.approve', 'Approved improvement rewrite completed.', res.data);
      setCompletedImprovementIds((prev) => Array.from(new Set([...prev, ...selectedIds])));
      setApprovedImprovementIds([]);

      // Log to thread
      if (currentProject) {
        await loadThread(currentProject.id);
      }

      // If diagram checkbox is ticked → generate diagram immediately
      if (drawDiagrams && improvementPlan.length > 0) {
        await generateDiagram();
      }
      await loadChapterEditor(false);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : 'Rewrite approval failed.';
      setError(String(message));
      addActivityLog('error', 'rewrite.approve', 'Rewrite approval failed.', message);
    } finally {
      setIsBusy(false);
    }
  };

  const generateDiagram = async () => {
    if (!uploadResult) return;
    setIsBusy(true);
    setError(null);
    addActivityLog('info', 'diagram.generate', 'Diagram generation started.', {
      docId: uploadResult.doc_id,
      diagramStyle,
      designTheme,
    });
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
    if (!uploadResult) return;
    if (showBusy) setIsBusy(true);
    setError(null);
    try {
      const res = await axios.get<ChapterEditorResult>(`${API_BASE}/analysis/chapter-editor/${uploadResult.doc_id}`, {
        params: { doc_type: docType, norm: targetFormat },
      });
      setChapterDrafts(res.data.chapters);
      setActiveChapterId(res.data.chapters[0]?.id ?? null);
      setChapterGuidance(res.data.revision_guidance);
      setChapterProposal(null);
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
    setChapterProposal((prev) => (prev?.chapter_id === chapterId ? prev : null));
  };

  const resetActiveChapter = () => {
    if (!activeChapter) return;
    updateChapterDraft(activeChapter.id, activeChapter.original_text);
  };

  const draftChapterRewrite = async () => {
    if (!uploadResult || !activeChapter) return;
    if (approvedScopeIds.length === 0) {
      setError('Approve at least one improvement item before drafting a chapter revision.');
      return;
    }
    setIsRewritingChapter(true);
    setError(null);
    addActivityLog('info', 'chapter.rewrite.draft', 'Chapter rewrite proposal started.', {
      docId: uploadResult.doc_id,
      chapterId: activeChapter.id,
      approvedItemCount: approvedScopeIds.length,
    });
    try {
      const res = await axios.post<ChapterRewriteProposal>(`${API_BASE}/analysis/chapter-rewrite-proposal`, {
        doc_id: uploadResult.doc_id,
        chapter_id: activeChapter.id,
        title: activeChapter.title,
        text: activeChapter.edited_text,
        approved_item_ids: approvedScopeIds,
        doc_type: docType,
        norm: targetFormat,
      });
      setChapterProposal(res.data);
      addActivityLog('success', 'chapter.rewrite.draft', 'Chapter rewrite proposal generated.', {
        chapterId: res.data.chapter_id,
      });
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : 'Chapter rewrite proposal failed.';
      setError(String(message));
      addActivityLog('error', 'chapter.rewrite.draft', 'Chapter rewrite proposal failed.', message);
    } finally {
      setIsRewritingChapter(false);
    }
  };

  const applyChapterProposal = () => {
    if (!chapterProposal) return;
    updateChapterDraft(chapterProposal.chapter_id, chapterProposal.proposed_text);
    setActiveChapterId(chapterProposal.chapter_id);
    setCompletedChapterIds((prev) =>
      prev.includes(chapterProposal.chapter_id) ? prev : [...prev, chapterProposal.chapter_id],
    );
    setChapterProposal(null);
  };

  const markActiveChapterComplete = () => {
    if (!activeChapter) return;
    setCompletedChapterIds((prev) =>
      prev.includes(activeChapter.id) ? prev.filter((id) => id !== activeChapter.id) : [...prev, activeChapter.id],
    );
  };

  const finalizeThesis = async () => {
    if (!uploadResult || chapterDrafts.length === 0) return;
    setIsFinalizing(true);
    setError(null);
    addActivityLog('info', 'thesis.finalize', 'Final thesis export started.', {
      docId: uploadResult.doc_id,
      chapterCount: chapterDrafts.length,
      outputFormats,
      designTheme,
    });
    try {
      const res = await axios.post<FinalizeResult>(`${API_BASE}/analysis/finalize-thesis`, {
        doc_id: uploadResult.doc_id,
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
      if (currentProject) await loadThread(currentProject.id);
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
    // BUG 3 FIX: Tauri WebView2 blocks programmatic anchor.click() on localhost URLs.
    // window.open() with '_blank' works correctly in both WebView2 and regular browsers:
    // - In Tauri desktop: opens the OS default browser which handles the download
    // - In browser: opens a new tab which triggers the file download from the backend
    const href = artifactHref(artifact);
    window.open(href, '_blank', 'noopener,noreferrer');
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
          : 'Neon offline — Using long-term local bundled seed skills'
      }
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

                <section className="academic-chat-shell">
                  <div className="academic-chat-main">
                    <div className="assistant-bubble">
                      <div className="assistant-avatar">
                        <Bot size={18} />
                      </div>
                      <div className="assistant-message">
                        <div className="assistant-message-kicker">Academic Review Assistant</div>
                        <h2>{scores ? 'Your evidence report and improvement workflow are ready.' : 'Upload a thesis or paper and I will run the academic integrity workflow.'}</h2>
                        <p>
                          I will check active skills, AI-writing signals, originality, open academic sources,
                          chapter/page improvement items, diagram opportunities, and final DOCX/PDF readiness.
                        </p>
                        <div className="assistant-action-row">
                          <button
                            className="btn btn-primary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isBusy}
                          >
                            <UploadCloud size={16} />
                            {uploadResult || currentProject.doc_id ? 'Analyze another version' : 'Upload document'}
                          </button>
                          {improvementPlan.length > 0 && (
                            <button className="btn btn-secondary" onClick={() => setApprovalMode('one-by-one')}>
                              <ThumbsUp size={16} />
                              Review improvements
                            </button>
                          )}
                          {chapterDrafts.length > 0 && (
                            <button className="btn btn-secondary" onClick={() => void finalizeThesis()} disabled={isFinalizing || !designAccentValid}>
                              <Download size={16} />
                              {finalizeResult ? 'Regenerate package' : 'Finalize package'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="workflow-timeline">
                      {workflowSteps.map((step) => (
                        <div key={step.label} className={`workflow-step ${step.state}`}>
                          <span>{step.state === 'done' ? <CheckCircle2 size={14} /> : <Activity size={14} />}</span>
                          <div>
                            <strong>{step.label}</strong>
                            <small>{step.detail}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <aside className="academic-chat-side">
                    <div className="source-summary-card">
                      <div className="source-summary-title">
                        <GlobeLock size={16} />
                        Open Source Coverage
                      </div>
                      <strong>{researchSources ? `${sourceCheckedCount}/${researchSources.source_count ?? researchSources.sources.length}` : '13'} sources</strong>
                      <span>{researchSources ? `${sourceMatchCount} candidate matches` : 'Ready after analysis'}</span>
                      {sourceNeedsKeyCount > 0 && <small>{sourceNeedsKeyCount} source(s) need API key configuration</small>}
                    </div>
                    <div className="source-chip-grid">
                      {(researchSources?.sources ?? [
                        { id: 'arxiv', name: 'arXiv', status: 'skipped' as const },
                        { id: 'crossref', name: 'Crossref', status: 'skipped' as const },
                        { id: 'openalex', name: 'OpenAlex', status: 'skipped' as const },
                        { id: 'pubmed', name: 'PubMed', status: 'skipped' as const },
                        { id: 'datacite', name: 'DataCite', status: 'skipped' as const },
                        { id: 'eric', name: 'ERIC', status: 'skipped' as const },
                      ]).slice(0, 8).map((source) => (
                        <span key={source.id} className={`source-chip ${source.status}`}>
                          {source.name}
                        </span>
                      ))}
                    </div>
                  </aside>
                </section>

                {/* Project thread */}
                {thread.length > 0 && (
                  <div className="card thread-card mb-6">
                    <div className="card-header">
                      <div>
                        <div className="card-title">Review Log</div>
                        <div className="card-subtitle">
                          {showFullReviewLog ? 'Showing all project events.' : 'Showing latest events. Older entries are hidden.'}
                        </div>
                      </div>
                      <div className="thread-header-actions">
                        {thread.length > 6 && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setShowFullReviewLog((value) => !value)}>
                            {showFullReviewLog ? 'Show recent only' : `Show ${thread.length - 6} older`}
                          </button>
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

                        {integrityReport && (
                          <>
                            <div className="divider" />
                            <div className="integrity-grade-panel">
                              <div>
                                <div className="settings-group-title">Integrity Grade</div>
                                <div className={`integrity-grade ${integrityReport.grade}`}>
                                  {integrityReport.grade.replaceAll('_', ' ')}
                                </div>
                              </div>
                              <p className="text-secondary text-sm">
                                AI-writing risk is a writing-pattern signal, not proof of authorship. The grade is based
                                on local document checks, reachable open scholarly sources, and configured skills.
                              </p>
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

                      {/* Expandable Connector Intelligence Log (Thinking & Research) */}
                      {researchSources && (
                        <div className="card animate-scale research-connectors-panel">
                          <div
                            className="card-header"
                            onClick={() => setExpandConnectors(!expandConnectors)}
                            style={{ cursor: 'pointer', userSelect: 'none' }}
                          >
                            <div>
                              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>Thinking & Research Connectors</span>
                                <span className="badge badge-cyan">{researchSources.sources.length} repositories checked</span>
                              </div>
                              <div className="card-subtitle">
                                Active Query: "{researchSources.queries?.[0] ?? 'Scholarly document analysis'}"
                              </div>
                            </div>
                            <div className="badge badge-purple" style={{ fontSize: '12px' }}>
                              {expandConnectors ? '▲ Hide Log' : '▼ Expand Research Step'}
                            </div>
                          </div>

                          {expandConnectors && (
                            <div className="connector-accordion" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {researchSources.sources.map((source) => (
                                <div
                                  className="connector-card"
                                  key={source.id}
                                  style={{
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    background: 'var(--bg-card-subtle, rgba(255,255,255,0.02))',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '16px' }}>🌐</span>
                                      <div>
                                        <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>{source.name}</strong>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                          {source.coverage ?? 'scholarly metadata'}
                                          {source.cached ? ' · cached' : ''}
                                          {source.requires_key ? ` · ${source.configured ? 'key configured' : 'key needed'}` : ''}
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <span className={`badge ${source.status === 'checked' ? 'badge-green' : source.status === 'needs_key' ? 'badge-rose' : 'badge-amber'}`}>
                                        {source.matches?.length ?? 0} results found
                                      </span>
                                      <span className="badge badge-purple">{source.status}</span>
                                    </div>
                                  </div>

                                  {source.access_note && (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.45 }}>
                                      {source.access_note}
                                      {source.docs_url && (
                                        <>
                                          {' '}
                                          <a href={source.docs_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                                            API docs
                                          </a>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {source.matches && source.matches.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', paddingLeft: '8px', borderLeft: '2px solid var(--accent)' }}>
                                      {source.matches.map((m, idx) => (
                                        <div key={idx} style={{ fontSize: '13px', lineHeight: '1.4' }}>
                                          <div style={{ fontWeight: 500 }}>
                                            {m.url ? (
                                              <a href={m.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                                                {m.title} ↗
                                              </a>
                                            ) : (
                                              <span style={{ color: 'var(--text-main)' }}>{m.title}</span>
                                            )}
                                          </div>
                                          {m.year && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Published / Indexed: {m.year}</div>}
                                          {m.evidence && (
                                            <div className={`source-evidence ${m.evidence.classification}`}>
                                              <div>
                                                <strong>{m.evidence.classification.replaceAll('_', ' ')}</strong>
                                                <span> Â· {m.evidence.overlap_percent}% title/query overlap</span>
                                              </div>
                                              {m.evidence.shared_terms.length > 0 && (
                                                <div>Shared terms: {m.evidence.shared_terms.join(', ')}</div>
                                              )}
                                              {m.evidence.document_passage && (
                                                <div className="source-passage">"{m.evidence.document_passage}"</div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                      {source.message ?? 'No matching public entries found.'}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Ethical Boundaries Banner */}
                      <div className="card animate-scale" style={{ borderLeft: '4px solid #10b981', background: 'rgba(16, 185, 129, 0.05)', marginBottom: '16px' }}>
                        <div className="card-header" style={{ paddingBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShieldCheck size={18} style={{ color: '#10b981' }} />
                            <span className="card-title" style={{ fontSize: '15px' }}>Active Ethical &amp; Scope Boundaries</span>
                          </div>
                          <span className="badge badge-green">Strict Compliance Gate</span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                          <div style={{ marginBottom: '4px' }}>&bull; <strong>No Data Fabrication:</strong> OTIF never generates empirical observations, statistical data, or false findings.</div>
                          <div style={{ marginBottom: '4px' }}>&bull; <strong>Deterministic Citation Locking:</strong> All DOIs and citations are extracted into immutable AST/Regex placeholders before syntactic revision.</div>
                          <div>&bull; <strong>CRediT Disclosure Ready:</strong> Every revision action is immutably logged for transparent journal AI disclosure compliance.</div>
                        </div>
                      </div>

                      {/* ── NEW: AI Detection Report Panel ── */}
                      {aiDetection && (
                        <div className="card animate-scale" style={{ borderLeft: `4px solid ${aiDetection.ai_detection_score >= 50 ? '#f59e0b' : '#10b981'}`, marginBottom: '16px' }}>
                          <div className="card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <ScanSearch size={18} style={{ color: aiDetection.ai_detection_score >= 50 ? '#f59e0b' : '#10b981' }} />
                              <div>
                                <div className="card-title">AI Detection Report</div>
                                <div className="card-subtitle">Multi-signal analysis — GPTZero / Copyleaks methodology</div>
                              </div>
                            </div>
                            <span className={`badge ${aiDetection.ai_detection_score >= 75 ? 'badge-rose' : aiDetection.ai_detection_score >= 50 ? 'badge-amber' : aiDetection.ai_detection_score >= 25 ? 'badge-cyan' : 'badge-green'}`}>
                              {aiDetection.confidence} confidence
                            </span>
                          </div>

                          {/* Big Score Gauge */}
                          <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <div style={{ position: 'relative', width: '100px', height: '100px', flexShrink: 0 }}>
                              <svg width="100" height="100" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="12" />
                                <circle
                                  cx="50" cy="50" r="40"
                                  fill="none"
                                  stroke={aiDetection.ai_detection_score >= 75 ? '#ef4444' : aiDetection.ai_detection_score >= 50 ? '#f59e0b' : aiDetection.ai_detection_score >= 25 ? '#3b82f6' : '#10b981'}
                                  strokeWidth="12"
                                  strokeDasharray={`${aiDetection.ai_detection_score * 2.51} 251`}
                                  strokeLinecap="round"
                                  transform="rotate(-90 50 50)"
                                  style={{ transition: 'stroke-dasharray 0.8s ease' }}
                                />
                                <text x="50" y="46" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text-main)">{aiDetection.ai_detection_score}%</text>
                                <text x="50" y="62" textAnchor="middle" fontSize="9" fill="var(--text-muted)">AI DETECTED</text>
                              </svg>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '8px', lineHeight: '1.5' }}>{aiDetection.verdict}</p>
                              <div style={{ fontSize: '11px', padding: '6px 10px', background: 'var(--bg-overlay)', borderRadius: '6px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                {aiDetection.turnitin_ai_equivalent}
                              </div>
                            </div>
                          </div>

                          {/* Signal Breakdown */}
                          {aiDetection.signals && (
                            <div style={{ padding: '0 20px 16px' }}>
                              <div className="settings-group-title" style={{ marginBottom: '10px' }}><BarChart2 size={14} /> Signal Breakdown</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                                {Object.entries(aiDetection.signals).map(([key, val]) => (
                                  <div key={key} style={{ background: 'var(--bg-overlay)', borderRadius: '6px', padding: '8px 10px' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{key.replace(/_/g, ' ')}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${Math.min(100, Math.abs(val as number))}%`, background: key.includes('reduction') ? '#10b981' : (val as number) > 60 ? '#ef4444' : (val as number) > 30 ? '#f59e0b' : '#3b82f6', transition: 'width 0.5s ease' }} />
                                      </div>
                                      <span style={{ fontSize: '12px', fontWeight: 600, minWidth: '36px', textAlign: 'right' }}>{(val as number).toFixed(0)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── NEW: Turnitin-Style Similarity Panel ── */}
                      {turnitinSimilarity && (
                        <div className="card animate-scale" style={{ borderLeft: `4px solid ${turnitinSimilarity.similarity_index >= 40 ? '#ef4444' : turnitinSimilarity.similarity_index >= 20 ? '#f59e0b' : '#10b981'}`, marginBottom: '16px' }}>
                          <div
                            className="card-header"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setShowTurnitinDetail(!showTurnitinDetail)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Percent size={18} style={{ color: turnitinSimilarity.similarity_index >= 40 ? '#ef4444' : '#10b981' }} />
                              <div>
                                <div className="card-title">Turnitin-Style Similarity Index</div>
                                <div className="card-subtitle">{turnitinSimilarity.match_count} sources • n-gram shingle + cosine fingerprint</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span className={`badge ${turnitinSimilarity.similarity_index >= 40 ? 'badge-rose' : turnitinSimilarity.similarity_index >= 20 ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: '18px', fontWeight: 700, padding: '6px 14px' }}>
                                {turnitinSimilarity.similarity_index.toFixed(1)}%
                              </span>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{showTurnitinDetail ? '▲' : '▼'}</span>
                            </div>
                          </div>
                          <div style={{ padding: '0 20px 16px' }}>
                            <p style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-main)' }}>{turnitinSimilarity.interpretation}</p>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                              <div style={{ flex: 1, height: '10px', background: 'var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${turnitinSimilarity.similarity_index}%`, background: turnitinSimilarity.similarity_index >= 40 ? 'linear-gradient(90deg,#ef4444,#dc2626)' : turnitinSimilarity.similarity_index >= 20 ? 'linear-gradient(90deg,#f59e0b,#d97706)' : 'linear-gradient(90deg,#10b981,#059669)', transition: 'width 1s ease', borderRadius: '5px' }} />
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: 600 }}>{turnitinSimilarity.high_risk_matches} high risk • {turnitinSimilarity.medium_risk_matches} medium risk</span>
                            </div>
                          </div>

                          {showTurnitinDetail && turnitinSimilarity.per_source_similarity.length > 0 && (
                            <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--border)' }}>
                              <div className="settings-group-title" style={{ marginBottom: '10px', marginTop: '12px' }}>Per-Source Similarity Breakdown</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {turnitinSimilarity.per_source_similarity.slice(0, 8).map((src, idx) => (
                                  <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-overlay)', borderRadius: '6px', borderLeft: `3px solid ${src.risk_level === 'high' ? '#ef4444' : src.risk_level === 'medium' ? '#f59e0b' : src.risk_level === 'low' ? '#3b82f6' : 'var(--border)'}` }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {src.source_url ? (
                                          <a href={src.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                                            {src.source_title} <ExternalLink size={11} />
                                          </a>
                                        ) : src.source_title}
                                      </div>
                                      {src.source_year && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{src.source_year}</div>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                      <span className={`badge ${src.risk_level === 'high' ? 'badge-rose' : src.risk_level === 'medium' ? 'badge-amber' : 'badge-cyan'}`}>{src.combined_similarity.toFixed(1)}%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── NEW: Design Skill Panel ── */}
                      {improvementPlan.length > 0 && (
                        <div className="card animate-scale" style={{ marginBottom: '16px', border: showDesignPanel ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
                          <div
                            className="card-header"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setShowDesignPanel(!showDesignPanel)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Palette size={18} style={{ color: 'var(--accent)' }} />
                              <div>
                                <div className="card-title">Design Skill</div>
                                <div className="card-subtitle">Global theme shared across all chapters. Override per chapter if needed.</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span className="badge badge-brand" style={{ background: designAccentValid ? (normalizedDesignAccent.startsWith('#') ? normalizedDesignAccent : `#${normalizedDesignAccent}`) : '#1f4e79', color: 'white' }}>
                                {designThemeOptions.find(o => o.id === designTheme)?.label ?? designTheme}
                              </span>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{showDesignPanel ? '▲' : '▼'}</span>
                            </div>
                          </div>

                          {showDesignPanel && (
                            <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                              <div className="rewrite-option-grid">
                                <label className="context-field">
                                  <span className="settings-label">Global Design theme</span>
                                  <select
                                    className="settings-input full-width"
                                    value={designTheme}
                                    onChange={(e) => setDesignTheme(e.target.value)}
                                  >
                                    {designThemeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                  </select>
                                </label>
                                <label className="context-field">
                                  <span className="settings-label">Global Accent color</span>
                                  <div className="color-input-row">
                                    <input
                                      type="color"
                                      value={designAccentValid ? (normalizedDesignAccent.startsWith('#') ? normalizedDesignAccent : `#${normalizedDesignAccent}`) : '#1f4e79'}
                                      onChange={(e) => setDesignAccentHex(e.target.value)}
                                      aria-label="Global document accent color"
                                    />
                                    <input
                                      className={`settings-input full-width ${designAccentValid ? '' : 'input-error'}`}
                                      value={designAccentHex}
                                      onChange={(e) => setDesignAccentHex(e.target.value)}
                                      placeholder="#1f4e79"
                                    />
                                  </div>
                                </label>
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
                              </div>

                              {/* Per-chapter overrides */}
                              {chapterResults.length > 0 && (
                                <div>
                                  <div className="settings-group-title" style={{ marginBottom: '10px' }}><Layers size={14} /> Per-Chapter Design Override (optional)</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {chapterResults.slice(0, 10).map((chapter) => {
                                      const override = getChapterDesign(chapter.id);
                                      return (
                                        <div key={chapter.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-overlay)', borderRadius: '6px' }}>
                                          <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{chapter.title}</span>
                                          {override ? (
                                            <>
                                              <input
                                                type="color"
                                                value={override.accentHex}
                                                onChange={(e) => setChapterDesign(chapter.id, override.theme, e.target.value)}
                                                style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                              />
                                              <select
                                                className="settings-input"
                                                style={{ width: '140px' }}
                                                value={override.theme}
                                                onChange={(e) => setChapterDesign(chapter.id, e.target.value, override.accentHex)}
                                              >
                                                {designThemeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                              </select>
                                              <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => clearChapterDesign(chapter.id)}>Reset</button>
                                            </>
                                          ) : (
                                            <button
                                              className="btn btn-secondary btn-sm"
                                              style={{ padding: '4px 10px', fontSize: '12px' }}
                                              onClick={() => setChapterDesign(chapter.id, designTheme, designAccentHex)}
                                            >
                                              + Override
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {improvementPlan.length > 0 && (
                        <div className="card animate-scale improvement-plan-panel">
                          <div className="card-header">
                            <div>
                              <div className="card-title">Improvement Work Queue</div>
                              <div className="card-subtitle">
                                Approve items one-by-one, then revise chapters and compile the full document.
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={downloadReport}
                                title="Download detailed markdown report"
                              >
                                📥 Full Report (.md)
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={downloadCreditStatement}
                                title="Generate formal CRediT AI Contribution Statement"
                                style={{ border: '1px solid #10b981', color: '#10b981' }}
                              >
                                📜 CRediT (.md)
                              </button>
                              <div className="badge badge-green">{approvedImprovementIds.length}/{improvementPlan.length} approved</div>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div style={{ padding: '0 20px 12px' }}>
                            <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' }}>
                              <div style={{ height: '100%', width: `${improvementPlan.length > 0 ? (approvedImprovementIds.length / improvementPlan.length * 100) : 0}%`, background: 'linear-gradient(90deg, var(--accent), #10b981)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                              <span>{approvedImprovementIds.length} approved</span>
                              <span>{improvementPlan.length - approvedImprovementIds.length} remaining</span>
                            </div>
                          </div>

                          <div className="workflow-strip">
                            <div>
                              <span>1</span>
                              <strong>{activeImprovementPlan.length} active suggestion(s)</strong>
                              <small>Approve the changes you want.</small>
                            </div>
                            <div>
                              <span>2</span>
                              <strong>{chapterDrafts.length || chapterResults.length} chapter block(s)</strong>
                              <small>Work one chapter at a time.</small>
                            </div>
                            <div>
                              <span>3</span>
                              <strong>{finalizeResult ? 'Package ready' : 'Finalize pending'}</strong>
                              <small>Download full DOCX/PDF.</small>
                            </div>
                          </div>

                          {/* Approval mode toggle */}
                          <div style={{ padding: '0 20px 12px', display: 'flex', gap: '8px' }}>
                            <button
                              className={`btn btn-sm ${approvalMode === 'one-by-one' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setApprovalMode('one-by-one')}
                            >
                              <ThumbsUp size={13} /> One-by-One
                            </button>
                            <button
                              className={`btn btn-sm ${approvalMode === 'batch' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setApprovalMode('batch')}
                            >
                              <Layers size={13} /> Batch Review
                            </button>
                          </div>

                          {/* One-by-one approval wizard */}
                          {approvalMode === 'one-by-one' && activeImprovementPlan.length > 0 && (() => {
                            const item = activeImprovementPlan[currentApprovalIndex] ?? activeImprovementPlan[0];
                            const isApproved = item ? approvedImprovementIds.includes(item.id) : false;
                            const progress = `${Math.min(currentApprovalIndex + 1, activeImprovementPlan.length)} / ${activeImprovementPlan.length}`;
                            return item ? (
                              <div style={{ margin: '0 20px 16px', border: '1px solid var(--accent)', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ padding: '14px 16px', background: 'var(--bg-overlay)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{progress}</span>
                                    <span className={`badge ${item.priority === 'high' ? 'badge-amber' : 'badge-cyan'}`}>{item.priority}</span>
                                    {isApproved && <span className="badge badge-green">✓ Approved</span>}
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={prevApprovalItem}
                                      disabled={currentApprovalIndex === 0}
                                      style={{ padding: '4px 10px' }}
                                    >←</button>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={skipCurrentItem}
                                      disabled={currentApprovalIndex >= activeImprovementPlan.length - 1}
                                      style={{ padding: '4px 10px' }}
                                    >→</button>
                                  </div>
                                </div>
                                <div style={{ padding: '16px' }}>
                                  <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>{item.title}</div>
                                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: '1.6' }}>{item.action}</p>
                                  <div className="plan-evidence" style={{ marginBottom: '14px' }}>{item.evidence}</div>
                                  <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                      id={`approve-item-${item.id}`}
                                      className={`btn ${isApproved ? 'btn-secondary' : 'btn-primary'}`}
                                      onClick={() => {
                                        toggleApprovedImprovement(item.id);
                                        if (!isApproved && currentApprovalIndex < activeImprovementPlan.length - 1) {
                                          setTimeout(() => setCurrentApprovalIndex((i) => i + 1), 300);
                                        }
                                      }}
                                      style={{ flex: 1 }}
                                    >
                                      {isApproved ? <><ThumbsDown size={14} /> Unapprove</> : <><ThumbsUp size={14} /> Approve</>}
                                    </button>
                                    <button
                                      className="btn btn-secondary"
                                      onClick={skipCurrentItem}
                                      disabled={currentApprovalIndex >= activeImprovementPlan.length - 1}
                                    >
                                      Skip →
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : null;
                          })()}

                          {/* Batch approval list */}
                          {approvalMode === 'batch' && (
                            <div className="plan-list">
                              {activeImprovementPlan.map((item) => (
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
                              {activeImprovementPlan.length === 0 && (
                                <div className="empty-inline">
                                  All suggestions have been approved. Continue chapter edits or finalize the package.
                                </div>
                              )}
                            </div>
                          )}

                          {completedImprovementPlan.length > 0 && (
                            <div className="completed-plan-list">
                              <div className="settings-group-title">Approved and removed from active queue</div>
                              {completedImprovementPlan.map((item) => (
                                <div className="completed-plan-item" key={item.id}>
                                  <CheckCircle2 size={14} />
                                  <span>{item.title}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Approve All shortcut */}
                          {approvedImprovementIds.length < improvementPlan.length && (
                            <div style={{ padding: '0 20px 12px' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setApprovedImprovementIds(improvementPlan.map(i => i.id))}
                              >
                                <BadgeCheck size={14} /> Approve All ({improvementPlan.length})
                              </button>
                            </div>
                          )}

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
                              </div>
                            )}

                            <div className="rewrite-option-grid">
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
                              <label className="context-field">
                                <span className="settings-label">Document accent color</span>
                                <div className="color-input-row">
                                  <input
                                    type="color"
                                    value={designAccentValid ? (normalizedDesignAccent.startsWith('#') ? normalizedDesignAccent : `#${normalizedDesignAccent}`) : '#1f4e79'}
                                    onChange={(e) => setDesignAccentHex(e.target.value)}
                                    aria-label="Document accent color"
                                  />
                                  <input
                                    className={`settings-input full-width ${designAccentValid ? '' : 'input-error'}`}
                                    value={designAccentHex}
                                    onChange={(e) => setDesignAccentHex(e.target.value)}
                                    placeholder="#1f4e79"
                                    spellCheck={false}
                                  />
                                </div>
                                {!designAccentValid && (
                                  <span className="field-error">Use a 6-digit hex color, for example #1F4E79.</span>
                                )}
                              </label>
                            </div>

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
                              className="btn btn-secondary"
                              onClick={approveAllRemainingImprovements}
                              disabled={isBusy || activeImprovementPlan.length === 0}
                            >
                              Select all remaining
                            </button>
                            <button
                              id="approve-rewrite-btn"
                              className="btn btn-primary"
                              onClick={() => void approveRewrite()}
                              disabled={isBusy || approvedImprovementIds.length === 0 || outputFormats.length === 0 || !designAccentValid}
                            >
                              <Bot size={16} />
                              Approve selected and open chapter workflow
                              {drawDiagrams && ' + Diagram'}
                            </button>
                            {(approvalResult || completedImprovementPlan.length > 0) && (
                              <button
                                className="btn btn-secondary"
                                onClick={() => void loadChapterEditor()}
                                disabled={isBusy}
                              >
                                <FileText size={16} />
                                Open chapter editor
                              </button>
                            )}
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
                              <div className="settings-group-title">Integrity-Preserving Revision Preview</div>
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
                              onClick={() => { setEditingDiagram(!editingDiagram); setEditedMermaid(editedMermaid || diagramResult.mermaid_source); }}
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

                          <MermaidPreview chart={editedMermaid || diagramResult.mermaid_source} />

                          {editingDiagram && (
                            <textarea
                              className="mermaid-editor"
                              value={editedMermaid}
                              onChange={(e) => setEditedMermaid(e.target.value)}
                              rows={16}
                              spellCheck={false}
                              style={{ width: '100%', padding: '10px', background: 'var(--bg-overlay)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'monospace', marginBottom: '12px' }}
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

                      {chapterDrafts.length > 0 && (
                        <div className="card animate-scale chapter-editor-panel">
                          <div className="card-header">
                            <div>
                              <div className="card-title">Chapter Live Editor</div>
                              <div className="card-subtitle">
                                Edit approved chapter text locally, preview the compiled document, then export DOCX/PDF.
                              </div>
                            </div>
                            <div className="badge badge-green">{chapterDrafts.length} chapters loaded</div>
                          </div>

                          {chapterGuidance && (
                            <div className="revision-guidance">
                              <div className="settings-group-title">AI revision guidance</div>
                              <p>{chapterGuidance}</p>
                            </div>
                          )}

                          <div className="chapter-progress-strip">
                            <div>
                              <strong>{completedChapterIds.length}/{chapterDrafts.length}</strong>
                              <span>chapters marked complete</span>
                            </div>
                            <div>
                              <strong>{changedChapterCount}</strong>
                              <span>chapter(s) edited</span>
                            </div>
                            <div>
                              <strong>{completionPercent}%</strong>
                              <span>ready for final compile</span>
                            </div>
                          </div>

                          <div className="chapter-editor-layout">
                            <div className="chapter-rail">
                              {chapterDrafts.map((chapter, index) => {
                                const changed = chapter.edited_text !== chapter.original_text;
                                const completed = completedChapterIds.includes(chapter.id);
                                return (
                                  <button
                                    key={chapter.id}
                                    className={`chapter-tab ${activeChapter?.id === chapter.id ? 'active' : ''} ${completed ? 'complete' : ''}`}
                                    onClick={() => selectChapter(chapter.id)}
                                  >
                                    <span>{index + 1}. {chapter.title}</span>
                                    <small>{completed ? 'complete' : changed ? 'edited' : `${chapter.word_count ?? 0} words`}</small>
                                  </button>
                                );
                              })}
                            </div>

                            <div className="chapter-edit-surface">
                              {activeChapter && (
                                <>
                                  <div className="chapter-edit-toolbar">
                                    <div>
                                      <div className="settings-label">Editing</div>
                                      <strong>{activeChapter.title}</strong>
                                    </div>
                                    <div className="chapter-toolbar-actions">
                                      <button className="btn btn-secondary btn-sm" onClick={resetActiveChapter}>
                                        Reset chapter
                                      </button>
                                      <button className="btn btn-secondary btn-sm" onClick={markActiveChapterComplete}>
                                        {completedChapterIds.includes(activeChapter.id) ? 'Reopen chapter' : 'Mark chapter complete'}
                                      </button>
                                      <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => void draftChapterRewrite()}
                                        disabled={isRewritingChapter || approvedScopeIds.length === 0}
                                        title={approvedScopeIds.length === 0 ? 'Approve at least one improvement item first' : 'Draft AI-assisted revision for this chapter'}
                                      >
                                        <Bot size={14} />
                                        {isRewritingChapter ? 'Drafting...' : 'Draft AI revision'}
                                      </button>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setShowCompiledPreview((value) => !value)}
                                      >
                                        {showCompiledPreview ? 'Hide preview' : 'Show preview'}
                                      </button>
                                    </div>
                                  </div>

                                  <textarea
                                    className="chapter-editor-textarea"
                                    value={activeChapter.edited_text}
                                    onChange={(e) => updateChapterDraft(activeChapter.id, e.target.value)}
                                    spellCheck
                                  />

                                  {chapterProposal && chapterProposal.chapter_id === activeChapter.id && (
                                    <div className="chapter-proposal">
                                      <div className="chapter-proposal-header">
                                        <div>
                                          <div className="settings-group-title">AI chapter proposal</div>
                                          <span className="settings-desc">
                                            {chapterProposal.provider} / {chapterProposal.model ?? 'selected model'} · citations locked: {chapterProposal.citation_lock.locked_count}
                                          </span>
                                        </div>
                                        <div className="chapter-toolbar-actions">
                                          <button className="btn btn-secondary btn-sm" onClick={() => setChapterProposal(null)}>
                                            Reject
                                          </button>
                                          <button className="btn btn-primary btn-sm" onClick={applyChapterProposal}>
                                            <CheckCircle2 size={14} />
                                            Apply to chapter
                                          </button>
                                        </div>
                                      </div>
                                      <pre>{chapterProposal.proposed_text.slice(0, 8000)}</pre>
                                      {!chapterProposal.citation_lock.all_restored && (
                                        <div className="field-error">
                                          Some citation placeholders were not restored. Review carefully before applying.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {showCompiledPreview && (
                            <div className="compiled-preview">
                              <div className="compiled-preview-header">
                                <div>
                                  <div className="settings-group-title">Compiled document preview</div>
                                  <span className="settings-desc">
                                    {compiledPreview.split(/\s+/).filter(Boolean).length.toLocaleString()} words assembled
                                  </span>
                                </div>
                                <button
                                  className="btn btn-primary"
                                  onClick={() => void finalizeThesis()}
                                  disabled={isFinalizing || outputFormats.length === 0 || !designAccentValid}
                                >
                                  <FileText size={16} />
                                  {isFinalizing ? 'Finalizing...' : 'Finalize full document package'}
                                </button>
                              </div>
                              <pre>{compiledPreview.slice(0, 12000)}</pre>
                              {compiledPreview.length > 12000 && (
                                <div className="settings-desc">Preview truncated for speed. Full edited text is exported.</div>
                              )}
                            </div>
                          )}

                          {!showCompiledPreview && (
                            <div className="finalize-dock">
                              <div>
                                <div className="settings-group-title">Final full document package</div>
                                <span className="settings-desc">
                                  Compile all edited chapters into one downloadable DOCX/PDF.
                                </span>
                              </div>
                              <button
                                className="btn btn-primary"
                                onClick={() => void finalizeThesis()}
                                disabled={isFinalizing || outputFormats.length === 0 || !designAccentValid}
                              >
                                <FileText size={16} />
                                {isFinalizing ? 'Finalizing...' : 'Finalize and download full document'}
                              </button>
                            </div>
                          )}

                          {finalizeResult && (
                            <div className="finalize-output">
                              <div className="card-header compact-header">
                                <div>
                                  <div className="card-title">Final Thesis Package Ready</div>
                                  <div className="card-subtitle">
                                    Generated after approval from {finalizeResult.chapter_count} edited chapter(s).
                                  </div>
                                </div>
                                <div className="badge badge-green">Ready to download</div>
                              </div>

                              <div className="artifact-grid">
                                {finalizeResult.artifacts.map((artifact) => (
                                  <button
                                    key={artifact.filename}
                                    className="artifact-card"
                                    onClick={() => downloadArtifact(artifact)}
                                  >
                                    <FileText size={20} />
                                    <span>{artifact.format.toUpperCase()}</span>
                                    <strong>{artifact.filename}</strong>
                                    <small>{(artifact.size_bytes / 1024).toFixed(1)} KB</small>
                                  </button>
                                ))}
                              </div>

                              {finalizeResult.field_update_status && (
                                <div className={`front-matter-status ${finalizeResult.field_update_status.updated_by_word ? 'ready' : 'needs-open'}`}>
                                  <div className="settings-group-title">Front matter and page-number fields</div>
                                  <p>
                                    {finalizeResult.field_update_status.updated_by_word
                                      ? 'TOC, list of tables, and list of figures were updated by Word automation before export.'
                                      : 'TOC, list of tables, and list of figures are embedded and set to update when opened in Word. Automated page-number update needs Microsoft Word automation or LibreOffice on this machine.'}
                                  </p>
                                </div>
                              )}

                              {finalizeResult.preservation_report && (
                                <div className="preservation-summary">
                                  <div className="settings-group-title">DOCX preservation summary</div>
                                  <div className="score-compare-grid">
                                    {Object.entries(finalizeResult.preservation_report).slice(0, 8).map(([key, value]) => (
                                      <div className="score-compare" key={key}>
                                        <span>{key.replaceAll('_', ' ')}</span>
                                        <strong>{Array.isArray(value) ? value.join(', ') || 'none' : String(value ?? 'n/a')}</strong>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="score-compare-grid">
                                {Object.entries(finalizeResult.after_scores).slice(0, 8).map(([key, after]) => (
                                  <div className="score-compare" key={key}>
                                    <span>{key.replaceAll('_', ' ')}</span>
                                    <strong>
                                      {String(finalizeResult.before_scores[key] ?? 'n/a')}{' -> '}{String(after ?? 'n/a')}
                                    </strong>
                                  </div>
                                ))}
                              </div>

                              {finalizeResult.limitations.length > 0 && (
                                <div className="export-limitations">
                                  {finalizeResult.limitations.map((item) => (
                                    <span key={item}>{item}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
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
                  <div className="settings-desc">Falls back to seed skills when offline.</div>
                </div>
                <span className={`badge ${neonConnected ? 'badge-green' : 'badge-amber'}`}>
                  {neonConnected ? 'Connected' : 'Offline'}
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
                <span className={`badge ${neonConnected ? 'badge-green' : 'badge-amber'}`}>
                  {neonConnected ? 'Connected' : neonDraft?.configured ? 'Configured' : 'Offline'}
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

      {/* Persistent browser API access link in footer */}
      <footer className="app-footer">
        <span className="footer-fallback-label">🌐 Browser UI:</span>
        <a
          href={apiDocsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="footer-fallback-url"
          title="Open OTIF API documentation in your browser"
          onClick={openApiDocs}
        >
          {apiDocsUrl} - open
        </a>
        <span className="footer-version">OTIF v1.1.3 · Free &amp; Open Source · Apache-2.0</span>
      </footer>
    </div>
  );
}

export default App;
