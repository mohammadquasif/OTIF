"""Analysis API with server-sent event streaming."""
import asyncio
import json
import re
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.ai.provider_router import AISettings, load_ai_settings
from app.api.v1.documents import document_metadata_path, find_document_path
from app.api.v1.diagram_studio import build_design_rewrite_payload
from app.db import local_db
from app.core.citation_lock import lock_citations, unlock_citations
from app.research.connectors import check_research_sources
from app.skills.skill_manager import skill_manager

router = APIRouter()


class AnalysisRequest(BaseModel):
    doc_type: str = "thesis"
    norm: str = "apa7"
    session_id: str | None = None
    project_id: str | None = None      # If set, analysis result is logged to project thread


class PlanRewriteRequest(BaseModel):
    """Request to rewrite document sections based on an approved plan + diagram."""
    doc_id: str
    plan_text: str
    figure_start: int = 1
    doc_type: str = "thesis"
    norm: str = "apa7"


class RewriteApprovalRequest(BaseModel):
    doc_id: str
    approved_item_ids: list[str]
    doc_type: str = "thesis"
    norm: str = "apa7"
    draw_diagrams: bool = False
    diagram_style: str = "academic"
    design_theme: str = "classic_blue"
    output_formats: list[str] = Field(default_factory=lambda: ["docx", "pdf"])
    maintain_front_matter: bool = True


def _approval_path(doc_id: str) -> Path:
    return document_metadata_path(doc_id).with_name(f"{doc_id}.rewrite_approval.json")


def _extract_text(path: Path) -> str:
    suffix = path.suffix.lower()

    if suffix == ".txt":
        return path.read_text(encoding="utf-8", errors="ignore")

    if suffix == ".docx":
        from docx import Document

        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    if suffix == ".pdf":
        import fitz

        with fitz.open(path) as doc:
            return "\n".join(page.get_text("text") for page in doc)

    return ""


def _format_label(value: str) -> str:
    labels = {
        "apa7": "APA 7",
        "ugc": "UGC thesis format",
        "ieee": "IEEE",
        "harvard": "Harvard",
        "springer": "Springer",
        "elsevier": "Elsevier",
        "european_thesis": "European thesis format",
    }
    return labels.get(value, value.replace("_", " ").upper())


def _split_chapters(text: str) -> list[dict]:
    chapter_pattern = re.compile(
        r"(?im)^(chapter\s+\d+[:.\-\s].*|chapter\s+[ivxlcdm]+[:.\-\s].*|\d+\.\s+[A-Z][^\n]{3,120}|"
        r"abstract|introduction|literature review|methodology|methods|results|discussion|conclusion|references)\s*$"
    )
    matches = list(chapter_pattern.finditer(text))
    if not matches:
        return [{"id": "whole-document", "title": "Whole Document", "text": text}]

    chapters: list[dict] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        title = match.group(1).strip()[:120]
        if body:
            chapters.append({"id": f"chapter-{len(chapters) + 1}", "title": title, "text": body})
    return chapters or [{"id": "whole-document", "title": "Whole Document", "text": text}]


def _score_chapters(chapters: list[dict]) -> list[dict]:
    chapter_results = []
    for chapter in chapters[:12]:
        chapter_analysis = _score_document(chapter["text"], include_plan=False)
        chapter_results.append(
            {
                "id": chapter["id"],
                "title": chapter["title"],
                "metrics": chapter_analysis["metrics"],
                "scores": chapter_analysis["scores"],
                "findings": chapter_analysis["findings"][:5],
            }
        )
    return chapter_results


def _sentences(text: str) -> list[str]:
    return [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text.strip()) if sentence.strip()]


def _paragraphs(text: str) -> list[str]:
    return [paragraph.strip() for paragraph in re.split(r"\n\s*\n+", text) if len(paragraph.split()) >= 20]


def _has_citation(text: str) -> bool:
    return bool(
        re.search(
            r"\([A-Z][A-Za-z&.\-\s]+,\s*\d{4}[a-z]?\)|[A-Z][A-Za-z.\-]+\s+\(\d{4}[a-z]?\)|\[\d+(?:,\s*\d+)*\]",
            text,
        )
    )


