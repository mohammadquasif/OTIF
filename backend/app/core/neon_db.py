"""
OTIF — Neon PostgreSQL Connection
Handles both read-only (skill pull) and write (skill update) roles.
Uses asyncpg for async operations.
"""
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Any

import asyncpg

from app.config import settings

logger = logging.getLogger(__name__)

# Connection pools — created at startup
_read_pool: asyncpg.Pool | None = None
_write_pool: asyncpg.Pool | None = None


async def create_pools() -> None:
    """Create Neon connection pools on app startup."""
    global _read_pool, _write_pool

    if not settings.has_neon:
        logger.warning("⚠️  Neon DB URL not configured — skill sync disabled (offline mode)")
        return

    try:
        # Read pool — for pulling skills (uses read-only role)
        read_url = settings.NEON_READ_URL or settings.NEON_OWNER_URL or settings.NEON_WRITE_URL
        if not read_url:
            logger.warning("Neon read URL not configured - skill sync disabled (offline mode)")
            return

        _read_pool = await asyncpg.create_pool(
            read_url,
            min_size=1,
            max_size=5,
            command_timeout=30,
            server_settings={"application_name": "otif-reader"},
        )

        # Write pool — for pushing skill updates (uses write role)
        write_url = settings.NEON_WRITE_URL or settings.NEON_OWNER_URL
        if write_url:
            _write_pool = await asyncpg.create_pool(
                write_url,
                min_size=1,
                max_size=3,
                command_timeout=60,
                server_settings={"application_name": "otif-writer"},
            )

        logger.info("✅ Neon PostgreSQL pools created (read + write)")

    except Exception as e:
        logger.error(f"❌ Failed to connect to Neon DB: {e}")
        _read_pool = None
        _write_pool = None


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


async def execute_read(query: str, *args) -> list[dict]:
    """Execute a read query and return list of dicts."""
    async with get_read_conn() as conn:
        rows = await conn.fetch(query, *args)
        return [dict(row) for row in rows]


async def execute_read_one(query: str, *args) -> dict | None:
    """Execute a read query and return single dict or None."""
    async with get_read_conn() as conn:
        row = await conn.fetchrow(query, *args)
        return dict(row) if row else None


async def execute_write(query: str, *args) -> str:
    """Execute a write query and return status."""
    async with get_write_conn() as conn:
        return await conn.execute(query, *args)


async def execute_write_returning(query: str, *args) -> dict | None:
    """Execute a write query with RETURNING clause."""
    async with get_write_conn() as conn:
        row = await conn.fetchrow(query, *args)
        return dict(row) if row else None


async def execute_write_many(query: str, args_list: list[tuple]) -> None:
    """Execute a write query with multiple argument sets (batch insert)."""
    async with get_write_conn() as conn:
        await conn.executemany(query, args_list)
