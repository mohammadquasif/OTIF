"""Runtime desktop configuration stored outside the install directory."""
from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

from app.config import settings
from app.core.secret_store import protect_secret, restrict_secret_file, unprotect_secret


class NeonRuntimeSettings(BaseModel):
    read_url: str = ""
    write_url: str = ""
    owner_url: str = ""


class NeonRuntimeStatus(BaseModel):
    configured: bool
    read_configured: bool
    write_configured: bool
    owner_configured: bool
    read_url: str = ""
    write_url: str = ""
    owner_url: str = ""


def _config_dir() -> Path:
    path = Path(settings.PROJECTS_PATH).parent / "config"
    path.mkdir(parents=True, exist_ok=True)
    return path


def neon_config_path() -> Path:
    return _config_dir() / "neon_settings.json"


def _masked(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 16:
        return "********"
    return f"{value[:10]}********{value[-6:]}"


def _is_masked(value: str) -> bool:
    return "****" in value or "..." in value


def _env_neon_settings() -> NeonRuntimeSettings:
    return NeonRuntimeSettings(
        read_url=settings.NEON_READ_URL,
        write_url=settings.NEON_WRITE_URL,
        owner_url=settings.NEON_OWNER_URL,
    )


def load_neon_settings(mask: bool = False) -> NeonRuntimeSettings:
    config = _env_neon_settings()
    path = neon_config_path()
    if path.exists():
        raw = json.loads(path.read_text(encoding="utf-8"))
        saved = NeonRuntimeSettings(
            read_url=unprotect_secret(str(raw.get("read_url", ""))),
            write_url=unprotect_secret(str(raw.get("write_url", ""))),
            owner_url=unprotect_secret(str(raw.get("owner_url", ""))),
        )
        config = NeonRuntimeSettings(
            read_url=saved.read_url or config.read_url,
            write_url=saved.write_url or config.write_url,
            owner_url=saved.owner_url or config.owner_url,
        )
    if mask:
        return NeonRuntimeSettings(
            read_url=_masked(config.read_url),
            write_url=_masked(config.write_url),
            owner_url=_masked(config.owner_url),
        )
    return config


def save_neon_settings(new_settings: NeonRuntimeSettings) -> NeonRuntimeStatus:
    current = load_neon_settings(mask=False)

    def merge(current_value: str, incoming_value: str) -> str:
        if incoming_value and not _is_masked(incoming_value):
            return incoming_value
        if incoming_value == "":
            return ""
        return current_value

    merged = NeonRuntimeSettings(
        read_url=merge(current.read_url, new_settings.read_url),
        write_url=merge(current.write_url, new_settings.write_url),
        owner_url=merge(current.owner_url, new_settings.owner_url),
    )
    path = neon_config_path()
    payload = {
        "read_url": protect_secret(merged.read_url),
        "write_url": protect_secret(merged.write_url),
        "owner_url": protect_secret(merged.owner_url),
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    restrict_secret_file(path)
    return neon_status(mask=True)


def neon_status(mask: bool = True) -> NeonRuntimeStatus:
    config = load_neon_settings(mask=mask)
    raw = load_neon_settings(mask=False)
    return NeonRuntimeStatus(
        configured=bool(raw.read_url or raw.write_url or raw.owner_url),
        read_configured=bool(raw.read_url),
        write_configured=bool(raw.write_url),
        owner_configured=bool(raw.owner_url),
        read_url=config.read_url,
        write_url=config.write_url,
        owner_url=config.owner_url,
    )