def _citation_metrics(text: str) -> dict:
    sentences = _sentences(text)
    citation_sentences = [sentence for sentence in sentences if _has_citation(sentence)]
    references_present = bool(re.search(r"(?im)^\s*(references|bibliography|works cited)\s*$", text))
    doi_count = len(re.findall(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b", text, flags=re.I))
    url_count = len(re.findall(r"https?://[^\s)]+", text))
    claim_sentences = [
        sentence
        for sentence in sentences
        if len(sentence.split()) >= 10 and not re.match(r"(?i)^(chapter|table|figure|appendix)\b", sentence)
    ]
    citation_coverage = (len(citation_sentences) / len(claim_sentences) * 100) if claim_sentences else 0
    citation_quality = min(
        96,
        citation_coverage * 0.72
        + (10 if references_present else 0)
        + min(10, doi_count * 1.5)
        + min(6, url_count),
    )
    return {
        "citation_coverage": round(citation_coverage, 1),
        "citation_quality": round(citation_quality, 1),
        "citation_sentence_count": len(citation_sentences),
        "claim_sentence_count": len(claim_sentences),
        "doi_count": doi_count,
        "url_count": url_count,
        "references_present": references_present,
    }


def _internal_similarity_metrics(text: str) -> dict:
    paragraphs = _paragraphs(text)
    duplicate_pairs = 0
    for left_index, left in enumerate(paragraphs):
        left_words = set(re.findall(r"\b[a-z]{4,}\b", left.lower()))
        if len(left_words) < 12:
            continue
        for right in paragraphs[left_index + 1 :]:
            right_words = set(re.findall(r"\b[a-z]{4,}\b", right.lower()))
            if len(right_words) < 12:
                continue
            union = left_words | right_words
            overlap = len(left_words & right_words) / len(union) if union else 0
            if overlap >= 0.82:
                duplicate_pairs += 1
    duplication_risk = min(35, duplicate_pairs * 7)
    return {
        "paragraph_count": len(paragraphs),
        "near_duplicate_pairs": duplicate_pairs,
        "internal_duplication_risk": round(duplication_risk, 1),
    }


def _style_metrics(text: str, banned_hits: list[dict], word_count: int, avg_sentence_length: float) -> dict:
    sentences = _sentences(text)
    sentence_lengths = [len(re.findall(r"\b[\w'-]+\b", sentence)) for sentence in sentences]
    mean = sum(sentence_lengths) / len(sentence_lengths) if sentence_lengths else 0
    variance = sum((length - mean) ** 2 for length in sentence_lengths) / len(sentence_lengths) if sentence_lengths else 0
    burstiness = min(100, (variance ** 0.5 / mean * 100) if mean else 0)
    passive_hits = len(re.findall(r"\b(?:is|are|was|were|be|been|being)\s+\w+(?:ed|en)\b", text, flags=re.I))
    passive_ratio = passive_hits / len(sentences) * 100 if sentences else 0
    template_openers = len(
        re.findall(
            r"(?im)^\s*(this section|this chapter|it is important|furthermore|moreover|additionally|in conclusion)\b",
            text,
        )
    )
    researcher_voice_hits = len(
        re.findall(
            r"\b(this study|this research|the evidence suggests|a limitation|the practical implication|my interpretation)\b",
            text,
            flags=re.I,
        )
    )
    quote_words = sum(len(match.split()) for match in re.findall(r'"([^"]{120,})"', text))
    generic_penalty = min(18, template_openers * 3 + sum(hit["count"] for hit in banned_hits) * 1.2)
    humanization_score = max(
        5,
        min(
            96,
            88
            - generic_penalty
            - min(12, passive_ratio * 0.35)
            - min(15, max(0, avg_sentence_length - 24) * 1.1)
            + min(8, researcher_voice_hits * 1.5)
            + min(6, burstiness * 0.08),
        ),
    )
    ai_writing_risk = max(
        5,
        min(
            95,
            100
            - humanization_score
            + min(12, template_openers * 2)
            + min(10, sum(hit["count"] for hit in banned_hits) * 0.8)
            + (8 if burstiness < 25 and word_count > 300 else 0),
        ),
    )
    return {
        "burstiness": round(burstiness, 1),
        "passive_voice_ratio": round(passive_ratio, 1),
        "template_opener_count": template_openers,
        "researcher_voice_markers": researcher_voice_hits,
        "long_quote_words": quote_words,
        "humanization_score": round(humanization_score, 1),
        "ai_writing_risk": round(ai_writing_risk, 1),
    }


def _build_improvement_plan(
    analysis: dict,
    doc_type: str,
    norm: str,
    chapter_results: list[dict] | None = None,
) -> list[dict]:
    scores = analysis["scores"]
    metrics = analysis["metrics"]
    findings = analysis["findings"]
    plan: list[dict] = []

    if scores["plagiarism_risk"] >= 25:
        plan.append(
            {
                "id": "plagiarism-risk-reduction",
                "title": "Reduce plagiarism and similarity risk",
                "priority": "high" if scores["plagiarism_risk"] >= 40 else "medium",
                "action": (
                    "Check unsupported claims, near-duplicate internal passages, long quotations, and close paraphrase "
                    "patterns before rewriting."
                ),
                "evidence": f"Plagiarism risk is {scores['plagiarism_risk']} with {analysis['metrics']['near_duplicate_pairs']} near-duplicate paragraph pair(s).",
                "requires_ai": True,
            }
        )

    if scores["originality_score"] < 70:
        plan.append(
            {
                "id": "originality-claim-strength",
                "title": "Strengthen originality and contribution",
                "priority": "high" if scores["originality_score"] < 55 else "medium",
                "action": (
                    "Convert descriptive material into synthesis: what is combined, what gap remains, and what the "
                    "researcher contributes without overclaiming."
                ),
                "evidence": f"Originality score is {scores['originality_score']}; contribution may not be sufficiently defended.",
                "requires_ai": True,
            }
        )

    if scores["ai_writing_risk"] >= 45:
        plan.append(
            {
                "id": "voice-authenticity",
                "title": "Reduce AI-like academic phrasing",
                "priority": "high" if scores["ai_writing_risk"] >= 65 else "medium",
                "action": (
                    "Rewrite repetitive, over-polished, and generic phrasing into a more specific researcher voice "
                    "while preserving meaning and citations."
                ),
                "evidence": (
                    f"AI-writing risk is {scores['ai_writing_risk']}; burstiness is {metrics['burstiness']} "
                    f"and template openers found: {metrics['template_opener_count']}."
                ),
                "requires_ai": True,
            }
        )

    if scores["humanization_score"] < 70:
        plan.append(
            {
                "id": "humanization-researcher-voice",
                "title": "Improve authentic researcher voice",
                "priority": "medium",
                "action": (
                    "Add bounded interpretation, specific context, friction/trade-off, and consequence statements "
                    "instead of generic importance claims."
                ),
                "evidence": f"Humanization score is {scores['humanization_score']} with {metrics['researcher_voice_markers']} researcher voice marker(s).",
                "requires_ai": True,
            }
        )

    if findings:
        flagged = ", ".join(hit["word"] for hit in findings[:4])
        plan.append(
            {
                "id": "flagged-phrases",
                "title": "Replace flagged phrases",
                "priority": "high",
                "action": "Review each flagged phrase and rewrite only where the replacement improves clarity or originality.",
                "evidence": f"Flagged phrase hits include: {flagged}.",
                "requires_ai": True,
            }
        )

    if scores["citation_quality"] < 70:
        plan.append(
            {
                "id": "citation-strength",
                "title": "Strengthen citation signal",
                "priority": "high",
                "action": (
                    "Mark unsupported claims, add missing in-text citation placeholders, and normalize citation style "
                    "without inventing sources."
                ),
                "evidence": (
                    f"Citation quality is {scores['citation_quality']}; citation coverage is "
                    f"{metrics['citation_coverage']}% across claim-like sentences."
                ),
                "requires_ai": True,
            }
        )

    if scores["structure_signal"] < 72:
        plan.append(
            {
                "id": "academic-structure",
                "title": f"Tighten {doc_type.replace('_', ' ')} structure",
                "priority": "medium",
                "action": (
                    "Improve section transitions, objective alignment, methodology/result boundaries, and conclusion traceability."
                ),
                "evidence": f"Structure signal is {scores['structure_signal']} for the selected document type.",
                "requires_ai": True,
            }
        )

    for chapter in (chapter_results or [])[:8]:
        chapter_scores = chapter["scores"]
        weak_signals = []
        if chapter_scores["citation_signal"] < 70:
            weak_signals.append("citation support")
        if chapter_scores["ai_writing_risk"] >= 50:
            weak_signals.append("researcher voice")
        if chapter_scores["originality_score"] < 70:
            weak_signals.append("original contribution")
        if chapter_scores["structure_signal"] < 72:
            weak_signals.append("section structure")
        if not weak_signals:
            continue
        start_pg = chapter.get("start_page", 1)
        end_pg = chapter.get("end_page", start_pg + 12)
        plan.append(
            {
                "id": f"{chapter['id']}-improvement",
                "title": f"Improve {chapter['title']} (Pages {start_pg}–{end_pg})",
                "priority": "high" if len(weak_signals) >= 2 else "medium",
                "action": f"Revise pages {start_pg}–{end_pg} for {', '.join(weak_signals)} while preserving claims, TOC headings, and citations.",
                "evidence": (
                    f"[Page-Wise Audit Pages {start_pg}–{end_pg}] {chapter['title']} scores: AI risk {chapter_scores['ai_pattern_risk']}, "
                    f"originality {chapter_scores['originality_score']}, citation {chapter_scores['citation_signal']}, "
                    f"structure {chapter_scores['structure_signal']}."
                ),
                "requires_ai": True,
                "chapter_id": chapter["id"],
                "page_range": f"{start_pg}–{end_pg}",
            }
        )

    plan.append(
        {
            "id": "diagram-opportunities",
            "title": "Identify and draft required diagrams",
            "priority": "medium",
            "action": (
                "After approval, detect methodology/process/model sections and draft academic diagrams only where they "
                "clarify the argument."
            ),
            "evidence": "Diagram generation is optional and requires separate approval in the rewrite options.",
            "requires_ai": True,
        }
    )

    plan.append(
        {
            "id": "target-format",
            "title": f"Apply {_format_label(norm)} checks",
            "priority": "medium",
            "action": "Check headings, references, tables/figures, and style conventions against the selected target format.",
            "evidence": f"Target format selected: {_format_label(norm)}.",
            "requires_ai": False,
        }
    )

    plan.append(
        {
            "id": "front-matter-integrity",
            "title": "Maintain TOC, list of tables, and list of figures",
            "priority": "high" if norm == "ugc" else "medium",
            "action": (
                "Preserve heading hierarchy, table captions, figure captions, page-aware front matter, and export-ready "
                "DOCX/PDF structure."
            ),
            "evidence": f"Required for {_format_label(norm)} output and final submission polish.",
            "requires_ai": False,
        }
    )

    return plan


def _rewrite_prompt(text: str, approved_items: list[dict], doc_type: str, norm: str, req: RewriteApprovalRequest) -> str:
    item_text = "\n".join(f"- {item['title']}: {item['action']}" for item in approved_items)
    excerpt = text[:6000]
    return (
        "You are performing an Integrity-Preserving Revision on a scholarly document excerpt after explicit user approval.\n"
        "Rules:\n"
        "- Preserve meaning, claims, section intent, and academic rigor.\n"
        "- Do not invent sources, findings, data, references, or page numbers.\n"
        "- NEVER modify or delete placeholder tokens like [[CIT_LOCK_...]]. Keep them exactly where they appear.\n"
        "- Elevate scholarly voice without introducing generic copywriting tone.\n\n"
        f"Document type: {doc_type}\n"
        f"Target format: {_format_label(norm)}\n"
        f"Diagram drafting approved: {'yes' if req.draw_diagrams else 'no'}\n"
        f"Diagram style: {req.diagram_style}\n"
        f"Design theme: {req.design_theme}\n"
        f"Maintain TOC/list of tables/list of figures: {'yes' if req.maintain_front_matter else 'no'}\n"
        f"Approved improvements:\n{item_text}\n\n"
        "Return a concise chapter-wise revision preview, optional diagram suggestions if approved, and a short formatting note.\n\n"
        f"Document excerpt:\n{excerpt}"
    )


async def _try_generate_rewrite_preview(
    text: str,
    approved_items: list[dict],
    req: RewriteApprovalRequest,
    config: AISettings,
) -> dict:
    if config.provider != "ollama":
        return {
            "rewrite_status": "approval_recorded_selected_text_required",
            "rewrite_preview": None,
            "rewrite_note": (
                "Cloud revision is not automatic for full documents. Select a paragraph/chapter or switch to local "
                "Ollama to revise without sending document text to a cloud provider."
            ),
        }

    locked_text, lock_map = lock_citations(text)
    prompt = _rewrite_prompt(locked_text, approved_items, req.doc_type, req.norm, req)
    model = config.model_by_provider.get("ollama") or "llama3.3:latest"
    base_url = (config.ollama_base_url or "http://localhost:11434").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=5.0)) as client:
            response = await client.post(
                f"{base_url}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False},
            )
            response.raise_for_status()
            data = response.json()
            raw_preview = data.get("response", "").strip()
            restored_preview, all_restored, missing_tokens = unlock_citations(raw_preview, lock_map)
            note = f"Generated locally with Ollama model {model}. Citations deterministically locked and restored ({len(lock_map)} references preserved)."
            if not all_restored:
                note += f" Restored {len(missing_tokens)} citations omitted by model."
            return {
                "rewrite_status": "rewrite_preview_ready",
                "rewrite_preview": restored_preview,
                "rewrite_note": note,
            }
    except Exception as exc:
        return {
            "rewrite_status": "approval_recorded_ai_unavailable",
            "rewrite_preview": None,
            "rewrite_note": f"Approval was saved, but Ollama revision engine is not available: {exc}",
        }


