#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
OUTPUT_DIR="$ROOT_DIR/apps/desktop/src-tauri/binaries"
PYTHON="$BACKEND_DIR/.venv/bin/python"

if [ ! -f "$PYTHON" ]; then
    echo "Error: Python virtual environment not found at $PYTHON."
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

WORK_DIR="$BACKEND_DIR/build/pyinstaller"
DIST_DIR="$BACKEND_DIR/dist/pyinstaller"

"$PYTHON" -m PyInstaller \
    --clean \
    --onefile \
    --name "otif-backend" \
    --workpath "$WORK_DIR" \
    --distpath "$DIST_DIR" \
    --paths "$BACKEND_DIR" \
    "$BACKEND_DIR/app/desktop_server.py"

BIN="$DIST_DIR/otif-backend"
if [ ! -f "$BIN" ]; then
    echo "Expected backend sidecar was not created: $BIN"
    exit 1
fi

cp -f "$BIN" "$OUTPUT_DIR/otif-backend"
cp -f "$BIN" "$OUTPUT_DIR/otif-backend.exe"
chmod +x "$OUTPUT_DIR/otif-backend"*
echo "Backend sidecar ready: $OUTPUT_DIR/otif-backend"
