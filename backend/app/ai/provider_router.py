"""AI provider configuration, model options, and connectivity checks."""
import json
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel, Field

from app.config import settings
from app.core.secret_store import protect_secret, restrict_secret_file, unprotect_secret

ProviderId = Literal["ollama", "deepseek", "gemini", "openai"]
PrivacyMode = Literal["local_only", "selected_paragraph", "selected_chapter", "cloud_allowed"]


class ModelOption(BaseModel):
    id: str
    label: str
    use_case: str
    context: str | None = None
    local: bool = False


class ProviderOption(BaseModel):
    id: ProviderId
    name: str
    mode: Literal["local", "cloud"]
    configured: bool
    default_model: str
    models: list[ModelOption]
    notes: str


class AISettings(BaseModel):
    privacy_mode: PrivacyMode = "local_only"
    provider: ProviderId = "ollama"
    model_by_provider: dict[str, str] = Field(default_factory=dict)
    api_keys: dict[str, str] = Field(default_factory=dict)
    ollama_base_url: str | None = None


class ConnectionResult(BaseModel):
    provider: ProviderId
    ok: bool
    message: str
    models_seen: list[str] = Field(default_factory=list)


MODEL_OPTIONS: dict[ProviderId, list[ModelOption]] = {
    "ollama": [
        ModelOption(id="llama3.3:latest", label="Llama 3.3", use_case="local academic review", local=True),
        ModelOption(id="qwen2.5:latest", label="Qwen 2.5", use_case="local long-form rewriting", local=True),
        ModelOption(id="deepseek-r1:latest", label="DeepSeek R1", use_case="local reasoning", local=True),
        ModelOption(id="mistral:latest", label="Mistral", use_case="lightweight local editing", local=True),
    ],
    "deepseek": [
        ModelOption(id="deepseek-chat", label="DeepSeek Chat", use_case="cost-efficient academic drafting"),
        ModelOption(id="deepseek-reasoner", label="DeepSeek Reasoner", use_case="research reasoning and review"),
        ModelOption(id="deepseek-v4-flash", label="DeepSeek V4 Flash", use_case="fast cloud review"),
        ModelOption(id="deepseek-v4-pro", label="DeepSeek V4 Pro", use_case="higher quality cloud reasoning"),
    ],
    "gemini": [
        ModelOption(id="gemini-3-pro", label="Gemini 3 Pro", use_case="best quality long-context review"),
        ModelOption(id="gemini-3-flash", label="Gemini 3 Flash", use_case="fast thesis review"),
        ModelOption(id="gemini-2.5-pro", label="Gemini 2.5 Pro", use_case="long-context academic analysis"),
        ModelOption(id="gemini-2.5-flash", label="Gemini 2.5 Flash", use_case="balanced speed and quality"),
    ],
    "openai": [
        ModelOption(id="gpt-5.5", label="GPT-5.5", use_case="highest quality academic review"),
        ModelOption(id="gpt-5.5-mini", label="GPT-5.5 Mini", use_case="fast lower-cost review"),
        ModelOption(id="gpt-5.4", label="GPT-5.4", use_case="strong general academic work"),
        ModelOption(id="o4-mini", label="o4-mini", use_case="reasoning-heavy checks"),
    ],
}


def _config_path() -> Path:
    path = Path(settings.PROJECTS_PATH).parent / "config"
    path.mkdir(parents=True, exist_ok=True)
    return path / "ai_settings.json"


