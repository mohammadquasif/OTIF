"""
OTIF — Local SQLite Database (SQLite-Only, Production-Grade)
Project workspace: 1 project = 1 document.
Stores projects, structured thread log, skill sync history, skill discoveries,
phrase favorites, user preferences, reference library, writing sessions, and
phrase usage analytics — all in a single robust WAL-mode SQLite file.
Designed for minimum 1-year data retention with automatic backups.
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

-- ── Phrase Favorites (user bookmarks) ──────────────────────────
CREATE TABLE IF NOT EXISTS phrase_favorites (
    id           TEXT PRIMARY KEY,
    category_id  TEXT NOT NULL,
    phrase_text  TEXT NOT NULL,
    created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fav_category ON phrase_favorites(category_id);

-- ── User Preferences (persist UI state across sessions) ────────
CREATE TABLE IF NOT EXISTS user_preferences (
    key          TEXT PRIMARY KEY,
    value        TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

-- ── Reference Library (cite-while-you-write) ───────────────────
CREATE TABLE IF NOT EXISTS reference_library (
    id           TEXT PRIMARY KEY,
    project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
    citation_key TEXT NOT NULL,
    title        TEXT NOT NULL,
    authors      TEXT,
    year         TEXT,
    doi          TEXT,
    url          TEXT,
    raw_bibtex   TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ref_project ON reference_library(project_id);
CREATE INDEX IF NOT EXISTS idx_ref_citekey ON reference_library(citation_key);

-- ── Writing Sessions (productivity tracking) ───────────────────
CREATE TABLE IF NOT EXISTS writing_sessions (
    id               TEXT PRIMARY KEY,
    project_id       TEXT REFERENCES projects(id) ON DELETE CASCADE,
    chapter_id       TEXT,
    started_at       TEXT NOT NULL,
    ended_at         TEXT,
    word_count_start INTEGER DEFAULT 0,
    word_count_end   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_project ON writing_sessions(project_id);

-- ── Phrase Usage (anonymous, powers smart suggestions) ──────────
CREATE TABLE IF NOT EXISTS phrase_usage (
    id               TEXT PRIMARY KEY,
    phrase_category  TEXT NOT NULL,
    phrase_text      TEXT NOT NULL,
    used_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_category ON phrase_usage(phrase_category);
CREATE INDEX IF NOT EXISTS idx_usage_time ON phrase_usage(used_at);
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
    content_str = json.dumps(content, default=str) if isinstance(content, dict) else content
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


# ══════════════════════════════════════════════════════════════════
# Phrase Favorites CRUD
# ══════════════════════════════════════════════════════════════════

async def add_phrase_favorite(category_id: str, phrase_text: str) -> dict:
    """Bookmark a phrase. Returns the favorite record."""
    fav_id = _new_id()
    now = _now()
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            "INSERT INTO phrase_favorites (id, category_id, phrase_text, created_at) VALUES (?, ?, ?, ?)",
            (fav_id, category_id, phrase_text, now),
        )
        await db.commit()
    return {"id": fav_id, "category_id": category_id, "phrase_text": phrase_text, "created_at": now}


async def remove_phrase_favorite(category_id: str, phrase_text: str) -> bool:
    """Remove a bookmarked phrase. Returns True if deleted."""
    async with aiosqlite.connect(_db_path()) as db:
        result = await db.execute(
            "DELETE FROM phrase_favorites WHERE category_id=? AND phrase_text=?",
            (category_id, phrase_text),
        )
        await db.commit()
        return (result.rowcount or 0) > 0


async def remove_phrase_favorite_by_id(fav_id: str) -> bool:
    """Remove a bookmarked phrase by ID."""
    async with aiosqlite.connect(_db_path()) as db:
        result = await db.execute("DELETE FROM phrase_favorites WHERE id=?", (fav_id,))
        await db.commit()
        return (result.rowcount or 0) > 0


async def get_phrase_favorites(category_id: str | None = None) -> list[dict]:
    """Return bookmarked phrases, optionally filtered by category."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        if category_id:
            async with db.execute(
                "SELECT * FROM phrase_favorites WHERE category_id=? ORDER BY created_at DESC",
                (category_id,),
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM phrase_favorites ORDER BY created_at DESC"
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def is_phrase_favorited(category_id: str, phrase_text: str) -> bool:
    """Check if a specific phrase is bookmarked."""
    async with aiosqlite.connect(_db_path()) as db:
        async with db.execute(
            "SELECT 1 FROM phrase_favorites WHERE category_id=? AND phrase_text=? LIMIT 1",
            (category_id, phrase_text),
        ) as cursor:
            return await cursor.fetchone() is not None


# ══════════════════════════════════════════════════════════════════
# User Preferences CRUD
# ══════════════════════════════════════════════════════════════════

async def set_preference(key: str, value: str) -> None:
    """Upsert a user preference."""
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            "INSERT INTO user_preferences (key, value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, value, _now()),
        )
        await db.commit()


