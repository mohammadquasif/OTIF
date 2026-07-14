import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import axios from 'axios';
import {
  Activity, UploadCloud, Sparkles, ShieldCheck, Download,
  Settings, Sun, Moon, X, CheckCircle2, AlertTriangle, Zap,
  FileText, BookOpen, Search, ChevronRight,
  ArrowRight, Copy, Info, Loader2,
} from 'lucide-react';
import { API_BASE } from './api';
import { useTheme } from './contexts/ThemeContext';
import type {
  SkillStatus, AIStatus, UploadResult,
  PreflightScores, ImprovementItem, StreamEvent, FinalizeResult,
} from './types';

type ScannedExportChapter = {
  id: string;
  title: string;
  original_text?: string;
  edited_text: string;
};

type FullRewriteChapter = {
  id: string;
  title: string;
  original_text: string;
  rewritten_text: string;
  changes_summary: string;
};

// ── Constants ─────────────────────────────────────────────────

const DOC_TYPES = [
  { id: 'thesis', label: 'Thesis / Dissertation' },
  { id: 'research_paper', label: 'Research Paper' },
  { id: 'journal_article', label: 'Journal Article' },
  { id: 'literature_review', label: 'Literature Review' },
  { id: 'research_proposal', label: 'Research Proposal' },
  { id: 'conference_paper', label: 'Conference Paper' },
  { id: 'technical_report', label: 'Technical Report' },
];

const NORMS = [
  { id: 'ugc', label: '🇮🇳 UGC PhD (India)' },
  { id: 'apa7', label: 'APA 7th Edition' },
  { id: 'ieee', label: 'IEEE' },
  { id: 'harvard', label: 'Harvard' },
  { id: 'springer', label: 'Springer' },
  { id: 'elsevier', label: 'Elsevier' },
  { id: 'iit', label: '🇮🇳 IIT Thesis' },
  { id: 'aicte', label: '🇮🇳 AICTE PhD' },
  { id: 'european_thesis', label: 'European Thesis' },
];

const SCAN_DIMENSIONS = [
  { key: 'plagiarism_risk', label: 'Plagiarism Risk', icon: Search, desc: 'Near-duplicate phrases, attribution gaps, verbatim quotes' },
  { key: 'ai_writing_risk', label: 'AI Writing Signature', icon: Sparkles, desc: 'Formulaic templates, monotonous patterns, boilerplate detection' },
  { key: 'originality_score', label: 'Originality Evidence', icon: ShieldCheck, desc: 'Literature gap, methodology boundary, contribution clarity' },
  { key: 'citation_quality', label: 'Citation Quality', icon: BookOpen, desc: 'DOI presence, format consistency, reference coverage' },
  { key: 'scholarly_voice', label: 'Scholarly Voice', icon: FileText, desc: 'Burstiness, vocabulary diversity, hedging balance' },
  { key: 'structure_cohesion', label: 'Structure & Cohesion', icon: Zap, desc: 'Chapter transitions, heading hierarchy, IMRaD compliance' },
];

// ── Helpers ───────────────────────────────────────────────────

function scoreColor(v: number | null): string {
  if (v === null) return 'var(--text-muted)';
  if (v >= 75) return 'var(--score-excellent)';
  if (v >= 50) return 'var(--score-good)';
  if (v >= 35) return 'var(--score-fair)';
  return 'var(--score-critical)';
}

function scoreLabel(v: number | null): string {
  if (v === null) return 'N/A';
  if (v >= 75) return 'Excellent';
  if (v >= 50) return 'Good';
  if (v >= 35) return 'Needs Work';
  return 'Critical';
}

