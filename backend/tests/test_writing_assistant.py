from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import writing_assistant


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(writing_assistant.router, prefix="/api/v1/writing-assistant")
    return TestClient(app)


def test_phrasebank_loads_bundled_categories():
    client = _client()

    response = client.get("/api/v1/writing-assistant/phrasebank")

    assert response.status_code == 200
    payload = response.json()
    assert payload["version"]
    assert len(payload["categories"]) >= 5
    assert any(category["id"] == "methodology" for category in payload["categories"])


def test_paraphrase_returns_provider_result(monkeypatch):
    async def fake_generate_text_with_active_provider(*args, **kwargs):
        return "The present study examines the relationship between leadership and adoption.", "test-model"

    monkeypatch.setattr(
        writing_assistant,
        "generate_text_with_active_provider",
        fake_generate_text_with_active_provider,
    )
    client = _client()

    response = client.post(
        "/api/v1/writing-assistant/paraphrase",
        json={
            "text_selection": "This study looks at the relationship between leadership and adoption.",
            "context": "This chapter introduces the study.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["original_text"].startswith("This study looks")
    assert payload["paraphrased_text"].startswith("The present study examines")
    assert payload["model"] == "test-model"
