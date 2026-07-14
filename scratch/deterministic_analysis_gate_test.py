"""Deterministic checks for compulsory AI and internet analysis gates."""
import json
import sys
from io import BytesIO

sys.path.insert(0, "backend")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai.provider_router import AISettings
from app.api.v1 import analysis, documents


sample_text = """# Test Paper

## Abstract
This paper tests the compulsory analysis gates.

## Introduction
The scan should require both a configured AI provider and internet access for open scholarly APIs.
"""


def build_client() -> TestClient:
    app = FastAPI()
    app.include_router(documents.router, prefix="/api/v1/documents")
    app.include_router(analysis.router, prefix="/api/v1/analysis")
    return TestClient(app)


def upload_doc(client: TestClient) -> str:
    upload = client.post(
        "/api/v1/documents/upload",
        files={"file": ("gate_test.md", BytesIO(sample_text.encode("utf-8")), "text/markdown")},
    )
    assert upload.status_code == 200, upload.text
    return upload.json()["doc_id"]


def collect(client: TestClient, doc_id: str) -> list[dict]:
    events: list[dict] = []
    with client.stream(
        "POST",
        f"/api/v1/analysis/run/{doc_id}",
        json={"doc_type": "research_paper", "norm": "apa7", "pace": "fast"},
        timeout=30,
    ) as response:
        assert response.status_code == 200, response.text
        for line in response.iter_lines():
            if line and line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


async def internet_ok() -> dict:
    return {"internet_reachable": True, "reachable_count": 1, "checked_count": 1, "checks": []}


async def internet_down() -> dict:
    return {"internet_reachable": False, "reachable_count": 0, "checked_count": 1, "checks": []}


def ai_ok(mask_keys: bool = True) -> AISettings:
    return AISettings(
        provider="deepseek",
        model_by_provider={"deepseek": "deterministic"},
        api_keys={"deepseek": "sk-test-configured"},
        privacy_mode="cloud_allowed",
    )


def ai_missing(mask_keys: bool = True) -> AISettings:
    return AISettings(
        provider="deepseek",
        model_by_provider={"deepseek": "deterministic"},
        api_keys={"deepseek": ""},
        privacy_mode="cloud_allowed",
    )


def main() -> None:
    client = build_client()
    doc_id = upload_doc(client)

    analysis.load_ai_settings = ai_missing
    analysis.check_open_research_connectivity = internet_ok
    no_ai = collect(client, doc_id)
    no_ai_error = next(event for event in no_ai if event.get("stage") == "error")
    assert no_ai_error.get("gate") == "ai_model", no_ai_error

    analysis.load_ai_settings = ai_ok
    analysis.check_open_research_connectivity = internet_down
    no_internet = collect(client, doc_id)
    no_internet_error = next(event for event in no_internet if event.get("stage") == "error")
    assert no_internet_error.get("gate") == "internet", no_internet_error

    print(json.dumps({
        "no_ai_gate": no_ai_error.get("gate"),
        "no_internet_gate": no_internet_error.get("gate"),
        "status": "passed",
    }, indent=2))


if __name__ == "__main__":
    main()
