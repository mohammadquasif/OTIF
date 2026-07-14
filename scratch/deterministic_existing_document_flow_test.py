"""Deterministic smoke test for upload/open -> scan -> approve -> rewrite -> export.

This test uses the real FastAPI routes but replaces live AI/research calls so the
workflow can be verified without network access or a running local model.
"""
import json
import sys
from io import BytesIO

sys.path.insert(0, "backend")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai.provider_router import AISettings
from app.api.v1 import analysis, documents
from app.research import connectors
from app.research.connectors import ResearchSource


sample_text = """# Digital Transformation and SME Performance in India

## Abstract
This study examines how digital transformation affects SME performance in India using survey and interview evidence.

## Introduction
Digital transformation has become central to SME competitiveness, but smaller firms face financial, skill, and infrastructure constraints. The literature has emphasized large enterprises more than emerging-economy SMEs, creating a gap in contextual evidence.

## Literature Review
Vial (2019) defines digital transformation as a process where digital technologies trigger strategic organizational responses. Resource-based theory suggests that firms gain advantage when digital capabilities are valuable, rare, and difficult to imitate.

## Methodology
The study uses a mixed-methods design. A survey was administered to SME owners and managers across Maharashtra, Tamil Nadu, and Gujarat. Semi-structured interviews were used to explore adoption barriers.

## Results
The survey indicated that firms with higher digital maturity reported stronger revenue growth and operational efficiency. Many respondents identified digital skill shortages as a barrier.

## Discussion
The findings support the role of digital capability as a performance resource, while showing that local infrastructure and skills shape the actual gains.

## Conclusion
Digital transformation can improve SME performance in India, but outcomes depend on skill development and implementation capability.

## References
Vial, G. (2019). Understanding digital transformation: A review and a research agenda. Journal of Strategic Information Systems, 28(2), 118-144.
"""


async def fake_connectivity() -> dict:
    return {
        "internet_reachable": True,
        "reachable_count": 1,
        "checked_count": 1,
        "checked_at": "deterministic-test",
        "checks": [],
        "message": "Internet simulated for deterministic flow test.",
    }


async def fake_ai_review(text: str, analysis_result: dict, doc_type: str, norm: str, research_context: str | None = None) -> dict:
    first_chapter = (analysis_result.get("chapters") or [{}])[0].get("id")
    return {
        "status": "ai_completed",
        "provider": "test-double",
        "model": "deterministic",
        "warning": None,
        "review_summary": "Deterministic academic review completed.",
        "items": [
            {
                "title": "Strengthen contribution framing",
                "priority": "high",
                "action": "Clarify the research gap, contribution, and evidence chain in the introduction.",
                "evidence": "The introduction states a gap but does not yet connect it to a precise contribution.",
                "chapter_id": first_chapter,
                "page_range": "1-2",
            }
        ],
    }


async def fake_rewrite(
    prompt: str,
    config,
    title: str,
    locked_text: str,
    approved_items: list[dict],
    doc_type: str,
    norm: str,
) -> tuple[str, str, str, str | None]:
    rewritten = (
        locked_text
        + "\n\nRevision note: This chapter now foregrounds the approved contribution framing while preserving original claims and citations."
    )
    return rewritten, "deterministic", "test-double", None


async def fake_source_checker(client, query: str) -> list[dict]:
    return []


def fake_ai_settings(mask_keys: bool = True) -> AISettings:
    key = "sk-test-configured" if not mask_keys else "sk-t...ured"
    return AISettings(
        provider="deepseek",
        model_by_provider={"deepseek": "deterministic"},
        api_keys={"deepseek": key},
        privacy_mode="cloud_allowed",
    )


