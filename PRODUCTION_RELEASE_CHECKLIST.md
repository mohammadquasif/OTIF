# OTIF Production Release Checklist

Use this checklist before publishing a desktop installer.

## 1. Build Inputs

- Rust/Cargo installed for Tauri.
- Node/npm installed for the desktop UI.
- Backend virtual environment created at `backend/.venv`.
- PyInstaller installed in the backend virtual environment.
- Export dependencies installed: `python-docx`, `reportlab`, `pymupdf`.
- Optional exact PDF conversion engine installed: LibreOffice `soffice` or Microsoft Word.
- Optional true Mermaid rendering installed: Mermaid CLI `mmdc`.

Run:

```powershell
.\scripts\check_desktop_prereqs.ps1
```

## 2. Build Gates

Run from repository root:

```powershell
& backend\.venv\Scripts\python.exe -m compileall backend\app
cd apps\desktop
npm run build
```

Run export smoke test:

```powershell
& backend\.venv\Scripts\python.exe scripts\test_export_pipeline.py
```

## 3. Runtime Gates

- Desktop app launches without showing API URLs to the user.
- Backend sidecar starts hidden on `127.0.0.1`.
- Health endpoint reports `status: healthy`.
- Skill status reports either bundled skills loaded or Neon schema ready.
- If Neon is configured, `/api/v1/skills/status` must show `neon_schema.ready: true`.
- If Neon schema is not ready, run `backend/scripts/seed_neon_schema.py` with owner credentials.

## 4. AI Provider Gates

- Only one provider can be active at a time.
- Ollama local connection test passes when local mode is selected.
- Cloud provider rewrite is blocked unless privacy mode allows selected chapter or cloud use.
- API keys are stored through the local secret store, not plain JSON.

## 5. Research Source Gates

- Internet gate blocks analysis when scholarly checks are unreachable.
- Research connector cache is created locally and reused.
- Public APIs are queried with rate delay to avoid aggressive polling.
- Report clearly states that open-source overlap is evidence, not a licensed plagiarism verdict.

## 6. Thesis Export Gates

- User approves improvement plan before rewrite/final export.
- Chapter rewrite is proposal-only until user applies it.
- DOCX export downloads successfully.
- PDF export downloads successfully.
- PDF uses Office/LibreOffice conversion when available, otherwise ReportLab fallback.
- Custom accent color is validated as 6-digit hex and appears in DOCX/PDF.
- Diagram image is inserted when diagram generation is selected.
- Integrity certificate downloads with before/after scores.

## 7. Document Fidelity Gates

- Validate at least one DOCX thesis containing headings, tables, captions, references, and figures.
- Validate at least one PDF thesis upload.
- Check generated DOCX opens in Microsoft Word.
- Check generated PDF opens in a standard PDF reader.
- Confirm TOC/list of tables/list of figures expectations for the selected norm.

## 8. Privacy And Security Gates

- No thesis text is pushed to Neon.
- No API key appears in UI responses or logs.
- Config file permissions are restricted after saving AI settings.
- Generated exports remain local under the app data directory.
- Audit thread records analysis, approval, rewrite, diagram, and export events.

## 9. Installer Gates

- Windows installer builds successfully.
- App is code-signed before public distribution.
- Installer includes backend sidecar and required Python packages.
- Fresh-machine install test passes without developer tools.
- Uninstall removes application binaries without deleting user projects unless explicitly requested.

## 10. Release Evidence

Attach to each release:

- Build logs.
- Export smoke-test log.
- Screenshot of AI provider gate.
- Screenshot of chapter live editor.
- Screenshot of final DOCX/PDF download cards.
- Sample generated DOCX, PDF, and integrity certificate from non-private test content.
