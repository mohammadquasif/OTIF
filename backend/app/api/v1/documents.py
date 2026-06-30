"""Document upload and local metadata API."""
import json
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.config import settings
from app.db import local_db

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}


def _uploads_dir() -> Path:
    path = Path(settings.UPLOADS_PATH)
    path.mkdir(parents=True, exist_ok=True)
    return path


def document_metadata_path(doc_id: str) -> Path:
    return _uploads_dir() / f"{doc_id}.json"


def find_document_path(doc_id: str) -> Path | None:
    """Return the local path for an uploaded document."""
    uploads_dir = _uploads_dir()
    for ext in ALLOWED_EXTENSIONS:
        path = uploads_dir / f"{doc_id}{ext}"
        if path.exists():
            return path
    return None


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    project_id: Optional[str] = Query(default=None, description="Project to attach this document to (optional)"),
):
    """
    Upload a PDF, DOCX, DOC, or TXT academic document.
    File is stored locally only and is never sent to the cloud by this endpoint.
    If project_id is provided, the document is attached to that project (1:1).
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    # Validate project if provided
    if project_id:
        project = await local_db.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
        if project.get("doc_id"):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Project '{project_id}' already has a document attached "
                    f"({project['filename']}). Each project holds exactly one document."
                ),
            )

    doc_id = str(uuid.uuid4())
    doc_path = _uploads_dir() / f"{doc_id}{ext}"

    contents = await file.read()
    doc_path.write_bytes(contents)

    metadata = {
        "doc_id": doc_id,
        "filename": file.filename,
        "extension": ext,
        "size_bytes": len(contents),
        "path": str(doc_path),
        "project_id": project_id,
    }
    document_metadata_path(doc_id).write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    # Attach to project and log upload in thread
    if project_id:
        await local_db.set_project_document(project_id, doc_id, file.filename or "")
        await local_db.add_thread_message(
            project_id=project_id,
            role="user",
            message_type="upload",
            content={
                "doc_id": doc_id,
                "filename": file.filename,
                "size_bytes": len(contents),
                "extension": ext,
            },
        )

    return {
        **metadata,
        "message": "Document uploaded locally. Ready for analysis.",
        "privacy_note": "This document is stored on your machine only.",
    }


@router.get("/{doc_id}")
async def get_document(doc_id: str):
    """Get document metadata by ID."""
    metadata_path = document_metadata_path(doc_id)
    if metadata_path.exists():
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
        data["exists"] = Path(data["path"]).exists()
        return data

    path = find_document_path(doc_id)
    if path:
        return {
            "doc_id": doc_id,
            "path": str(path),
            "size_bytes": path.stat().st_size,
            "exists": True,
        }

    raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")
