"""Runtime desktop configuration loaded from environment-managed settings."""
from __future__ import annotations

from pydantic import BaseModel

from app.config import settings


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


def _masked(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 16:
        return "********"
    return f"{value[:10]}********{value[-6:]}"


def _env_neon_settings() -> NeonRuntimeSettings:
    return NeonRuntimeSettings(
        read_url=settings.NEON_READ_URL,
        write_url=settings.NEON_WRITE_URL,
        owner_url=settings.NEON_OWNER_URL,
    )


def load_neon_settings(mask: bool = False) -> NeonRuntimeSettings:
    config = _env_neon_settings()
    if mask:
        return NeonRuntimeSettings(
            read_url=_masked(config.read_url),
            write_url=_masked(config.write_url),
            owner_url=_masked(config.owner_url),
        )
    return config


def save_neon_settings(new_settings: NeonRuntimeSettings) -> NeonRuntimeStatus:
    """Compatibility no-op: Neon credentials are controlled by environment only."""
    _ = new_settings
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
