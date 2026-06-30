"""
OTIF — Local SQLite Database
Project workspace: 1 project = 1 document.
Stores projects, structured thread log, skill sync history, and skill discoveries.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from app.config import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────
# Schema
# ──────────────────────────────────────────────────────────────────

_SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    doc_type    TEXT NOT NULL DEFAULT 'thesis',
    norm        TEXT NOT NULL DEFAULT 'apa7',
    doc_id      TEXT,                          -- uploaded document UUID (1:1)
    filename    TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    skill_sync_at  TEXT,
    neon_sync_version TEXT
);

CREATE TABLE IF NOT EXISTS thread_messages (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role         TEXT NOT NULL,
    -- role: 'user' | 'system' | 'analysis' | 'rewrite' | 'diagram' | 'sync'
    message_type TEXT NOT NULL,
    -- message_type: 'upload' | 'analysis_result' | 'improvement_plan'
    --              | 'rewrite_diff' | 'diagram_generated' | 'skill_sync'
    --              | 'approval' | 'error'
    content      TEXT NOT NULL,               -- JSON string
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_sync_log (
    id            TEXT PRIMARY KEY,
    project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
    synced_at     TEXT NOT NULL,
    skill_count   INTEGER NOT NULL DEFAULT 0,
    new_skills    INTEGER NOT NULL DEFAULT 0,
    updated_skills INTEGER NOT NULL DEFAULT 0,
    source        TEXT NOT NULL DEFAULT 'manual'
    -- source: 'startup' | 'manual' | 'project_open' | 'user_sync'
);

CREATE TABLE IF NOT EXISTS skill_discoveries (
    id            TEXT PRIMARY KEY,
    project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
    skill_id      TEXT NOT NULL,
    description   TEXT NOT NULL,
    confidence    REAL NOT NULL DEFAULT 0.7,
    user_approved INTEGER NOT NULL DEFAULT 0,
    -- 0=pending, 1=approved, 2=rejected
    pushed_at     TEXT,
    discovered_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thread_project ON thread_messages(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_discoveries_project ON skill_discoveries(project_id, user_approved);
"""


# ──────────────────────────────────────────────────────────────────
# Connection Helper
# ──────────────────────────────────────────────────────────────────