async def get_preference(key: str, default: str | None = None) -> str | None:
    """Get a user preference by key."""
    async with aiosqlite.connect(_db_path()) as db:
        async with db.execute(
            "SELECT value FROM user_preferences WHERE key=?", (key,)
        ) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else default


async def get_all_preferences() -> dict[str, str]:
    """Return all user preferences as a dict."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT key, value FROM user_preferences") as cursor:
            rows = await cursor.fetchall()
            return {r["key"]: r["value"] for r in rows}


async def delete_preference(key: str) -> bool:
    """Remove a preference."""
    async with aiosqlite.connect(_db_path()) as db:
        result = await db.execute("DELETE FROM user_preferences WHERE key=?", (key,))
        await db.commit()
        return (result.rowcount or 0) > 0


# ══════════════════════════════════════════════════════════════════
# Reference Library CRUD
# ══════════════════════════════════════════════════════════════════

async def add_reference(
    project_id: str | None,
    citation_key: str,
    title: str,
    authors: str | None = None,
    year: str | None = None,
    doi: str | None = None,
    url: str | None = None,
    raw_bibtex: str | None = None,
) -> dict:
    """Add a reference to the library."""
    ref_id = _new_id()
    now = _now()
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            """INSERT INTO reference_library
               (id, project_id, citation_key, title, authors, year, doi, url, raw_bibtex, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (ref_id, project_id, citation_key, title, authors, year, doi, url, raw_bibtex, now, now),
        )
        await db.commit()
    return {
        "id": ref_id, "project_id": project_id, "citation_key": citation_key,
        "title": title, "authors": authors, "year": year, "doi": doi, "url": url,
        "created_at": now, "updated_at": now,
    }


