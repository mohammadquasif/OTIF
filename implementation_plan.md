# OTIF Production Implementation Plan

This plan tracks the remaining work required to make OTIF a real installable desktop application with no dummy capability claims.

## Product Standard

OTIF must not show, claim, or score a feature unless the backend can produce evidence for it.

Every user-facing result must include:

- source data used
- local/cloud boundary
- method used
- confidence or limitation
- evidence links or document locations where possible

## Current Truth

Implemented:

- React interface
- FastAPI backend
- local upload for TXT, PDF, DOCX
- basic local text extraction
- skill pack loading from Neon or bundled seed files
- AI provider settings for Ollama, DeepSeek, Gemini, and OpenAI-compatible providers
- provider connection checks
- local-first privacy mode defaults
- streamed analysis workflow

Not production-grade yet:

- desktop installer
- robust academic document parser
- local database/project storage
- evidence-backed scoring
- open research connectors
- rewrite approval workflow
- diagram studio
- report generation
- DOCX/PDF export

## Phase 1: Installable Desktop App

Goal: user installs OTIF and runs it without manually starting Vite or FastAPI.

Required:

- Add Tauri 2 desktop shell. [Implemented scaffold]
- Bundle React frontend into the Tauri app. [Implemented scaffold]
- Start the Python FastAPI backend as a managed sidecar. [Implemented scaffold]
- Store app data under the OS app data directory, not the repo folder.
- Add first-run setup screen for local data folder, privacy mode, and AI provider.
- Add Windows installer build.
- Add signed installer later when release identity is ready.

Acceptance:

- A user can install OTIF on Windows.
- OTIF launches from Start Menu.
- Backend starts and stops with the app.
- No terminal windows are required.
- Upload and analysis work inside the desktop window.

## Phase 2: Local Project Storage

Goal: documents, extracted text, analysis, and settings persist correctly.

Required:

- SQLite schema for projects, documents, sections, paragraphs, citations, reports, and settings.
- DuckDB tables for analysis metrics and evidence.
- Local file storage for originals and exports.
- Optional FAISS index for semantic search.
- Encrypted local API key storage.
- Project create/open/delete flows.

Acceptance:

- User can create a project.
- Uploaded documents appear after app restart.
- Analysis results are reproducible from stored evidence.
- API keys are not stored as plain visible text.

## Phase 3: Real Document Parser

Goal: replace simple text extraction with academic structure extraction.

Required:

- DOCX parser for headings, paragraphs, tables, figures, captions, footnotes, references, appendices.
- PDF parser with page and paragraph mapping.
- Markdown and LaTeX import.
- ODT support.
- Citation/reference extraction.
- Table and figure detection.
- Equation and appendix detection.

Acceptance:

- Each finding points to chapter, section, page, and paragraph where possible.
- Parser output is stored locally.
- Unsupported content is reported clearly instead of silently ignored.

## Phase 4: Evidence-Backed Academic Intelligence

Goal: replace heuristic scores with defensible engines.

Required engines:

- Originality engine for repeated ideas, internal repetition, and weak contribution language.
- Similarity engine for exact, near, semantic, and self-similarity against local documents.
- AI writing pattern engine with sentence variation, phrase pattern, burstiness, and structure evidence.
- Humanizer pattern engine for unnatural synonym shifts and tone inconsistency.
- Citation intelligence engine for missing citations, citation-reference mismatch, DOI checks, and density.
- Academic quality engine for research gap, objectives, methodology alignment, discussion, limitations, and contribution.
- Formatting compliance engine for APA, IEEE, UGC, European thesis, Springer, Elsevier, and custom templates.

Acceptance:

- No score is produced without evidence.
- Reports explain why a score changed.
- The app never claims to check against all papers.
- Wording says: "Checked against configured local documents and connected open-access research sources."

## Phase 5: Open Research Connectors

Goal: connect to legal, open scholarly sources.

Required:

- OpenAlex metadata search.
- Crossref DOI/reference validation.
- arXiv search.
- CORE metadata and legal full-text access where available.
- Zenodo records.
- Europe PMC and PubMed/PMC.
- DOAJ journal validation.
- Optional institutional repository OAI-PMH.
- Wikidata/Wikipedia for background entity support.

Acceptance:

- Each connector has rate limit handling.
- Each result includes source, license/access status, and timestamp.
- Similarity is only run against sources legally available to the app.

## Phase 6: AI Router and Rewrite Approval

Goal: AI helps only when the user chooses, and rewrites only after approval.

Required:

- Unified router for Ollama, DeepSeek, Gemini, OpenAI-compatible APIs.
- Provider model discovery where supported.
- Local-only mode enforced by backend.
- Selected paragraph/chapter cloud modes enforced by backend.
- Prompt templates from skill packs.
- Rewrite diff viewer.
- User approval before applying any rewrite.
- Rewrite history.

Forbidden:

- Fabricating references.
- Fabricating data or results.
- Removing valid citations.
- Rewriting to evade detectors.
- Promising to pass Turnitin or any detector.

Acceptance:

- User can see exactly what text would be sent to cloud AI.
- User can approve/reject each rewrite.
- All accepted changes are logged.

## Phase 7: Diagram Studio

Goal: create editable academic diagrams from document structure.

Required:

- Mermaid rendering.
- PlantUML rendering.
- Graphviz rendering.
- Edit source code and preview.
- Export SVG and PNG.
- Insert into DOCX/PDF export with captions.

Acceptance:

- Generated diagrams are editable.
- Caption and figure numbering can be regenerated.
- Failed render gives actionable error.

## Phase 8: Composer, Reports, and Export

Goal: produce useful academic deliverables.

Required outputs:

- Integrity Report.
- Improvement Report.
- Supervisor Report.
- Publication Readiness Report.
- Improved DOCX.
- Publication PDF.
- Markdown/HTML export.

Required DOCX features:

- clean heading styles
- TOC
- list of tables
- list of figures
- captions
- page numbering
- cross-references
- appendices
- template front matter

Acceptance:

- Exported documents open correctly in Word.
- Reports include evidence and limitations.
- Reports do not overclaim similarity coverage.

## Phase 9: Release Quality

Required:

- Automated backend tests.
- Frontend tests for upload/settings flows.
- Packaged desktop smoke test.
- Offline mode test.
- Cloud-disabled privacy test.
- Large document performance test.
- Error telemetry that does not include document text.
- Security review for local API and key storage.

Acceptance:

- One command builds the installer.
- One installer works on a clean Windows machine.
- App can run fully offline with Ollama or no AI provider.

## Immediate Next Build Order

1. Add Tauri desktop shell and package scripts.
2. Add managed backend sidecar.
3. Add SQLite project/document schema.
4. Replace analysis scores with evidence-backed parser output.
5. Hide or mark unavailable every feature not backed by real engine output.