def _masked(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "********"
    return f"{value[:4]}...{value[-4:]}"


def _env_defaults() -> AISettings:
    return AISettings(
        privacy_mode=settings.AI_PRIVACY_MODE,  # type: ignore[arg-type]
        provider=settings.AI_DEFAULT_PROVIDER,  # type: ignore[arg-type]
        model_by_provider={
            "ollama": settings.OLLAMA_DEFAULT_MODEL,
            "deepseek": settings.DEEPSEEK_DEFAULT_MODEL,
            "gemini": settings.GEMINI_DEFAULT_MODEL,
            "openai": settings.OPENAI_DEFAULT_MODEL,
        },
        api_keys={
            "deepseek": settings.DEEPSEEK_API_KEY,
            "gemini": settings.GEMINI_API_KEY,
            "openai": settings.OPENAI_API_KEY,
        },
        ollama_base_url=settings.OLLAMA_BASE_URL,
    )


def load_ai_settings(mask_keys: bool = False) -> AISettings:
    config = _env_defaults()
    path = _config_path()
    if path.exists():
        raw = json.loads(path.read_text(encoding="utf-8"))
        raw_keys = raw.get("api_keys", {})
        if isinstance(raw_keys, dict):
            raw["api_keys"] = {
                provider: unprotect_secret(str(value))
                for provider, value in raw_keys.items()
            }
        saved = AISettings.model_validate(raw)
        config = config.model_copy(update=saved.model_dump(exclude_unset=True))
    if mask_keys:
        config.api_keys = {provider: _masked(key) for provider, key in config.api_keys.items()}
    return config


def save_ai_settings(new_settings: AISettings) -> AISettings:
    current = load_ai_settings(mask_keys=False)
    incoming = new_settings.model_dump(exclude_unset=True)
    if "api_keys" in incoming and isinstance(incoming["api_keys"], dict):
        sanitized_keys = dict(current.api_keys)
        for provider, key in incoming["api_keys"].items():
            if key and "****" not in key:
                sanitized_keys[provider] = key
            elif key == "":
                sanitized_keys[provider] = ""
        incoming["api_keys"] = sanitized_keys
    merged = current.model_copy(update=incoming)
    path = _config_path()
    payload = merged.model_dump()
    payload["api_keys"] = {
        provider: protect_secret(key)
        for provider, key in merged.api_keys.items()
        if key
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    restrict_secret_file(path)
    return load_ai_settings(mask_keys=True)


def provider_options() -> list[ProviderOption]:
    config = load_ai_settings(mask_keys=False)
    api_keys = config.api_keys
    return [
        ProviderOption(
            id="ollama",
            name="Ollama",
            mode="local",
            configured=True,
            default_model=config.model_by_provider.get("ollama", settings.OLLAMA_DEFAULT_MODEL),
            models=MODEL_OPTIONS["ollama"],
            notes="Private local models through the Ollama API.",
        ),
        ProviderOption(
            id="deepseek",
            name="DeepSeek",
            mode="cloud",
            configured=bool(api_keys.get("deepseek")),
            default_model=config.model_by_provider.get("deepseek", settings.DEEPSEEK_DEFAULT_MODEL),
            models=MODEL_OPTIONS["deepseek"],
            notes="OpenAI-compatible API, useful for lower-cost academic review.",
        ),
        ProviderOption(
            id="gemini",
            name="Google Gemini",
            mode="cloud",
            configured=bool(api_keys.get("gemini")),
            default_model=config.model_by_provider.get("gemini", settings.GEMINI_DEFAULT_MODEL),
            models=MODEL_OPTIONS["gemini"],
            notes="Good fit for long-context thesis and paper review.",
        ),
        ProviderOption(
            id="openai",
            name="OpenAI",
            mode="cloud",
            configured=bool(api_keys.get("openai")),
            default_model=config.model_by_provider.get("openai", settings.OPENAI_DEFAULT_MODEL),
            models=MODEL_OPTIONS["openai"],
            notes="High-quality academic review and reasoning models.",
        ),
    ]


async def test_provider_connection(provider: ProviderId) -> ConnectionResult:
    config = load_ai_settings(mask_keys=False)
    timeout = httpx.Timeout(8.0, connect=4.0)

    if provider != config.provider:
        return ConnectionResult(
            provider=provider,
            ok=False,
            message=f"Only the selected provider can connect. Current provider: {config.provider}",
        )

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if provider == "ollama":
                base_url = (config.ollama_base_url or settings.OLLAMA_BASE_URL).rstrip("/")
                response = await client.get(f"{base_url}/api/tags")
                response.raise_for_status()
                data = response.json()
                models = [item.get("name", "") for item in data.get("models", []) if item.get("name")]
                return ConnectionResult(
                    provider=provider,
                    ok=True,
                    message=f"Ollama reachable at {base_url}",
                    models_seen=models[:20],
                )

            key = config.api_keys.get(provider, "")
            if not key:
                return ConnectionResult(provider=provider, ok=False, message="API key is not configured")

            if provider == "deepseek":
                response = await client.get(
                    "https://api.deepseek.com/models",
                    headers={"Authorization": f"Bearer {key}"},
                )
            elif provider == "gemini":
                response = await client.get(
                    "https://generativelanguage.googleapis.com/v1beta/models",
                    params={"key": key},
                )
            else:
                response = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {key}"},
                )

            response.raise_for_status()
            data = response.json()
            raw_models = data.get("data", data.get("models", []))
            models = [
                item.get("id") or item.get("name", "").replace("models/", "")
                for item in raw_models
                if item.get("id") or item.get("name")
            ]
            return ConnectionResult(provider=provider, ok=True, message=f"{provider} API key is valid", models_seen=models[:20])
    except Exception as exc:
        return ConnectionResult(provider=provider, ok=False, message=str(exc))


def status_payload() -> dict:
    config = load_ai_settings(mask_keys=True)
    return {
        "settings": config.model_dump(),
        "active_provider": config.provider,
        "active_model": config.model_by_provider.get(config.provider),
        "providers": [provider.model_dump() for provider in provider_options()],
        "privacy_modes": [
            {"id": "local_only", "label": "Local only", "cloud_allowed": False},
            {"id": "selected_paragraph", "label": "Selected paragraph only", "cloud_allowed": True},
            {"id": "selected_chapter", "label": "Selected chapter only", "cloud_allowed": True},
            {"id": "cloud_allowed", "label": "Cloud allowed", "cloud_allowed": True},
        ],
        "model_sources": {
            "openai": "https://platform.openai.com/docs/models",
            "gemini": "https://ai.google.dev/gemini-api/docs/models",
            "deepseek": "https://api-docs.deepseek.com/quick_start/pricing",
            "ollama": "https://github.com/ollama/ollama/blob/main/docs/api.md",
        },
    }
