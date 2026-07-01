"""Neon PostgreSQL connection helpers.

The desktop app can run without a source-tree .env file, so Neon URLs are read
from environment defaults plus the protected runtime config in app data.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import asyncpg

from app.core.runtime_config import load_neon_settings

logger = logging.getLogger(__name__)

_read_pool: asyncpg.Pool | None = None
_write_pool: asyncpg.Pool | None = None

REQUIRED_TABLES = [
    "skills",
    "skill_versions",
    "skill_rules",
    "skill_word_lists",
    "skill_prompts",
    "skill_thresholds",
    "skill_packs",
    "skill_learning_events",
    "skill_performance",
    "skill_proposed_rules",
    "formatting_templates",
    "research_sources",
    "release_history",
]


async def create_pools() -> None:
    """Create Neon connection pools on app startup."""
    global _read_pool, _write_pool

    config = load_neon_settings(mask=False)
    if not (config.read_url or config.write_url or config.owner_url):
        logger.warning("Neon DB URL not configured - skill sync disabled (offline mode)")
        return

    read_url = config.read_url or config.owner_url or config.write_url
    if not read_url:
        logger.warning("Neon read URL not configured - skill sync disabled (offline mode)")
        return

    try:
        _read_pool = await asyncpg.create_pool(
            read_url,
            min_size=1,
            max_size=5,
            command_timeout=30,
            server_settings={"application_name": "otif-reader"},
        )
    except Exception as exc:
        logger.error("Failed to connect to Neon read DB: %s", exc)
        _read_pool = None
        _write_pool = None
        return

    write_url = config.write_url or config.owner_url
    if write_url:
        try:
            if write_url == read_url:
                logger.info("Neon write pool uses the read/owner connection URL")
            _write_pool = await asyncpg.create_pool(
                write_url,
                min_size=1,
                max_size=3,
                command_timeout=60,
                server_settings={"application_name": "otif-writer"},
            )
        except Exception as exc:
            logger.warning("Failed to connect to Neon write DB; read-only sync remains enabled: %s", exc)
            _write_pool = None

    logger.info("Neon PostgreSQL read pool created%s", " with write pool" if _write_pool else "")


async def close_pools() -> None:
    """Close pools on app shutdown."""
    global _read_pool, _write_pool
    if _read_pool:
        await _read_pool.close()
    if _write_pool:
        await _write_pool.close()
    _read_pool = None
    _write_pool = None
    logger.info("Neon DB pools closed")


async def reconnect() -> None:
    """Reload runtime credentials and recreate Neon pools."""
    await close_pools()
    await create_pools()


@asynccontextmanager
async def get_read_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a read-only connection from the pool."""
    if _read_pool is None:
        raise RuntimeError("Neon read pool not initialized")
    async with _read_pool.acquire() as conn:
        yield conn


@asynccontextmanager
async def get_write_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a write connection from the pool."""
    if _write_pool is None:
        raise RuntimeError("Neon write pool not initialized")
    async with _write_pool.acquire() as conn:
        yield conn


async def is_connected() -> bool:
    """Check if Neon DB is reachable."""
    try:
        if _read_pool is None:
            return False
        async with _read_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception:
        return False


async def verify_schema() -> dict:
    """Return Neon schema readiness without mutating the database."""
    if _read_pool is None:
        return {
            "connected": False,
            "ready": False,
            "missing_tables": REQUIRED_TABLES,
            "message": "Neon read pool is not initialized.",
        }
    try:
        async with _read_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = ANY($1::text[])
                """,
                REQUIRED_TABLES,
            )
        found = {row["table_name"] for row in rows}
        missing = [table for table in REQUIRED_TABLES if table not in found]
        return {
            "connected": True,
            "ready": not missing,
            "missing_tables": missing,
            "required_tables": REQUIRED_TABLES,
            "message": "Neon schema ready." if not missing else "Neon schema is missing required tables.",
        }
    except Exception as exc:
        return {
            "connected": False,
            "ready": False,
            "missing_tables": REQUIRED_TABLES,
            "message": str(exc),
        }


async def execute_read(query: str, *args: Any) -> list[dict]:
    """Execute a read query and return list of dicts."""
    async with get_read_conn() as conn:
        rows = await conn.fetch(query, *args)
        return [dict(row) for row in rows]


async def execute_read_one(query: str, *args: Any) -> dict | None:
    """Execute a read query and return single dict or None."""
    async with get_read_conn() as conn:
        row = await conn.fetchrow(query, *args)
        return dict(row) if row else None


async def execute_write(query: str, *args: Any) -> str:
    """Execute a write query and return status."""
    async with get_write_conn() as conn:
        return await conn.execute(query, *args)


async def execute_write_returning(query: str, *args: Any) -> dict | None:
    """Execute a write query with RETURNING clause."""
    async with get_write_conn() as conn:
        row = await conn.fetchrow(query, *args)
        return dict(row) if row else None


async def execute_write_many(query: str, args_list: list[tuple]) -> None:
    """Execute a write query with multiple argument sets."""
    async with get_write_conn() as conn:
        await conn.executemany(query, args_list)
