// ── Shared types used across App.tsx, hooks, and components ──
import type { LucideIcon } from 'lucide-react';

export type ProviderId = 'ollama' | 'deepseek' | 'gemini' | 'openai' | 'claude';

export interface SkillSummary {
  skill_id: string;
  name: string;
  category: string;
  version: string;
  description: string;
  rule_count: number;
  word_list_count: number;
}

export interface SkillEngineStatus {
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

export interface SkillStatus {
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

export interface ModelOption {
  id: string;
  label: string;
  use_case: string;
  context?: string | null;
  local: boolean;
}

export interface ProviderOption {
  id: ProviderId;
  name: string;
  mode: 'local' | 'cloud';
  configured: boolean;
  default_model: string;
  models: ModelOption[];
  notes: string;
}

export interface PrivacyMode {
  id: string;
  label: string;
  cloud_allowed: boolean;
}

export type AIDiscipline =
  | 'general' | 'stem' | 'humanities' | 'business' | 'law' | 'medicine' | 'social_sciences' | 'education';

export type AIWritingStyle =
  | 'formal' | 'technical' | 'argumentative' | 'analytical' | 'descriptive' | 'critical';

export type AIAnalysisDepth = 'quick' | 'standard' | 'deep';
export type AIRewriteIntensity = 'light' | 'moderate' | 'thorough';

/** Controls how the AI reasons and generates text during analysis and rewrite. */
export interface AIBehavior {
  discipline: AIDiscipline;
  writing_style: AIWritingStyle;
  analysis_depth: AIAnalysisDepth;
  rewrite_intensity: AIRewriteIntensity;
  /** When true, AI uses provided document context to write or scaffold full sections. */
  context_writing_enabled: boolean;
}

export const DEFAULT_AI_BEHAVIOR: AIBehavior = {
  discipline: 'general',
  writing_style: 'formal',
  analysis_depth: 'standard',
  rewrite_intensity: 'moderate',
  context_writing_enabled: false,
};

export interface AISettings {
  privacy_mode: string;
  provider: ProviderId;
  model_by_provider: Record<string, string>;
  api_keys: Record<string, string>;
  ollama_base_url: string | null;
  behavior: AIBehavior;
}

export interface AIStatus {
  settings: AISettings;
  active_provider: ProviderId;
  active_model: string | null;
  providers: ProviderOption[];
  privacy_modes: PrivacyMode[];
  model_sources: Record<string, string>;
}

export interface ConnectionResult {
  provider: ProviderId;
  ok: boolean;
  message: string;
  models_seen: string[];
}

export interface NeonRuntimeSettings {
  configured: boolean;
  read_configured: boolean;
  write_configured: boolean;
  owner_configured: boolean;
  read_url: string;
  write_url: string;
  owner_url: string;
}

export interface NeonSettingsResponse {
  settings: NeonRuntimeSettings;
  schema: {
    connected: boolean;
    configured?: boolean;
    ready: boolean;
    message: string;
    missing_tables?: string[];
  };
}

export interface NeonTestResponse extends NeonSettingsResponse {
  ok: boolean;
}

export interface UploadResult {
  doc_id: string;
  filename: string;
  size_bytes: number;
  path: string;
  message: string;
  privacy_note: string;
  project_id?: string;
}

export type PreflightScores = Record<string, number | string | null>;

export interface Finding {
  word: string;
  replacement: string | null;
  severity: string;
  count: number;
}

export interface ImprovementItem {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  action: string;
  evidence: string;
  requires_ai: boolean;
  chapter_id?: string;
  page_range?: string;
  analysis_source?: 'rules' | 'skills' | 'ai_review' | string;
  evidence_refs?: string[];
  source_evidence_ids?: string[];
  source_suggestions?: Array<{
    evidence_id: string;
    source_id: string;
    source_name: string;
    title: string;
    year: string | number | null;
    url: string | null;
    classification?: string | null;
  }>;
}

export interface ChapterResult {
  id: string;
  title: string;
  metrics: Record<string, number>;
  scores: PreflightScores;
  findings: Finding[];
}

export interface ResearchSourceResult {
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

export interface ResearchSourcesReport {
  internet_checked: boolean;
  queries: string[];
  sources: ResearchSourceResult[];
  source_count?: number;
  checked_source_count?: number;
}

export interface IntegrityReport {
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

export interface StreamEvent {
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
  validation_handoff?: Record<string, unknown>;
}

export interface RewriteApprovalResult {
  doc_id: string;
  approved_item_ids: string[];
  approved_items: ImprovementItem[];
  active_provider: ProviderId;
  active_model: string | null;
  privacy_mode: string;
  rewrite_status: string;
  rewrite_preview: string | null;
  rewrite_note: string;
  document_actions: Record<string, unknown>;
  next_step: string;
}

export interface EditableChapter {
  id: string;
  title: string;
  original_text: string;
  edited_text: string;
  word_count?: number;
}

export interface TrackChangesChapter {
  id: string;
  title: string;
  original_text: string;
  rewritten_text: string | null;
  diff_tokens: DiffToken[];
  word_count: number;
  approved: boolean;
}

export interface TrackChangesResponse {
  doc_id: string;
  filename: string;
  doc_type: string;
  norm: string;
  chapters: TrackChangesChapter[];
  total_chapters: number;
  approved_chapters: number;
  rewrite_authorized: boolean;
  message: string;
}

export interface FrontMatterPreview {
  doc_id: string;
  target_format: string;
  toc_entries: Array<{ title: string; level?: number; page: number }>;
  tables: Array<{ title?: string; caption?: string; page: number }>;
  figures: Array<{ title?: string; caption?: string; page: number }>;
  toc_text: string;
  list_of_tables_text: string;
  list_of_figures_text: string;
  page_number_mode: 'estimated' | 'exact' | string;
  note: string;
}

export interface ScanSessionRestore {
  doc_id: string;
  filename: string;
  document_exists: boolean;
  analysis_available: boolean;
  analysis: {
    scores?: PreflightScores;
    improvement_plan?: ImprovementItem[];
    research_sources?: {
      ai_detection?: AIDetectionResult;
      turnitin_style_similarity?: TurnitinSimilarity;
    };
  } | null;
  approval: RewriteApprovalResult | null;
  rewrite_draft: {
    chapters?: Array<TrackChangesChapter & { changes_summary?: string }>;
    saved_at?: string;
    autosaved?: boolean;
  } | null;
  status: 'uploaded' | 'analysis_complete' | 'improvement_plan_approved' | 'rewrite_in_progress' | string;
  message: string;
}

export interface ChapterEditorResult {
  doc_id: string;
  filename: string;
  chapters: EditableChapter[];
  scores: PreflightScores;
  approval: RewriteApprovalResult | null;
  requires_approval: boolean;
  revision_guidance: string | null;
  message: string;
}

export interface FinalizedArtifact {
  format: 'docx' | 'pdf' | 'md' | string;
  filename: string;
  size_bytes: number;
  download_url: string;
}

export interface FinalizeResult {
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

export interface ChapterRewriteProposal {
  doc_id: string;
  chapter_id: string;
  title: string;
  provider: ProviderId | 'local';
  model: string | null;
  privacy_mode: string;
  proposed_text: string;
  provider_warning?: string | null;
  citation_lock: {
    locked_count: number;
    all_restored: boolean;
    missing_tokens: string[];
  };
  requires_user_apply: boolean;
  message: string;
}

export interface PhraseBankCategory {
  id: string;
  title: string;
  description: string;
  phrases: Array<{ text: string; favorited: boolean }>;
}

export interface PhraseBankResponse {
  version: string;
  sources: Array<{ name: string; path: string; note?: string }>;
  categories: PhraseBankCategory[];
  total_categories: number;
  total_phrases: number;
}

export interface ParaphraseResult {
  original_text: string;
  paraphrased_text: string;
  provider: ProviderId;
  model: string | null;
  privacy_mode: string;
  citation_lock: {
    locked_count: number;
    all_restored: boolean;
    missing_tokens: string[];
  };
}

export interface TextSelectionState {
  chapterId: string;
  start: number;
  end: number;
  text: string;
}

export type DiffToken = {
  type: 'same' | 'add' | 'remove';
  value: string;
};

export interface DiagramResult {
  diagram_id: string;
  mermaid_source: string;
  themed_source: string;
  caption: string;
  figure_number: string;
  design_elements: Record<string, unknown>;
  requires_approval: boolean;
}

export interface AIDetectionSignals {
  perplexity_risk: number;
  burstiness_risk: number;
  template_opener_risk: number;
  passive_voice_risk: number;
  researcher_voice_reduction: number;
  repetition_risk: number;
  uniform_length_risk: number;
}

export interface AIDetectionResult {
  ai_detection_score: number;
  confidence: 'high' | 'medium' | 'low';
  signals: AIDetectionSignals;
  verdict: string;
  turnitin_ai_equivalent: string;
}

export interface PerSourceSimilarity {
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

export interface TurnitinSimilarity {
  similarity_index: number;
  match_count: number;
  high_risk_matches: number;
  medium_risk_matches: number;
  per_source_similarity: PerSourceSimilarity[];
  interpretation: string;
}

export interface PerChapterDesign {
  chapterId: string;
  theme: string;
  accentHex: string;
}

export type DiagnosticLevel = 'info' | 'success' | 'warning' | 'error';

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  level: DiagnosticLevel;
  action: string;
  message: string;
  details?: string;
}

export interface Project {
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

export interface ThreadMessage {
  id: string;
  project_id: string;
  role: string;
  message_type: string;
  content: Record<string, unknown> | string;
  created_at: string;
}

export interface Discovery {
  id: string;
  project_id: string;
  skill_id: string;
  description: string;
  confidence: number;
  user_approved: number;
  pushed_at: string | null;
  discovered_at: string;
}

export type TabId = 'projects' | 'analyze' | 'skills' | 'community' | 'settings';
export type AnalysisStepId = 'upload' | 'live' | 'report' | 'plan' | 'download';

export interface ThreadIconEntry {
  icon: LucideIcon;
  label: string;
  color: string;
}
