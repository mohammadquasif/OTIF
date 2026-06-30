"""AI provider configuration and connection checks."""
from fastapi import APIRouter

from app.ai.provider_router import (
    AISettings,
    ProviderId,
    provider_options,
    save_ai_settings,
    status_payload,
    test_provider_connection,
)

router = APIRouter()


@router.get("/status")
async def ai_status():
    """Return AI privacy mode, configured providers, and supported model options."""
    return status_payload()


@router.put("/settings")
async def update_ai_settings(req: AISettings):
    """Persist local AI settings. API keys are masked when returned."""
    saved = save_ai_settings(req)
    return {
        "settings": saved.model_dump(),
        "providers": [provider.model_dump() for provider in provider_options()],
    }


@router.post("/test/{provider}")
async def test_ai_provider(provider: ProviderId):
    """Check whether a provider is reachable without sending document content."""
    return (await test_provider_connection(provider)).model_dump()