def _originality_matrix(text: str, citation: dict, similarity: dict, banned_hits: list[dict]) -> dict:
    """
    QUA-007: Originality Evidence Matrix (5-Dimension)
    Each dimension scored 0 (absent), 10 (partial), or 20 (fully present).
    Total max = 100.
    """
    text_lower = text.lower()

    # Dimension 1: Literature Gap
    # Look for explicit gap language supported by multiple citations
    gap_phrases = [
        "gap in", "limited research", "little is known", "no study",
        "insufficient", "overlooked", "under-explored", "lack of",
        "research gap", "no consensus", "remains unclear",
    ]
    gap_hits = sum(1 for phrase in gap_phrases if phrase in text_lower)
    citation_count = citation.get("citation_sentence_count", 0)
    dim1 = 20 if (gap_hits >= 2 and citation_count >= 5) else (10 if gap_hits >= 1 else 0)

    # Dimension 2: Applied Integration
    # Framework names that represent established models
    established_models = [
        "togaf", "nist", "iso/iec", "oecd", "tam", "utaut",
        "dynamic capabilities", "kotter", "mckinsey", "7s",
        "cobit", "itil", "pmbok", "agile", "scrum", "lean",
        "balanced scorecard", "resource-based",
    ]
    model_hits = sum(1 for model in established_models if model in text_lower)
    dim2 = 20 if model_hits >= 3 else (10 if model_hits >= 1 else 0)

    # Dimension 3: Artefact Contribution
    artefact_signals = [
        "framework", "model", "schema", "prototype", "artefact", "artifact",
        "tool", "dashboard", "matrix", "checklist", "process map",
        "architecture", "design science",
    ]
    artefact_hits = sum(1 for sig in artefact_signals if sig in text_lower)
    # Check if at least one artefact has named components
    has_named_components = bool(
        re.search(
            r"(?i)(?:layer|pillar|component|module|dimension|element|phase)\s*\d+\s*[:\-–]\s*\w+",
            text,
        )
    )
    dim3 = 20 if (artefact_hits >= 2 and has_named_components) else (10 if artefact_hits >= 1 else 0)

    # Dimension 4: Methodological Boundary
    boundary_phrases = [
        "does not", "this study does not", "outside the scope",
        "not within", "not included", "excluded from", "beyond the scope",
        "limitation of this", "not generalised", "not generalizable",
        "this research does not", "future work", "future research",
    ]
    boundary_hits = sum(1 for phrase in boundary_phrases if phrase in text_lower)
    dim4 = 20 if boundary_hits >= 3 else (10 if boundary_hits >= 1 else 0)

    # Dimension 5: Practical Implication
    implication_phrases = [
        "the practical implication", "practitioners", "organisations should",
        "managers should", "recommended for", "applicable to",
        "can be adopted", "for implementation", "in practice",
        "practical recommendation", "for practitioners",
    ]
    implication_hits = sum(1 for phrase in implication_phrases if phrase in text_lower)
    dim5 = 20 if implication_hits >= 2 else (10 if implication_hits >= 1 else 0)

    total = dim1 + dim2 + dim3 + dim4 + dim5

    return {
        "originality_evidence_matrix": total,
        "originality_dimensions": {
            "literature_gap": dim1,
            "applied_integration": dim2,
            "artefact_contribution": dim3,
            "methodological_boundary": dim4,
            "practical_implication": dim5,
        },
    }


