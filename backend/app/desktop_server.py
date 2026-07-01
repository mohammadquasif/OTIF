"""Desktop backend entrypoint.

This is used by the Tauri shell. It keeps OTIF data outside the source tree and
starts FastAPI on a desktop-only localhost port.
"""
import os
import platform
from pathlib import Path

import uvicorn


def _default_data_dir() -> Path:
    system = platform.system().lower()
    if system == "windows":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif system == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "OTIF"


def configure_desktop_environment() -> None:
    data_dir = Path(os.environ.get("OTIF_DATA_DIR", _default_data_dir()))
    os.environ.setdefault("HOST", "127.0.0.1")
    os.environ.setdefault("PORT", os.environ.get("OTIF_BACKEND_PORT", "18765"))
    os.environ.setdefault("LOCAL_DB_PATH", str(data_dir / "otif_local.db"))
    os.environ.setdefault("UPLOADS_PATH", str(data_dir / "uploads"))
    os.environ.setdefault("EMBEDDINGS_PATH", str(data_dir / "embeddings"))
    os.environ.setdefault("PROJECTS_PATH", str(data_dir / "projects"))

    for key in ["UPLOADS_PATH", "EMBEDDINGS_PATH", "PROJECTS_PATH"]:
        Path(os.environ[key]).mkdir(parents=True, exist_ok=True)


def main() -> None:
    configure_desktop_environment()
    from app.main import app
    uvicorn.run(
        app,
        host=os.environ["HOST"],
        port=int(os.environ["PORT"]),
        log_level="info",
    )


if __name__ == "__main__":
    main()