function scoreBg(v: number | null): string {
  if (v === null) return 'var(--bg-muted)';
  if (v >= 75) return 'hsla(145, 75%, 55%, 0.1)';
  if (v >= 50) return 'hsla(191, 90%, 55%, 0.1)';
  if (v >= 35) return 'hsla(38, 95%, 58%, 0.1)';
  return 'hsla(352, 85%, 62%, 0.1)';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cardIconStyle(color: string, bg: string): React.CSSProperties {
  return { width: '48px', height: '48px', borderRadius: 'var(--r-md)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 };
}

// ── Format Requirement Presets ────────────────────────────────

interface FormatPreset {
  label: string;
  suggestedChapters: { title: string; words: number; pages: number }[];
  totalWords: number;
  totalPages: number;
  notes: string;
  citationStyle: string;
  structure: string;
}

const FORMAT_PRESETS: Record<string, FormatPreset> = {
  'thesis_apa7': {
    label: 'APA 7th Thesis',
    suggestedChapters: [
      { title: 'Title Page', words: 0, pages: 1 },
      { title: 'Abstract', words: 250, pages: 1 },
      { title: 'Introduction', words: 6000, pages: 20 },
      { title: 'Literature Review', words: 10000, pages: 30 },
      { title: 'Method', words: 6000, pages: 20 },
      { title: 'Results', words: 8000, pages: 25 },
      { title: 'Discussion', words: 8000, pages: 25 },
      { title: 'Conclusion', words: 3000, pages: 10 },
      { title: 'References', words: 0, pages: 8 },
    ],
    totalWords: 45000, totalPages: 150,
    notes: 'APA 7th requires running head, abstract (250 words max), double spacing, 1-inch margins. Uses author-date citation. Level 1-5 headings with specific formatting.',
    citationStyle: 'APA 7th Edition — (Author, Year) in-text, full reference list',
    structure: 'Standard APA dissertation structure with Method-Results-Discussion',
  },
  'thesis_ieee': {
    label: 'IEEE Thesis',
    suggestedChapters: [
      { title: 'Title Page', words: 0, pages: 1 },
      { title: 'Abstract', words: 300, pages: 1 },
      { title: 'Introduction', words: 8000, pages: 25 },
      { title: 'Literature Survey', words: 12000, pages: 35 },
      { title: 'Proposed Methodology', words: 10000, pages: 30 },
      { title: 'Implementation & Experiments', words: 10000, pages: 30 },
      { title: 'Results & Evaluation', words: 8000, pages: 25 },
      { title: 'Conclusion & Future Work', words: 4000, pages: 12 },
      { title: 'References', words: 0, pages: 8 },
    ],
    totalWords: 55000, totalPages: 175,
    notes: 'IEEE uses numbered citation [1], [2]. Technical/engineering focus. Requires equations, figures, and tables with IEEE numbering. Single-column or double-column format.',
    citationStyle: 'IEEE — Sequential numbering [1], [2], [3]',
    structure: 'Problem → Literature → Method → Implementation → Evaluation → Conclusion',
  },
  'thesis_harvard': {
    label: 'Harvard Thesis',
    suggestedChapters: [
      { title: 'Title Page', words: 0, pages: 1 },
      { title: 'Abstract', words: 300, pages: 1 },
      { title: 'Introduction', words: 7000, pages: 22 },
      { title: 'Literature Review', words: 10000, pages: 30 },
      { title: 'Methodology', words: 7000, pages: 22 },
      { title: 'Findings', words: 10000, pages: 30 },
      { title: 'Discussion', words: 8000, pages: 25 },
      { title: 'Conclusion', words: 4000, pages: 12 },
      { title: 'Reference List', words: 0, pages: 8 },
    ],
    totalWords: 50000, totalPages: 160,
    notes: 'Harvard uses author-date in-text citations with full reference list. Common in UK/Australian universities. Emphasizes critical analysis over description.',
    citationStyle: 'Harvard — (Author, Year) in-text, alphabetical reference list',
    structure: 'Introduction → Lit Review → Methodology → Findings → Discussion → Conclusion',
  },
  'research_paper_apa7': {
    label: 'APA 7 Research Paper',
    suggestedChapters: [
      { title: 'Title Page', words: 0, pages: 1 },
      { title: 'Abstract', words: 250, pages: 1 },
      { title: 'Introduction', words: 1500, pages: 5 },
      { title: 'Literature Review', words: 2000, pages: 6 },
      { title: 'Method', words: 1500, pages: 5 },
      { title: 'Results', words: 1500, pages: 5 },
      { title: 'Discussion', words: 1500, pages: 5 },
      { title: 'Conclusion', words: 500, pages: 2 },
      { title: 'References', words: 0, pages: 3 },
    ],
    totalWords: 9000, totalPages: 30,
    notes: 'APA 7 research paper: double-spaced, 1-inch margins, running head, author-date citations. Abstract limited to 250 words.',
    citationStyle: 'APA 7th — (Author, Year)',
    structure: 'Standard APA empirical paper: IMRaD structure',
  },
  'research_paper_ieee': {
    label: 'IEEE Conference Paper',
    suggestedChapters: [
      { title: 'Title & Authors', words: 0, pages: 1 },
      { title: 'Abstract', words: 200, pages: 1 },
      { title: 'Introduction', words: 800, pages: 2 },
      { title: 'Related Work', words: 1000, pages: 2 },
      { title: 'Proposed Approach', words: 1500, pages: 3 },
      { title: 'Experiments & Results', words: 1200, pages: 3 },
      { title: 'Discussion', words: 600, pages: 1 },
      { title: 'Conclusion', words: 400, pages: 1 },
      { title: 'References', words: 0, pages: 1 },
    ],
    totalWords: 6000, totalPages: 15,
    notes: 'IEEE conference format: two-column, 10pt font, numbered citations [1]. Typically 6-8 pages. Must include keywords and IEEE copyright notice.',
    citationStyle: 'IEEE — Sequential numbers [1]-[20]',
    structure: 'Two-column IEEE conference format',
  },
  'research_paper_springer': {
    label: 'Springer Journal Article',
    suggestedChapters: [
      { title: 'Title & Abstract', words: 300, pages: 1 },
      { title: 'Introduction', words: 1500, pages: 4 },
      { title: 'Theoretical Background', words: 2000, pages: 5 },
      { title: 'Methodology', words: 1500, pages: 4 },
      { title: 'Results', words: 2000, pages: 5 },
      { title: 'Discussion', words: 1500, pages: 4 },
      { title: 'Conclusion & Limitations', words: 800, pages: 2 },
      { title: 'References', words: 0, pages: 3 },
    ],
    totalWords: 10000, totalPages: 28,
    notes: 'Springer format: single-column, structured abstract, author contribution statement, data availability statement, conflict of interest declaration.',
    citationStyle: 'Springer Harvard or Vancouver — check journal guidelines',
    structure: 'Springer standard: structured abstract + IMRaD + declarations',
  },
  'literature_review_apa7': {
    label: 'APA 7 Literature Review',
    suggestedChapters: [
      { title: 'Title Page', words: 0, pages: 1 },
      { title: 'Abstract', words: 200, pages: 1 },
      { title: 'Introduction', words: 1500, pages: 5 },
      { title: 'Thematic Review: Theme 1', words: 3000, pages: 9 },
      { title: 'Thematic Review: Theme 2', words: 3000, pages: 9 },
      { title: 'Thematic Review: Theme 3', words: 3000, pages: 9 },
      { title: 'Synthesis & Research Gaps', words: 1500, pages: 5 },
      { title: 'Conclusion & Future Directions', words: 800, pages: 3 },
      { title: 'References', words: 0, pages: 5 },
    ],
    totalWords: 13000, totalPages: 45,
    notes: 'Literature review: synthesizes existing research, identifies gaps, proposes future directions. Thematic or chronological organization. Critical analysis, not summary.',
    citationStyle: 'APA 7th — (Author, Year)',
    structure: 'Thematic synthesis with critical analysis',
  },
  'research_proposal_apa7': {
    label: 'APA 7 Research Proposal',
    suggestedChapters: [
      { title: 'Title Page', words: 0, pages: 1 },
      { title: 'Abstract', words: 250, pages: 1 },
      { title: 'Introduction & Problem Statement', words: 2000, pages: 6 },
      { title: 'Literature Review', words: 2500, pages: 8 },
      { title: 'Research Questions & Hypotheses', words: 1000, pages: 3 },
      { title: 'Proposed Methodology', words: 2000, pages: 6 },
      { title: 'Expected Contributions', words: 800, pages: 3 },
      { title: 'Timeline & Resources', words: 500, pages: 2 },
      { title: 'References', words: 0, pages: 3 },
    ],
    totalWords: 9000, totalPages: 30,
    notes: 'Research proposal: justifies the research, demonstrates feasibility, outlines methodology. Must show significance and originality.',
    citationStyle: 'APA 7th — (Author, Year)',
    structure: 'Problem → Background → Questions → Method → Contributions → Plan',
  },
  // ── Indian PhD Formats ──────────────────────────────────
  'thesis_ugc': {
    label: '🇮🇳 UGC PhD Thesis (India)',
    suggestedChapters: [
      { title: 'Title Page', words: 0, pages: 1 },
      { title: 'Declaration by Researcher', words: 200, pages: 1 },
      { title: 'Certificate by Supervisor', words: 200, pages: 1 },
      { title: 'Acknowledgement', words: 300, pages: 1 },
      { title: 'Abstract', words: 500, pages: 2 },
      { title: 'Table of Contents', words: 0, pages: 3 },
      { title: 'List of Figures', words: 0, pages: 2 },
      { title: 'List of Tables', words: 0, pages: 2 },
      { title: 'List of Abbreviations', words: 0, pages: 1 },
      { title: 'Chapter 1: Introduction', words: 10000, pages: 30 },
      { title: 'Chapter 2: Literature Review', words: 15000, pages: 45 },
      { title: 'Chapter 3: Research Methodology', words: 10000, pages: 30 },
      { title: 'Chapter 4: Data Analysis & Results', words: 15000, pages: 45 },
      { title: 'Chapter 5: Discussion of Findings', words: 12000, pages: 35 },
      { title: 'Chapter 6: Conclusion & Recommendations', words: 8000, pages: 25 },
      { title: 'References / Bibliography', words: 0, pages: 15 },
      { title: 'Appendices', words: 0, pages: 10 },
      { title: 'List of Publications', words: 0, pages: 2 },
    ],
    totalWords: 85000, totalPages: 280,
    notes: 'Per UGC Minimum Standards 2022: Max 10% plagiarism, pre-submission seminar required, 1 journal publication + 2 conferences. Declaration + Certificate pages mandatory. Times New Roman 12pt, double spacing, 1.5" left margin.',
    citationStyle: 'APA 7th or Numbered — as per university guidelines',
    structure: 'UGC 2022: Declaration → Certificate → Chapters 1-6 → References → Publications',
  },
  'thesis_iit': {
    label: '🇮🇳 IIT PhD Thesis',
    suggestedChapters: [
      { title: 'Title Page', words: 0, pages: 1 },
      { title: 'Certificate & Declaration', words: 200, pages: 1 },
      { title: 'Acknowledgements', words: 200, pages: 1 },
      { title: 'Synopsis (5-10 pages)', words: 3000, pages: 8 },
      { title: 'Table of Contents', words: 0, pages: 2 },
      { title: 'Nomenclature / Glossary', words: 0, pages: 2 },
      { title: 'Chapter 1: Introduction', words: 8000, pages: 25 },
      { title: 'Chapter 2: Literature Survey', words: 12000, pages: 35 },
      { title: 'Chapter 3: Theoretical Framework', words: 8000, pages: 25 },
      { title: 'Chapter 4: Experimental/Methodology', words: 10000, pages: 30 },
      { title: 'Chapter 5: Results & Analysis', words: 12000, pages: 35 },
      { title: 'Chapter 6: Conclusions & Future Scope', words: 6000, pages: 18 },
      { title: 'References', words: 0, pages: 10 },
      { title: 'Publications from Thesis', words: 0, pages: 2 },
    ],
    totalWords: 65000, totalPages: 200,
    notes: 'IIT senate norms: A4 paper, 1.5 spacing, 12pt Times New Roman, min 120 pages. Synopsis required before chapters. Publications categorized: Journal (SCI/SCIE/Scopus) / Conference / Book Chapter. External examiner requirements apply.',
    citationStyle: 'IEEE or APA 7th — depends on department (Engineering=IEEE, Management=APA)',
    structure: 'IIT: Synopsis → Lit Survey → Theory → Experiments → Results → Conclusions',
  },
  'thesis_aicte': {
    label: '🇮🇳 AICTE Doctoral Thesis',
    suggestedChapters: [
      { title: 'Title Page', words: 0, pages: 1 },
      { title: 'Declaration & Certificate', words: 300, pages: 2 },
      { title: 'Acknowledgement', words: 200, pages: 1 },
      { title: 'Abstract', words: 500, pages: 2 },
      { title: 'Table of Contents', words: 0, pages: 2 },
      { title: 'List of Figures & Tables', words: 0, pages: 2 },
      { title: 'Chapter 1: Introduction', words: 8000, pages: 25 },
      { title: 'Chapter 2: Literature Review', words: 12000, pages: 35 },
      { title: 'Chapter 3: Research Design', words: 8000, pages: 25 },
      { title: 'Chapter 4: Implementation', words: 10000, pages: 30 },
      { title: 'Chapter 5: Results & Validation', words: 10000, pages: 30 },
      { title: 'Chapter 6: Conclusion & Future Work', words: 6000, pages: 18 },
      { title: 'References', words: 0, pages: 10 },
      { title: 'Annexures & Publications', words: 0, pages: 5 },
    ],
    totalWords: 60000, totalPages: 190,
    notes: 'AICTE Doctoral Guidelines: 12pt Times New Roman, double spacing, 1.5" binding margin. Chapter numbering: 1, 1.1, 1.1.1. Figures/tables chapter-wise (Fig 1.1). Submission to Shodhganga mandatory.',
    citationStyle: 'APA 7th / IEEE / Harvard — as per discipline (Engineering=IEEE, Science=APA)',
    structure: 'AICTE: Intro → Lit Review → Design → Implementation → Validation → Conclusion',
  },
  'research_paper_ugc': {
    label: '🇮🇳 UGC-CARE Journal Article',
    suggestedChapters: [
      { title: 'Title & Author Info', words: 0, pages: 1 },
      { title: 'Abstract (250 words max)', words: 250, pages: 1 },
      { title: 'Keywords', words: 0, pages: 0 },
      { title: 'Introduction', words: 1500, pages: 5 },
      { title: 'Literature Review', words: 2000, pages: 6 },
      { title: 'Research Methodology', words: 1500, pages: 5 },
      { title: 'Results & Discussion', words: 2500, pages: 8 },
      { title: 'Conclusion & Implications', words: 800, pages: 3 },
      { title: 'Acknowledgement & Funding', words: 100, pages: 0 },
      { title: 'References', words: 0, pages: 3 },
    ],
    totalWords: 9000, totalPages: 32,
    notes: 'UGC-CARE listed journals require: structured abstract, plagiarism declaration, conflict of interest statement. Must cite from UGC-CARE/Scopus/WoS sources only. Predatory journal citations cause rejection.',
    citationStyle: 'APA 7th / Harvard — per journal guidelines',
    structure: 'UGC-CARE: IMRaD + declarations + Indian context relevance',
  },
  'journal_article_ugc': {
    label: '🇮🇳 Indian Scopus Journal Article',
    suggestedChapters: [
      { title: 'Title Page', words: 0, pages: 1 },
      { title: 'Abstract (structured)', words: 300, pages: 1 },
      { title: 'Introduction & Indian Context', words: 1500, pages: 5 },
      { title: 'Theoretical Background', words: 2000, pages: 6 },
      { title: 'Methodology', words: 1500, pages: 5 },
      { title: 'Findings & Analysis', words: 2500, pages: 8 },
      { title: 'Discussion & Implications for India', words: 1500, pages: 5 },
      { title: 'Conclusion & Policy Recommendations', words: 700, pages: 2 },
      { title: 'References (UGC-CARE/Scopus)', words: 0, pages: 3 },
    ],
    totalWords: 10000, totalPages: 36,
    notes: 'Indian Scopus journals (Springer India, Elsevier India, Taylor & Francis India): Include Indian policy context, NEP 2020 relevance, Indian industry implications. Cite Shodhganga theses. Avoid predatory journal citations.',
    citationStyle: 'APA 7th or journal-specific style',
    structure: 'Scopus Indian: IMRaD + Indian context + Regional implications',
  },
};

function getFormatPreset(docType: string, norm: string): FormatPreset | null {
  const key = `${docType}_${norm}`;
  if (FORMAT_PRESETS[key]) return FORMAT_PRESETS[key];
  // Fallback: try generic research_paper preset for any research paper type
  const fallbackKey = `research_paper_${norm}`;
  if (FORMAT_PRESETS[fallbackKey]) return FORMAT_PRESETS[fallbackKey];
  // Generic fallback
  return {
    label: `${docType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} (${norm.toUpperCase()})`,
    suggestedChapters: [
      { title: 'Abstract', words: 300, pages: 1 },
      { title: 'Introduction', words: 2000, pages: 6 },
      { title: 'Main Body', words: 5000, pages: 15 },
      { title: 'Conclusion', words: 1000, pages: 3 },
      { title: 'References', words: 0, pages: 3 },
    ],
    totalWords: 8000, totalPages: 28,
    notes: `${norm.toUpperCase()} format guidelines apply. Verify specific requirements with your institution or target journal.`,
    citationStyle: norm.toUpperCase(),
    structure: 'Standard academic structure',
  };
}

// ── Component ─────────────────────────────────────────────────

export default function AcademicEditorApp() {
  // ── Backend startup ──────────────────────────────────────
  type BackendPhase = 'starting' | 'ready' | 'error';
  const [backendPhase, setBackendPhase] = useState<BackendPhase>('starting');
  const [startupMsg, setStartupMsg] = useState('Waking up the research engine…');
  const [startupDot, setStartupDot] = useState(0);

  // ── System ───────────────────────────────────────────────
  const { mode: themeMode, toggle: toggleTheme } = useTheme();
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiDraft, setAiDraft] = useState<{ provider: string; api_keys: Record<string, string>; privacy_mode: string; ollama_base_url?: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [skillCount, setSkillCount] = useState(0);
  const [newSkillsAvailable, setNewSkillsAvailable] = useState(false);
  const [syncingSkills, setSyncingSkills] = useState(false);

  // ── Mode ─────────────────────────────────────────────────
  type AppMode = 'landing' | 'new-doc' | 'scan';
  const [mode, setMode] = useState<AppMode>('landing');

  // ── New Document (multi-step wizard) ─────────────────────
  type WizardStep = 'setup' | 'context' | 'generate';
  const [wizardStep, setWizardStep] = useState<WizardStep>('setup');
  const [newDocType, setNewDocType] = useState('research_paper');
  const [newDocNorm, setNewDocNorm] = useState('apa7');
  const [customGuidelines, setCustomGuidelines] = useState('');
  const [targetWords, setTargetWords] = useState(0);
  const [targetPages, setTargetPages] = useState(0);
  const [newDocContext, setNewDocContext] = useState('');
  const [generatedText, setGeneratedText] = useState('');
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [newDocId, setNewDocId] = useState<string | null>(null);
  const [genPhase, setGenPhase] = useState<'idle' | 'writing' | 'done'>('idle');

  // ── Scan ─────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runScanRef = useRef<((docId: string) => Promise<void>) | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [scanDocId, setScanDocId] = useState<string | null>(null);
  const [scanFilename, setScanFilename] = useState('');
  const [scanDocType, setScanDocType] = useState('thesis');
  const [scanNorm, setScanNorm] = useState('apa7');
  const [scanPace, setScanPace] = useState('normal');  // fast | normal | detailed
  const [scores, setScores] = useState<PreflightScores | null>(null);
  const [improvementPlan, setImprovementPlan] = useState<ImprovementItem[]>([]);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [scanPhase, setScanPhase] = useState<'upload' | 'scanning' | 'results' | 'exporting'>('upload');
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [researchApiStatus, setResearchApiStatus] = useState<Map<string, { name: string; status: string; matchCount: number; step: number }>>(new Map());
  const [rewritePreview, setRewritePreview] = useState<string | null>(null);
  const [rewriteDiff, setRewriteDiff] = useState<{ deletions: string[]; insertions: string[] } | null>(null);
  const [scanExportChapters, setScanExportChapters] = useState<ScannedExportChapter[]>([]);

  // ── Computed ─────────────────────────────────────────────
  const aiProvider = aiDraft?.provider ?? aiStatus?.active_provider ?? 'deepseek';
  const providerConfigured = Boolean(aiDraft?.api_keys?.[aiDraft?.provider ?? 'deepseek']);
  const isOllama = aiDraft?.provider === 'ollama';
  const needsSetup = !providerConfigured && !isOllama;

  // ── Connectivity check (AI + internet) ────────────────────
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);   // null = not checked yet
  const [internetOnline, setInternetOnline] = useState<boolean | null>(null);
  const [checkingConnectivity, setCheckingConnectivity] = useState(false);

  const checkConnectivity = useCallback(async () => {
    setCheckingConnectivity(true);
    setAiOnline(null);
    setInternetOnline(null);

    // Check internet
    try {
      const res = await axios.get('https://api.crossref.org/works?rows=1', { timeout: 5000 });
      setInternetOnline(res.status < 500);
    } catch { setInternetOnline(false); }

    // Check AI provider
    if (isOllama) {
      try {
        const res = await axios.get(`${(aiDraft?.ollama_base_url ?? 'http://localhost:11434').replace(/\/$/, '')}/api/tags`, { timeout: 5000 });
        setAiOnline(res.status === 200);
      } catch { setAiOnline(false); }
    } else if (aiDraft?.provider) {
      try {
        const res = await axios.post(`${API_BASE}/ai/test/${aiDraft.provider}`, {}, { timeout: 15000 });
        setAiOnline(res.data?.ok === true);
      } catch { setAiOnline(false); }
    }
    setCheckingConnectivity(false);
  }, [aiDraft?.provider, aiDraft?.ollama_base_url, isOllama]);

  // Run connectivity check once backend is ready and AI settings are loaded
  const ranCheck = useRef(false);
  useEffect(() => {
    if (backendPhase === 'ready' && aiDraft && !ranCheck.current) {
      ranCheck.current = true;
      void checkConnectivity();
    }
  }, [backendPhase, aiDraft, checkConnectivity]);

  // ── Auto-dismiss ─────────────────────────────────────────
  useEffect(() => {
    if (noticeMsg) { const t = setTimeout(() => setNoticeMsg(null), 3500); return () => clearTimeout(t); }
  }, [noticeMsg]);
  useEffect(() => {
    if (errorMsg) { const t = setTimeout(() => setErrorMsg(null), 10000); return () => clearTimeout(t); }
  }, [errorMsg]);

  // ── Backend startup ──────────────────────────────────────
  useEffect(() => {
    const MESSAGES = [
      'Waking up the research engine…', 'Loading academic skill packs…',
      'Connecting to scholarly databases…', 'Calibrating integrity checks…', 'Almost ready…',
    ];
    let attempt = 0, msgIdx = 0, stopped = false;
    const dotTimer = setInterval(() => setStartupDot((d) => (d + 1) % 4), 400);
    const msgTimer = setInterval(() => { msgIdx = (msgIdx + 1) % MESSAGES.length; setStartupMsg(MESSAGES[msgIdx]); }, 2200);
    const poll = async () => {
      while (!stopped && attempt < 60) {
        attempt++;
        try { await axios.get(`${API_BASE}/health`, { timeout: 1500 }); if (!stopped) { setBackendPhase('ready'); void refreshData(); } return; }
        catch { await new Promise((r) => setTimeout(r, 800)); }
      }
      if (!stopped) setBackendPhase('error');
    };
    void poll();
    return () => { stopped = true; clearInterval(dotTimer); clearInterval(msgTimer); };
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const [statusRes, aiRes] = await Promise.all([
        axios.get<SkillStatus>(`${API_BASE}/skills/status`),
        axios.get<AIStatus>(`${API_BASE}/ai/status`),
      ]);
      setAiStatus(aiRes.data);
      setAiDraft(aiRes.data.settings as unknown as typeof aiDraft);
      setSkillCount(statusRes.data?.skill_engine?.cache?.skill_count ?? 0);
      // Auto-sync if pending updates detected
      const pendingUpdates = statusRes.data?.update_count ?? 0;
      if (pendingUpdates > 0) {
        setNewSkillsAvailable(true);
      }
    } catch { /* offline */ }
  }, []);

  // ── Skill sync ───────────────────────────────────────────
  const handleSkillSync = useCallback(async () => {
    setSyncingSkills(true); setErrorMsg(null);
    try {
      const res = await axios.post<{ skill_count?: number; new_skills?: number; message?: string }>(`${API_BASE}/skills/pull`);
      const newCount = res.data?.skill_count ?? skillCount;
      if (newCount > skillCount) {
        setNoticeMsg(`Synced! ${newCount - skillCount} new skill(s) loaded. Total: ${newCount}`);
        setNewSkillsAvailable(false);
      } else {
        setNoticeMsg(`Skills up to date (${newCount} loaded).`);
      }
      setSkillCount(newCount);
    } catch {
      setErrorMsg('Skill sync failed. Neon DB may be unreachable. Using local fallback skills.');
    } finally { setSyncingSkills(false); }
  }, [skillCount]);

  // Auto-sync when pending updates detected (runs once after startup)
  const autoSyncRan = useRef(false);
  useEffect(() => {
    if (newSkillsAvailable && !autoSyncRan.current) {
      autoSyncRan.current = true;
      const timer = setTimeout(() => { void handleSkillSync(); }, 3000);
      return () => clearTimeout(timer);
    }
  }, [newSkillsAvailable, handleSkillSync]);

  // ── Settings ─────────────────────────────────────────────
  const saveSettings = useCallback(async () => {
    if (!aiDraft) return;
    setIsBusy(true);
    try { await axios.put(`${API_BASE}/ai/settings`, aiDraft); setNoticeMsg('Settings saved ✓'); setShowSettings(false); }
    catch { setErrorMsg('Could not save settings. Is the backend running?'); }
    finally { setIsBusy(false); }
  }, [aiDraft]);

  // ── MODE 1: New Document ─────────────────────────────────
  const handleGenerateDocument = useCallback(async () => {
    if (newDocContext.trim().length < 20) { setErrorMsg('Please provide at least 20 characters of research context.'); return; }
    if (needsSetup) { setErrorMsg('Configure your AI API key first. Click the gear icon ⚙️ in the top bar.'); setShowSettings(true); return; }
    if (!aiOnline) { setErrorMsg('AI provider is offline. Check your connection and API key in Settings, then retry.'); setShowSettings(true); return; }
    if (internetOnline === false) { setErrorMsg('Internet is required to retrieve open scholarly citation candidates before generating a new document.'); return; }
    setGenPhase('writing'); setIsBusy(true); setErrorMsg(null);
    const preset = getFormatPreset(newDocType, newDocNorm);
    const sections = (preset?.suggestedChapters ?? []).filter((ch) => ch.words > 0).map((ch) => ch.title);
    try {
      const res = await axios.post(`${API_BASE}/writing-assistant/write-from-context`, {
        research_context: newDocContext.trim(),
        doc_type: newDocType, norm: newDocNorm, sections,
      }, { timeout: 300000 }); // 5 min timeout for long generation
      const content = res.data.content ?? res.data.draft ?? res.data.text ?? '';
      if (!content) throw new Error('AI returned empty response. Try again with more context.');
      setGeneratedText(content);
      setGeneratedTitle(res.data.title ?? 'Generated Document');
      setNewDocId(res.data.doc_id ?? null);
      setGenPhase('done');
      setNoticeMsg('Document generated successfully!');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = String(err.response?.data?.detail ?? err.message);
        if (err.response?.status === 401) setErrorMsg('AI API key is invalid or expired. Update it in Settings.');
        else if (err.response?.status === 403) setErrorMsg('This feature is blocked by your privacy settings. Check Settings → Privacy Mode.');
        else if (err.code === 'ECONNABORTED') setErrorMsg('Generation timed out. Try with shorter context or check your AI provider.');
        else setErrorMsg(detail);
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Generation failed. Try again.');
      }
      setGenPhase('idle');
    } finally { setIsBusy(false); }
  }, [newDocContext, newDocType, newDocNorm, needsSetup, aiOnline, internetOnline]);

  const handleCopyGenerated = useCallback(() => {
    navigator.clipboard.writeText(generatedText).then(
      () => setNoticeMsg('Copied to clipboard ✓'),
      () => setErrorMsg('Could not copy. Select and copy manually.'),
    );
  }, [generatedText]);

  const handleExportGenerated = useCallback(async (format: 'docx' | 'pdf') => {
    if (!newDocId && !generatedText) { setErrorMsg('Nothing to export yet.'); return; }
    setIsBusy(true);
    try {
      if (newDocId) {
        const res = await axios.post<FinalizeResult>(`${API_BASE}/analysis/finalize-thesis`, {
          doc_id: newDocId,
          chapters: [{ id: 'main', title: generatedTitle, original_text: generatedText, edited_text: generatedText }],
          doc_type: newDocType, norm: newDocNorm, design_theme: themeMode === 'dark' ? 'classic_blue' : 'mono_formal',
          output_formats: [format],
        });
        const artifact = res.data.artifacts.find((a) => a.format === format);
        if (artifact) {
          const base = API_BASE.replace(/\/api\/v1$/, '');
          window.open(`${base}${artifact.download_url}`, '_blank', 'noopener,noreferrer');
        }
      } else {
        const blob = new Blob([generatedText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${generatedTitle.replace(/[^a-zA-Z0-9]/g, '_')}.${format === 'docx' ? 'txt' : 'txt'}`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }
      setNoticeMsg(`Exported as ${format.toUpperCase()} ✓`);
    } catch (err) {
      setErrorMsg(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : 'Export failed.');
    } finally { setIsBusy(false); }
  }, [newDocId, generatedText, generatedTitle, newDocType, newDocNorm, themeMode]);

  // ── MODE 2: Scan ─────────────────────────────────────────
  const handleFileUpload = useCallback(async (file: File) => {
    setScanFilename(file.name);
    setRewritePreview(null); setRewriteDiff(null); setScanExportChapters([]);
    setScanPhase('scanning'); setScanLog([]); setIsBusy(true); setErrorMsg(null);
    try {
      setScanLog((p) => [...p, '📤 Uploading document...']);
      const form = new FormData(); form.append('file', file);
      const upload = await axios.post<UploadResult>(`${API_BASE}/documents/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const docId = upload.data.doc_id; setScanDocId(docId);
      setScanLog((p) => [...p, `✅ Uploaded: ${file.name} (${formatBytes(file.size)})`]);
      await runScanRef.current?.(docId);
    } catch (err) {
      setErrorMsg(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : 'Upload failed.');
      setScanPhase('upload');
    } finally { setIsBusy(false); }
  }, []);

  const runScan = useCallback(async (docId: string) => {
    if (needsSetup) { setErrorMsg('Configure an AI provider before scanning. OTIF analysis requires AI + skill packs + open research APIs.'); setShowSettings(true); setScanPhase('upload'); return; }
    if (aiOnline === false) { setErrorMsg('AI provider is offline. Analysis requires a working AI provider. Check Settings and retry connection check.'); setShowSettings(true); setScanPhase('upload'); return; }
    if (internetOnline === false) { setErrorMsg('Internet is required for open scholarly API checks. Restore internet/proxy access, then scan again.'); setScanPhase('upload'); return; }
    setIsBusy(true); setScanLog([]); setResearchApiStatus(new Map());
    setScanLog((p) => [...p, '🔍 Starting analysis — connecting to research engines...']);
    try {
      const response = await fetch(`${API_BASE}/analysis/run/${docId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: scanDocType, norm: scanNorm, pace: scanPace }),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      if (!response.body) throw new Error('No response stream');

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
          const line = chunk.split('\n').find((e) => e.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as StreamEvent & { source_id?: string; source_name?: string; status?: string; match_count?: number; step?: number; total?: number };
          // Per-API research status
          if (event.stage === 'research_source_checking' && event.source_id) {
            setResearchApiStatus((prev) => {
              const next = new Map(prev);
              next.set(event.source_id!, { name: event.source_name ?? event.source_id!, status: 'checking', matchCount: 0, step: event.step ?? 0 });
              return next;
            });
          }
          if (event.stage === 'research_source_result' && event.source_id) {
            setResearchApiStatus((prev) => {
              const next = new Map(prev);
              next.set(event.source_id!, { name: event.source_name ?? event.source_id!, status: event.status ?? 'checked', matchCount: event.match_count ?? 0, step: next.get(event.source_id!)?.step ?? 0 });
              return next;
            });
          }
          // Log messages (skip per-API events since they go to the grid)
          if (event.message && event.stage !== 'research_source_checking' && event.stage !== 'research_source_result') {
            setScanLog((p) => [...p, event.message!]);
          }
          if (event.scores) setScores(event.scores);
          if (event.improvement_plan) { setImprovementPlan(event.improvement_plan); setApprovedIds([]); }
          if (event.stage === 'error') throw new Error(event.message ?? 'Analysis error');
        }
      }
      setScanLog((p) => [...p, '✅ Analysis complete']);
      setScanPhase('results');
      setNoticeMsg('Scan complete! Review the findings below.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Scan failed.');
      setScanPhase('upload');
    } finally { setIsBusy(false); }
  }, [scanDocType, scanNorm, scanPace, needsSetup, aiOnline, internetOnline]);
  runScanRef.current = runScan;

  const handleToggleApproval = useCallback((id: string) => {
    setApprovedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const handleApproveAll = useCallback(() => {
    if (approvedIds.length === improvementPlan.length) setApprovedIds([]);
    else setApprovedIds(improvementPlan.map((item) => item.id));
  }, [improvementPlan, approvedIds]);

  const toggleExpandItem = useCallback((id: string) => {
    setExpandedItems((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const handleApplyImprovements = useCallback(async () => {
    if (!scanDocId) return;
    if (approvedIds.length === 0) { setErrorMsg('Select at least one improvement before applying changes.'); return; }
    if (needsSetup) { setErrorMsg('Configure your AI API key first. Click the gear icon ⚙️ in the top bar.'); setShowSettings(true); return; }
    if (!aiOnline) { setErrorMsg('AI provider is offline. Cannot apply AI improvements. Check Settings → AI Provider.'); setShowSettings(true); return; }
    setIsBusy(true); setNoticeMsg('Applying improvements with AI...');
    try {
      const res = await axios.post(`${API_BASE}/analysis/approve-rewrite`, {
        doc_id: scanDocId,
        approved_item_ids: approvedIds,
        doc_type: scanDocType, norm: scanNorm,
        design_theme: themeMode === 'dark' ? 'classic_blue' : 'mono_formal',
        output_formats: ['docx'],
      });
      const chapRes = await axios.get(`${API_BASE}/analysis/chapter-editor/${scanDocId}?doc_type=${scanDocType}&norm=${scanNorm}`);
      const sourceChapters = (chapRes.data?.chapters ?? []).map((ch: { id: string; title: string; original_text: string }) => ({
        id: ch.id,
        title: ch.title,
        original_text: ch.original_text,
        edited_text: ch.original_text,
      }));
      if (sourceChapters.length === 0) {
        throw new Error('No editable chapters were returned for export.');
      }
      const fullRewrite = await axios.post<{ chapters: FullRewriteChapter[]; warnings?: string[] }>(`${API_BASE}/analysis/rewrite-full-document`, {
        doc_id: scanDocId,
        chapters: sourceChapters,
        approved_item_ids: approvedIds,
        doc_type: scanDocType,
        norm: scanNorm,
        design_theme: themeMode === 'dark' ? 'classic_blue' : 'mono_formal',
      }, { timeout: 300000 });
      const rewrittenChapters = (fullRewrite.data?.chapters ?? []).map((ch) => ({
        id: ch.id,
        title: ch.title,
        original_text: ch.original_text,
        edited_text: ch.rewritten_text || ch.original_text,
      }));
      if (rewrittenChapters.length === 0) {
        throw new Error('AI rewrite did not return any chapter text to export.');
      }
      setScanExportChapters(rewrittenChapters);
      setRewritePreview(rewrittenChapters.map((ch) => `## ${ch.title}\n\n${ch.edited_text}`).join('\n\n'));
      const rewriteWarnings = fullRewrite.data?.warnings ?? [];
      if (rewriteWarnings.length > 0) {
        setNoticeMsg(`Rewrite completed with ${rewriteWarnings.length} chapter warning(s). Review the updated preview before export.`);
      }
      const preview = res.data?.rewrite_preview;
      if (preview && typeof preview === 'string' && preview.length > 50) {
        // Use backend-computed diff if available, otherwise compute client-side
        if (res.data?.diff) {
          setRewriteDiff(res.data.diff);
        } else {
          try {
            const chapRes = await axios.get(`${API_BASE}/analysis/chapter-editor/${scanDocId}?doc_type=${scanDocType}&norm=${scanNorm}`);
            const chapters = chapRes.data?.chapters ?? [];
            const originalText = chapters.map((ch: { original_text: string }) => ch.original_text ?? '').join('\n\n');
            if (originalText.length > 100) {
              const originalSentences = originalText.split(/(?<=[.!?])\s+/).filter((s: string) => s.length > 15);
              const rewriteSentences = preview.split(/(?<=[.!?])\s+/).filter((s: string) => s.length > 15);
              const origSet = new Set(originalSentences.map((s: string) => s.trim().toLowerCase()));
              const rewriteSet = new Set(rewriteSentences.map((s: string) => s.trim().toLowerCase()));
              const deletions = originalSentences.filter((s: string) => !rewriteSet.has(s.trim().toLowerCase()));
              const insertions = rewriteSentences.filter((s: string) => !origSet.has(s.trim().toLowerCase()));
              setRewriteDiff({ deletions, insertions });
            }
          } catch { /* diff computation is best-effort */ }
        }
      }
      setScanPhase('exporting');
      if ((fullRewrite.data?.warnings ?? []).length === 0) {
        setNoticeMsg('Improvements applied! Review track changes below, then export.');
      }
    } catch (err) {
      setErrorMsg(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : 'Improvement failed.');
    } finally { setIsBusy(false); }
  }, [scanDocId, approvedIds, scanDocType, scanNorm, themeMode, needsSetup, aiOnline]);

  const handleExportScanned = useCallback(async (format: 'docx' | 'pdf') => {
    if (!scanDocId) return;
    setIsBusy(true);
    try {
      let chaptersPayload = scanExportChapters;
      if (chaptersPayload.length === 0) {
        const chapRes = await axios.get(`${API_BASE}/analysis/chapter-editor/${scanDocId}?doc_type=${scanDocType}&norm=${scanNorm}`);
        chaptersPayload = (chapRes.data?.chapters ?? []).map((ch: { id: string; title: string; original_text: string }) => ({
          id: ch.id, title: ch.title, original_text: ch.original_text, edited_text: ch.original_text,
        }));
      }
      if (chaptersPayload.length === 0) {
        throw new Error('No chapter text is available to export.');
      }

      const res = await axios.post<FinalizeResult>(`${API_BASE}/analysis/finalize-thesis`, {
        doc_id: scanDocId,
        chapters: chaptersPayload,
        doc_type: scanDocType, norm: scanNorm,
        design_theme: themeMode === 'dark' ? 'classic_blue' : 'mono_formal',
        output_formats: [format],
      });
      const artifact = res.data.artifacts.find((a) => a.format === format);
      if (artifact) {
        const base = API_BASE.replace(/\/api\/v1$/, '');
        window.open(`${base}${artifact.download_url}`, '_blank', 'noopener,noreferrer');
        setNoticeMsg(`Downloading ${format.toUpperCase()}...`);
      }
    } catch (err) {
      setErrorMsg(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : 'Export failed.');
    } finally { setIsBusy(false); }
  }, [scanDocId, scanDocType, scanNorm, themeMode, scanExportChapters]);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFileUpload(file);
    e.target.value = '';
  }, [handleFileUpload]);

  // ── Drag & drop ──────────────────────────────────────────
  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setDragOver(false); }, []);
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFileUpload(file);
  }, [handleFileUpload]);

  const resetScan = useCallback(() => {
    setScanDocId(null); setScanFilename(''); setScores(null);
    setImprovementPlan([]); setApprovedIds([]); setScanPhase('upload'); setScanLog([]);
    setResearchApiStatus(new Map()); setRewritePreview(null); setRewriteDiff(null); setScanExportChapters([]);
  }, [runScan]);

  // Re-analyze the rewritten document
  const handleReAnalyze = useCallback(async () => {
    if (!scanDocId) return;
    setRewritePreview(null); setRewriteDiff(null); setScanExportChapters([]);
    setScanPhase('scanning'); setScanLog([]); setIsBusy(true); setErrorMsg(null);
    try {
      setScanLog((p) => [...p, '🔄 Re-analyzing rewritten document...']);
      await runScan(scanDocId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Re-analysis failed.');
      setScanPhase('results');
    } finally { setIsBusy(false); }
  }, [scanDocId, runScan]);

  const resetNewDoc = useCallback(() => {
    setNewDocContext(''); setGeneratedText(''); setGeneratedTitle('');
    setNewDocId(null); setGenPhase('idle'); setWizardStep('setup');
    setCustomGuidelines(''); setTargetWords(0); setTargetPages(0);
  }, []);

  // ── Splash screen ────────────────────────────────────────
  if (backendPhase !== 'ready') {
    const dots = '.'.repeat(startupDot + 1).padEnd(3, ' ');
    return (
      <div className="splash-overlay">
        <div className="splash-card">
          <div className="splash-logo">
            <div className="splash-logo-icon"><Activity size={28} color="white" /></div>
            <div>
              <div className="splash-logo-title">OTIF</div>
              <div className="splash-logo-sub">OpenThesis Integrity Fabric</div>
            </div>
          </div>
          {backendPhase === 'starting' && (
            <>
              <div className="splash-spinner"><div className="splash-ring" /></div>
              <p className="splash-status">{startupMsg}{dots}</p>
              <p className="splash-hint">Starting local research engine — this takes a few seconds on first launch</p>
            </>
          )}
          {backendPhase === 'error' && (
            <>
              <div className="splash-error-icon">⚠️</div>
              <p className="splash-status" style={{ color: 'var(--accent-rose)' }}>Backend did not start</p>
              <div className="splash-actions">
                <button className="btn btn-primary splash-retry-btn" onClick={() => { setBackendPhase('starting'); window.location.reload(); }}>Retry</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── SHARED TOP BAR ───────────────────────────────────────
  const TopBar = ({ title, onBack, action }: { title: string; onBack?: () => void; action?: React.ReactNode }) => (
    <div style={s.topBar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {onBack && <button onClick={onBack} style={s.backBtn}>← Back</button>}
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {action}
        <button onClick={toggleTheme} style={s.iconBtn} title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`}>
          {themeMode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button onClick={() => setShowSettings(true)} style={s.iconBtn} title="Settings">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );

  // ── LANDING PAGE ─────────────────────────────────────────
  if (mode === 'landing') {
    return (
      <div style={s.shell}>
        <TopBar title="OTIF — OpenThesis Integrity Fabric" action={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Skill sync — shown when updates pending */}
            {newSkillsAvailable && (
              <button onClick={handleSkillSync} disabled={syncingSkills} style={{
                fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--r-full)',
                border: 'none', background: 'hsla(38,95%,58%,0.15)', color: 'var(--score-fair)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                animation: 'pulse 2s ease-in-out infinite',
              }} title="Sync skill updates from Neon DB">
                {syncingSkills ? '⏳ Syncing...' : '🔄 Sync Skills Now'}
                <span style={{ background: 'var(--score-fair)', color: '#000', padding: '1px 5px', borderRadius: 'var(--r-full)', fontSize: '9px' }}>{skillCount}</span>
              </button>
            )}
            {/* AI status pill */}
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)',
              background: checkingConnectivity ? 'var(--bg-overlay)' : aiOnline ? 'hsla(145,75%,55%,0.12)' : 'hsla(352,85%,62%,0.1)',
              color: checkingConnectivity ? 'var(--text-muted)' : aiOnline ? 'var(--score-excellent)' : 'var(--score-critical)',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: checkingConnectivity ? 'var(--text-muted)' : aiOnline ? 'var(--score-excellent)' : 'var(--score-critical)' }} />
              {checkingConnectivity ? 'Checking AI...' : aiOnline ? 'AI Ready' : 'AI Offline'}
            </span>
            {/* Internet status pill */}
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)',
              background: checkingConnectivity ? 'var(--bg-overlay)' : internetOnline ? 'hsla(145,75%,55%,0.12)' : 'hsla(352,85%,62%,0.1)',
              color: checkingConnectivity ? 'var(--text-muted)' : internetOnline ? 'var(--score-excellent)' : 'var(--score-critical)',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: checkingConnectivity ? 'var(--text-muted)' : internetOnline ? 'var(--score-excellent)' : 'var(--score-critical)' }} />
              {checkingConnectivity ? 'Checking Net...' : internetOnline ? 'Internet OK' : 'No Internet'}
            </span>
            {needsSetup && <span style={{ fontSize: '10px', color: 'var(--score-critical)', fontWeight: 600, padding: '3px 10px', background: 'hsla(352,85%,62%,0.1)', borderRadius: 'var(--r-full)' }}>⚙️ Add API Key</span>}
            {newSkillsAvailable && <button onClick={handleSkillSync} disabled={syncingSkills} style={{ fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', border: 'none', background: 'hsla(38,95%,58%,0.12)', color: 'var(--score-fair)', cursor: 'pointer' }}>🔄 {syncingSkills ? 'Syncing...' : `${skillCount} skills — Sync`}</button>}
            {aiOnline === false && <button onClick={checkConnectivity} style={{ fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', border: 'none', background: 'var(--bg-overlay)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Retry</button>}
          </div>
        } />

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px 64px' }}>
{/* Model upgrade banner — shown when using small Ollama model */}
{aiProvider === 'ollama' && aiStatus?.active_model && !aiStatus.active_model.includes('7b') && !aiStatus.active_model.includes('8b') && !aiStatus.active_model.includes('13b') && !aiStatus.active_model.includes('70b') && (
  <div style={{
    maxWidth: '640px', margin: '0 auto 24px', padding: '12px 16px',
    background: 'hsla(38,95%,58%,0.08)', border: '1px solid hsla(38,95%,58%,0.2)',
    borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-secondary)',
    display: 'flex', alignItems: 'center', gap: '10px',
  }}>
    <span style={{ fontSize: '18px' }}>💡</span>
    <span style={{ flex: 1, lineHeight: 1.5 }}>
      <strong style={{ color: 'var(--score-fair)' }}>Small model detected:</strong> {aiStatus.active_model} (1.5B).
      For quality academic writing, pull a larger model:{' '}
      <code style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>ollama pull qwen2.5:7b</code>
      {' '}or configure a cloud API key in Settings ⚙️.
    </span>
  </div>
)}

{/* Hero */}
<div style={{ textAlign: 'center', maxWidth: '640px', marginBottom: '48px' }}>
  <h1 style={{ fontSize: '32px', fontWeight: 900, lineHeight: 1.2, color: 'var(--text-primary)', margin: '0 0 12px' }}>
    Academic Research<br />Intelligence Platform
  </h1>
  <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 6px' }}>
    Local-first. AI-powered. Built for doctoral candidates to audit, improve, and write rigorous manuscripts — no data ever leaves your machine unless you choose a cloud AI.
  </p>
</div>

          {/* Two cards */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '820px', width: '100%' }}>
            {/* NEW DOCUMENT CARD */}
            <div style={{ ...s.card, flex: '1 1 340px', maxWidth: '400px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                <div style={cardIconStyle('var(--brand-500)', 'hsla(258,75%,55%,0.12)')}><Sparkles size={24} /></div>
                <div>
                  <h2 style={s.cardTitle}>Write New Document</h2>
                  <p style={s.cardDesc}>AI writes a complete academic draft from your research context.</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {['Describe your research topic & findings', 'AI generates structured academic prose', 'Review, export as DOCX or PDF'].map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--brand-400)', flexShrink: 0 }}>{i + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
              <button onClick={() => { setMode('new-doc'); resetNewDoc(); }}
                disabled={!aiOnline}
                style={aiOnline ? s.primaryBtn : { ...s.primaryBtn, background: 'var(--bg-muted)', color: 'var(--text-muted)', cursor: 'not-allowed' }}>
                <Sparkles size={16} /> {aiOnline ? 'Start Writing' : 'AI Required — Offline'}
                {aiOnline && <ArrowRight size={14} style={{ marginLeft: 'auto' }} />}
              </button>
              {aiOnline === false && (
                <p style={{ fontSize: '10px', color: 'var(--score-critical)', margin: '6px 0 0', textAlign: 'center' }}>
                  Requires a working AI provider. Check your API key in Settings ⚙️ or retry connection check.
                </p>
              )}
            </div>

            {/* SCAN CARD */}
            <div style={{ ...s.card, flex: '1 1 340px', maxWidth: '400px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                <div style={cardIconStyle('var(--accent-green)', 'hsla(145,75%,55%,0.12)')}><ShieldCheck size={24} /></div>
                <div>
                  <h2 style={s.cardTitle}>Scan Existing Document</h2>
                  <p style={s.cardDesc}>Upload your manuscript for a 6-dimension integrity audit & improvement plan.</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {['Upload your .docx, .pdf, or .txt file', '6-dimension analysis in under 60 seconds', 'Approve & apply AI-powered improvements'].map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--accent-green)', flexShrink: 0 }}>{i + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setMode('scan'); resetScan(); }}
                disabled={aiOnline === false || internetOnline === false || checkingConnectivity}
                style={(aiOnline === false || internetOnline === false || checkingConnectivity) ? { ...s.primaryBtnGreen, background: 'var(--bg-muted)', color: 'var(--text-muted)', cursor: 'not-allowed' } : s.primaryBtnGreen}
              >
                <ShieldCheck size={16} /> {checkingConnectivity ? 'Checking...' : 'Scan Document'} <ArrowRight size={14} style={{ marginLeft: 'auto' }} />
              </button>
              {internetOnline === false && (
                <>
                <p style={{ fontSize: '10px', color: 'var(--score-critical)', margin: '6px 0 0', textAlign: 'center' }}>
                  Internet required - open research source checks are mandatory for analysis.
                </p>
                <p style={{ display: 'none' }}>
                  ⚠ No internet — research source checks will be skipped. Local analysis still works.
                </p>
                </>
              )}
            </div>
          </div>

          {/* Bottom status bar */}
          <div style={{ marginTop: '40px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%',
                background: checkingConnectivity ? 'var(--text-muted)' : aiOnline === null ? 'var(--text-muted)' : aiOnline ? 'var(--score-excellent)' : 'var(--score-critical)' }} />
              <span>AI: {checkingConnectivity ? 'Checking...' : aiOnline === null ? 'Waiting...' : aiOnline ? `${aiProvider} ready` : 'Offline'}</span>
            </div>
            <span>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%',
                background: checkingConnectivity ? 'var(--text-muted)' : internetOnline ? 'var(--score-excellent)' : 'var(--score-critical)' }} />
              <span>{checkingConnectivity ? 'Checking...' : internetOnline ? 'Internet OK' : 'No Internet'}</span>
            </div>
            <span>|</span>
            <span>Local manuscript storage</span>
            <span>|</span>
            <button onClick={checkConnectivity} style={{ background: 'none', border: 'none', color: 'var(--brand-400)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, padding: 0 }}
              disabled={checkingConnectivity}>
              {checkingConnectivity ? 'Checking...' : 'Recheck'}
            </button>
          </div>
        </div>

        {showSettings && <SettingsModal aiDraft={aiDraft} setAiDraft={setAiDraft} aiStatus={aiStatus} themeMode={themeMode} toggleTheme={toggleTheme} onSave={saveSettings} onClose={() => setShowSettings(false)} isBusy={isBusy} />}
        {errorMsg && <Toast type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />}
        {noticeMsg && <Toast type="notice" message={noticeMsg} />}
      </div>
    );
  }

  // ── MODE 1: NEW DOCUMENT ─────────────────────────────────
  // ── MODE 1: NEW DOCUMENT (Wizard) ────────────────────────
  if (mode === 'new-doc') {
    const preset = getFormatPreset(newDocType, newDocNorm);
    const effectiveTargetWords = targetWords || preset?.totalWords || 8000;
    const effectiveTargetPages = targetPages || preset?.totalPages || 28;

    return (
      <div style={s.shell}>
        <TopBar title="Write New Document" onBack={() => { setMode('landing'); resetNewDoc(); }}
          action={<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {newSkillsAvailable && <button onClick={handleSkillSync} disabled={syncingSkills} style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-full)', border: 'none', background: 'hsla(38,95%,58%,0.15)', color: 'var(--score-fair)', cursor: 'pointer' }}>{syncingSkills ? '⏳' : '🔄'} Sync {skillCount}</button>}
            {aiOnline === false && <span style={{ fontSize: '10px', color: 'var(--score-critical)', fontWeight: 600, padding: '3px 10px', background: 'hsla(352,85%,62%,0.1)', borderRadius: 'var(--r-full)' }}>⚠ AI Offline</span>}
          </div>}
        />

        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: '840px', margin: '0 auto', padding: '24px 24px 64px' }}>
            {/* Wizard steps indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '32px' }}>
              {(['setup', 'context', 'generate'] as WizardStep[]).map((step, i) => {
                const isActive = wizardStep === step;
                const isDone = (wizardStep === 'context' && step === 'setup') || (wizardStep === 'generate' && (step === 'setup' || step === 'context'));
                return (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 14px', borderRadius: 'var(--r-full)',
                      background: isActive ? 'var(--brand-500)' : isDone ? 'hsla(145,75%,55%,0.12)' : 'var(--bg-overlay)',
                      color: isActive ? '#fff' : isDone ? 'var(--score-excellent)' : 'var(--text-muted)',
                      fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', transition: 'all var(--t-fast)',
                    }}>
                      <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: isActive ? 'hsla(0,0%,100%,0.2)' : isDone ? 'hsla(145,75%,55%,0.2)' : 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>
                        {isDone ? '✓' : i + 1}
                      </span>
                      {step === 'setup' ? 'Setup' : step === 'context' ? 'Context' : 'Generate'}
                    </div>
                    {i < 2 && <div style={{ flex: 1, height: '2px', background: isDone ? 'var(--score-excellent)' : 'var(--bg-muted)', margin: '0 8px', borderRadius: '1px', transition: 'background var(--t-normal)' }} />}
                  </div>
                );
              })}
            </div>

            {/* STEP 1: SETUP */}
            {wizardStep === 'setup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Document Setup</h2>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={s.label}>Document Type</label>
                    <select value={newDocType} onChange={(e) => { setNewDocType(e.target.value); setTargetWords(0); setTargetPages(0); }} style={{ ...s.select, width: '100%' }}>
                      {DOC_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={s.label}>Citation Format</label>
                    <select value={newDocNorm} onChange={(e) => { setNewDocNorm(e.target.value); setTargetWords(0); setTargetPages(0); }} style={{ ...s.select, width: '100%' }}>
                      {NORMS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                    </select>
                  </div>
                </div>

                {preset && (
                  <div style={{ padding: '20px', background: 'var(--bg-raised)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                          📋 {preset.label} · Suggested Structure
                        </h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                          {preset.notes}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <span>📝 ~{effectiveTargetWords.toLocaleString()} words</span>
                        <span>📄 ~{effectiveTargetPages} pages</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                      {preset.suggestedChapters.map((ch, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-overlay)', borderRadius: 'var(--r-sm)', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{ch.title}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{ch.words > 0 ? `~${ch.words.toLocaleString()} words` : ''}{ch.pages > 0 ? ` · ${ch.pages} pages` : ''}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 150px' }}>
                        <label style={{ ...s.label, fontSize: '10px' }}>Override Word Count</label>
                        <input type="number" value={targetWords || ''} onChange={(e) => setTargetWords(Number(e.target.value) || 0)} placeholder={preset.totalWords.toLocaleString()} style={s.input} />
                      </div>
                      <div style={{ flex: '1 1 150px' }}>
                        <label style={{ ...s.label, fontSize: '10px' }}>Override Page Count</label>
                        <input type="number" value={targetPages || ''} onChange={(e) => setTargetPages(Number(e.target.value) || 0)} placeholder={preset.totalPages.toString()} style={s.input} />
                      </div>
                    </div>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      📌 Citation style: <strong style={{ color: 'var(--text-secondary)' }}>{preset.citationStyle}</strong>
                    </p>
                  </div>
                )}

                <div>
                  <label style={s.label}>University / Journal Guidelines <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — paste formatting requirements)</span></label>
                  <textarea value={customGuidelines} onChange={(e) => setCustomGuidelines(e.target.value)}
                    placeholder="Paste any specific formatting, structure, or content requirements from your university or target journal..." style={{ ...s.textarea, minHeight: '80px' }} rows={4} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setWizardStep('context')} style={s.primaryBtn}>Continue to Context <ArrowRight size={14} /></button>
                </div>
              </div>
            )}

            {/* STEP 2: CONTEXT */}
            {wizardStep === 'context' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Research Context & Topic</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    Describe your research. AI will generate a complete {preset?.label ?? 'document'} with {effectiveTargetWords.toLocaleString()} words across {preset?.suggestedChapters?.length ?? 5} chapters, using {preset?.citationStyle ?? newDocNorm.toUpperCase()} citations with real references from CrossRef.
                  </p>
                </div>
                <div style={{ padding: '12px 16px', background: 'var(--bg-overlay)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <span>📄 Type: <strong>{preset?.label ?? newDocType}</strong></span>
                  <span>📝 Target: <strong>~{effectiveTargetWords.toLocaleString()} words</strong></span>
                  <span>📑 Chapters: <strong>{preset?.suggestedChapters?.length ?? 5}</strong></span>
                  <span>🔖 Citations: <strong>{preset?.citationStyle ?? newDocNorm.toUpperCase()}</strong></span>
                  {customGuidelines && <span>📋 Custom guidelines: <strong>Yes</strong></span>}
                  <button onClick={() => setWizardStep('setup')} style={{ background: 'none', border: 'none', color: 'var(--brand-400)', cursor: 'pointer', fontSize: '10px', fontWeight: 600, padding: 0, textDecoration: 'underline' }}>Edit setup →</button>
                </div>
                <div>
                  <label style={s.label}>Research Context <span style={{ color: 'var(--score-critical)' }}>*</span></label>
                  <textarea value={newDocContext} onChange={(e) => setNewDocContext(e.target.value)}
                    placeholder="Describe your research topic, methodology, key findings, theoretical framework, and any specific requirements. Be as detailed as possible." style={{ ...s.textarea, minHeight: '180px' }} rows={10} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                    <span>{newDocContext.length} / 8000 characters</span>
                    <span>{newDocContext.length < 20 ? 'Minimum 20 characters required' : undefined}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button onClick={() => setWizardStep('setup')} style={{ ...s.secondaryBtn }}>← Back to Setup</button>
                  <button onClick={() => { setWizardStep('generate'); }} disabled={newDocContext.trim().length < 20} style={s.primaryBtn}>Review & Generate <ArrowRight size={14} /></button>
                </div>
              </div>
            )}

            {/* STEP 3: GENERATE */}
            {genPhase === 'idle' && wizardStep === 'generate' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Review & Generate</h2>
                <div style={{ padding: '20px', background: 'var(--bg-raised)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-subtle)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Generation Summary</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                    {[['Type', preset?.label ?? newDocType], ['Format', newDocNorm.toUpperCase()], ['Words', `~${effectiveTargetWords.toLocaleString()}`], ['Pages', `~${effectiveTargetPages}`], ['Chapters', String(preset?.suggestedChapters?.length ?? 5)], ['Citations', `${preset?.citationStyle ?? newDocNorm} (open scholarly APIs)`], ['Diagrams', 'Auto-generated ✅'], ['Integrity', 'Ready for audit'], ['AI Transparency', 'Disclosure-ready'], ...(customGuidelines ? [['Custom Guidelines', 'Provided ✅']] : [])].map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{l}</span><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {preset && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Chapters to generate:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {preset.suggestedChapters.filter((ch) => ch.words > 0).map((ch, i) => (
                          <span key={i} style={{ fontSize: '10px', padding: '3px 8px', background: 'var(--bg-overlay)', borderRadius: 'var(--r-sm)', color: 'var(--text-secondary)' }}>{ch.title}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button onClick={() => setWizardStep('context')} style={{ ...s.secondaryBtn }}>← Back</button>
                  <button onClick={handleGenerateDocument} disabled={isBusy} style={s.primaryBtn}><Sparkles size={16} /> Generate {preset?.label ?? 'Document'}</button>
                </div>
              </div>
            )}

            {/* Writing... */}
            {/* Writing progress with animated step indicators */}
            {genPhase === 'writing' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
                <div className="splash-spinner"><div className="splash-ring" /></div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '20px 0 8px' }}>Writing {preset?.label ?? 'document'}...</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 24px', maxWidth: '440px', lineHeight: 1.6 }}>
                  Generating {preset?.suggestedChapters?.length ?? 5} chapters with real citations from CrossRef, diagrams, and humanized prose.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '380px', width: '100%' }}>
                  {[
                    { icon: '🔍', label: 'Extracting key concepts from your context', detail: 'Identifying research themes, methodology, and findings' },
                    { icon: '📚', label: 'Searching real citations from CrossRef', detail: 'Finding real, verifiable academic references for your topic' },
                    { icon: '📊', label: 'Generating diagrams from structure', detail: 'Auto-detecting frameworks, processes, and models to diagram' },
                    { icon: '✍️', label: 'Writing chapters with academic skill rules', detail: `Applying ${skillCount} skill packs for quality, originality, and voice` },
                    { icon: '🔒', label: 'Locking citations byte-identically', detail: 'Ensuring all references are preserved and traceable' },
                    { icon: '✅', label: 'Humanizing and finalizing', detail: 'Removing AI patterns, varying sentence rhythm, adding researcher voice' },
                  ].map((step, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 14px', background: 'var(--bg-raised)',
                      borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)',
                      opacity: 0.5 + (i * 0.08), transition: 'opacity 0.3s',
                    }}>
                      <span style={{ fontSize: '18px', flexShrink: 0 }}>{step.icon}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{step.label}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{step.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '20px' }}>
                  Using {aiProvider}{aiStatus?.active_model ? ` / ${aiStatus.active_model}` : ''} · This may take 2–5 minutes for longer documents
                </p>
              </div>
            )}

            {/* Done */}
            {genPhase === 'done' && generatedText && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{generatedTitle || (preset?.label ?? 'Document')}</h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>{generatedText.split(/\s+/).filter(Boolean).length.toLocaleString()} words · ready for integrity scan · disclosure-ready</p>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={handleCopyGenerated} style={s.secondaryBtn}><Copy size={13} /> Copy</button>
                    <button onClick={() => handleExportGenerated('docx')} style={s.secondaryBtn}><Download size={13} /> DOCX</button>
                    <button onClick={() => handleExportGenerated('pdf')} style={s.secondaryBtn}><Download size={13} /> PDF</button>
                  </div>
                </div>
                <div style={{ background: '#ffffff', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-default)', boxShadow: '0 1px 6px hsla(225,30%,5%,0.3)', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 16px', background: 'var(--bg-overlay)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={13} color="var(--text-muted)" /><span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{preset?.label ?? 'Generated Document'}</span>
                  </div>
                  <div style={{ padding: '28px 36px', maxHeight: '60vh', overflow: 'auto' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '15px', lineHeight: 1.85, color: '#1a1a1a', margin: 0 }}>{generatedText}</pre>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => { setWizardStep('setup'); resetNewDoc(); setGenPhase('idle'); }} style={{ ...s.secondaryBtn }}>Write Another</button>
                  {newDocId && <button onClick={() => { setScanDocId(newDocId); setScanFilename(generatedTitle); setScanDocType(newDocType); setScanNorm(newDocNorm); setMode('scan'); setScanPhase('scanning'); void runScan(newDocId); }} style={s.secondaryBtn}><Search size={13} /> Scan This</button>}
                </div>
              </div>
            )}
          </div>
        </div>
        {showSettings && <SettingsModal aiDraft={aiDraft} setAiDraft={setAiDraft} aiStatus={aiStatus} themeMode={themeMode} toggleTheme={toggleTheme} onSave={saveSettings} onClose={() => setShowSettings(false)} isBusy={isBusy} />}
        {errorMsg && <Toast type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />}
        {noticeMsg && <Toast type="notice" message={noticeMsg} />}
      </div>
    );
  }

  if (mode === 'scan') {
    return (
      <div style={s.shell}>
        <TopBar title={`Scan Document${scanFilename ? ` — ${scanFilename}` : ''}`}
          onBack={() => { setMode('landing'); resetScan(); }}
          action={<div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {newSkillsAvailable && <button onClick={handleSkillSync} disabled={syncingSkills} style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-full)', border: 'none', background: 'hsla(38,95%,58%,0.15)', color: 'var(--score-fair)', cursor: 'pointer' }}>{syncingSkills ? '⏳' : '🔄'} Sync {skillCount}</button>}
            {aiOnline === false && <span style={{ fontSize: '10px', color: 'var(--score-critical)', fontWeight: 600, padding: '3px 10px', background: 'hsla(352,85%,62%,0.1)', borderRadius: 'var(--r-full)' }}>⚠ AI Offline</span>}
            {scanPhase === 'exporting' && (
              <>
                <button onClick={() => handleExportScanned('docx')} style={s.primaryBtnSmall}><Download size={13} /> DOCX</button>
                <button onClick={() => handleExportScanned('pdf')} style={s.secondaryBtn}><Download size={13} /> PDF</button>
              </>
            )}
          </div>}
        />

        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px 24px 64px' }}>
            <input ref={fileInputRef} type="file" accept=".docx,.pdf,.txt,.md" style={{ display: 'none' }} onChange={handleFileChange} />

            {/* UPLOAD PHASE */}
            {scanPhase === 'upload' && (
              <div
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                style={{ ...s.dropZone, borderColor: dragOver ? 'var(--brand-500)' : 'var(--border-default)', background: dragOver ? 'hsla(258,75%,55%,0.05)' : 'var(--bg-raised)' }}>
                <UploadCloud size={48} color={dragOver ? 'var(--brand-400)' : 'var(--text-muted)'} style={{ marginBottom: '16px', transition: 'color var(--t-fast)' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                  {dragOver ? 'Drop your file here' : 'Upload Your Document'}
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px', textAlign: 'center', maxWidth: '400px', lineHeight: 1.6 }}>
                  Drag & drop a .docx, .pdf, or .txt file, or click below. Your document stays on your machine.
                </p>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                  <select value={scanDocType} onChange={(e) => setScanDocType(e.target.value)} style={s.select}>
                    {DOC_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  <select value={scanNorm} onChange={(e) => setScanNorm(e.target.value)} style={s.select}>
                    {NORMS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>Scan speed:</span>
                  {(['fast', 'normal', 'detailed'] as const).map((p) => (
                    <button key={p} onClick={() => setScanPace(p)}
                      style={{
                        fontSize: '11px', fontWeight: scanPace === p ? 700 : 500,
                        padding: '4px 12px', borderRadius: 'var(--r-full)', border: scanPace === p ? '2px solid var(--brand-400)' : '1px solid var(--border-default)',
                        background: scanPace === p ? 'hsla(258,75%,55%,0.1)' : 'transparent',
                        color: scanPace === p ? 'var(--brand-400)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}>
                      {p === 'fast' ? '⚡ Fast' : p === 'normal' ? '🔄 Normal' : '🔬 Detailed'}
                    </button>
                  ))}
                </div>

                <button onClick={() => fileInputRef.current?.click()} style={s.primaryBtn}>
                  <UploadCloud size={16} /> Choose File
                </button>

                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '16px' }}>
                  Accepted formats: .docx, .pdf, .txt, .md — up to 50MB
                </p>
              </div>
            )}

            {/* SCANNING PHASE */}
            {scanPhase === 'scanning' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', textAlign: 'center' }}>
                  <div className="splash-spinner"><div className="splash-ring" /></div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '20px 0 8px' }}>
                    Analyzing {scanFilename || 'document'}...
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                    Running 6-dimension academic integrity scan
                  </p>
                </div>

                {/* Scan progress log */}
                <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)', padding: '16px', maxWidth: '520px', margin: '0 auto', width: '100%' }}>
                  {scanLog.map((entry, i) => (
                    <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '3px 0', fontFamily: 'var(--font-mono)', opacity: i === scanLog.length - 1 ? 1 : 0.6 }}>
                      {entry}
                    </div>
                  ))}
                  {scanLog.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>Starting analysis...</div>}
                </div>

                {/* Live Research API Status Grid */}
                {researchApiStatus.size > 0 && (
                  <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)', padding: '16px', maxWidth: '560px', margin: '0 auto', width: '100%' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      🌐 Live Research API Status
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px' }}>
                      {Array.from(researchApiStatus.values())
                        .sort((a, b) => a.step - b.step)
                        .map((api) => (
                          <div key={api.name} style={{
                            fontSize: '10px', padding: '6px 8px', borderRadius: 'var(--r-sm)',
                            background: api.status === 'checking' ? 'hsla(38,95%,58%,0.08)' :
                                       api.status === 'checked' ? 'hsla(145,75%,55%,0.08)' :
                                       api.status === 'unavailable' ? 'hsla(352,85%,62%,0.06)' :
                                       'hsla(214,20%,50%,0.05)',
                            border: '1px solid ' + (api.status === 'checking' ? 'hsla(38,95%,58%,0.25)' :
                                                      api.status === 'checked' ? 'hsla(145,75%,55%,0.25)' :
                                                      api.status === 'unavailable' ? 'hsla(352,85%,62%,0.15)' :
                                                      'var(--border-subtle)'),
                            display: 'flex', alignItems: 'center', gap: '4px',
                            color: api.status === 'checking' ? 'var(--score-fair)' :
                                   api.status === 'checked' ? 'var(--score-excellent)' :
                                   api.status === 'unavailable' ? 'var(--score-critical)' :
                                   'var(--text-muted)',
                          }}>
                            <span>{api.status === 'checking' ? '⏳' : api.status === 'checked' ? '✅' : api.status === 'unavailable' ? '❌' : '◻️'}</span>
                            <span style={{ fontWeight: 600, flex: 1 }}>{api.name}</span>
                            {api.matchCount > 0 && <span style={{ fontSize: '9px', opacity: 0.7 }}>{api.matchCount}</span>}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RESULTS PHASE */}
            {(scanPhase === 'results' || scanPhase === 'exporting') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Analysis Results
                </h2>

                {/* Scores */}
                {scores && (
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 ' + '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Dimension Scores
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                      {SCAN_DIMENSIONS.map((dim) => {
                        const val = typeof scores[dim.key] === 'number' ? scores[dim.key] as number : null;
                        const color = scoreColor(val);
                        const label = scoreLabel(val);
                        const bg = scoreBg(val);
                        return (
                          <div key={dim.key} style={{ padding: '16px', background: bg, borderRadius: 'var(--r-md)', border: `1px solid ${color}20`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <dim.icon size={15} color={color} />
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{dim.label}</span>
                              </div>
                              <span style={{ fontSize: '10px', fontWeight: 700, color, textTransform: 'uppercase' }}>{label}</span>
                            </div>
                            {/* Bar */}
                            <div style={{ height: '5px', background: 'var(--bg-muted)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${val ?? 0}%`, background: color, borderRadius: '3px', transition: 'width 1.5s ease' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{dim.desc}</span>
                              <span style={{ fontSize: '18px', fontWeight: 800, color }}>{val !== null ? val.toFixed(1) : '—'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Improvement Plan */}
                {improvementPlan.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Improvement Plan
                        </h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                          {approvedIds.length} of {improvementPlan.length} items approved — click items to review
                        </p>
                      </div>
                      <button onClick={handleApproveAll} style={s.linkBtn}>
                        {approvedIds.length === improvementPlan.length ? 'Deselect All' : 'Approve All'}
                      </button>
                    </div>

                    {/* Progress */}
                    <div style={{ height: '4px', background: 'var(--bg-muted)', borderRadius: '2px', marginBottom: '16px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round((approvedIds.length / improvementPlan.length) * 100)}%`, background: 'var(--brand-500)', borderRadius: '2px', transition: 'width var(--t-normal)' }} />
                    </div>

                    {/* Items */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {improvementPlan.map((item) => {
                        const approved = approvedIds.includes(item.id);
                        const expanded = expandedItems.has(item.id);
                        const priorityColor = item.priority === 'high' ? 'var(--score-critical)'
                          : item.priority === 'medium' ? 'var(--score-fair)' : 'var(--score-good)';
                        return (
                          <div key={item.id} style={{ ...s.improvementItem, borderLeftColor: priorityColor, opacity: approved ? 0.5 : 1 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                              {/* Checkbox */}
                              <button onClick={(e) => { e.stopPropagation(); handleToggleApproval(item.id); }}
                                style={{ ...s.checkbox, background: approved ? 'var(--brand-500)' : 'transparent', borderColor: approved ? 'var(--brand-500)' : 'var(--border-default)' }}>
                                {approved && <CheckCircle2 size={13} color="#fff" />}
                              </button>

                              {/* Content */}
                              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => toggleExpandItem(item.id)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {item.title}
                                  </span>
                                  <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 'var(--r-full)', color: priorityColor, background: `${priorityColor}15` }}>
                                    {item.priority}
                                  </span>
                                  {item.page_range && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.page_range}</span>}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '4px' }}>
                                  {item.action}
                                </div>
                                {expanded && item.evidence && (
                                  <div style={{ marginTop: '8px', padding: '10px 12px', background: 'var(--bg-overlay)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Evidence</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6 }}>
                                      "{item.evidence}"
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Expand toggle */}
                              <button onClick={() => toggleExpandItem(item.id)} style={{ ...s.iconBtn, width: '24px', height: '24px', alignSelf: 'flex-start', flexShrink: 0 }}>
                                <ChevronRight size={14} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform var(--t-fast)' }} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Apply button */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'center' }}>
                      <button onClick={handleApplyImprovements} disabled={isBusy} style={s.primaryBtn}>
                        {isBusy ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
                        {isBusy ? 'Applying...' : approvedIds.length > 0 ? `Apply ${approvedIds.length} Improvements with AI` : 'Select Improvements to Apply'}
                      </button>
                    </div>
                  </div>
                )}

                {/* No issues found */}
                {improvementPlan.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <CheckCircle2 size={48} color="var(--score-excellent)" style={{ marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                      Document Looks Strong
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                      No critical improvements needed across all 6 dimensions.
                    </p>
                  </div>
                )}

                {/* Export section after improvements applied */}
                {scanPhase === 'exporting' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Track Changes Diff View */}
                    {rewriteDiff && (rewriteDiff.deletions.length > 0 || rewriteDiff.insertions.length > 0) && (
                      <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-default)', padding: '20px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Sparkles size={16} /> Track Changes Preview
                        </h3>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                          <span style={{ color: 'var(--score-critical)', fontWeight: 600 }}>Red</span> = removed/rephrased &nbsp;|&nbsp;
                          <span style={{ color: 'var(--score-excellent)', fontWeight: 600 }}>Green</span> = new/improved text
                        </p>
                        <div style={{ maxHeight: '400px', overflow: 'auto', padding: '12px', background: 'var(--bg-default)', borderRadius: 'var(--r-md)', fontSize: '12px', lineHeight: 1.8 }}>
                          {rewriteDiff.deletions.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--score-critical)', marginBottom: '4px', textTransform: 'uppercase' }}>Removed / Rephrased:</div>
                              {rewriteDiff.deletions.slice(0, 15).map((s, i) => (
                                <div key={i} style={{ color: 'var(--score-critical)', background: 'hsla(352,85%,62%,0.06)', padding: '4px 8px', marginBottom: '3px', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--score-critical)' }}>
                                  {s}
                                </div>
                              ))}
                              {rewriteDiff.deletions.length > 15 && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>...and {rewriteDiff.deletions.length - 15} more</div>}
                            </div>
                          )}
                          {rewriteDiff.insertions.length > 0 && (
                            <div>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--score-excellent)', marginBottom: '4px', textTransform: 'uppercase' }}>New / Improved:</div>
                              {rewriteDiff.insertions.slice(0, 15).map((s, i) => (
                                <div key={i} style={{ color: 'var(--score-excellent)', background: 'hsla(145,75%,55%,0.06)', padding: '4px 8px', marginBottom: '3px', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--score-excellent)' }}>
                                  {s}
                                </div>
                              ))}
                              {rewriteDiff.insertions.length > 15 && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>...and {rewriteDiff.insertions.length - 15} more</div>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Updated document preview */}
                    {rewritePreview && (
                      <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-default)', padding: '20px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                          <Sparkles size={16} /> Updated Document Preview
                        </h3>
                        <div style={{ maxHeight: '500px', overflow: 'auto', padding: '16px', background: 'var(--bg-default)', borderRadius: 'var(--r-md)', fontSize: '13px', lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                          {rewritePreview}
                        </div>
                      </div>
                    )}

                    <div style={{ textAlign: 'center', padding: '24px', background: 'hsla(145,75%,55%,0.08)', borderRadius: 'var(--r-lg)', border: '1px solid hsla(145,75%,55%,0.2)' }}>
                      <CheckCircle2 size={28} color="var(--score-excellent)" style={{ marginBottom: '8px' }} />
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        Improvements Applied
                      </h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                        Your revised document is ready. Export now or re-analyze to verify.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => handleExportScanned('docx')} style={s.primaryBtn}>
                          <Download size={15} /> Download DOCX
                        </button>
                        <button onClick={() => handleExportScanned('pdf')} style={s.secondaryBtn}>
                          <Download size={15} /> Download PDF
                        </button>
                        <button onClick={() => void handleReAnalyze()} disabled={isBusy} style={{ ...s.secondaryBtn, border: '1px solid var(--brand-400)', color: 'var(--brand-400)' }}>
                          <Search size={15} /> Re-Analyze
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {showSettings && <SettingsModal aiDraft={aiDraft} setAiDraft={setAiDraft} aiStatus={aiStatus} themeMode={themeMode} toggleTheme={toggleTheme} onSave={saveSettings} onClose={() => setShowSettings(false)} isBusy={isBusy} />}
        {errorMsg && <Toast type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />}
        {noticeMsg && <Toast type="notice" message={noticeMsg} />}
      </div>
    );
  }

  return null;
}

// ── Settings Modal ──────────────────────────────────────────

function SettingsModal({
  aiDraft, setAiDraft, aiStatus, themeMode, toggleTheme, onSave, onClose, isBusy,
}: {
  aiDraft: { provider: string; api_keys: Record<string, string>; privacy_mode: string } | null;
  setAiDraft: (d: typeof aiDraft) => void;
  aiStatus: AIStatus | null;
  themeMode: string;
  toggleTheme: () => void;
  onSave: () => void;
  onClose: () => void;
  isBusy: boolean;
}) {
  const providers = aiStatus?.providers ?? [];
  const currentProvider = aiDraft?.provider ?? 'deepseek';
  const privacyModes = aiStatus?.privacy_modes ?? [];

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Settings</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Configure AI provider, theme, and privacy</p>
          </div>
          <button onClick={onClose} style={s.iconBtn}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Theme */}
          <div>
            <label style={s.label}>Appearance</label>
            <button onClick={toggleTheme} style={{ ...s.secondaryBtn, width: '100%', justifyContent: 'center', padding: '12px' }}>
              {themeMode === 'dark' ? '☀️  Switch to Light Mode' : '🌙  Switch to Dark Mode'}
            </button>
          </div>

          {/* AI Provider */}
          <div>
            <label style={s.label}>AI Provider</label>
            <select value={currentProvider} onChange={(e) => setAiDraft({ ...aiDraft, provider: e.target.value, api_keys: aiDraft?.api_keys ?? {}, privacy_mode: aiDraft?.privacy_mode ?? 'cloud_allowed' })} style={s.select}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.mode}){p.configured ? ' ✓' : ''}</option>)}
            </select>
            {currentProvider === 'ollama' && (
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Uses local Ollama models. Make sure Ollama is running. No API key needed.
              </p>
            )}
          </div>

          {/* Privacy */}
          <div>
            <label style={s.label}>Privacy Mode</label>
            <select value={aiDraft?.privacy_mode ?? 'cloud_allowed'} onChange={(e) => setAiDraft({ ...aiDraft, provider: aiDraft?.provider ?? 'deepseek', api_keys: aiDraft?.api_keys ?? {}, privacy_mode: e.target.value })} style={s.select}>
              {privacyModes.map((pm) => <option key={pm.id} value={pm.id}>{pm.label}</option>)}
            </select>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Controls when cloud AI providers can be used. "Local only" restricts to Ollama.
            </p>
          </div>

          {/* API Key */}
          {currentProvider !== 'ollama' && (
            <div>
              <label style={s.label}>{currentProvider.toUpperCase()} API Key</label>
              <input type="password" value={aiDraft?.api_keys?.[currentProvider] ?? ''}
                onChange={(e) => setAiDraft({ ...aiDraft, provider: aiDraft?.provider ?? 'deepseek', api_keys: { ...aiDraft?.api_keys, [currentProvider]: e.target.value }, privacy_mode: aiDraft?.privacy_mode ?? 'cloud_allowed' })}
                placeholder="sk-..." style={s.input} />
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Encrypted with Windows DPAPI. Stored locally — never shared.
              </p>
            </div>
          )}

          {/* Info */}
          <div style={{ padding: '12px', background: 'var(--bg-overlay)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Info size={13} color="var(--text-muted)" />
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>About OTIF</span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              OpenThesis Integrity Fabric v0.1.0 — Local-first academic research intelligence platform.
              All document processing happens on your machine. Cloud AI is optional and only sends
              the specific text you choose to rewrite or generate.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button onClick={onClose} style={s.secondaryBtn}>Cancel</button>
          <button onClick={onSave} disabled={isBusy} style={s.primaryBtn}>
            {isBusy ? <Loader2 size={15} className="spin" /> : null}
            {isBusy ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────

function Toast({ type, message, onClose }: { type: 'error' | 'notice'; message: string; onClose?: () => void }) {
  const bg = type === 'error'
    ? 'hsla(352,85%,62%,0.12)'
    : 'hsla(258,75%,55%,0.9)';
  const border = type === 'error'
    ? '1px solid hsla(352,85%,62%,0.3)'
    : 'none';
  const color = type === 'error' ? 'var(--score-critical)' : '#fff';
  const Icon = type === 'error' ? AlertTriangle : CheckCircle2;

  return (
    <div style={{
      position: 'fixed', zIndex: 9999,
      ...(type === 'notice' ? { top: '12px', left: '50%', transform: 'translateX(-50%)' } : { top: '12px', right: '12px', maxWidth: '450px' }),
      padding: '10px 16px', borderRadius: type === 'notice' ? 'var(--r-full)' : 'var(--r-md)',
      background: bg, border, color,
      fontSize: '12px', fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: '8px',
      boxShadow: 'var(--shadow-lg)',
    }}>
      <Icon size={14} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>{message}</span>
      {onClose && (
        <button onClick={onClose} style={{ background: 'none', border: 'none', color, cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  shell: { display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-subtle)', minHeight: '48px' },
  backBtn: { background: 'none', border: 'none', color: 'var(--brand-400)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--r-sm)' },
  iconBtn: { width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 'var(--r-md)', color: 'var(--text-secondary)', cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', color: 'var(--brand-400)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '4px 8px' },

  card: { padding: '28px', background: 'var(--bg-raised)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-xl)', transition: 'all var(--t-fast)', display: 'flex', flexDirection: 'column' },
  cardTitle: { fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' },
  cardDesc: { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 },

  dropZone: { padding: '48px 24px', border: '2px dashed var(--border-default)', borderRadius: 'var(--r-lg)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all var(--t-fast)', cursor: 'pointer' },

  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 22px', fontSize: '14px', fontWeight: 700, borderRadius: 'var(--r-lg)', border: 'none', background: 'var(--brand-500)', color: '#fff', cursor: 'pointer', transition: 'all var(--t-fast)' },
  primaryBtnGreen: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 22px', fontSize: '14px', fontWeight: 700, borderRadius: 'var(--r-lg)', border: 'none', background: 'var(--accent-green)', color: '#fff', cursor: 'pointer', transition: 'all var(--t-fast)' },
  primaryBtnSmall: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 14px', fontSize: '12px', fontWeight: 700, borderRadius: 'var(--r-md)', border: 'none', background: 'var(--brand-500)', color: '#fff', cursor: 'pointer' },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 14px', fontSize: '12px', fontWeight: 600, borderRadius: 'var(--r-md)', border: '1px solid var(--border-default)', background: 'var(--bg-overlay)', color: 'var(--text-secondary)', cursor: 'pointer' },

  select: { padding: '8px 12px', fontSize: '12px', borderRadius: 'var(--r-md)', background: 'var(--bg-overlay)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' },
  input: { width: '100%', padding: '10px 14px', fontSize: '13px', borderRadius: 'var(--r-md)', background: 'var(--bg-overlay)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-sans)' },
  textarea: { width: '100%', padding: '14px 16px', fontSize: '13px', lineHeight: 1.7, borderRadius: 'var(--r-md)', resize: 'vertical' as const, background: 'var(--bg-overlay)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', outline: 'none' },
  label: { display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },

  improvementItem: { padding: '14px 16px', background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', borderLeft: '3px solid var(--border-default)', transition: 'all var(--t-fast)' },
  checkbox: { width: '22px', height: '22px', borderRadius: '6px', border: '2px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all var(--t-fast)', marginTop: '1px' },

  modalOverlay: { position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsla(225,25%,5%,0.7)', backdropFilter: 'blur(4px)' },
  modalBox: { background: 'var(--bg-raised)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border-default)', padding: '28px', maxWidth: '500px', width: '92%', maxHeight: '85vh', overflow: 'auto' },
};
