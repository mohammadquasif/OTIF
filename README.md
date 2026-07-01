# OpenThesis Integrity Fabric (OTIF)
### Academic Research Intelligence Platform — Local-First, Privacy-Preserving, Integrity-Driven

<div align="center">
  <img src="apps/desktop/src/assets/hero.png" alt="OTIF" width="140">

  [![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
  [![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)](https://fastapi.tiangolo.com)
  [![React](https://img.shields.io/badge/React-19+-61DAFB.svg)](https://react.dev)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0+-FFC131.svg)](https://tauri.app)
  [![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-blue.svg)](#installation)
  [![Neon](https://img.shields.io/badge/Neon-PostgreSQL-purple.svg)](https://neon.tech)
</div>

---

## What is OTIF?

**OTIF (OpenThesis Integrity Fabric)** is an open-source, desktop-first academic research integrity platform that helps doctoral candidates, post-graduate researchers, and academics:

- **Detect AI-written patterns** in their own manuscripts before submission
- **Assess and reduce plagiarism risk** through real-time structural analysis
- **Strengthen originality** by scoring literature gap, artefact contribution, and methodological boundaries
- **Preserve citations byte-identically** during any revision workflow
- **Export publication-ready DOCX/PDF** with chapter-level editing and themed academic formatting
- **Generate formal CRediT AI Disclosure Statements** for peer-reviewed journal submission compliance

OTIF is built on a strict **1 Project = 1 Document** model. Your unpublished thesis stays on your local machine.

---

## Installation (Windows Desktop)

> **Platform:** Windows standalone installer is available today. macOS and Linux CI builds are configured, pending testing.

### Download the Installer (Recommended)

1. Go to **[Releases](https://github.com/mohammadquasif/OTIF/releases)**
2. Download `OTIF_Setup_x64.exe`
3. Run the installer — OTIF opens as a native desktop window, no browser required
4. Launch Ollama locally for AI revision, or configure a cloud key in Settings

### Run from Source

```bash
git clone https://github.com/mohammadquasif/OTIF.git
cd OTIF

# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Desktop
cd ../apps/desktop
npm install
npm run desktop:dev
```

---

## What is Currently Built

### Backend Engine

| Module | Status |
|:---|:---:|
| Document Ingestion (.docx, .pdf, .txt) | DONE |
| 86-Rule Skill Engine (Neon sync) | DONE |
| Preflight Scoring Pipeline (6 dimensions) | DONE |
| 5-Dimension Originality Evidence Matrix | DONE |
| Chapter Detection and Independent Scoring | DONE |
| Research Question Traceback (RQ Score) | DONE |
| Epistemic Hedging Density Analysis | DONE |
| Citation Metrics (DOI, coverage, quality) | DONE |
| Near-Duplicate Paragraph Detection | DONE |
| Burstiness and Voice Analysis | DONE |
| Deterministic Citation Locking | DONE |
| Multi-Source Research Verification (6 APIs) | DONE |
| Prioritized Improvement Plan Generator | DONE |
| Integrity-Preserving Revision (Ollama + Cloud) | DONE |
| Chapter-Level Approved Rewriting | DONE |
| Mermaid Diagram Studio | DONE |
| DOCX Export with 4 Academic Themes | DONE |
| PDF Export | DONE |
| CRediT AI Disclosure Statement Generator | DONE |
| Immutable Audit Thread (SQLite) | DONE |
| Academic Integrity Certificate | DONE |

### Desktop App (Windows)

| Feature | Status |
|:---|:---:|
| Native Windows Desktop (.exe installer) | DONE |
| Real-time streaming analysis (SSE) | DONE |
| Chapter-by-chapter score breakdown | DONE |
| Research connector API hits panel | DONE |
| Active Ethical Boundaries panel | DONE |
| Improvement Plan with per-item approval | DONE |
| Download Full Report (.md) | DONE |
| Download CRediT Statement (.md) | DONE |
| Diagram Studio + 4 academic themes | DONE |
| Living Skill Engine (sync + last-sync time) | DONE |
| AI provider settings (Ollama/OpenAI/DeepSeek/Gemini) | DONE |
| Privacy mode controls | DONE |
| macOS / Linux installers | IN PROGRESS |

---

## How the Advanced Report Works

### Preflight Score Dashboard — 6 Dimensions

| Dimension | What It Measures | Direction |
|:---|:---|:---|
| Plagiarism Risk | Near-duplicate pairs + citation gaps + quote density | Lower = Better |
| Originality Score | Evidence Matrix (60%) + heuristic blend (40%) | Higher = Better |
| Citation Quality | Coverage, DOI presence, reference section, format | Higher = Better |
| Humanization Score | Burstiness, researcher voice, passive ratio, template openers | Higher = Better |
| AI Writing Risk | Template openers + low burstiness + banned phrase density | Lower = Better |
| Structure Signal | Word depth, vocabulary uniqueness, chapter boundaries | Higher = Better |

### Originality Evidence Matrix — 5 Dimensions (0-100)

Each dimension scored 0, 10, or 20:

1. **Literature Gap** — Explicit gap language backed by 5+ citations
2. **Applied Integration** — Established theoretical models (TOGAF, TAM, UTAUT, etc.)
3. **Artefact Contribution** — Named framework/model components
4. **Methodological Boundary** — Stated limitations, scope exclusions
5. **Practical Implication** — Actionable practitioner recommendations

### Research Quality Checks

- **RQ Traceback Score** — Auto-detects Research Questions and checks if each is answered in findings/discussion
- **Hedging Density** — Flags over-assertive (< 4/1000 words) and excessive (> 20/1000 words) hedge language

### Chapter-Wise Page-Level Audit

- Independently scores up to 12 chapters
- Each chapter: AI risk, originality, citation signal, structure signal
- Generates page-range-specific improvement items (e.g., Revise pages 45-67 for citation support)

### Live Research Connector Evidence

Queries 6 open academic repositories concurrently:
- arXiv, CrossRef, Europe PMC, Zenodo, Semantic Scholar, OpenAlex
- Returns matching papers with titles, years, URLs
- Flags possible similarity risk matches for manual review

### Prioritized Improvement Plan

Every weakness automatically generates an action item with:
- Priority (high / medium)
- Exact action describing what to change
- Evidence showing the specific score that triggered it
- Page range for chapter-level items
- AI requirement flag

The plan drives Integrity-Preserving Revision:
1. Select items to address and approve
2. OTIF locks all citations as immutable placeholder tokens
3. AI revises only the approved scope
4. Citations restored byte-identically from the lock map
5. Revision preview shown; author retains full editorial control

---

## How OTIF Differs From Competitors

| Capability | Turnitin | Grammarly | StealthWriter / AI Humanizer | OTIF |
|:---|:---:|:---:|:---:|:---:|
| Plagiarism detection | vs. vendor DB | No | No | Local + 6 open APIs |
| AI writing detection | Flag only | No | No | Risk score + analysis |
| Constructive improvement plan | No | Grammar only | No | Prioritized, evidence-based |
| Citation preservation | N/A | No | Destroys citations | Byte-identical locking |
| Originality evidence matrix | No | No | No | 5-dimension scored |
| Research question traceback | No | No | No | Auto-detected |
| Live scholarly API verification | No | No | No | CrossRef, OpenAlex, arXiv+ |
| Thesis text stays local | No — uploaded | No — cloud | No — cloud logged | 100% local |
| DOCX/PDF export with themes | No | No | No | 4 academic themes |
| CRediT AI disclosure statement | No | No | No | Auto-generated |
| Immutable revision audit trail | No | No | No | Local SQLite |
| Diagram generation | No | No | No | Mermaid Studio |
| Format compliance (APA/UGC/IEEE) | Partial | Basic | No | 7 formats |

### Key Differentiators

**vs. Turnitin:** Turnitin stores your unpublished thesis permanently in their vendor database and provides no constructive guidance. OTIF gives you an improvement plan, keeps your text local, and never submits to any external repository.

**vs. Grammarly:** Grammarly polishes grammar and copywriting. It has no awareness of doctoral formatting norms, cannot verify DOIs against CrossRef, cannot detect AI patterns in academic prose, and cannot generate research diagrams.

**vs. StealthWriter / AI Humanizer tools:** These tools rewrite to evade AI detectors and routinely corrupt academic citations. OTIF explicitly refuses to bypass detectors. It improves authentic scholarly voice with all citations locked in place.

---

## Ethical Boundaries

1. **No Data Fabrication** — OTIF never generates empirical findings, statistics, or synthetic citations
2. **No Evasion Tooling** — OTIF will not generate text designed to defeat specific detectors
3. **Deterministic Citation Locking** — Every DOI and reference is byte-locked before any AI revision
4. **Approval-Gated Revision** — No changes applied without explicit per-item user selection
5. **Immutable Audit Log** — All events timestamped and stored locally
6. **CRediT Compliance** — Every revision logged for transparent journal AI disclosure

---

## Known Gaps

| Gap | Notes |
|:---|:---|
| No external corpus comparison | Plagiarism risk is local; no full-internet similarity database like Turnitin |
| AI detection is risk-signal only | Structural risk indicator, not a certified detection output |
| macOS / Linux installers | CI configured, pending end-to-end testing |
| PDF generation | Requires LibreOffice or LaTeX; falls back to DOCX only if absent |
| No web/SaaS mode | Desktop-only today |

---

## Skill Engine

8 skill packs synchronized from Neon PostgreSQL on startup:

| Pack | Focus |
|:---|:---|
| 01_plagiarism_check | Banned phrases, near-duplicate signals |
| 02_humanization | Researcher voice markers, authenticity patterns |
| 03_reduce_ai_writing | AI writing signatures, template opener detection |
| 04_writing_improvement | Clarity, transition, vocabulary |
| 05_design_formatting | TOC, headings, figure/table captions |
| 06_research_quality | RQ alignment, hedging, contribution clarity |
| 07_citation | Citation schema, DOI format, completeness |
| 08_design_rewrite | Chapter diagram and structure revision |

---

## Academic Format Compliance

APA 7, UGC (India), IEEE, Harvard, Springer, Elsevier, European Thesis

---

## License

Apache-2.0. See [LICENSE](LICENSE).

---

*OTIF is a local-first research integrity assistant. It is not a plagiarism detection service, and it is not an AI writing evasion tool. It is designed to help researchers improve the quality, clarity, and integrity of their scholarly work.*
