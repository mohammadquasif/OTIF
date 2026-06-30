"""
OTIF — FastAPI Main Application
OpenThesis Integrity Fabric — Academic Research Intelligence Platform
"""
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.core import neon_db
from app.db import local_db
from app.skills.skill_manager import skill_manager

# ── Logging ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("otif")


# ── Startup / Shutdown ────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    logger.info("═" * 60)
    logger.info("🚀 OTIF — OpenThesis Integrity Fabric")
    logger.info(f"   Version: {settings.APP_VERSION}")
    logger.info("═" * 60)

    # 1. Ensure local data directories exist
    for path in [settings.UPLOADS_PATH, settings.EMBEDDINGS_PATH, settings.PROJECTS_PATH]:
        os.makedirs(path, exist_ok=True)

    # 1b. Initialise local SQLite project database
    await local_db.init_db()

    # 2. Connect to Neon PostgreSQL
    await neon_db.create_pools()

    # 3. PULL SKILLS (antivirus-style startup)
    logger.info("🔄 Pulling skills from Neon DB (antivirus-style)...")
    skill_status = await skill_manager.startup_pull()
    logger.info(f"✅ Skills loaded: {skill_status.get('skill_count', 0)} active skills")

    # 4. Log available AI providers
    providers = settings.available_providers
    logger.info(f"🤖 Available AI providers: {', '.join(providers)}")

    logger.info("✅ OTIF ready — http://localhost:8000")
    logger.info("=" * 60)

    yield  # Application runs here

    # ── Shutdown ──────────────────────────────────────────────────
    logger.info("🔄 OTIF shutting down...")
    await neon_db.close_pools()
    logger.info("✅ OTIF stopped")


# ── App Instance ──────────────────────────────────────────────────
app = FastAPI(
    title="OTIF — OpenThesis Integrity Fabric",
    description="AI-powered Academic Research Intelligence Platform",
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request Timing Middleware ─────────────────────────────────────
@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = (time.time() - start) * 1000
    response.headers["X-Response-Time"] = f"{duration:.2f}ms"
    return response


# ── Global Error Handler ──────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred. Check server logs.",
            "path": str(request.url),
        },
    )


# ── Routes ────────────────────────────────────────────────────────
from app.api.v1 import ai, analysis, documents, health, projects, skills
from app.api.v1 import diagrams as diagrams_router

app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["AI"])
app.include_router(skills.router, prefix="/api/v1/skills", tags=["Skills"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["Documents"])
app.include_router(analysis.router, prefix="/api/v1/analysis", tags=["Analysis"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(diagrams_router.router, prefix="/api/v1/diagrams", tags=["Diagrams"])


# ── Root ──────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root():
    return {
        "app": "OTIF — OpenThesis Integrity Fabric",
        "version": settings.APP_VERSION,
        "docs": "/api/docs",
        "status": "running",
        "skills": skill_manager.cache.status,
        "providers": settings.available_providers,
    }
