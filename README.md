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
- **Preflight Scoring Matrix**: Scored across 86 intelligence rules spanning **Plagiarism**, **AI Writing Detection**, **Authentic Humanization**, **Scholarly Citations**, **Formatting Norms**, and **Research Quality (5-Dimension Matrix)**.

### 3. 📐 Dynamic Themed Diagram Studio
- **Automated Conceptual Modeling**: Transforms approved improvement plans into structured Mermaid diagrams (`academic`, `method_flow`, or `conceptual_model`).
- **4 Academic Design Themes**:
  - 🔵 **Classic Blue**: Standard IEEE / ACM engineering color hierarchy.
  - ✒️ **Mono Formal**: High-contrast, monochromatic serif layout tailored for university print theses.
  - 🌿 **Emerald Academic**: Clean teal and green palette for life sciences and environmental studies.
  - 🍷 **Maroon Submission**: Rich university submission styling with dignified maroon accents.
- **Interactive Source Editor**: Inspect, modify, and fine-tune generated Mermaid source code before locking it with one-click **Save & Approve**.

### 4. 🧠 The Living Skill Engine & Community Intelligence
- **Antivirus-Style Definition Pulls**: On startup, OTIF pulls the newest academic detection rules, citation schemas, and humanization patterns from Neon PostgreSQL.
- **Anonymous Pattern Contribution**: When you approve an AI improvement, OTIF shares *only the structural skill pattern* (rule code + confidence delta) with the global community database—**never your thesis text, citations, or author identity**.
- **Research Privacy Guarantee**: Opt-in contribution switch enabled by default with full transparency: *your research stays private; the community gets smarter.*

### 5. 📚 Multi-Database Scholarly Verification
Verifies claims, citations, and research gaps against 8+ free open-access academic repositories:
- **OpenAlex** (300M+ academic works)
- **CrossRef** (DOI validity & metadata)
- **arXiv & CORE** (Preprints & full-text open access)
- **Semantic Scholar & Europe PMC** (Citation graphs & biomedical literature)

---

## 🥊 Commercial vs. Open-Source Comparison

Why pay hundreds of dollars per year for closed-source tools that harvest your unpublished thesis data? See how OTIF compares against commercial academic software:

| Feature | Turnitin / iThenticate | Grammarly Premium | Originality.ai | Jenni AI / Writefull | **OTIF (Open Source)** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Price / Subscription** | Expensive Institutional License | ~$144 / year | ~$180 / year | ~$240 / year | **100% Free & Open Source** |
| **Data Privacy & Storage** | Stored in vendor database | Cloud processed | Cloud processed | Cloud processed | **Local-First (SQLite on your PC)** |
| **Local Offline AI Inference** | ❌ No | ❌ No | ❌ No | ❌ No | **✅ Ollama (Llama 3.3, DeepSeek-R1)** |
| **Scholarly Citation Check** | ✅ Basic matching | ❌ Basic formatting | ❌ No | ⚠️ Limited | **✅ Full DOI & Reference Verification** |
| **UGC / IEEE / APA 7 Norms** | ❌ No | ❌ No | ❌ No | ⚠️ Partial | **✅ Built-in Compliance Enforcer** |
| **Automated Academic Diagrams** | ❌ No | ❌ No | ❌ No | ❌ No | **✅ Themed Mermaid Diagram Studio** |
| **Structured Audit Thread Log** | ❌ No | ❌ No | ❌ No | ❌ No | **✅ Immutable Review Trail** |
| **Living Community Skills** | ❌ Proprietary blackbox | ❌ Closed | ❌ Closed | ❌ Closed | **✅ Open Antivirus-Style Skill Pulls** |

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

# Install requirements
pip install -r requirements.txt
```

#### Step 3: Build & Run the Native Desktop Application
```bash
# Return to the desktop app folder
cd ../apps/desktop

# Install frontend UI dependencies
npm install

# Run the native desktop application in development mode
# (Tauri will automatically boot the UI and manage local sidecars)
npm run tauri dev
```

To compile the standalone production installer for distribution:
```bash
npm run tauri build
```
*The compiled native desktop installer (`.exe` / `.dmg` / `.deb`) will be output inside `apps/desktop/src-tauri/target/release/bundle/`.*

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
