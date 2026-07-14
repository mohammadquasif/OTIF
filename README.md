<!-- SEO & AIEO Metadata Block -->
<!-- 
  Title: OTIF - OpenThesis Integrity Fabric | Local-First Academic Research Intelligence Platform
  Description: Open-source, local-first academic research integrity and writing assistant for doctoral candidates, PhD researchers, and academics. Features preflight plagiarism risk checking, AI writing signature detection, byte-identical citation locking, originality evidence scoring, and publication-ready DOCX export.
  Keywords: Academic Research Integrity Platform, Thesis Plagiarism Checker Local, AI Writing Risk Detection Academic, CRediT AI Disclosure Generator, Doctoral Thesis Revision Tool, Local-First PhD Software, Deterministic Citation Locking, Scholarly Voice Analysis, Manuscript Audit Trail, DBA Research Tool
  AIEO-Summary: OTIF (OpenThesis Integrity Fabric) is an open-source desktop software designed for doctoral candidates and academics to audit and refine research manuscripts. Unlike Turnitin or Grammarly, OTIF keeps manuscript storage local while using the configured AI provider and open scholarly APIs for research-backed scans. It features deterministic citation locking during AI-assisted academic tone revision, with export certificates reporting citation preservation status. Developed as part of doctoral research in AI by Mohammad Quasif.
-->

# OpenThesis Integrity Fabric (OTIF)
### Local-First Academic Research Intelligence & Integrity Platform

