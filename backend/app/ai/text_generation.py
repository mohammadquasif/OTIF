"""Shared text generation helpers for active AI provider calls."""
from collections.abc import Iterable

import httpx
from fastapi import HTTPException

from app.ai.provider_router import AISettings


def _behavior_system_prefix(config: AISettings) -> str:
    """Build a concise system-role prefix from AIBehavior settings to prepend to all prompts."""
    b = config.behavior
    discipline_labels = {
        "stem": "STEM (science, technology, engineering, mathematics)",
        "humanities": "humanities",
        "social_sciences": "social sciences",
        "business": "business and management",
        "law": "law",
        "medicine": "medicine and health sciences",
        "education": "education",
        "general": "general academic",
    }
    style_labels = {
        "formal": "formal academic",
        "technical": "technical/scientific",
        "argumentative": "argumentative",
        "analytical": "analytical",
        "descriptive": "descriptive",
        "critical": "critical review",
    }
    depth_labels = {
        "quick": "focus on the most critical issues only",
        "standard": "provide a balanced, standard-depth analysis",
        "deep": "conduct a thorough, research-level analysis with detailed evidence and recommendations",
    }
    intensity_labels = {
        "light": "make only targeted, minimal edits that preserve the author's voice",
        "moderate": "improve sentence structure and flow while preserving meaning",
        "thorough": "substantially restructure and elevate the writing quality",
    }
    # Handle both Pydantic model and plain dict (from API settings save)
    def _get_attr(obj: object, key: str, default: str) -> str:
        if isinstance(obj, dict):
            return str(obj.get(key, default))
        return str(getattr(obj, key, default))
    discipline = discipline_labels.get(_get_attr(b, "discipline", "general academic"), "general academic")
    style = style_labels.get(_get_attr(b, "writing_style", "formal academic"), "formal academic")
    depth = depth_labels.get(_get_attr(b, "analysis_depth", "standard"), "provide a balanced analysis")
    intensity = intensity_labels.get(_get_attr(b, "rewrite_intensity", "moderate"), "improve flow while preserving meaning")
    return (
        f"SYSTEM CONTEXT: You are an expert academic writing assistant specialising in {discipline} research. "
        f"Write in {style} style. When analysing, {depth}. "
        f"When rewriting, {intensity}. "
        "Follow scholarly standards: preserve all citations, avoid fabricating data, "
        "and maintain the author's original argument throughout.\n\n"
    )


async def generate_text_with_active_provider(
    prompt: str,
    config: AISettings,
    *,
    cloud_privacy_modes: Iterable[str],
    task_label: str,
    timeout_seconds: float = 180.0,
) -> tuple[str, str]:
    """Generate text with the configured active provider and privacy gate."""
    # Prepend behavior system context to every prompt
    full_prompt = _behavior_system_prefix(config) + prompt

    provider = config.provider
    model = config.model_by_provider.get(provider) or ""

    if provider == "ollama":
        base_url = (config.ollama_base_url or "http://localhost:11434").rstrip("/")
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_seconds, connect=5.0)) as client:
            response = await client.post(
                f"{base_url}/api/generate",
                json={"model": model or "llama3.3:latest", "prompt": full_prompt, "stream": False},
            )
            response.raise_for_status()
            return response.json().get("response", "").strip(), model

    if config.privacy_mode not in set(cloud_privacy_modes):
        allowed = ", ".join(sorted(cloud_privacy_modes))
        raise HTTPException(
            status_code=403,
            detail=(
                f"Cloud {task_label} is blocked by privacy mode. Select one of: {allowed}, "
                "or switch to Ollama."
            ),
        )

    key = config.api_keys.get(provider, "")
    if not key:
        raise HTTPException(status_code=400, detail=f"No API key configured for {provider}.")

    system_msg = _behavior_system_prefix(config)
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_seconds, connect=8.0)) as client:
        if provider == "deepseek":
            response = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": model or "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                },
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip(), model

        if provider == "openai":
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": model or "gpt-5.5",
                    "messages": [
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                },
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip(), model

        if provider == "claude":
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": model or "claude-3-5-sonnet-latest",
                    "system": system_msg,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 4096,
                    "temperature": 0.2,
                },
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("content", [])
            return "\n".join(part.get("text", "") for part in content if part.get("type") == "text").strip(), model

        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model or 'gemini-3-pro'}:generateContent",
            params={"key": key},
            json={
                "systemInstruction": {"parts": [{"text": system_msg}]},
                "contents": [{"parts": [{"text": prompt}]}],
            },
        )
        response.raise_for_status()
        data = response.json()
        candidates = data.get("candidates", [])
        parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
        return "\n".join(part.get("text", "") for part in parts).strip(), model
