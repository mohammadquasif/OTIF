"""
OTIF — Skills API Endpoints
Full CRUD + community learning endpoints for the Skill Engine.
"""
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.skills.skill_manager import skill_manager, LearningEvent, NewPatternDiscovery
from app.core import neon_db
from app.core.runtime_config import NeonRuntimeSettings, neon_status, save_neon_settings

router = APIRouter()


@router.get("/neon/settings")
async def get_neon_settings():
    """Return masked desktop Neon runtime configuration."""
    schema = await neon_db.verify_schema()
    return {
        "settings": neon_status(mask=True).model_dump(),
        "schema": schema,
    }


@router.put("/neon/settings")
async def update_neon_settings(req: NeonRuntimeSettings):
    """Compatibility no-op: Neon credentials are environment-managed."""
    saved = save_neon_settings(req)
    await neon_db.reconnect()
    schema = await neon_db.verify_schema()
    if schema["ready"]:
        await skill_manager.startup_pull()
    return {
        "settings": saved.model_dump(),
        "schema": schema,
        "message": "Neon credentials are environment-managed. Runtime credential edits were ignored.",
    }


@router.post("/neon/test")
async def test_neon_connection():
    """Reconnect and verify the Neon schema."""
    await neon_db.reconnect()
    schema = await neon_db.verify_schema()
    return {
        "ok": bool(schema["connected"] and schema["ready"]),
        "schema": schema,
        "settings": neon_status(mask=True).model_dump(),
    }


# ── GET /skills/status ────────────────────────────────────────────
@router.get("/status")
async def skill_status():
    """
    Get current skill engine status.
    Shows: loaded skills, versions, confidence scores, pending updates.
    """
    neon_schema = await neon_db.verify_schema()
    neon_connected = bool(neon_schema["connected"])
    updates = await skill_manager.check_for_updates() if neon_schema["ready"] else []

    return {
        "neon_connected": neon_connected,
        "neon_schema": neon_schema,
        "skill_engine": skill_manager.status,
        "pending_updates": updates,
        "update_count": len(updates),
    }


# ── GET /skills/ ──────────────────────────────────────────────────
@router.get("/")
async def list_skills():
    """List all loaded skills with their categories and rule counts."""
    return {
        "skills": [
            {
                "skill_id": s.skill_id,
                "name": s.name,
                "category": s.category,
                "version": s.version,
                "description": s.description,
                "rule_count": len(s.rules),
                "word_list_count": len(s.word_lists),
                "prompt_types": list(s.prompts.keys()),
                "loaded_at": s.loaded_at.isoformat(),
            }
            for s in skill_manager.cache.all()
        ]
    }


# ── GET /skills/{skill_id} ────────────────────────────────────────
@router.get("/{skill_id}")
async def get_skill(skill_id: str):
    """Get full skill detail including rules, word lists, and prompts."""
    skill = skill_manager.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found in cache")

    return {
        "skill_id": skill.skill_id,
        "name": skill.name,
        "category": skill.category,
        "version": skill.version,
        "description": skill.description,
        "ethical_boundary": skill.ethical_boundary,
        "trigger_phrases": skill.trigger_phrases,
        "rules": [
            {
                "rule_code": r.rule_code,
                "rule_name": r.rule_name,
                "rule_type": r.rule_type,
                "severity": r.severity,
                "description": r.description,
                "confidence": r.confidence,
                "success_rate": r.success_rate,
            }
            for r in skill.rules
        ],
        "banned_words": [
            {
                "word": w.word_or_phrase,
                "replacement": w.replacement,
                "severity": w.severity,
                "confidence": w.confidence,
            }
            for w in skill.banned_words
        ],
        "preferred_phrases": [w.word_or_phrase for w in skill.preferred_words],
        "prompts": list(skill.prompts.keys()),
        "thresholds": [
            {
                "metric": t.metric_name,
                "target": t.target_value,
                "excellent": t.excellent_min,
                "good": t.good_min,
            }
            for t in skill.thresholds
        ],
    }


# ── POST /skills/pull ─────────────────────────────────────────────
@router.post("/pull")
async def force_skill_pull():
    """Force re-pull all skills from Neon DB (like 'Update virus definitions')."""
    schema = await neon_db.verify_schema()
    if not schema["ready"]:
        return {
            "message": "Neon is offline or schema is not ready. Bundled seed skills remain active.",
            "status": skill_manager.status,
            "neon_schema": schema,
        }
    status = await skill_manager.startup_pull()
    return {
        "message": "Skills re-pulled from Neon DB",
        "status": status,
        "neon_schema": await neon_db.verify_schema(),
    }


# ── GET /skills/updates ───────────────────────────────────────────
@router.get("/updates/available")
async def check_updates():
    """Check if newer skill versions exist in Neon DB."""
    if not await neon_db.is_connected():
        return {"connected": False, "updates": []}
    updates = await skill_manager.check_for_updates()
    return {
        "connected": True,
        "updates": updates,
        "has_updates": len(updates) > 0,
    }


# ── POST /skills/session/start ────────────────────────────────────
@router.post("/session/start")
async def start_session():
    """Start a new research session for skill learning tracking."""
    session_id = str(uuid.uuid4())
    skill_manager.start_session(session_id)
    return {"session_id": session_id, "message": "Research session started"}


# ── POST /skills/session/complete ────────────────────────────────
class SessionCompleteRequest(BaseModel):
    session_id: str
    approved_discoveries: list[str] = []


@router.post("/session/complete")
async def complete_session(
    req: SessionCompleteRequest,
    background_tasks: BackgroundTasks,
):
    """
    Complete a research session and push approved learning signals to Neon.

    Privacy: Only score deltas and rule trigger statistics are sent.
    No document text is ever transmitted.
    """
    background_tasks.add_task(
        skill_manager.push_session_updates,
        req.session_id,
        req.approved_discoveries,
    )
    discoveries = skill_manager.get_pending_discoveries()
    return {
        "message": "Session completion queued",
        "session_id": req.session_id,
        "pending_discoveries": [
            {
                "description": d.description,
                "skill_id": d.skill_id,
                "confidence": d.confidence,
                "source": d.discovered_from,
            }
            for d in discoveries
        ],
        "note": "Only statistical signals (score deltas) sent to community DB. No text transmitted.",
    }


# ── GET /skills/words/banned ──────────────────────────────────────
@router.get("/words/banned")
async def get_all_banned_words():
    """Get the complete banned words list from all skills (for client-side highlighting)."""
    banned = skill_manager.get_banned_words()
    return {
        "count": len(banned),
        "words": [
            {
                "word": w.word_or_phrase,
                "replacement": w.replacement,
                "severity": w.severity,
                "confidence": w.confidence,
            }
            for w in sorted(banned, key=lambda x: x.severity, reverse=True)
        ],
    }
