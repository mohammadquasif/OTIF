# OTIF Desktop Build

OTIF is scaffolded as a Tauri desktop app with a managed FastAPI backend process.

## What Runs In Desktop Mode

- Tauri opens the React app.
- The Rust shell starts the backend on `127.0.0.1:18765`.
- The backend entrypoint is `backend/app/desktop_server.py`.
- Desktop data is stored under the OS app data directory:
  - Windows: `%LOCALAPPDATA%\OTIF`
  - macOS: `~/Library/Application Support/OTIF`
  - Linux: `$XDG_DATA_HOME/OTIF` or `~/.local/share/OTIF`

## Prerequisites

- Node.js
- Rust and Cargo
- Python backend virtual environment
- PyInstaller inside the backend virtual environment

Check prerequisites:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check_desktop_prereqs.ps1
```

Install missing Python packaging support:

```powershell
backend\.venv\Scripts\python.exe -m ensurepip --upgrade
backend\.venv\Scripts\python.exe -m pip install pyinstaller
```

Install Rust/Cargo from:

```text
https://rustup.rs/
```

## Build Backend Sidecar

```powershell
npm --prefix apps\desktop run desktop:prepare-backend
```

This creates:

```text
apps\desktop\src-tauri\binaries\otif-backend.exe
```

## Run Desktop In Development

```powershell
cd apps\desktop
npm install
npm run desktop:dev
```

## Build Windows Installer

```powershell
cd apps\desktop
npm run desktop:build
```

Expected installer outputs are created under:

```text
apps\desktop\src-tauri\target\release\bundle
```

## Current Build Blocker On This Machine

Rust and Cargo are not installed, so native Tauri compilation cannot run here yet. The React build and Python backend compile are verified.
