"""
OTIF — FastAPI Main Application
OpenThesis Integrity Fabric — Academic Research Intelligence Platform
"""
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

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
    desktop_data_dir = os.environ.get("OTIF_DATA_DIR")
    if desktop_data_dir:
        data_dir = Path(desktop_data_dir)
        settings.LOCAL_DB_PATH = str(data_dir / "otif_local.db")
        settings.UPLOADS_PATH = str(data_dir / "uploads")
        settings.EMBEDDINGS_PATH = str(data_dir / "embeddings")
        settings.PROJECTS_PATH = str(data_dir / "projects")

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

    logger.info(f"✅ OTIF ready — http://{settings.HOST}:{settings.PORT}/app/")
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
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
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
from app.api.v1 import ai, analysis, documents, health, projects, skills, writing_assistant
from app.api.v1 import diagrams as diagrams_router

app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["AI"])
app.include_router(skills.router, prefix="/api/v1/skills", tags=["Skills"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["Documents"])
app.include_router(analysis.router, prefix="/api/v1/analysis", tags=["Analysis"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(diagrams_router.router, prefix="/api/v1/diagrams", tags=["Diagrams"])
app.include_router(writing_assistant.router, prefix="/api/v1/writing-assistant", tags=["Writing Assistant"])


@app.get("/docs", include_in_schema=False)
async def legacy_docs_redirect():
    return RedirectResponse(url="/api/docs")


@app.get("/redoc", include_in_schema=False)
async def legacy_redoc_redirect():
    return RedirectResponse(url="/api/redoc")


def _frontend_dist_dir() -> Path | None:
    bundle_root = Path(getattr(sys, "_MEIPASS", Path.cwd()))
    candidates = [
        Path(os.environ.get("OTIF_FRONTEND_DIST", "")),
        bundle_root / "frontend-dist",
        Path(sys.executable).resolve().parent / "frontend-dist" if getattr(sys, "frozen", False) else Path(),
        Path(__file__).resolve().parents[2] / "apps" / "desktop" / "dist",
    ]
    for candidate in candidates:
        if candidate and (candidate / "index.html").exists():
            return candidate
    if getattr(sys, "frozen", False) and bundle_root.exists():
        for index_path in bundle_root.rglob("index.html"):
            if "frontend-dist" in index_path.parts:
                return index_path.parent
    return None


frontend_dist = _frontend_dist_dir()
if frontend_dist:
    @app.get("/app", include_in_schema=False)
    async def desktop_browser_fallback_no_slash():
        return RedirectResponse(url="/app/")

    @app.get("/app/{path:path}", include_in_schema=False)
    async def desktop_browser_fallback(path: str = ""):
        requested = frontend_dist / path
        if path and requested.exists() and requested.is_file():
            return FileResponse(requested)
        return FileResponse(frontend_dist / "index.html")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        for icon_path in (frontend_dist / "favicon.ico", frontend_dist / "favicon.svg"):
            if icon_path.exists():
                return FileResponse(icon_path)
        return RedirectResponse(url="/app/")


# ── Root ──────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root():
    if frontend_dist:
        return RedirectResponse(url="/app/")
    return {
        "app": "OTIF — OpenThesis Integrity Fabric",
        "version": settings.APP_VERSION,
        "docs": "/api/docs",
        "status": "running",
        "skills": skill_manager.cache.status,
        "providers": settings.available_providers,
    }