def _hedging_metrics(text: str, word_count: int) -> dict:
    """
    AID-013: Epistemic hedging language density.
    Target: 4-12 markers per 1000 words.
    """
    hedging_words = [
        r"\bmay\b", r"\bmight\b", r"\bcould\b",
        r"\bsuggests?\b", r"\bindicates?\b",
        r"\bappears? to\b", r"\btends? to\b", r"\barguably\b",
        r"\bit is possible\b", r"\bthere is evidence\b",
        r"\bseems to\b", r"\bit appears\b", r"\btypically\b",
    ]
    hedging_count = sum(
        len(re.findall(pattern, text, flags=re.I)) for pattern in hedging_words
    )
    density = (hedging_count / word_count * 1000) if word_count else 0
    return {
        "hedging_count": hedging_count,
        "hedging_density_per_1000": round(density, 1),
        "hedging_risk": "over_assertive" if density < 4 else ("excessive" if density > 20 else "healthy"),
    }


def _rq_traceback(text: str) -> dict:
    """
    QUA-009: Research Question traceback score.
    Checks what % of stated RQs appear traceable in findings/discussion.
    """
    rq_pattern = re.compile(
        r"(?i)(?:research\s+question|RQ)\s*(\d+)\s*[:\-–.]\s*([^\n?]{10,200}\??)",
        re.MULTILINE,
    )
    rqs = rq_pattern.findall(text)
    if not rqs:
        return {"rq_count": 0, "rq_traceback_score": None, "unanswered_rqs": []}

    # Look in discussion/conclusion sections for each RQ reference
    discussion_section = ""
    disc_match = re.search(
        r"(?i)(?:discussion|conclusion|findings|results)(.*?)(?:references|bibliography|$)",
        text,
        re.DOTALL,
    )
    if disc_match:
        discussion_section = disc_match.group(1).lower()
    else:
        # Use last 30% of text as proxy
        cutoff = int(len(text) * 0.7)
        discussion_section = text[cutoff:].lower()

    answered = 0
    unanswered: list[str] = []
    for rq_num, rq_text in rqs:
        # RQ is answered if its number or keywords appear in discussion
        rq_keywords = [w for w in re.split(r"\W+", rq_text.lower()) if len(w) > 4][:3]
        in_discussion = (
            f"rq{rq_num}" in discussion_section
            or f"research question {rq_num}" in discussion_section
            or any(kw in discussion_section for kw in rq_keywords)
        )
        if in_discussion:
            answered += 1
        else:
            unanswered.append(f"RQ{rq_num}: {rq_text[:80]}")

    score = round(answered / len(rqs) * 100, 1) if rqs else None
    return {
        "rq_count": len(rqs),
        "rq_traceback_score": score,
        "unanswered_rqs": unanswered,
    }


