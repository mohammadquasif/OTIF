"""
OTIF — Projects API
One project = one document workspace.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.core import neon_db
from app.db import local_db
from app.skills.skill_manager import skill_manager

router = APIRouter()


# ──────────────────────────────────────────────────────────────────
# Request / Response Models
# ──────────────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    name: str
    doc_type: str = "thesis"
    norm: str = "apa7"


class ApproveDiscoveryRequest(BaseModel):
    auto_push: bool = True   # push to Neon immediately after approval


# ──────────────────────────────────────────────────────────────────
# Projects CRUD
# ──────────────────────────────────────────────────────────────────

@router.post("/")
async def create_project(req: CreateProjectRequest):
    """Create a new project workspace (1 project = 1 document slot)."""
    project = await local_db.create_project(req.name, req.doc_type, req.norm)
    return project


@router.get("/")
async def list_projects():
    """List all projects ordered by last activity."""
    projects = await local_db.list_projects()
    return {"projects": projects, "count": len(projects)}


@router.get("/{project_id}")
async def get_project(project_id: str):
    """Get project details."""
    project = await local_db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return project


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    """Delete a project and all its thread messages and discoveries."""
    project = await local_db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
        
    doc_id = project.get("doc_id")
    
    deleted = await local_db.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=500, detail=f"Failed to delete project '{project_id}'")
        
    # Cleanup document files if attached
    if doc_id:
        from app.api.v1.documents import find_document_path, document_metadata_path
        import shutil
        
        doc_path = find_document_path(doc_id)
        if doc_path and doc_path.exists():
            doc_path.unlink()
            
        meta_path = document_metadata_path(doc_id)
        if meta_path.exists():
            meta_path.unlink()
            
        from app.export.thesis_exporter import export_dir
        from app.config import settings
        from pathlib import Path
        export_path = export_dir(Path(settings.UPLOADS_PATH), doc_id)
        if export_path.exists():
            shutil.rmtree(export_path, ignore_errors=True)
            
    return {"message": f"Project '{project_id}' deleted"}


# ──────────────────────────────────────────────────────────────────
# Thread
# ──────────────────────────────────────────────────────────────────

@router.get("/{project_id}/thread")
async def get_thread(project_id: str):
    """Return the full structured review log for a project."""
    project = await local_db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    messages = await local_db.get_thread(project_id)
    return {
        "project_id": project_id,
        "project_name": project["name"],
        "messages": messages,
        "count": len(messages),
    }


# ──────────────────────────────────────────────────────────────────
# Skill Sync
# ──────────────────────────────────────────────────────────────────

@router.post("/{project_id}/sync-skills")
async def sync_skills(project_id: str):
    """
    Force a Neon skill pull for this project.
    Logs the sync result in skill_sync_log and adds a thread entry.
    Called automatically on project open if last sync > 1h ago.
    """
    project = await local_db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    neon_ok = await neon_db.is_connected()
    if not neon_ok:
        return {
            "synced": False,
            "message": "Neon DB not reachable — skills not updated. Using locally cached skills.",
            "neon_connected": False,
        }

    # Pull latest skills
    before_count = len(skill_manager.cache.all())
    status = await skill_manager.startup_pull()
    after_count = len(skill_manager.cache.all())
    new_skills = max(0, after_count - before_count)

    # Log sync
    await local_db.log_skill_sync(
        project_id=project_id,
        skill_count=after_count,
        new_skills=new_skills,
        updated_skills=status.get("updated_count", 0),
        source="user_sync",
    )

    # Add thread entry
    await local_db.add_thread_message(
        project_id=project_id,
        role="system",
        message_type="skill_sync",
        content={
            "skill_count": after_count,
            "new_skills": new_skills,
            "updated_skills": status.get("updated_count", 0),
            "source": "user_sync",
            "neon_connected": True,
        },
    )

    return {
        "synced": True,
        "skill_count": after_count,
        "new_skills": new_skills,
        "updated_skills": status.get("updated_count", 0),
        "neon_connected": True,
        "message": f"Skills synced from Neon. {after_count} skills active, {new_skills} new.",
    }


# ──────────────────────────────────────────────────────────────────
# Skill Discoveries
# ──────────────────────────────────────────────────────────────────

@router.get("/{project_id}/discoveries")
async def get_discoveries(project_id: str):
    """Return pending (unapproved) skill discoveries for this project."""
    project = await local_db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    discoveries = await local_db.get_pending_discoveries(project_id)
    return {
        "project_id": project_id,
        "discoveries": discoveries,
        "count": len(discoveries),
        "privacy_note": (
            "OTIF only collects structural skill patterns (rule codes, confidence deltas). "
            "No thesis text, citations, or personal data is ever transmitted. "
            "Your contribution helps improve analysis for all researchers."
        ),
    }


@router.post("/{project_id}/discoveries/{discovery_id}/approve")
async def approve_discovery(
    project_id: str,
    discovery_id: str,
    req: ApproveDiscoveryRequest,
    background_tasks: BackgroundTasks,
):
    """
    Approve a skill discovery. If auto_push=True and Neon is reachable,
    queues the pattern for push in the background.
    No document text is pushed — only structural skill signals.
    """
    approved = await local_db.approve_discovery(discovery_id)
    if not approved:
        raise HTTPException(status_code=404, detail=f"Discovery '{discovery_id}' not found")

    push_queued = False
    if req.auto_push and await neon_db.is_connected():
        background_tasks.add_task(_push_discovery_to_neon, discovery_id)
        push_queued = True

    return {
        "discovery_id": discovery_id,
        "approved": True,
        "push_queued": push_queued,
        "message": (
            "Discovery approved and queued for push to Neon."
            if push_queued
            else "Discovery approved. Push will happen when Neon is available."
        ),
    }


@router.post("/{project_id}/discoveries/{discovery_id}/reject")
async def reject_discovery(project_id: str, discovery_id: str):
    """Reject a skill discovery — it will not be pushed to Neon."""
    rejected = await local_db.reject_discovery(discovery_id)
    if not rejected:
        raise HTTPException(status_code=404, detail=f"Discovery '{discovery_id}' not found")
    return {"discovery_id": discovery_id, "rejected": True}


# ──────────────────────────────────────────────────────────────────
# Background Task: Push Discovery to Neon
# ──────────────────────────────────────────────────────────────────

async def _push_discovery_to_neon(discovery_id: str) -> None:
    """
    Push an approved discovery signal to Neon.
    Privacy: only skill_id, description (the rule pattern), and confidence are sent.
    No document text, thesis content, or user data is included.
    """
    try:
        neon_ok = await neon_db.is_connected()
        if not neon_ok:
            return

        # Push only the pattern signal, not any document data
        await neon_db.execute_write(
            """
            INSERT INTO community_skill_signals
              (signal_id, skill_id, description, confidence, submitted_at)
            VALUES (gen_random_uuid(), $1, $2, $3, NOW())
            ON CONFLICT DO NOTHING
            """,
            # Note: Neon table may not exist yet — will be created on first deploy
            # Handled gracefully by try/except
        )
        await local_db.mark_discovery_pushed(discovery_id)
    except Exception:
        # Push failure is non-fatal — pattern stays approved and will retry
        pass
