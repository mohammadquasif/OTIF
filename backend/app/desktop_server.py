"""Desktop backend entrypoint.

This is used by the Tauri shell. It keeps OTIF data outside the source tree and
starts FastAPI on a desktop-only localhost port.
"""
import os
import platform
import tempfile
from pathlib import Path

import uvicorn


def _is_writable_dir(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".otif-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


def _default_data_dir() -> Path:
    system = platform.system().lower()
    candidates: list[Path] = []
    if system == "windows":
        for key in ("LOCALAPPDATA", "APPDATA", "USERPROFILE"):
            value = os.environ.get(key)
            if value:
                candidates.append(Path(value) / "OTIF")
    elif system == "darwin":
        candidates.append(Path.home() / "Library" / "Application Support" / "OTIF")
    else:
        candidates.append(Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "OTIF")

    candidates.append(Path(tempfile.gettempdir()) / "OTIF")
    for candidate in candidates:
        if _is_writable_dir(candidate):
            return candidate
    return Path(tempfile.gettempdir()) / "OTIF"


def _resolve_data_dir() -> Path:
    configured = os.environ.get("OTIF_DATA_DIR")
    if configured:
        data_dir = Path(configured)
        if _is_writable_dir(data_dir):
            return data_dir
    return _default_data_dir()


def configure_desktop_environment() -> None:
    data_dir = _resolve_data_dir()
    os.environ["OTIF_DATA_DIR"] = str(data_dir)
    os.environ["HOST"] = "127.0.0.1"
    os.environ["PORT"] = os.environ.get("OTIF_BACKEND_PORT", "18765")
    os.environ["LOCAL_DB_PATH"] = str(data_dir / "otif_local.db")
    os.environ["UPLOADS_PATH"] = str(data_dir / "uploads")
    os.environ["EMBEDDINGS_PATH"] = str(data_dir / "embeddings")
    os.environ["PROJECTS_PATH"] = str(data_dir / "projects")
    os.environ["CORS_ORIGINS"] = os.environ.get(
        "CORS_ORIGINS",
        ",".join(
            [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://tauri.localhost",
                "https://tauri.localhost",
            ]
        ),
    )
    os.environ["CORS_ORIGIN_REGEX"] = os.environ.get(
        "CORS_ORIGIN_REGEX",
        r"https?://(localhost|127\.0\.0\.1|tauri\.localhost)(:\d+)?",
    )

    for key in ["UPLOADS_PATH", "EMBEDDINGS_PATH", "PROJECTS_PATH"]:
        Path(os.environ[key]).mkdir(parents=True, exist_ok=True)


def main() -> None:
    configure_desktop_environment()
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import app
    uvicorn.run(
        app,
        host=os.environ["HOST"],
        port=int(os.environ["PORT"]),
        log_level="info",
    )


if __name__ == "__main__":
    main()