def _db_path() -> Path:
    path = Path(settings.LOCAL_DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


async def init_db() -> None:
    """Create tables if they don't exist. Called at app startup."""
    async with aiosqlite.connect(_db_path()) as db:
        await db.executescript(_SCHEMA)
        await db.commit()
    logger.info("✅ Local SQLite database initialised: %s", _db_path())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


# ──────────────────────────────────────────────────────────────────
# Projects CRUD
# ──────────────────────────────────────────────────────────────────

async def create_project(name: str, doc_type: str = "thesis", norm: str = "apa7") -> dict:
    """Create a new project. Returns the project dict."""
    project_id = _new_id()
    now = _now()
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            """
            INSERT INTO projects (id, name, doc_type, norm, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (project_id, name, doc_type, norm, now, now),
        )
        await db.commit()
    return {
        "id": project_id,
        "name": name,
        "doc_type": doc_type,
        "norm": norm,
        "doc_id": None,
        "filename": None,
        "created_at": now,
        "updated_at": now,
        "skill_sync_at": None,
    }


async def get_project(project_id: str) -> dict | None:
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def list_projects() -> list[dict]:
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM projects ORDER BY updated_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def set_project_document(project_id: str, doc_id: str, filename: str) -> None:
    """Attach a document to the project (1:1)."""
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            "UPDATE projects SET doc_id=?, filename=?, updated_at=? WHERE id=?",
            (doc_id, filename, _now(), project_id),
        )
        await db.commit()


async def update_project_sync(project_id: str, neon_version: str | None = None) -> None:
    """Update skill_sync_at timestamp on the project."""
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            "UPDATE projects SET skill_sync_at=?, neon_sync_version=?, updated_at=? WHERE id=?",
            (_now(), neon_version, _now(), project_id),
        )
        await db.commit()


async def delete_project(project_id: str) -> bool:
    """Delete project and all child records (CASCADE)."""
    async with aiosqlite.connect(_db_path()) as db:
        result = await db.execute("DELETE FROM projects WHERE id=?", (project_id,))
        await db.commit()
        return (result.rowcount or 0) > 0


# ──────────────────────────────────────────────────────────────────
# Thread Messages CRUD
# ──────────────────────────────────────────────────────────────────

async def add_thread_message(
    project_id: str,
    role: str,
    message_type: str,
    content: dict | str,
) -> str:
    """Add a structured entry to the project thread log."""
    msg_id = _new_id()
    content_str = json.dumps(content) if isinstance(content, dict) else content
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            """
            INSERT INTO thread_messages (id, project_id, role, message_type, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (msg_id, project_id, role, message_type, content_str, _now()),
        )
        # Also bump project updated_at
        await db.execute(
            "UPDATE projects SET updated_at=? WHERE id=?",
            (_now(), project_id),
        )
        await db.commit()
    return msg_id


async def get_thread(project_id: str) -> list[dict]:
    """Return all thread messages for a project, oldest first."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM thread_messages WHERE project_id=? ORDER BY created_at ASC",
            (project_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    messages = []
    for row in rows:
        entry = dict(row)
        try:
            entry["content"] = json.loads(entry["content"])
        except (json.JSONDecodeError, TypeError):
            pass  # keep as string
        messages.append(entry)
    return messages


# ──────────────────────────────────────────────────────────────────
# Skill Sync Log CRUD
# ──────────────────────────────────────────────────────────────────

async def log_skill_sync(
    project_id: str | None,
    skill_count: int,
    new_skills: int,
    updated_skills: int,
    source: str = "manual",
) -> str:
    """Record a Neon skill sync event."""
    log_id = _new_id()
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            """
            INSERT INTO skill_sync_log
              (id, project_id, synced_at, skill_count, new_skills, updated_skills, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (log_id, project_id, _now(), skill_count, new_skills, updated_skills, source),
        )
        await db.commit()
    if project_id:
        await update_project_sync(project_id)
    return log_id


async def get_last_sync(project_id: str) -> dict | None:
    """Return the most recent sync log entry for a project."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT * FROM skill_sync_log
            WHERE project_id=?
            ORDER BY synced_at DESC LIMIT 1
            """,
            (project_id,),
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


# ──────────────────────────────────────────────────────────────────
# Skill Discoveries CRUD
# ──────────────────────────────────────────────────────────────────

async def add_discovery(
    project_id: str,
    skill_id: str,
    description: str,
    confidence: float = 0.7,
) -> str:
    """Record a newly detected skill pattern from a project analysis."""
    disc_id = _new_id()
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            """
            INSERT INTO skill_discoveries
              (id, project_id, skill_id, description, confidence, user_approved, discovered_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            """,
            (disc_id, project_id, skill_id, description, confidence, _now()),
        )
        await db.commit()
    return disc_id


async def get_pending_discoveries(project_id: str) -> list[dict]:
    """Return unapproved and unrejected discoveries for a project."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT * FROM skill_discoveries
            WHERE project_id=? AND user_approved=0
            ORDER BY confidence DESC
            """,
            (project_id,),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def approve_discovery(discovery_id: str) -> bool:
    """Mark a discovery as approved (ready for push to Neon)."""
    async with aiosqlite.connect(_db_path()) as db:
        result = await db.execute(
            "UPDATE skill_discoveries SET user_approved=1 WHERE id=?",
            (discovery_id,),
        )
        await db.commit()
        return (result.rowcount or 0) > 0


async def reject_discovery(discovery_id: str) -> bool:
    """Mark a discovery as rejected (will not be pushed)."""
    async with aiosqlite.connect(_db_path()) as db:
        result = await db.execute(
            "UPDATE skill_discoveries SET user_approved=2 WHERE id=?",
            (discovery_id,),
        )
        await db.commit()
        return (result.rowcount or 0) > 0


async def mark_discovery_pushed(discovery_id: str) -> None:
    """Record that an approved discovery was pushed to Neon."""
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            "UPDATE skill_discoveries SET pushed_at=? WHERE id=?",
            (_now(), discovery_id),
        )
        await db.commit()


async def get_approved_unpushed_discoveries() -> list[dict]:
    """Return all approved discoveries not yet pushed across all projects."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT * FROM skill_discoveries
            WHERE user_approved=1 AND pushed_at IS NULL
            ORDER BY discovered_at ASC
            """,
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
