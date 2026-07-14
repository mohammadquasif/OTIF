"""Deterministic smoke test for research-backed new document generation."""
import json
import sys

sys.path.insert(0, "backend")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import analysis, documents, writing_assistant
from app.api.v1.writing_assistant import CitationResult


async def fake_citations(q: str, limit: int = 12, source: str | None = None) -> list[CitationResult]:
    return [
        CitationResult(
            doi="10.1016/j.jsis.2019.01.003",
            title="Understanding digital transformation: A review and a research agenda",
            authors="Vial, Gregory",
            year="2019",
            journal="Journal of Strategic Information Systems",
            url="https://doi.org/10.1016/j.jsis.2019.01.003",
            source="crossref",
        )
    ]


async def fake_generate(prompt: str, config, cloud_privacy_modes=None, task_label: str = "", timeout_seconds: float = 0):
    assert "VERIFIED OPEN-API CITATION CANDIDATES" in prompt
    assert "Vial, Gregory" in prompt
    text = """# Digital Transformation and SME Performance

## Abstract
This draft examines digital transformation in small firms using a research-backed framing (Vial, 2019).

## Introduction
Digital transformation is treated as a strategic organizational change process rather than a narrow technology upgrade (Vial, 2019).

## Methods
The proposed study uses a mixed-methods design to connect adoption barriers with performance outcomes.

## Results
The expected results section should report evidence without inventing unsupported statistics.

## Discussion
The discussion links digital capability, organizational learning, and contextual constraints.

## References
Vial, G. (2019). Understanding digital transformation: A review and a research agenda. Journal of Strategic Information Systems, 28(2), 118-144. https://doi.org/10.1016/j.jsis.2019.01.003
"""
    return text, "deterministic"


def main() -> None:
    writing_assistant._search_open_citation_candidates = fake_citations
    writing_assistant.generate_text_with_active_provider = fake_generate

    app = FastAPI()
    app.include_router(writing_assistant.router, prefix="/api/v1/writing-assistant")
    app.include_router(documents.router, prefix="/api/v1/documents")
    app.include_router(analysis.router, prefix="/api/v1/analysis")
    client = TestClient(app)

    generated = client.post(
        "/api/v1/writing-assistant/write-from-context",
        json={
            "research_context": "Digital transformation and SME performance in India with mixed methods evidence.",
            "doc_type": "research_paper",
            "norm": "apa7",
            "sections": ["Abstract", "Introduction", "Methods", "Results", "Discussion", "References"],
        },
    )
    result = {"generate_status": generated.status_code}
    payload = generated.json()
    result["doc_id_present"] = bool(payload.get("doc_id"))
    result["citation_candidate_count"] = payload.get("citation_candidate_count")
    result["title"] = payload.get("title")

    doc_id = payload["doc_id"]
    meta = client.get(f"/api/v1/documents/{doc_id}")
    result["metadata_status"] = meta.status_code
    result["metadata_exists"] = meta.json().get("exists")

    finalize = client.post(
        "/api/v1/analysis/finalize-thesis",
        json={
            "doc_id": doc_id,
            "chapters": [
                {
                    "id": "generated",
                    "title": payload.get("title", "Generated Document"),
                    "original_text": payload["content"],
                    "edited_text": payload["content"],
                }
            ],
            "doc_type": "research_paper",
            "norm": "apa7",
            "design_theme": "mono_formal",
            "output_formats": ["docx", "pdf"],
        },
    )
    final_json = finalize.json()
    result["finalize_status"] = finalize.status_code
    result["artifacts"] = [
        {
            "format": artifact.get("format"),
            "size_bytes": artifact.get("size_bytes"),
            "filename": artifact.get("filename"),
        }
        for artifact in final_json.get("artifacts", [])
    ]
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
