"""
OTIF Backend Configuration
Loads from .env file using Pydantic Settings
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────
    APP_NAME: str = "OTIF"
    APP_VERSION: str = "1.0.16"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # ── Neon PostgreSQL ───────────────────────────────────────
    NEON_READ_URL: str = ""
    NEON_WRITE_URL: str = ""
    NEON_OWNER_URL: str = ""

    # ── Local Storage ─────────────────────────────────────────
    LOCAL_DB_PATH: str = "./data/otif_local.db"
    UPLOADS_PATH: str = "./data/uploads"
    EMBEDDINGS_PATH: str = "./data/embeddings"
    PROJECTS_PATH: str = "./data/projects"

    # ── AI Providers ──────────────────────────────────────────
    AI_PRIVACY_MODE: str = "local_only"  # local_only | selected_paragraph | selected_chapter | cloud_allowed
    AI_DEFAULT_PROVIDER: str = "ollama"

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_DEFAULT_MODEL: str = "llama3.3:latest"

    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_DEFAULT_MODEL: str = "deepseek-chat"

    OPENAI_API_KEY: str = ""
    OPENAI_DEFAULT_MODEL: str = "gpt-5.5"

    GEMINI_API_KEY: str = ""
    GEMINI_DEFAULT_MODEL: str = "gemini-3-pro"

    # ── Research APIs ─────────────────────────────────────────
    OPENALEX_EMAIL: str = ""
    OPENALEX_API_KEY: str = ""
    CORE_API_KEY: str = ""
    SEMANTIC_SCHOLAR_API_KEY: str = ""
    UNPAYWALL_EMAIL: str = ""

    # ── Skill Engine ──────────────────────────────────────────
    SKILL_PULL_INTERVAL: int = 3600          # seconds
    SKILL_UPDATE_THRESHOLD: float = 0.05     # min improvement to trigger update
    SKILL_CONTRIBUTE_ANONYMOUS: bool = True
    SKILL_PRIVACY_MESSAGE: str = (
        "OTIF is a research project. We do not collect thesis content, author identity, "
        "citations, or private data. Only anonymous structural skill rules and confidence deltas "
        "are shared to improve analysis for all researchers."
    )

    # ── CORS ──────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def has_neon(self) -> bool:
        return bool(self.NEON_READ_URL or self.NEON_WRITE_URL or self.NEON_OWNER_URL)

    @property
    def has_ollama(self) -> bool:
        return True  # Always try, detect at runtime

    @property
    def has_deepseek(self) -> bool:
        return bool(self.DEEPSEEK_API_KEY)

    @property
    def has_openai(self) -> bool:
        return bool(self.OPENAI_API_KEY)

    @property
    def has_gemini(self) -> bool:
        return bool(self.GEMINI_API_KEY)

    @property
    def available_providers(self) -> list[str]:
        providers = ["ollama"]  # Always available
        if self.has_deepseek:
            providers.append("deepseek")
        if self.has_openai:
            providers.append("openai")
        if self.has_gemini:
            providers.append("gemini")
        return providers


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
