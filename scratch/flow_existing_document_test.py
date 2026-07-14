"""Smoke test: existing document upload -> scan -> approve -> rewrite -> DOCX/PDF export."""
import json
import sys
from io import BytesIO

sys.path.insert(0, "backend")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import analysis, documents


sample_text = """# Digital Transformation and SME Performance in India

## Abstract
This study examines how digital transformation affects SME performance in India. It uses survey and interview evidence from manufacturing and service firms.

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


def main() -> None:
    app = FastAPI()
    app.include_router(documents.router, prefix="/api/v1/documents")
    app.include_router(analysis.router, prefix="/api/v1/analysis")
    client = TestClient(app)

    result: dict = {}
    upload = client.post(
        "/api/v1/documents/upload",
        files={"file": ("existing_research.md", BytesIO(sample_text.encode("utf-8")), "text/markdown")},
    )
    result["upload_status"] = upload.status_code
    doc_id = upload.json().get("doc_id")
    result["doc_id"] = doc_id

    stages: list[str] = []
    final_scores = None
    plan: list[dict] = []
    with client.stream(
        "POST",
        f"/api/v1/analysis/run/{doc_id}",
        json={"doc_type": "research_paper", "norm": "apa7", "pace": "fast"},
        timeout=300,
    ) as response:
        result["scan_status"] = response.status_code
        for line in response.iter_lines():
            if not line or not line.startswith("data: "):
                continue
            payload = json.loads(line[6:])
            stages.append(payload.get("stage", ""))
            if payload.get("stage") == "scores_ready":
                final_scores = payload.get("scores")
                plan = payload.get("improvement_plan") or []

    result["scan_event_count"] = len(stages)
    result["scan_unique_stages"] = len(set(stages))
    result["scan_complete"] = "complete" in stages and "error" not in stages
    result["scores"] = final_scores
    result["plan_count"] = len(plan)
    result["plan_titles"] = [item.get("title") for item in plan[:5]]

    approved_ids = [item["id"] for item in plan[:3]]
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
    result["approve_status"] = approve.status_code
    approval_json = approve.json()
    result["rewrite_status"] = approval_json.get("rewrite_status")
    result["preview_chars"] = len(approval_json.get("rewrite_preview") or "")
    result["diff_counts"] = approval_json.get("diff")

    chapter = client.get(
        f"/api/v1/analysis/chapter-editor/{doc_id}",
        params={"doc_type": "research_paper", "norm": "apa7"},
    )
    result["chapter_status"] = chapter.status_code
    chapters = chapter.json().get("chapters", [])
    result["chapter_count"] = len(chapters)
    chapter_payload = [
        {
            "id": c["id"],
            "title": c["title"],
            "original_text": c["original_text"],
            "edited_text": c["edited_text"],
        }
        for c in chapters
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
        timeout=300,
    )
    result["full_rewrite_status"] = rewrite.status_code
    rewrite_json = rewrite.json()
    result["full_rewrite_chapters"] = len(rewrite_json.get("chapters", []))
    result["rewrite_words_original"] = rewrite_json.get("total_words_original")
    result["rewrite_words_rewritten"] = rewrite_json.get("total_words_rewritten")
    export_chapters = [
        {
            "id": c["id"],
            "title": c["title"],
            "original_text": c["original_text"],
            "edited_text": c["rewritten_text"],
        }
        for c in rewrite_json.get("chapters", [])
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
        timeout=180,
    )
    result["finalize_status"] = finalize.status_code
    final_json = finalize.json()
    result["artifact_summary"] = [
        {
            "format": artifact.get("format"),
            "filename": artifact.get("filename"),
            "size_bytes": artifact.get("size_bytes"),
        }
        for artifact in final_json.get("artifacts", [])
    ]
    result["before_overall"] = (final_json.get("before_scores") or {}).get("overall_preflight")
    result["after_overall"] = (final_json.get("after_scores") or {}).get("overall_preflight")
    result["field_update_status"] = final_json.get("field_update_status")

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
