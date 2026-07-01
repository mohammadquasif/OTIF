"""OTIF — Health Check Endpoints"""
from fastapi import APIRouter
from app.config import settings
from app.core import neon_db
from app.skills.skill_manager import skill_manager

router = APIRouter()


@router.get("/health")
async def health():
    neon_schema = await neon_db.verify_schema()
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "neon_db": "connected" if neon_schema["connected"] else "offline",
        "neon_schema": neon_schema,
        "skills_loaded": skill_manager.cache.status["skill_count"],
        "ai_providers": settings.available_providers,
    }
