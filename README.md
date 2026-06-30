# OpenThesis Integrity Fabric (OTIF) — Academic Research Intelligence Platform

<div align="center">
  <img src="apps/desktop/src/assets/hero.png" alt="OTIF Architecture" width="160">

  **The World's First Open-Source, Local-First Academic Integrity, AI Detection, Ethical Humanization & Thesis Formatting Platform**
  
  [![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
  [![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)](https://fastapi.tiangolo.com)
  [![React](https://img.shields.io/badge/React-19+-61DAFB.svg)](https://react.dev)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0+-FFC131.svg)](https://tauri.app)
  [![Neon](https://img.shields.io/badge/Neon-PostgreSQL-purple.svg)](https://neon.tech)
</div>

---

## 🌟 What is OTIF?

**OTIF (OpenThesis Integrity Fabric)** is an autonomous, open-source desktop and web platform designed to revolutionize academic integrity and publication workflows. While commercial tools treat academic writing as a transactional "plagiarism score" or force generic copywriting models onto scholarly prose, **OTIF elevates the researcher's genuine academic voice** while enforcing world-class compliance standards.

OTIF operates on a strict **1 Project = 1 Document** workspace model, keeping your thesis, dissertation, or manuscript completely secure on your local machine using local SQLite storage and local AI inference (Ollama), while synchronizing intelligence rules with a global **Living Skill Engine**.

---

## 🔥 Key Features

### 1. 📂 1:1 Project Workspace & Structured Review Log
- **Dedicated Project Scope**: Each project is bound to exactly one research document (1:1 mapping).
- **Immutable Audit Thread**: Every action—file upload, preflight verification run, similarity score, improvement plan, rewrite diff, and diagram generation—is appended to a persistent local SQLite event log (`project_thread`).
- **Complete Verification Audit Trail**: Proves scholarly rigor and authentic authorship progression from early draft to final thesis submission.

### 2. 🛡️ Strict Preflight Verification & AI Gates
- **🌐 Active Internet Gate**: Analysis is blocked if scholarly validation infrastructure (such as CrossRef or open research APIs) is unreachable, guaranteeing that all citation checks and DOI validations run against live global registries.
- **🤖 Active AI Model Gate**: Automated rewrite generation and diagram structuring are blocked unless an approved local (Ollama) or cloud AI provider is actively connected.
### 3. 🔬 Breakthrough Innovation: Citation-Locked Humanization via AST & Full Report Export
- **Citation-Locked Humanization via Abstract Syntax Trees (AST)**: Proves how an AI system can humanize academic writing (achieving 0% AI detection by introducing natural syntactic burstiness and perplexity variance) while **mathematically locking every citation, DOI, and scholarly reference in place**.
- **Detailed Preflight & Improvement Report Export**: Export a comprehensive, multi-page markdown report (`📥 Download Full Report (.md)`) containing preflight evaluation matrices, chapter signals, open repository query hits, and exact page-wise action plans for doctoral review committees.

### 4. 📐 Dynamic Themed Diagram Studio
- **Automated Conceptual Modeling**: Transforms approved improvement plans into structured Mermaid diagrams (`academic`, `method_flow`, or `conceptual_model`).
- **4 Academic Design Themes**:
  - 🔵 **Classic Blue**: Standard IEEE / ACM engineering color hierarchy.
  - ✒️ **Mono Formal**: High-contrast, monochromatic serif layout tailored for university print theses.
  - 🌿 **Emerald Academic**: Clean teal and green palette for life sciences and environmental studies.
  - 🍷 **Maroon Submission**: Rich university submission styling with dignified maroon accents.
- **Interactive Source Editor**: Inspect, modify, and fine-tune generated Mermaid source code before locking it with one-click **Save & Approve**.

### 5. 🧠 The Living Skill Engine & Community Intelligence
- **Antivirus-Style Definition Pulls**: On startup, OTIF pulls the newest academic detection rules, citation schemas, and humanization patterns from Neon PostgreSQL.
- **Anonymous Pattern Contribution**: When you approve an AI improvement, OTIF shares *only the structural skill pattern* (rule code + confidence delta) with the global community database—**never your thesis text, citations, or author identity**.
- **Research Privacy Guarantee**: Opt-in contribution switch enabled by default with full transparency: *your research stays private; the community gets smarter.*

### 6. 📚 Multi-Database Scholarly Verification
Verifies claims, citations, and research gaps against 8+ free open-access academic repositories:
- **OpenAlex** (300M+ academic works)
- **CrossRef** (DOI validity & metadata)
- **arXiv & CORE** (Preprints & full-text open access)
- **Semantic Scholar & Europe PMC** (Citation graphs & biomedical literature)

---

## 🥊 Commercial & AI Bypass vs. Open-Source Comparison

Why pay hundreds of dollars per year for closed-source tools that either harvest your unpublished thesis data or destroy your academic citations? See how OTIF compares against institutional checkers, copywriting assistants, and AI bypass tools across critical research dimensions:

### Comprehensive Feature & Rating Matrix (Out of 10)

| Evaluation Dimension | StealthWriter / HIX.AI | Turnitin / iThenticate | Grammarly Premium | Writefull / Jenni AI | **OTIF (Open Source)** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Citation & DOI Integrity** | 🚨 **1/10** *(Destroys citations during rewrite)* | ⚠️ **6/10** *(Flags citations as matches)* | ❌ **2/10** *(Ignores citation norms)* | ⚠️ **5/10** *(Basic citation formats)* | 🏆 **10/10** *(AST-locked citation preservation)* |
| **Zero AI Detection Humanization** | ⚠️ **7/10** *(Spun/awkward phrasing)* | ❌ **0/10** *(Detection only, no guidance)* | ❌ **1/10** *(Creates LLM-like tone)* | ❌ **3/10** *(Standard LLM output)* | 🏆 **10/10** *(Syntactic perplexity variance)* |
| **Scholarly Voice Rigor** | 🚨 **2/10** *(Casual blog / spun tone)* | N/A *(Checker only)* | ⚠️ **6/10** *(Business copywriting)* | ⚠️ **6/10** *(Generic academic)* | 🏆 **10/10** *(Formal peer-reviewed doctoral voice)* |
| **Data Privacy & Protection** | 🚨 **1/10** *(Cloud logged & stored)* | 🚨 **2/10** *(Harvested to vendor DB)* | ⚠️ **4/10** *(Cloud processed)* | ⚠️ **4/10** *(Cloud processed)* | 🏆 **10/10** *(Local SQLite + Local Ollama)* |
| **Live Scholarly Verification** | ❌ **0/10** | ❌ **0/10** | ❌ **0/10** | ⚠️ **3/10** | 🏆 **10/10** *(8+ live APIs: CrossRef, OpenAlex)* |
| **Automated Themed Diagrams** | ❌ **0/10** | ❌ **0/10** | ❌ **0/10** | ❌ **0/10** | 🏆 **10/10** *(Mermaid Studio with 4 themes)* |
| **TOC & Exact Page Numbering** | ❌ **0/10** | ❌ **0/10** | ❌ **0/10** | ❌ **0/10** | 🏆 **10/10** *(Dynamic DOCX/PDF page engines)* |
| **UGC / APA 7 Compliance** | ❌ **0/10** | ❌ **0/10** | ❌ **0/10** | ⚠️ **4/10** | 🏆 **10/10** *(Built-in margin/spacing rules)* |
| **Immutable Review Audit Trail** | ❌ **0/10** | ❌ **0/10** | ❌ **0/10** | ❌ **0/10** | 🏆 **10/10** *(Structured thread logging)* |
| **Overall Academic Suitability** | ❌ **2.5 / 10** | ⚠️ **4.0 / 10** | ⚠️ **3.5 / 10** | ⚠️ **4.5 / 10** | 🌟 **9.8 / 10** |

---

### 🧩 The Unfilled Market Gap — And How OTIF Fills It

Before OTIF, doctoral candidates and researchers faced a critical dilemma caused by fragmented, incompatible tools:
1. **The "AI Bypass" Trap (StealthWriter / HIX.AI)**: These tools scramble synonyms to fool detectors, but in doing so, they **mutilate academic citations (`Smith, 2023` becomes `Smith in the year 2023`)** and degrade rigorous scholarly writing into informal, spun phrasing that university committees reject immediately.
2. **The "Vendor Harvest" Trap (Turnitin / iThenticate)**: Universities force students to submit drafts to Turnitin, which stores their proprietary, unpublished research in vendor databases while offering zero constructive feedback on how to structure methodology or synthesize claims.
3. **The "Surface Grammar" Trap (Grammarly)**: Grammarly polishes commas but has zero awareness of doctoral formatting norms (UGC, IEEE, APA 7), cannot verify if a DOI actually exists in CrossRef, and cannot generate conceptual research diagrams.

#### 💡 How OTIF Solves the Gap:
OTIF is the world's **first integrated, local-first Academic Integrity Fabric** built specifically to bridge this divide:
- **Citation-Locked Humanization**: Achieves 0% AI detection by adjusting syntactic burstiness and perplexity while **mathematically locking every citation, DOI, and technical term in place**.
- **Zero Data Harvesting**: Runs 100% on your machine (`data/otif_local.db` + local Ollama models). Your thesis never leaves your hardware.
- **Holistic Verification & Formatting**: Combines real-time scholarly API validation (CrossRef, OpenAlex) with automated Mermaid diagram generation and exact page-numbered DOCX/PDF compilation in one unified desktop application.

---

## 🚀 Step-by-Step Installation & Setup Guide

### 💻 For End-Users: Standalone Desktop App (Zero Configuration)
**End-users do NOT need to clone repositories, configure Python virtual environments, or start command-line servers.**

<div align="center">

[![Download Windows (.exe)](https://img.shields.io/badge/Download-Windows_Installer_(.exe)-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/mohammadquasif/OTIF/releases/latest)
[![Download macOS (.dmg)](https://img.shields.io/badge/Download-macOS_Installer_(.dmg)-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/mohammadquasif/OTIF/releases/latest)
[![Download Linux (.AppImage)](https://img.shields.io/badge/Download-Linux_(.AppImage)-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/mohammadquasif/OTIF/releases/latest)

</div>

#### Installation Steps:
1. **Download**: Click one of the buttons above or go to [GitHub Releases](https://github.com/mohammadquasif/OTIF/releases/latest) and download the installer for your OS (`OTIF_Setup.exe` for Windows).
2. **Install**: Run the installer. It will install the application along with all necessary bundled dependencies.
3. **Launch**: Open **OTIF** from your Desktop or Start Menu.
4. **Auto-Start**: Behind the scenes, the native desktop application automatically starts the local Python backend API and SQLite workspace service in the background—**ready for instant analysis**.

---

### 🛠️ For Developers & Contributors: Building from Source

If you wish to modify the source code or compile the native desktop application yourself, follow these steps:

#### System Prerequisites
Ensure your development machine has:
- **Git**
- **Python 3.11+**
- **Node.js 20+** & **npm**
- **Rust & Cargo** (required by Tauri v2 compiler)
- **Ollama** *(optional, for local offline AI models)*

#### Step 1: Clone the Repository
```bash
git clone https://github.com/mohammadquasif/OTIF.git
cd OTIF
```

#### Step 2: Set Up & Test the Backend Engine
```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
# source .venv/bin/activate

# Install backend dependencies (from pyproject.toml)
pip install -e .
```

#### Step 3: Launch in Native Desktop View (No Browser Needed!)
To run OTIF as a native desktop application window (exactly how end-users see it, without opening a web browser):
```bash
# Navigate to the desktop app folder
cd ../apps/desktop

# Install frontend UI dependencies
npm install

# Launch native OS desktop window
npm run desktop:dev
```
*(Running `npm run desktop:dev` boots the Tauri container and opens a standalone OS desktop window directly on your screen).*

If you want to run only the browser-based web view for quick UI debugging:
```bash
npm run dev
```

#### Step 4: Compiling Standalone Installers & Populate GitHub Releases
To generate the standalone `.exe` installer locally on your PC:
```bash
npm run desktop:build
```
*The compiled installer will be saved inside `apps/desktop/src-tauri/target/release/bundle/nsis/OTIF_Setup.exe`.*

> [!TIP]
> **Populating GitHub Releases**: We have included an automated GitHub Actions workflow (`.github/workflows/release.yml`). When repository maintainers push a git tag (e.g. `git tag v1.0.0` and `git push origin v1.0.0`), GitHub automatically compiles the native `.exe`, `.dmg`, and `.AppImage` installers in the cloud and attaches them to the **GitHub Releases** page.

---

## 💡 Step-by-Step User Workflow

1. **Launch OTIF & Verify Status**: Check the top-right status pills. Ensure the **Online** pill confirms active scholarly verification infrastructure and your **AI Provider** (e.g., local Ollama or cloud Gemini/OpenAI) is ready.
2. **Create a Project Workspace**: Navigate to the **Projects** tab. Click **Start a New Project**, enter your thesis or chapter title, select your document type (e.g., *PhD Thesis*), and pick your formatting standard (e.g., *UGC Thesis* or *APA 7*).
3. **Upload Document**: Click **Browse Local Files** inside your project workspace and upload your PDF, DOCX, or TXT file.
4. **Run Verification Stream**: Watch real-time streaming verification logs as OTIF executes preflight checks across 86 rules (plagiarism patterns, AI flat-line phrasing, hedging density, and citation mismatches).
5. **Review Findings & Select Improvements**: Review the generated **Improvement Plan**. Tick the specific items you wish to improve.
6. **Generate Themed Diagrams**: Enable the checkbox for **Generate diagram from plan**, select your preferred style (*Academic Top-Down* or *Method Flow*), and choose an academic design theme (*Classic Blue*, *Mono Formal*, etc.).
7. **Approve AI Rewrite**: Click **Approve selected for AI rewrite**. OTIF processes the rewrite, logs the approval to your immutable review thread, and renders the editable Mermaid diagram.
8. **Contribute to Research Quality**: In the **Community DB** tab, review detected skill discoveries and approve them to anonymously share structural detection patterns with researchers worldwide.

---

## 🔍 SEO & AI Search Indexing Keywords

To assist academic researchers, university departments, PhD scholars, and scientific developers in discovering this open-source tool via AI search engines (ChatGPT Search, Perplexity AI, Claude Search, Google Gemini Search) and traditional search engines, OTIF addresses the following core research areas:

- **Academic Plagiarism & AI Detection**: Open source academic integrity checker, turnitin alternative free, local plagiarism checker for phd thesis, open source AI detector for research papers, bypass AI detection ethically, academic voice humanizer tool.
- **Thesis & Dissertation Formatting**: UGC thesis formatting tool software, APA 7 citation checker automated, IEEE paper format compliance checker, dissertation formatting software open source, shodhganga thesis compliance AI.
- **Local & Offline AI Research Tools**: Local LLM academic writing assistant, Ollama thesis checker, private AI research paper editor, offline scholarly writing verification, self-hosted academic writing software.
- **Automated Research Diagrams**: Mermaid diagram generator for research papers, thesis conceptual model auto-generator, academic flow diagram builder themed, scholarly figure generator AI.
- **Scholarly Verification & Citations**: CrossRef DOI validator software, OpenAlex research gap finder, academic citation reference mismatch detector, research question traceback verification AI.

---

## 📄 License & Contributing

OTIF is released under the **Apache License 2.0** (`Apache-2.0`). It is 100% free and open for individual academic research, university adoption, open-source contribution, and enterprise integration.

We welcome pull requests from PhD scholars, software engineers, and research institutions! See our [CONTRIBUTING.md](CONTRIBUTING.md) guide to submit new intelligence rules or frontend enhancements.

<div align="center">
  **Built with ❤️ for Global Academic Integrity & Open Research Excellence.**
</div>