def main() -> None:
    analysis.check_open_research_connectivity = fake_connectivity
    analysis._run_ai_analysis_pass = fake_ai_review
    analysis._generate_rewrite_text_with_resilience = fake_rewrite
    analysis.load_ai_settings = fake_ai_settings
    analysis.ALL_RESEARCH_SOURCES = [("test_source", "Deterministic Source")]
    connectors.SOURCES = [
        ResearchSource(
            id="test_source",
            name="Deterministic Source",
            base_url="https://example.test/research",
            requires_key=False,
            coverage="deterministic test metadata",
            docs_url="https://example.test/docs",
        )
    ]
    connectors.CHECKERS = {"test_source": fake_source_checker}
    connectors.SOURCE_RATE_DELAY_SECONDS = 0

    app = FastAPI()
    app.include_router(documents.router, prefix="/api/v1/documents")
    app.include_router(analysis.router, prefix="/api/v1/analysis")
    client = TestClient(app)

    result: dict = {}
    upload = client.post(
        "/api/v1/documents/upload",
        files={"file": ("existing_research.md", BytesIO(sample_text.encode("utf-8")), "text/markdown")},
    )
    print(f"upload={upload.status_code}", flush=True)
    result["upload_status"] = upload.status_code
    doc_id = upload.json().get("doc_id")
    result["doc_id"] = doc_id

    stages: list[str] = []
    plan: list[dict] = []
    scores = None
    with client.stream(
        "POST",
        f"/api/v1/analysis/run/{doc_id}",
        json={"doc_type": "research_paper", "norm": "apa7", "pace": "fast"},
        timeout=60,
    ) as response:
        result["scan_status"] = response.status_code
        for line in response.iter_lines():
            if not line or not line.startswith("data: "):
                continue
            payload = json.loads(line[6:])
            stages.append(payload.get("stage", ""))
            if payload.get("stage") == "scores_ready":
                scores = payload.get("scores")
                plan = payload.get("improvement_plan") or []
            if payload.get("stage") in {"scores_ready", "complete", "error"}:
                print(f"scan_stage={payload.get('stage')}", flush=True)
    print(f"scan_events={len(stages)}", flush=True)

    approved_ids = [item["id"] for item in plan[:2]]
    approve = client.post(
        "/api/v1/analysis/approve-rewrite",
        json={
            "doc_id": doc_id,
            "approved_item_ids": approved_ids,
            "doc_type": "research_paper",
            "norm": "apa7",
            "design_theme": "mono_formal",
            "output_formats": ["docx", "pdf"],
        },
    )
    print(f"approve={approve.status_code}", flush=True)

    chapter_res = client.get(
        f"/api/v1/analysis/chapter-editor/{doc_id}",
        params={"doc_type": "research_paper", "norm": "apa7"},
    )
    print(f"chapter_editor={chapter_res.status_code}", flush=True)
    chapters = chapter_res.json().get("chapters", [])
    chapter_payload = [
        {
            "id": chapter["id"],
            "title": chapter["title"],
            "original_text": chapter["original_text"],
            "edited_text": chapter["edited_text"],
        }
        for chapter in chapters
    ]

    rewrite = client.post(
        "/api/v1/analysis/rewrite-full-document",
        json={
            "doc_id": doc_id,
            "chapters": chapter_payload,
            "approved_item_ids": approved_ids,
            "doc_type": "research_paper",
            "norm": "apa7",
            "design_theme": "mono_formal",
        },
        timeout=60,
    )
    print(f"rewrite={rewrite.status_code}", flush=True)
    rewritten = rewrite.json().get("chapters", [])
    export_chapters = [
        {
            "id": chapter["id"],
            "title": chapter["title"],
            "original_text": chapter["original_text"],
            "edited_text": chapter["rewritten_text"],
        }
        for chapter in rewritten
    ]

    finalize = client.post(
        "/api/v1/analysis/finalize-thesis",
        json={
            "doc_id": doc_id,
            "chapters": export_chapters,
            "doc_type": "research_paper",
            "norm": "apa7",
            "design_theme": "mono_formal",
            "output_formats": ["docx", "pdf"],
        },
        timeout=60,
    )
    print(f"finalize={finalize.status_code}", flush=True)

    final_json = finalize.json()
    result.update(
        {
            "scan_complete": "complete" in stages and "error" not in stages,
            "scan_event_count": len(stages),
            "scores_ready": scores is not None,
            "plan_count": len(plan),
            "approved_count": len(approved_ids),
            "approve_status": approve.status_code,
            "chapter_status": chapter_res.status_code,
            "chapter_count": len(chapters),
            "full_rewrite_status": rewrite.status_code,
            "full_rewrite_chapters": len(rewritten),
            "finalize_status": finalize.status_code,
            "artifacts": [
                {
                    "format": artifact.get("format"),
                    "size_bytes": artifact.get("size_bytes"),
                    "filename": artifact.get("filename"),
                }
                for artifact in final_json.get("artifacts", [])
            ],
        }
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