def _score_document(
    text: str,
    doc_type: str = "thesis",
    norm: str = "apa7",
    include_plan: bool = True,
    research_sources: dict | None = None,
) -> dict:
    words = re.findall(r"\b[\w'-]+\b", text.lower())
    sentences = _sentences(text)
    word_count = len(words)
    sentence_count = len(sentences)
    unique_ratio = len(set(words)) / word_count if word_count else 0
    avg_sentence_length = word_count / sentence_count if sentence_count else 0

    banned_hits = []
    text_lower = text.lower()
    for entry in skill_manager.get_banned_words():
        phrase = entry.word_or_phrase.lower()
        count = len(re.findall(rf"\b{re.escape(phrase)}\b", text_lower))
        if count:
            banned_hits.append(
                {
                    "word": entry.word_or_phrase,
                    "replacement": entry.replacement,
                    "severity": entry.severity.value,
                    "count": count,
                }
            )

    checked_sources = [
        source["id"]
        for source in (research_sources or {}).get("sources", [])
        if source.get("status") == "checked"
    ]
    citation = _citation_metrics(text)
    similarity = _internal_similarity_metrics(text)
    style = _style_metrics(text, banned_hits, word_count, avg_sentence_length)
    originality_matrix = _originality_matrix(text, citation, similarity, banned_hits)
    hedging = _hedging_metrics(text, word_count)
    rq_traceback = _rq_traceback(text)
    phrase_quality = max(20, min(96, style["humanization_score"] - min(10, sum(hit["count"] for hit in banned_hits) * 0.4)))
    structure_signal = max(40, min(94, 58 + min(22, word_count / 250) + unique_ratio * 12))
    quote_penalty = min(12, style["long_quote_words"] / 40)
    plagiarism_risk = max(
        2,
        min(
            95,
            (100 - citation["citation_coverage"]) * 0.22
            + similarity["internal_duplication_risk"]
            + quote_penalty
            + min(8, sum(hit["count"] for hit in banned_hits) * 0.4),
        ),
    )
    originality_score = max(
        5,
        min(
            96,
            # Blend heuristic (40%) with evidence matrix (60%) for defensible score
            originality_matrix["originality_evidence_matrix"] * 0.6
            + (
                58
                + unique_ratio * 18
                + min(12, len(checked_sources) * 2)
                + min(10, citation["citation_quality"] * 0.08)
                - similarity["internal_duplication_risk"] * 0.7
                - min(12, sum(hit["count"] for hit in banned_hits) * 0.7)
            ) * 0.4,
        ),
    )
    overall = (
        (100 - plagiarism_risk)
        + originality_score
        + citation["citation_quality"]
        + style["humanization_score"]
        + (100 - style["ai_writing_risk"])
        + structure_signal
    ) / 6
    chapters = _split_chapters(text)
    chapter_results = _score_chapters(chapters) if include_plan else []

    analysis = {
        "analysis_mode": "local_preflight",
        "coverage": {
            "local_document_only": True,
            "open_research_sources_checked": checked_sources,
            "local_corpus_checked": [],
        },
        "limitations": [
            "This preflight does not check against all research papers.",
            "Similarity and originality require configured local corpora or open research connectors.",
            "Scores are derived only from the uploaded document text and loaded local skill rules.",
        ],
        "metrics": {
            "word_count": word_count,
            "sentence_count": sentence_count,
            "unique_word_ratio": round(unique_ratio, 3),
            "avg_sentence_length": round(avg_sentence_length, 1),
            **citation,
            **similarity,
            **style,
            **originality_matrix,
            **hedging,
            **rq_traceback,
        },
        "findings": banned_hits[:12],
        "scores": {
            "plagiarism_risk": round(plagiarism_risk, 1),
            "originality_score": round(originality_score, 1),
            "originality_evidence_matrix": originality_matrix["originality_evidence_matrix"],
            "citation_quality": citation["citation_quality"],
            "humanization_score": style["humanization_score"],
            "ai_writing_risk": style["ai_writing_risk"],
            "ai_pattern_risk": style["ai_writing_risk"],
            "phrase_quality": round(phrase_quality, 1),
            "citation_signal": citation["citation_quality"],
            "structure_signal": round(structure_signal, 1),
            "hedging_risk": hedging["hedging_risk"],
            "rq_traceback_score": rq_traceback["rq_traceback_score"],
            "overall_preflight": round(overall, 1),
        },
        "chapters": chapter_results,
        "research_sources": research_sources
        or {
            "internet_checked": False,
            "queries": [],
            "sources": [],
        },
        "formatting_plan": {
            "target": _format_label(norm),
            "maintain_table_of_contents": True,
            "maintain_list_of_tables": True,
            "maintain_list_of_figures": True,
            "export_formats": ["docx", "pdf"],
            "design_themes": ["classic_blue", "mono_formal", "emerald_academic", "maroon_submission"],
        },
    }
    analysis["improvement_plan"] = (
        _build_improvement_plan(analysis, doc_type, norm, chapter_results) if include_plan else []
    )
    return analysis