async def get_references(project_id: str | None = None) -> list[dict]:
    """List references, optionally filtered by project."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        if project_id:
            async with db.execute(
                "SELECT * FROM reference_library WHERE project_id=? OR project_id IS NULL ORDER BY created_at DESC",
                (project_id,),
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM reference_library ORDER BY created_at DESC"
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_reference(ref_id: str) -> dict | None:
    """Get a single reference by ID."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM reference_library WHERE id=?", (ref_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def update_reference(ref_id: str, **fields: str | None) -> bool:
    """Update reference fields."""
    allowed = {"citation_key", "title", "authors", "year", "doi", "url", "raw_bibtex"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not updates:
        return False
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    values = list(updates.values()) + [ref_id]
    async with aiosqlite.connect(_db_path()) as db:
        result = await db.execute(
            f"UPDATE reference_library SET {set_clause} WHERE id=?", values
        )
        await db.commit()
        return (result.rowcount or 0) > 0


async def delete_reference(ref_id: str) -> bool:
    """Remove a reference."""
    async with aiosqlite.connect(_db_path()) as db:
        result = await db.execute("DELETE FROM reference_library WHERE id=?", (ref_id,))
        await db.commit()
        return (result.rowcount or 0) > 0


# ══════════════════════════════════════════════════════════════════
# Writing Sessions CRUD
# ══════════════════════════════════════════════════════════════════

async def start_writing_session(project_id: str, chapter_id: str | None = None, word_count: int = 0) -> str:
    """Begin a writing session. Returns session ID."""
    session_id = _new_id()
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            """INSERT INTO writing_sessions
               (id, project_id, chapter_id, started_at, word_count_start)
               VALUES (?, ?, ?, ?, ?)""",
            (session_id, project_id, chapter_id, _now(), word_count),
        )
        await db.commit()
    return session_id


async def end_writing_session(session_id: str, word_count: int) -> bool:
    """End a writing session with final word count."""
    async with aiosqlite.connect(_db_path()) as db:
        result = await db.execute(
            "UPDATE writing_sessions SET ended_at=?, word_count_end=? WHERE id=? AND ended_at IS NULL",
            (_now(), word_count, session_id),
        )
        await db.commit()
        return (result.rowcount or 0) > 0


async def get_writing_sessions(project_id: str | None = None, limit: int = 50) -> list[dict]:
    """Return recent writing sessions."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        if project_id:
            async with db.execute(
                "SELECT * FROM writing_sessions WHERE project_id=? ORDER BY started_at DESC LIMIT ?",
                (project_id, limit),
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM writing_sessions ORDER BY started_at DESC LIMIT ?", (limit,)
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]


# ══════════════════════════════════════════════════════════════════
# Phrase Usage Tracking (anonymous analytics for smart suggestions)
# ══════════════════════════════════════════════════════════════════

async def log_phrase_usage(phrase_category: str, phrase_text: str) -> None:
    """Record that a phrase was used (for smart suggestions)."""
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute(
            "INSERT INTO phrase_usage (id, phrase_category, phrase_text, used_at) VALUES (?, ?, ?, ?)",
            (_new_id(), phrase_category, phrase_text, _now()),
        )
        await db.commit()


async def get_recent_phrases(limit: int = 20, category_id: str | None = None) -> list[dict]:
    """Return recently used phrases, optionally filtered by category."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        if category_id:
            async with db.execute(
                """SELECT phrase_category, phrase_text, MAX(used_at) as used_at, COUNT(*) as use_count
                   FROM phrase_usage WHERE phrase_category=?
                   GROUP BY phrase_category, phrase_text
                   ORDER BY used_at DESC LIMIT ?""",
                (category_id, limit),
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute(
                """SELECT phrase_category, phrase_text, MAX(used_at) as used_at, COUNT(*) as use_count
                   FROM phrase_usage
                   GROUP BY phrase_category, phrase_text
                   ORDER BY used_at DESC LIMIT ?""",
                (limit,),
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_most_used_phrases(limit: int = 30) -> list[dict]:
    """Return most frequently used phrases across all categories."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT phrase_category, phrase_text, COUNT(*) as use_count
               FROM phrase_usage
               GROUP BY phrase_category, phrase_text
               ORDER BY use_count DESC LIMIT ?""",
            (limit,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]


# ══════════════════════════════════════════════════════════════════
# Database Health & Maintenance
# ══════════════════════════════════════════════════════════════════

async def db_stats() -> dict:
    """Return database health statistics."""
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        stats: dict[str, int] = {}
        tables = [
            "projects", "thread_messages", "skill_sync_log", "skill_discoveries",
            "phrase_favorites", "user_preferences", "reference_library",
            "writing_sessions", "phrase_usage",
        ]
        for table in tables:
            async with db.execute(f"SELECT COUNT(*) as cnt FROM {table}") as cursor:
                row = await cursor.fetchone()
                stats[table] = row["cnt"] if row else 0
        async with db.execute("PRAGMA page_count") as cursor:
            row = await cursor.fetchone()
            stats["db_pages"] = row[0] if row else 0
        async with db.execute("PRAGMA freelist_count") as cursor:
            row = await cursor.fetchone()
            stats["db_freelist_pages"] = row[0] if row else 0
        return stats


async def vacuum_db() -> None:
    """Compact the database to reclaim free space."""
    async with aiosqlite.connect(_db_path()) as db:
        await db.execute("PRAGMA optimize")
        await db.execute("VACUUM")
        await db.commit()
    logger.info("✅ SQLite database vacuumed: %s", _db_path())