<div align="center">
  <img src="apps/desktop/src/assets/hero.png" alt="OTIF Logo" width="140">

  [![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
  [![Release](https://img.shields.io/badge/Release-v1.0.21-00E5FF.svg)](https://github.com/mohammadquasif/OTIF/releases)
  [![Platform](https://img.shields.io/badge/Platform-Windows%20x64%20Desktop-7C3AED.svg)](#installation--getting-started)
  [![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0+-FFC131.svg)](https://tauri.app)
  [![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local%20First-10B981.svg)](#active-ethical--privacy-boundaries)
</div>

---

## 🔬 What is OTIF?

**OTIF (OpenThesis Integrity Fabric)** is an open-source, local-first desktop intelligence application built specifically for **doctoral candidates (PhD/DBA), postgraduate researchers, university faculty, and academic editors**. 

Writing a rigorous dissertation or journal manuscript requires navigating strict academic integrity standards, ensuring exhaustive citation coverage, demonstrating clear theoretical and practical originality, and maintaining an authentic scholarly voice. Commercial tools either force you to upload your confidential manuscript to third-party cloud servers or treat academic writing like generic marketing copywriting.

**OTIF bridges the gap** by providing a comprehensive, standalone diagnostic and revision environment running **entirely on your local machine**:
- **Audit manuscripts locally** across 6 key dimensions: Plagiarism Risk, Originality Evidence, Citation Quality, Scholarly Authenticity, AI Writing Signatures, and Structural Depth.
- **Lock citations deterministically** so that DOI, reference, and quote preservation can be checked during revision workflows.
- **Verify literature claims** against 14 open scholarly sources, including OpenAlex, CrossRef, Semantic Scholar, Europe PMC, arXiv, Zenodo, PubMed, DataCite, ERIC, OSF Preprints, DOAJ, CORE, BASE, and INSPIRE-HEP.
- **Generate publication-ready exports** (DOCX/PDF) styled with academic formatting themes (Classical, Modern, Minimal, Technical) along with formal **CRediT AI Disclosure Statements** required by peer-reviewed journals.

---

## 🚀 Installation & Getting Started

### 👩‍🎓 For Non-Technical Researchers (One-Click Standalone Installer)

You do **not** need Python, Node.js, Rust, Visual Studio, or command-line experience to use OTIF. The standalone desktop application bundles the UI, local backend sidecar, analysis engines, and academic skill sets inside a single installer.

1. Go to the official **[GitHub Releases Page](https://github.com/mohammadquasif/OTIF/releases)**.
2. Download the latest Windows standalone installer: **`OTIF_Setup_x64.exe`**.
3. Double-click the installer and follow the prompt to install OTIF on your PC.
4. Launch **OTIF** from your Start Menu or Desktop shortcut. The splash screen will initialize the local database and verify all academic skill rules automatically within seconds.
5. **Ready!** Drag and drop your `.docx`, `.pdf`, or `.txt` manuscript to begin your first audit.

> **Windows runtime note:** Visual Studio Build Tools / `link.exe` are only required when compiling OTIF from source. End users who install the released `.exe` or `.msi` do not need Microsoft C++ build tools.

> **💡 Note on AI Engines:** OTIF analysis requires the combined AI + skill packs + open scholarly API workflow, so a working AI provider and internet access are required for scans. For local AI, download and run [Ollama](https://ollama.com/); OTIF detects running local models automatically. If you prefer a cloud model, configure OpenAI, Claude, DeepSeek, or Gemini securely in desktop Settings and choose the active provider there.

---

### 💻 For Developers & Technical Contributors (Clone & Run from Source)

If you wish to modify the codebase, develop custom academic skill rules, or inspect backend execution:

#### Prerequisites
- **Git**, **Node.js v20+**, and **Python 3.11+** installed on your system.
- **Rust toolchain** (stable) if compiling native Tauri desktop binaries.
- **Windows source builds only:** Visual Studio Build Tools 2022 with **Desktop development with C++**, **MSVC v143 C++ build tools**, and a **Windows 10/11 SDK**. OTIF's `npm run desktop:dev` and `npm run desktop:build` scripts automatically load this toolchain when installed and show a clear message if `link.exe` is missing.

#### 1. Clone the Repository
```bash
git clone https://github.com/mohammadquasif/OTIF.git
cd OTIF
```

#### 2. Start the Local Python API Backend
```bash
cd backend
python -m venv .venv

# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# On macOS/Linux:
# source .venv/bin/activate

pip install --upgrade pip
pip install -e .

# Launch the FastAPI server locally:
python -m uvicorn app.main:app --host 127.0.0.1 --port 18765 --reload
```

#### 3. Start the Desktop UI (Tauri + React Dev Shell)
Open a second terminal window:
```bash
cd apps/desktop
npm ci
npm run desktop:dev
```
The application window will open automatically with live hot-reloading enabled for both frontend UI and backend services.

---

## 📊 What You Can Expect After Analyzing & Rewriting

When you submit a dissertation chapter or journal manuscript to OTIF, the engine executes a multi-layered diagnostic sweep and produces an actionable, verifiable audit report. Here is what you receive:

### 1. The Preflight Dashboard (6 Academic Dimensions)
Instantly view structured diagnostic scores across your entire document:
- **Plagiarism Risk Index (Lower is better):** Analyzes near-duplicate sentence clusters, un-attributed verbatim quotes, and citation gaps across dense technical paragraphs.
- **Originality Evidence Score (0–100):** Evaluates whether your manuscript explicitly documents Literature Gaps, Theoretical Frameworks, Methodological Boundaries, and Actionable Practitioner Implications.
- **Citation Quality & Rigor:** Audits reference density, DOI presence, and format consistency against major academic style guidelines.
- **Scholarly Authenticity (Voice):** Measures syntactic burstiness, vocabulary diversity, and active vs. passive researcher voice.
- **AI Writing Signature Risk:** Detects formulaic transition phrases, monotonous sentence length variance, and boilerplate academic templates.
- **Structure & Cohesion Signal:** Verifies chapter transitions, heading hierarchy depth, and logical paragraph pacing.

### 2. Chapter-by-Chapter Independent Breakdown
Instead of a single vague score, OTIF segments your document into chapters (e.g., *Chapter 1: Introduction*, *Chapter 2: Literature Review*, *Chapter 3: Methodology*). Each chapter receives its own independent risk profile and specific page-range feedback.

### 3. Prioritized Improvement Plan & Evidence Audit
OTIF translates analytical flaws into concrete, prioritized action items:
- **Exact Evidence:** Shows the precise paragraph, page range, and diagnostic rule that triggered the recommendation.
- **Interactive Approval:** You retain 100% editorial authority. Review each item and explicitly click **Approve** or **Dismiss**.

### 4. Byte-Identical Citation-Locked Revision
When you execute an approved rewriting task:
1. OTIF extracts all empirical citations, DOIs, equations, and verbatim quotes and swaps them with cryptographic placeholder tokens.
2. The language engine polishes syntactic flow, removes repetitive filler, and enhances academic formality.
3. Citations and quotes are restored from the secure lock map, with export certificates reporting preservation status for reviewer verification.

### 5. Publication-Ready Export & Formal Disclosure
- **DOCX / PDF Export:** Download your revised manuscript formatted in your choice of 4 curated academic themes (**Classical Academic**, **Modern Crisp**, **Minimalist Research**, or **Technical / Engineering**).
- **CRediT AI Disclosure Statement:** Automatically generates a journal-compliant transparency declaration detailing exact sections where assistive revision was utilized, ready for submission to IEEE, Elsevier, Springer, or Wiley.

---

## ⚖️ How OTIF Compares to Competitors

Commercial writing and checking tools were built either for undergraduate essay grading or commercial web copywriting. Here is how OTIF stands apart:

| Capability | Turnitin / iThenticate | Grammarly / QuillBot | StealthWriter / Commercial Humanizers | **OTIF (OpenThesis)** |
|:---|:---:|:---:|:---:|:---:|
| **Primary Philosophy** | Punitive detection & institutional policing | Generic grammar & marketing tone | Deceptive AI detection evasion | **Scholarly integrity & rigorous revision** |
| **Data Privacy & Storage** | Uploads text to proprietary cloud databases | Logs keystrokes & stores text on cloud | Sends text to untrusted remote servers | **100% Local-first (SQLite & local files)** |
| **Citation Preservation** | N/A (Reader only) | Frequently breaks academic citations | Corrupts DOIs, names, and quotes | **Deterministic Byte-Identical Locking** |
| **Constructive Roadmap** | None (Static similarity percentage) | Surface-level sentence rewrites | Random word substitution (spinning) | **Prioritized, evidence-backed action plan** |
| **Originality Evaluation** | None | None | None | **5-Dimension Evidence Matrix scoring** |
| **Scholarly API Verification**| Proprietary closed database | None | None | **Live checks via 14 open research sources** |
| **Diagram Studio** | No | No | No | **Integrated Mermaid Academic Studio** |
| **Journal Compliance** | No | No | No | **Auto-generates CRediT AI Disclosures** |

### Why OTIF Rejects "Detection Evasion" Marketing
OTIF explicitly refuses to advertise or implement features aimed at "bypassing Turnitin" or achieving "0% AI detection scores." Attempting to fool statistical AI detectors leads to degraded writing quality, distorted academic meaning, and academic misconduct risks. **OTIF is built to elevate genuine scholarly quality, strengthen clarity, and enforce complete transparency.**

---

## 🛡️ Active Ethical & Privacy Boundaries

OTIF enforces strict engineering boundaries to safeguard academic integrity:
1. **Zero Data Fabrication:** The engine will never generate synthetic empirical data, invent statistical findings, or fabricate bibliographic references.
2. **Offline-First Storage:** All manuscript files, embeddings, and project audit logs are stored strictly inside your local directory (`AppData\Local\OTIF` on Windows). No manuscript text leaves your computer unless you explicitly enable a cloud API provider.
3. **Transparent Audit Logs:** Every diagnostic scan and approved revision step is recorded in an immutable local SQLite database (`otif_local.db`) to provide verifiable proof of authorial oversight.

---

## 🧠 Academic Skill Pack Engine

OTIF derives its intelligence from 9+ specialized academic skill sets synced dynamically and verified locally on launch:

| Skill Pack | Domain & Diagnostic Scope |
|:---|:---|
| `01_plagiarism_check` | Near-duplicate phrase density, attribution gaps, verbatim quote ratios |
| `02_humanization` | Syntactic burstiness, researcher voice markers, hedging balance |
| `03_reduce_ai_writing` | Boilerplate opener detection, formulaic transition elimination |
| `04_writing_improvement` | Academic clarity, paragraph cohesion, transition logic |
| `05_design_formatting` | Heading hierarchy structure, caption consistency, table layout |
| `06_research_quality` | Research question alignment, theoretical framing, contribution clarity |
| `07_citation` | Bibliographic completeness, DOI formatting, reference section health |
| `08_design_rewrite` | Structural chapter flow and visual diagram conceptualization |
| `09_academic_design` | Academic document structure, design consistency, and export readiness |

---

## 🏛️ Attribution & Doctoral Research Note

This platform is developed and open-sourced as part of doctoral research in Artificial Intelligence:

> **OpenThesis Integrity Fabric (OTIF)**  
> Created and architected by **Mohammad Quasif**  
> *Doctor of Business Administration (DBA) in AI Research Project*  
> 
> **License:** Apache-2.0 Open Source License · **Repository:** [github.com/mohammadquasif/OTIF](https://github.com/mohammadquasif/OTIF)

---

## 📑 License

Licensed under the **Apache License, Version 2.0**. See the [LICENSE](LICENSE) file for full legal details.