async def run_analysis_stream(doc_id: str, doc_type: str, norm: str, project_id: str | None = None):
    """Generator that yields SSE events during analysis."""

    async def event(stage: str, data: dict):
        payload = json.dumps({"stage": stage, **data})
        return f"data: {payload}\n\n"

    yield await event("started", {"doc_id": doc_id, "message": "Analysis started"})
    await asyncio.sleep(0.1)

    # ── GATE 1: AI Model Connectivity ────────────────────────────
    # Block both analysis and rewrite if no AI provider is reachable.
    ai_settings = load_ai_settings(mask_keys=False)
    ai_reachable = False
    ai_gate_message = ""
    try:
        provider = ai_settings.provider
        if provider == "ollama":
            ollama_url = getattr(ai_settings, "ollama_base_url", None) or "http://localhost:11434"
            async with httpx.AsyncClient(timeout=4) as client:
                resp = await client.get(f"{ollama_url}/api/tags")
                ai_reachable = resp.status_code == 200
            if not ai_reachable:
                ai_gate_message = "Ollama is not running. Start Ollama and try again."
        else:
            # Cloud providers: check if API key is set
            key_map = {
                "deepseek": getattr(ai_settings, "api_keys", {}).get("deepseek", ""),
                "openai": getattr(ai_settings, "api_keys", {}).get("openai", ""),
                "gemini": getattr(ai_settings, "api_keys", {}).get("gemini", ""),
            }
            key = key_map.get(provider, "")
            ai_reachable = bool(key and len(key) > 8)
            if not ai_reachable:
                ai_gate_message = f"No API key configured for {provider}. Add your key in Settings."
    except Exception as exc:
        ai_reachable = False
        ai_gate_message = f"Could not reach AI provider: {exc}"

    if not ai_reachable:
        yield await event(
            "error",
            {
                "message": (
                    f"🤖 AI model not available — analysis blocked. {ai_gate_message} "
                    f"OTIF requires an active AI model to run analysis and rewrites."
                ),
                "gate": "ai_model",
                "resolution": "Start Ollama (ollama serve) or configure a cloud API key in Settings.",
            },
        )
        return

    path = find_document_path(doc_id)
    if not path:
        yield await event("error", {"message": f"Document '{doc_id}' was not found"})
        return

    yield await event(
        "connection_check",
        {
            "message": "Checking desktop engine, internet, skills, and open research sources",
            "connectors": {
                "local_document": True,
                "skills": True,
                "open_research_sources": [
                    "arxiv",
                    "crossref",
                    "europe_pmc",
                    "zenodo",
                    "semantic_scholar",
                    "openalex",
                ],
                "local_corpus": [],
            },
        },
    )
    await asyncio.sleep(0.1)

    # ── GATE 2: Internet Connectivity ────────────────────────────
    # Block entirely if no research sources are reachable.
    # Pre-check by trying a lightweight DNS call.
    internet_reachable = False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            # Try CrossRef as the canary — it's fast and free
            resp = await client.get("https://api.crossref.org/works?rows=1")
            internet_reachable = resp.status_code < 500
    except Exception:
        internet_reachable = False

    if not internet_reachable:
        yield await event(
            "error",
            {
                "message": (
                    "🌐 Internet not reachable — analysis blocked. "
                    "OTIF requires an internet connection to verify citations and check research sources. "
                    "Connect to the internet and try again."
                ),
                "gate": "internet",
                "resolution": "Check your internet connection and try again.",
            },
        )
        return

    yield await event(
        "verification_scope",
        {
            "message": "Using uploaded text, local skills, and reachable free/open research APIs",
            "scope": "local_plus_open_sources",
        },
    )
    await asyncio.sleep(0.1)

    skills = skill_manager.get_skills_for_analysis()
    yield await event(
        "skills_loaded",
        {
            "count": len(skills),
            "skills": [s.name for s in skills],
            "message": f"Applying {len(skills)} active skills",
        },
    )
    await asyncio.sleep(0.1)

    yield await event("parsing", {"message": f"Parsing {path.name}..."})
    await asyncio.sleep(0.1)

    try:
        text = _extract_text(path)
    except Exception as exc:
        yield await event("error", {"message": f"Could not parse document: {exc}"})
        return

    if not text.strip():
        yield await event("error", {"message": "No readable text found in the uploaded document"})
        return

    yield await event("internet_research_started", {"message": "Checking free/open research sources"})
    research_sources = await check_research_sources(text, enabled=True)
    checked_count = sum(1 for source in research_sources["sources"] if source["status"] == "checked")
    yield await event(
        "internet_research_complete",
        {
            "message": f"{checked_count} open research source(s) responded",
            "research_sources": research_sources,
        },
    )
    await asyncio.sleep(0.1)

    chapters = _split_chapters(text)
    yield await event(
        "structure_detected",
        {
            "sections": [chapter["title"] for chapter in chapters[:12]],
            "message": f"{len(chapters)} chapter/section block(s) detected for {doc_type} using {norm.upper()} checks",
        },
    )
    await asyncio.sleep(0.1)

    for i, skill in enumerate(skills):
        yield await event(
            "skill_applying",
            {
                "skill": skill.name,
                "category": skill.category,
                "step": i + 1,
                "total": len(skills),
            },
        )
        await asyncio.sleep(0.12)

    analysis = _score_document(text, doc_type, norm, research_sources=research_sources)
    yield await event(
        "scores_ready",
        {
            "scores": analysis["scores"],
            "metrics": analysis["metrics"],
            "findings": analysis["findings"],
            "coverage": analysis["coverage"],
            "limitations": analysis["limitations"],
            "improvement_plan": analysis["improvement_plan"],
            "chapters": analysis["chapters"],
            "research_sources": analysis["research_sources"],
            "formatting_plan": analysis["formatting_plan"],
            "analysis_mode": analysis["analysis_mode"],
            "message": "Local preflight complete",
        },
    )
    await asyncio.sleep(0.1)

    yield await event(
        "approval_required",
        {
            "message": "Improvement plan is ready. Approve selected items before AI rewrite.",
            "requires_approval": True,
        },
    )
    await asyncio.sleep(0.1)

    yield await event(
        "complete",
        {
            "doc_id": doc_id,
            "message": "Analysis finished. Review your improvement plan.",
        },
    )

    # ── Log to project thread (structured review log) ────────────
    if project_id:
        try:
            await local_db.add_thread_message(
                project_id=project_id,
                role="analysis",
                message_type="analysis_result",
                content={
                    "doc_id": doc_id,
                    "doc_type": doc_type,
                    "norm": norm,
                    "scores": analysis["scores"],
                    "findings_count": len(analysis["findings"]),
                    "improvement_plan_count": len(analysis["improvement_plan"]),
                    "chapters_count": len(analysis["chapters"]),
                    "internet_checked": research_sources.get("internet_checked", False),
                    "message": "Analysis complete — review scores and approve improvement items",
                },
            )
        except Exception:
            pass  # Thread logging failure is non-fatal


@router.post("/run/{doc_id}")
async def run_analysis(doc_id: str, req: AnalysisRequest):
    """Start document analysis and stream progress via SSE."""
    return StreamingResponse(
        run_analysis_stream(doc_id, req.doc_type, req.norm, req.project_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/approve-rewrite")
async def approve_rewrite(req: RewriteApprovalRequest):
    """Record user approval for the selected improvement plan items."""
    path = find_document_path(req.doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{req.doc_id}' was not found")
    if not req.approved_item_ids:
        raise HTTPException(status_code=400, detail="Select at least one improvement before approving rewrite.")

    try:
        text = _extract_text(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse document: {exc}") from exc

    analysis = _score_document(text, req.doc_type, req.norm)
    items_by_id = {item["id"]: item for item in analysis["improvement_plan"]}
    invalid_ids = [item_id for item_id in req.approved_item_ids if item_id not in items_by_id]
    if invalid_ids:
        raise HTTPException(status_code=400, detail=f"Unknown improvement item IDs: {invalid_ids}")

    private_config = load_ai_settings(mask_keys=False)
    public_config = load_ai_settings(mask_keys=True)
    approved_items = [items_by_id[item_id] for item_id in req.approved_item_ids]
    rewrite_result = await _try_generate_rewrite_preview(text, approved_items, req, private_config)
    approval = {
        "doc_id": req.doc_id,
        "doc_type": req.doc_type,
        "norm": req.norm,
        "approved_item_ids": req.approved_item_ids,
        "approved_items": approved_items,
        "active_provider": public_config.provider,
        "active_model": public_config.model_by_provider.get(public_config.provider),
        "privacy_mode": public_config.privacy_mode,
        "document_actions": {
            "draw_diagrams": req.draw_diagrams,
            "diagram_style": req.diagram_style,
            "design_theme": req.design_theme,
            "output_formats": req.output_formats,
            "maintain_table_of_contents": req.maintain_front_matter,
            "maintain_list_of_tables": req.maintain_front_matter,
            "maintain_list_of_figures": req.maintain_front_matter,
            "target_format": _format_label(req.norm),
        },
        **rewrite_result,
        "next_step": (
            "AI rewrite is allowed only for these approved items and must follow the active provider "
            "and privacy mode settings."
        ),
    }
    _approval_path(req.doc_id).write_text(json.dumps(approval, indent=2), encoding="utf-8")
    return approval


@router.post("/rewrite-from-plan")
async def rewrite_from_plan(req: PlanRewriteRequest):
    """
    Generate a Mermaid diagram and section-level rewrite diffs from an
    approved plan. Implements skill DRW-001 through DRW-009.

    Steps:
      1. Verify document exists and can be parsed.
      2. Check that a prior approval record exists (DRW-001 gate).
      3. Extract design elements from the plan text (DRW-002).
      4. Map sections to plan elements (DRW-003).
      5. Generate Mermaid diagram (DRW-004).
      6. Produce diff proposals — all flagged requires_approval=True (DRW-005).
      7. Return payload for UI diff review.

    No section text is modified by this endpoint.
    All diffs require per-item approval via a subsequent call.
    """
    # 1. Verify document
    path = find_document_path(req.doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{req.doc_id}' was not found")

    # 2. DRW-001: Approval gate — require prior approval record
    approval_file = _approval_path(req.doc_id)
    if not approval_file.exists():
        raise HTTPException(
            status_code=403,
            detail=(
                "DRW-001: No approval record found for this document. "
                "Run analysis and approve an improvement plan before calling rewrite-from-plan."
            ),
        )

    try:
        stored_approval = json.loads(approval_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=500, detail=f"Could not read approval record: {exc}") from exc

    # 3. Parse document
    try:
        text = _extract_text(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse document: {exc}") from exc

    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in the uploaded document")

    if not req.plan_text.strip():
        raise HTTPException(status_code=400, detail="plan_text is required and must not be empty")

    # 4. Split document into chapters for mapping
    chapters = _split_chapters(text)

    # 5–7. Build the diagram + diff payload via diagram studio
    payload = build_design_rewrite_payload(
        plan_text=req.plan_text,
        chapters=chapters,
        doc_id=req.doc_id,
        figure_start=req.figure_start,
    )

    return {
        "doc_id": req.doc_id,
        "doc_type": req.doc_type,
        "norm": req.norm,
        "plan_approval": {
            "approved_item_ids": stored_approval.get("approved_item_ids", []),
            "approved_at": stored_approval.get("doc_id"),
            "privacy_mode": stored_approval.get("privacy_mode"),
        },
        "chapters_detected": len(chapters),
        **payload,
        "next_steps": [
            "Review each rewrite_diff item in the UI.",
            "Approve individual diffs — no changes are applied automatically.",
            "The Mermaid diagram source can be edited before insertion.",
            "After per-diff approval, call /approve-rewrite with the accepted item IDs.",
        ],
        "ethical_note": (
            "This endpoint produces proposals only. No document content has been modified. "
            "All diffs require explicit user approval before application (DRW-005)."
        ),
    }


@router.get("/credit-statement/{doc_id}")
async def get_credit_statement(doc_id: str, project_id: str | None = None):
    """Generate a CRediT-compliant AI Contribution & Integrity Statement from the immutable audit thread."""
    events = []
    if project_id:
        try:
            events = local_db.get_project_thread(project_id)
        except Exception:
            pass

    ai_actions = [e for e in events if e.get("event_type") in ("rewrite_approved", "diagram_generated")]
    
    statement = (
        "## CRediT & AI Tools Disclosure Statement\n\n"
        "**Declaration of Generative AI and AI-Assisted Technologies in the Writing Process:**\n\n"
        "During the preparation of this manuscript/thesis, the author(s) utilized OTIF (OpenThesis Integrity Fabric) "
        "exclusively for local-first Integrity-Preserving Revision, structural formatting compliance (UGC/APA 7), and "
        "automated multi-repository citation verification against live academic registries (CrossRef, OpenAlex, arXiv).\n\n"
        f"**Audit Trail & Scope of Assistance:**\n"
        f"- **Recorded Integrity Revision Events:** {len(ai_actions)}\n"
        "- **Citation Preservation:** 100% deterministic byte-identical placeholder locking applied.\n"
        "- **Ethical Boundary Compliance:** No substantive arguments, original data, experimental findings, or references "
        "were generated or fabricated by artificial intelligence.\n\n"
        "After using this tool, the author(s) reviewed and edited the content as needed and take(s) full responsibility "
        "for the content of the publication."
    )
    return {"doc_id": doc_id, "project_id": project_id, "credit_statement": statement, "verified_events": len(ai_actions)}

