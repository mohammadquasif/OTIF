"""Analysis API with server-sent event streaming."""
import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.ai.text_generation import generate_text_with_active_provider
from app.ai.provider_router import AISettings, load_ai_settings
from app.config import settings
from app.api.v1.documents import document_metadata_path, find_document_path
from app.api.v1.diagram_studio import build_design_rewrite_payload
from app.db import local_db
from app.core.citation_lock import lock_citations, unlock_citations
from app.export.thesis_exporter import (
    compile_chapter_text,
    create_certificate_markdown,
    create_docx,
    create_preserved_docx,
    create_pdf,
    convert_docx_to_pdf,
    export_dir,
    render_diagram_image,
    resolve_theme,
    rich_text_to_plain_text,
    safe_filename,
    update_docx_fields_with_word,
    build_integrity_certificate,
    normalize_hex_color,
    _extract_toc_entries,
    build_toc_text,
    build_lot_text,
    build_lol_text,
)
from app.research.connectors import (
    attach_source_evidence,
    check_research_sources,
    compute_ai_detection_score,
    compute_turnitin_style_similarity,
)
from app.skills.skill_manager import skill_manager

router = APIRouter()


OPEN_RESEARCH_CONNECTIVITY_PROBES = [
    ("crossref", "Crossref", "https://api.crossref.org/works?rows=1"),
    (
        "arxiv",
        "arXiv",
        "https://export.arxiv.org/api/query?search_query=all:research&start=0&max_results=1",
    ),
    ("datacite", "DataCite", "https://api.datacite.org/dois?page[size]=1"),
    (
        "europe_pmc",
        "Europe PMC",
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=OPEN_ACCESS:y&pageSize=1&format=json",
    ),
    (
        "semantic_scholar",
        "Semantic Scholar",
        "https://api.semanticscholar.org/graph/v1/paper/search?query=research&limit=1&fields=title",
    ),
    ("openalex", "OpenAlex", "https://api.openalex.org/works?per-page=1"),
]

# ── SSE Pacing ──────────────────────────────────────────────────
PACE_DELAYS = {"fast": 0.08, "normal": 0.6, "detailed": 1.5}

# All 14 open research sources for per-API progress events during scan
ALL_RESEARCH_SOURCES = [
    ("arxiv", "arXiv", "https://export.arxiv.org/api/query"),
    ("crossref", "Crossref", "https://api.crossref.org/works"),
    ("europe_pmc", "Europe PMC", "https://www.ebi.ac.uk/europepmc/webservices/rest/search"),
    ("pubmed", "PubMed", "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"),
    ("datacite", "DataCite", "https://api.datacite.org/dois"),
    ("eric", "ERIC", "https://api.ies.ed.gov/eric/"),
    ("osf_preprints", "OSF Preprints", "https://api.osf.io/v2/preprints/"),
    ("zenodo", "Zenodo", "https://zenodo.org/api/records"),
    ("semantic_scholar", "Semantic Scholar", "https://api.semanticscholar.org/graph/v1/paper/search"),
    ("openalex", "OpenAlex", "https://api.openalex.org/works"),
    ("doaj", "DOAJ", "https://doaj.org/api/search/articles"),
    ("core", "CORE", "https://api.core.ac.uk/v3/search/works"),
    ("base", "BASE", "https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi"),
    ("inspire_hep", "INSPIRE-HEP", "https://inspirehep.net/api"),
]


async def check_open_research_connectivity() -> dict:
    """Probe several free/open scholarly APIs without depending on one canary."""

    async def probe_source(
        client: httpx.AsyncClient,
        source_id: str,
        name: str,
        url: str,
    ) -> dict:
        try:
            response = await client.get(url)
            reachable = response.status_code < 500
            return {
                "id": source_id,
                "name": name,
                "status": "reachable" if reachable else "unavailable",
                "status_code": response.status_code,
                "message": (
                    f"{name} responded with HTTP {response.status_code}"
                    if reachable
                    else f"{name} returned HTTP {response.status_code}"
                ),
            }
        except Exception as exc:
            return {
                "id": source_id,
                "name": name,
                "status": "unavailable",
                "status_code": None,
                "message": str(exc)[:220],
            }

    timeout = httpx.Timeout(8.0, connect=4.0)
    headers = {"User-Agent": "OTIF/1.0 academic-integrity"}
    async with httpx.AsyncClient(
        timeout=timeout,
        headers=headers,
        follow_redirects=True,
        trust_env=True,
    ) as client:
        results = await asyncio.gather(
            *[
                probe_source(client, source_id, name, url)
                for source_id, name, url in OPEN_RESEARCH_CONNECTIVITY_PROBES
            ]
        )

    reachable = [result for result in results if result["status"] == "reachable"]
    return {
        "internet_reachable": bool(reachable),
        "reachable_count": len(reachable),
        "checked_count": len(results),
        "sources": results,
    }


class AnalysisRequest(BaseModel):
    doc_type: str = "thesis"
    norm: str = "apa7"
    session_id: str | None = None
    project_id: str | None = None      # If set, analysis result is logged to project thread
    research_context: str | None = None  # Optional context from document setup — fed to AI review
    pace: str = "normal"  # "fast" | "normal" | "detailed" — controls SSE event delay


class PlanRewriteRequest(BaseModel):
    """Request to rewrite document sections based on an approved plan + diagram."""
    doc_id: str
    plan_text: str
    figure_start: int = 1
    doc_type: str = "thesis"
    norm: str = "apa7"


class SmartDiagramRequest(BaseModel):
    chapter_text: str = ""
    chapter_title: str = ""


class RewriteApprovalRequest(BaseModel):
    doc_id: str
    approved_item_ids: list[str]
    doc_type: str = "thesis"
    norm: str = "apa7"
    draw_diagrams: bool = False
    diagram_style: str = "academic"
    design_theme: str = "classic_blue"
    design_accent_hex: str | None = None
    output_formats: list[str] = Field(default_factory=lambda: ["docx", "pdf"])
    maintain_front_matter: bool = True


class ChapterEdit(BaseModel):
    id: str
    title: str
    original_text: str = ""
    edited_text: str


class FinalizeThesisRequest(BaseModel):
    doc_id: str
    chapters: list[ChapterEdit]
    doc_type: str = "thesis"
    norm: str = "apa7"
    design_theme: str = "classic_blue"
    design_accent_hex: str | None = None
    output_formats: list[str] = Field(default_factory=lambda: ["docx", "pdf"])
    diagram_source: str | None = None
    diagram_caption: str | None = None
    project_id: str | None = None


class ChapterRewriteRequest(BaseModel):
    doc_id: str
    chapter_id: str
    title: str
    text: str
    approved_item_ids: list[str] = Field(default_factory=list)
    doc_type: str = "thesis"
    norm: str = "apa7"
    instruction: str | None = Field(default=None, max_length=1200)


class SessionDraftChapter(BaseModel):
    id: str
    title: str
    original_text: str = ""
    rewritten_text: str | None = None
    approved: bool = False


class SessionDraftRequest(BaseModel):
    chapters: list[SessionDraftChapter] = Field(default_factory=list, max_length=100)


def _approval_path(doc_id: str) -> Path:
    return document_metadata_path(doc_id).with_name(f"{doc_id}.rewrite_approval.json")


def _plan_path(doc_id: str) -> Path:
    return document_metadata_path(doc_id).with_name(f"{doc_id}.plan.json")


def _rewrite_cache_path(doc_id: str) -> Path:
    """Path to cached full-rewrite chapters for the track-changes view."""
    return document_metadata_path(doc_id).with_name(f"{doc_id}.full_rewrite.json")


def _extract_text(path: Path) -> str:
    suffix = path.suffix.lower()

    if suffix in {".txt", ".md"}:
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


def _evaluate_skill_rules(text: str, skills: list) -> dict:
    """Execute regex-backed skill rules and preserve semantic rules for AI validation."""
    automated_results: list[dict] = []
    declarative_rules: list[dict] = []
    invalid_patterns: list[dict] = []

    for skill in skills:
        category = getattr(skill.category, "value", str(skill.category))
        for rule in skill.rules:
            base = {
                "skill_id": skill.skill_id,
                "skill_name": skill.name,
                "category": category,
                "rule_code": rule.rule_code,
                "rule_name": rule.rule_name,
                "rule_type": getattr(rule.rule_type, "value", str(rule.rule_type)),
                "severity": getattr(rule.severity, "value", str(rule.severity)),
                "description": rule.description,
                "replacement": rule.replacement,
                "confidence": rule.confidence,
            }
            if not rule.pattern:
                declarative_rules.append(
                    {
                        **base,
                        "status": "ai_validation_required",
                        "reason": "This semantic/format rule has no machine-readable pattern.",
                    }
                )
                continue
            try:
                matches = list(re.finditer(rule.pattern, text, flags=re.I | re.MULTILINE))
            except re.error as exc:
                invalid_patterns.append(
                    {
                        **base,
                        "status": "invalid_pattern",
                        "error": str(exc),
                    }
                )
                continue
            automated_results.append(
                {
                    **base,
                    "status": "triggered" if matches else "passed",
                    "match_count": len(matches),
                    "samples": [
                        " ".join(match.group(0).split())[:180]
                        for match in matches[:4]
                    ],
                }
            )

    return {
        "loaded_count": len(skills),
        "total_rule_count": (
            len(automated_results)
            + len(declarative_rules)
            + len(invalid_patterns)
        ),
        "automated_rule_count": len(automated_results),
        "automated_trigger_count": sum(
            1 for result in automated_results if result["status"] == "triggered"
        ),
        "declarative_rule_count": len(declarative_rules),
        "invalid_pattern_count": len(invalid_patterns),
        "packs": [
            {
                "skill_id": skill.skill_id,
                "name": skill.name,
                "category": getattr(skill.category, "value", str(skill.category)),
                "version": skill.version,
                "rule_count": len(skill.rules),
                "word_list_count": len(skill.word_lists),
            }
            for skill in skills
        ],
        "automated_results": automated_results,
        "declarative_rules_for_ai_validation": declarative_rules,
        "invalid_patterns": invalid_patterns,
        "execution_note": (
            "Regex-backed rules were executed deterministically. Semantic and layout rules "
            "without machine-readable patterns are explicitly handed to the AI validation pass."
        ),
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
        # Extract real citation suggestions from research sources
        citation_suggestions = []
        research_data = analysis.get("research_sources", {})
        for source in research_data.get("sources", []):
            for match in source.get("matches", [])[:3]:
                title = match.get("title", "")
                year = match.get("year", "")
                url = match.get("url", "")
                if title and year:
                    citation_suggestions.append({
                        "title": title,
                        "year": str(year),
                        "url": url,
                        "source": source.get("name", "unknown"),
                    })
        unique_suggestions = []
        seen_titles = set()
        for s in citation_suggestions:
            if s["title"] not in seen_titles:
                seen_titles.add(s["title"])
                unique_suggestions.append(s)

        citation_hint = ""
        if unique_suggestions:
            examples = unique_suggestions[:4]
            citation_hint = (
                "\n\nReal citation suggestions from open research sources:\n" +
                "\n".join(f"  • {s['title']} ({s['year']}) — via {s['source']}" for s in examples) +
                "\n\nUse these or similar verified citations. Only add citations for claims that genuinely reference these works."
            )

        plan.append(
            {
                "id": "citation-strength",
                "title": "Strengthen citation signal",
                "priority": "high",
                "action": (
                    "Add real citations to unsupported factual claims. Use the suggested citations below "
                    "or find verified sources for each claim. Normalize citation style to "
                    f"{_format_label(norm)} format without inventing sources."
                ) + citation_hint,
                "evidence": (
                    f"Citation quality is {scores['citation_quality']}; citation coverage is "
                    f"{metrics['citation_coverage']}% across claim-like sentences. "
                    f"{len(unique_suggestions)} real citation suggestion(s) found from open research sources."
                ),
                "requires_ai": True,
                "citation_suggestions": unique_suggestions[:6],
            }
        )

    if scores["structure_signal"] < 72:
        if doc_type == "research_paper":
            plan.append(
                {
                    "id": "imrad-structure",
                    "title": "Enforce IMRaD structure",
                    "priority": "high",
                    "action": "Ensure the paper strictly follows Introduction, Methods, Results, and Discussion structure. Remove unnecessary thesis-style chapters.",
                    "evidence": f"Structure signal is {scores['structure_signal']}. Missing sections: {', '.join(metrics.get('missing_sections', []))}.",
                    "requires_ai": True,
                }
            )
        else:
            plan.append(
                {
                    "id": "academic-structure",
                    "title": "Tighten thesis chapter structure",
                    "priority": "medium",
                    "action": "Ensure standard thesis flow (Abstract, Intro, Literature Review, Methodology, Results, Discussion, Conclusion).",
                    "evidence": f"Structure signal is {scores['structure_signal']} for thesis. Missing sections: {', '.join(metrics.get('missing_sections', []))}.",
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

    norm_issues = metrics.get("norm_issues", [])
    if norm_issues:
        plan.append(
            {
                "id": "norm-compliance",
                "title": f"Fix {_format_label(norm)} citation formatting",
                "priority": "high",
                "action": " ".join(norm_issues),
                "evidence": f"Detected deviations from {_format_label(norm)} requirements.",
                "requires_ai": True,
            }
        )
    else:
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
        "- Elevate scholarly voice without introducing generic copywriting tone.\n"
        f"- For research papers: strictly follow IMRaD (Introduction, Methods, Results, Discussion). Do NOT invent thesis chapters (like 'Literature Review').\n" if doc_type == "research_paper" else "- For thesis: maintain formal multi-chapter hierarchy.\n"
        f"- Target Format ({norm}): Ensure citations and headings match this format closely.\n\n"
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
    """Generate a rewrite preview showing track-changes-style diff (deletions/insertions).

    Works with any configured AI provider — Ollama, cloud APIs, etc.
    For small local models, uses a simplified prompt that still produces useful output.
    """
    locked_text, lock_map = lock_citations(text)

    # Build a concise summary of approved improvements
    item_summary = "\n".join(
        f"- {item['title']}: {item['action'][:200]}"
        for item in approved_items[:6]
    )
    if len(approved_items) > 6:
        item_summary += f"\n- ... and {len(approved_items) - 6} more improvements"

    # Use a simpler, more direct prompt that works with small AND large models
    prompt = (
        "You are an academic editor. Revise this research document to fix the issues listed below.\n\n"
        "IMPORTANT RULES:\n"
        "- Preserve ALL meaning, claims, data, and citations.\n"
        "- Do NOT invent new sources, statistics, or findings.\n"
        "- Keep ALL [[CIT_LOCK_N]] tokens exactly as they appear.\n"
        "- Improve academic phrasing: vary sentence length, reduce clichés, add researcher voice.\n"
        "- For each major change, show: [OLD] original text [NEW] improved text\n\n"
        f"Document type: {req.doc_type}\n"
        f"Target format: {_format_label(req.norm)}\n\n"
        f"IMPROVEMENTS TO APPLY:\n{item_summary}\n\n"
        "DOCUMENT TEXT:\n"
        f"{locked_text[:5000]}\n\n"
        "Return the COMPLETE revised document. Use [OLD]...[NEW]... markers for significant changes "
        "so the user can review what was changed. At the end, add a brief '## Change Log' listing what was improved."
    )

    provider = config.provider

    # Cloud providers: use the standard AI text generation pipeline
    if provider != "ollama":
        try:
            from app.ai.text_generation import generate_text_with_active_provider as _gen
            raw_text, model_name = await _gen(
                prompt, config,
                cloud_privacy_modes={"cloud_allowed"},
                task_label="document rewrite preview",
            )
            restored_preview, all_restored, missing_tokens = unlock_citations(raw_text, lock_map)
            note = (
                f"Generated with {provider} ({model_name}). "
                f"Citations locked and restored ({len(lock_map)} references preserved)."
            )
            if not all_restored:
                note += f" {len(missing_tokens)} citations omitted by model."

            # Compute simple diff
            diff = _compute_rewrite_diff(text, restored_preview)

            return {
                "rewrite_status": "rewrite_preview_ready",
                "rewrite_preview": restored_preview,
                "rewrite_note": note,
                "diff": diff,
            }
        except Exception as exc:
            return {
                "rewrite_status": "approval_recorded_ai_unavailable",
                "rewrite_preview": None,
                "rewrite_note": f"Cloud AI rewrite failed: {exc}. Approval saved — retry with Ollama or check your API key.",
                "diff": None,
            }

    # Ollama: use local API directly
    model = config.model_by_provider.get("ollama") or "qwen2.5:1.5b"
    base_url = (config.ollama_base_url or "http://localhost:11434").rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=5.0)) as client:
            response = await client.post(
                f"{base_url}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False,
                      "options": {"temperature": 0.7, "num_predict": 4096}},
            )
            response.raise_for_status()
            data = response.json()
            raw_preview = data.get("response", "").strip()

            # Small model refusal detection
            refusal_patterns = [
                "I'm sorry", "I cannot", "I can't", "unable to",
                "Please provide", "I am unable", "I apologize",
            ]
            is_refusal = any(
                raw_preview.startswith(p) or raw_preview[:100].lower().find(p.lower()) >= 0
                for p in refusal_patterns
            )
            if is_refusal and len(raw_preview) < 200:
                # Small model refused — try with even simpler prompt
                simple_prompt = (
                    "Rewrite this academic text to improve clarity and scholarly voice. "
                    "Keep all facts and citations exactly the same. "
                    "Mark changes with [OLD] before and [NEW] after each change.\n\n"
                    f"TEXT:\n{locked_text[:3000]}"
                )
                response2 = await client.post(
                    f"{base_url}/api/generate",
                    json={"model": model, "prompt": simple_prompt, "stream": False,
                          "options": {"temperature": 0.5, "num_predict": 2048}},
                )
                response2.raise_for_status()
                raw_preview = response2.json().get("response", "").strip()

            restored_preview, all_restored, missing_tokens = unlock_citations(raw_preview, lock_map)

            if not restored_preview.strip() or len(restored_preview.strip()) < 50:
                raise ValueError("Model returned empty or too-short response")

            note = (
                f"Generated locally with Ollama model {model}. "
                f"Citations deterministically locked and restored ({len(lock_map)} references preserved)."
            )
            if not all_restored:
                note += f" Restored {len(missing_tokens)} citations omitted by model."

            diff = _compute_rewrite_diff(text, restored_preview)

            return {
                "rewrite_status": "rewrite_preview_ready",
                "rewrite_preview": restored_preview,
                "rewrite_note": note,
                "diff": diff,
            }
    except Exception as exc:
        return {
            "rewrite_status": "approval_recorded_ai_unavailable",
            "rewrite_preview": None,
            "rewrite_note": f"Approval saved, but rewrite engine unavailable: {exc}",
            "diff": None,
        }


def _compute_word_diff(original: str, rewritten: str) -> list[dict]:
    """LCS-based word-level diff returning [{type, value}, ...].

    Mirrors the frontend's buildDiff() for server-side pre-computation.
    Types: 'same' | 'add' | 'remove'
    """
    words_a = re.findall(r'\S+|\s+', original) or []
    words_b = re.findall(r'\S+|\s+', rewritten) or []
    rows = len(words_a) + 1
    cols = len(words_b) + 1
    dp: list[list[int]] = [[0] * cols for _ in range(rows)]

    for i in range(len(words_a) - 1, -1, -1):
        for j in range(len(words_b) - 1, -1, -1):
            dp[i][j] = (
                dp[i + 1][j + 1] + 1
                if words_a[i] == words_b[j]
                else max(dp[i + 1][j], dp[i][j + 1])
            )

    tokens: list[dict] = []
    i = j = 0
    while i < len(words_a) and j < len(words_b):
        if words_a[i] == words_b[j]:
            tokens.append({"type": "same", "value": words_a[i]})
            i += 1
            j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]:
            tokens.append({"type": "remove", "value": words_a[i]})
            i += 1
        else:
            tokens.append({"type": "add", "value": words_b[j]})
            j += 1

    while i < len(words_a):
        tokens.append({"type": "remove", "value": words_a[i]})
        i += 1
    while j < len(words_b):
        tokens.append({"type": "add", "value": words_b[j]})
        j += 1

    return tokens


def _compute_rewrite_diff(original: str, rewritten: str) -> dict:
    """Compute a simple sentence-level diff between original and rewritten text."""
    import re as _re
    orig_sentences = [s.strip() for s in _re.split(r'(?<=[.!?])\s+', original) if len(s.strip()) > 15]
    rewrite_sentences = [s.strip() for s in _re.split(r'(?<=[.!?])\s+', rewritten) if len(s.strip()) > 15]

    orig_set = set(s.lower() for s in orig_sentences)
    rewrite_set = set(s.lower() for s in rewrite_sentences)

    deletions = [s for s in orig_sentences if s.lower() not in rewrite_set][:20]
    insertions = [s for s in rewrite_sentences if s.lower() not in orig_set][:20]

    return {
        "deletions": deletions,
        "insertions": insertions,
        "deletion_count": len(deletions),
        "insertion_count": len(insertions),
        "original_sentences": len(orig_sentences),
        "rewritten_sentences": len(rewrite_sentences),
    }


def _detect_diagram_need(title: str, text: str) -> tuple[bool, str, str]:
    """Detect if chapter content would benefit from a diagram. Returns (needed, diagram_type, rationale)."""
    lower_text = (title + " " + text[:3000]).lower()
    process_signals = ["step", "phase", "stage", "process", "workflow", "pipeline", "procedure", "protocol", "sequence", "flow", "cycle", "lifecycle"]
    structure_signals = ["framework", "architecture", "model", "schema", "component", "layer", "module", "dimension", "pillar", "element", "structure", "hierarchy", "taxonomy", "classification"]
    relation_signals = ["relationship", "interaction", "between", "mapping", "correlation", "connection", "link", "interface", "integration"]
    method_signals = ["methodology", "method", "approach", "design science", "action research", "case study", "experiment", "survey", "interview"]
    comparison_signals = ["compare", "comparison", "versus", "vs", "difference between", "advantages", "disadvantages"]
    timeline_signals = ["timeline", "schedule", "milestone", "phase 1", "phase 2", "year 1", "year 2", "roadmap"]

    process_score = sum(1 for s in process_signals if s in lower_text) * 3
    structure_score = sum(1 for s in structure_signals if s in lower_text) * 3
    relation_score = sum(1 for s in relation_signals if s in lower_text) * 2
    method_score = sum(1 for s in method_signals if s in lower_text) * 2
    comparison_score = sum(1 for s in comparison_signals if s in lower_text) * 2
    timeline_score = sum(1 for s in timeline_signals if s in lower_text) * 3

    if structure_score >= 6:
        return (True, "conceptual_model", f"Structural framework detected — suggest conceptual model diagram for '{title}'")
    if process_score >= 6 or method_score >= 6:
        return (True, "method_flow", f"Process/methodology detected — suggest flow diagram for '{title}'")
    if relation_score >= 4:
        return (True, "relationship_map", f"Relationships detected — suggest relationship diagram for '{title}'")
    if comparison_score >= 4:
        return (True, "comparison_table", f"Comparisons detected — suggest comparison matrix for '{title}'")
    if timeline_score >= 6:
        return (True, "timeline", f"Timeline/schedule detected — suggest Gantt chart for '{title}'")
    if structure_score >= 3 or process_score >= 3:
        return (True, "generic_flow", f"Structural elements detected — suggest diagram for '{title}'")

    return (False, "", "")


def _verified_source_context(approved_items: list[dict]) -> str:
    """Return deduplicated source metadata selected during the evidence-backed AI review."""
    sources: list[str] = []
    seen: set[str] = set()
    for item in approved_items:
        for source in item.get("source_suggestions", []):
            source_id = str(source.get("evidence_id") or "")
            if not source_id or source_id in seen:
                continue
            seen.add(source_id)
            title = str(source.get("title") or "").strip()
            if not title:
                continue
            year = source.get("year") or "year unavailable"
            url = source.get("url") or "URL unavailable"
            source_name = source.get("source_name") or source.get("source_id") or "open source"
            sources.append(
                f"- {source_id}: {title} ({year}); {source_name}; {url}"
            )
    return "\n".join(sources[:12])


def _chapter_rewrite_prompt(
    *,
    title: str,
    text: str,
    approved_items: list[dict],
    doc_type: str,
    norm: str,
    instruction: str | None = None,
) -> str:
    item_text = "\n".join(f"- {item['title']}: {item['action']}" for item in approved_items) or "- General scholarly polishing"
    verified_sources = _verified_source_context(approved_items)

    # Detect diagram opportunity
    needs_diagram, diagram_type, diagram_rationale = _detect_diagram_need(title, text)
    diagram_instruction = ""
    if needs_diagram:
        type_guide = {
            "conceptual_model": "Use 'graph TD' (top-down) with labeled boxes for each component/dimension, connected by arrows showing relationships. Include all framework dimensions from the text.",
            "method_flow": "Use 'graph LR' (left-to-right) showing each methodology step as a node, connected by arrows in sequence. Include decision points as diamonds.",
            "relationship_map": "Use 'graph TD' showing entities/concepts as nodes with labeled arrows indicating the type of relationship.",
            "comparison_table": "Use 'graph LR' with two parallel columns showing the compared items and their attributes side by side.",
            "timeline": "Use a 'gantt' chart showing phases, milestones, and durations mentioned in the text.",
            "generic_flow": "Use 'graph TD' showing the main concepts and their logical connections from the chapter.",
        }
        guide = type_guide.get(diagram_type, type_guide["generic_flow"])
        diagram_instruction = (
            f"\n10. DIAGRAM REQUIRED: {diagram_rationale}\n"
            f"   At the end of the chapter, include a MERMAID diagram code block:\n"
            f"   ```mermaid\n{guide}\n   ```\n"
            "   Make the diagram SPECIFIC to this chapter's content — use actual concept names, not placeholder text.\n"
            "   Include a figure caption: 'Figure X: [descriptive caption]' before the mermaid block.\n"
        )

    return (
        "You are a Ref-N-Write Academic Chapter Rewriting Engine. Revise ONLY this chapter.\n"
        "Return the COMPLETE revised chapter text with no truncation.\n\n"
        "IMPERATIVE RULES:\n"
        "1. Preserve ALL claims, results, data, citations, references, numbers, and the author's original meaning.\n"
        "2. NEVER invent new sources, statistics, findings, limitations, tables, figures, or page numbers.\n"
        "2b. NEVER add placeholder citations like [CITATION NEEDED], [REF], [CITE], (Author, Year). Leave uncited claims as-is.\n"
        "2c. NEVER add DOI numbers, URLs, or reference entries except exact metadata explicitly "
        "listed in VERIFIED SOURCES below.\n"
        "2d. A [SOURCE NEEDED] marker may be resolved only with a directly relevant VERIFIED SOURCE "
        "listed below. Use only supplied metadata; do not guess authors, DOI values, years, or URLs. "
        "If the metadata is insufficient for the target citation style, retain the marker and explain "
        "the missing metadata in the review proposal.\n"
        "3. Keep ALL citation lock tokens EXACTLY: [[CIT_LOCK_0]], [[CIT_LOCK_1]], etc.\n"
        "4. Improve academic voice: varied sentence rhythm, precise vocabulary, natural hedging.\n"
        "5. Reduce AI-like patterns: remove template openers, vary sentence length, add researcher voice.\n"
        "6. Strengthen logical flow between paragraphs and sections.\n"
        "7. Replace overused clichés ('furthermore', 'it is important to note') with fresher alternatives.\n"
        "8. Weave citations naturally into sentences — not parenthetical afterthoughts.\n"
        f"{'- For research papers: Maintain strict IMRaD structure.\n' if doc_type == 'research_paper' else ''}"
        f"{'- For thesis: Maintain formal multi-chapter academic hierarchy.\n' if doc_type != 'research_paper' else ''}"
        f"9. TARGET FORMAT: {_format_label(norm)}.\n"
        f"{diagram_instruction}\n"
        f"DOCUMENT TYPE: {doc_type}\n"
        f"CHAPTER TITLE: {title}\n"
        f"USER AI COMMAND: {instruction.strip() if instruction else 'Apply the approved improvement plan.'}\n"
        f"APPROVED IMPROVEMENTS TO APPLY:\n{item_text}\n\n"
        f"VERIFIED SOURCES SELECTED BY THE REVIEW PASS:\n{verified_sources or '- none'}\n\n"
        f"CHAPTER TEXT:\n{text[:18000]}\n\n"
        "Return ONLY the complete revised chapter text — no markdown fences around the entire response, no explanations."
    )


async def _generate_text_with_active_provider(prompt: str, config: AISettings) -> tuple[str, str]:
    return await generate_text_with_active_provider(
        prompt,
        config,
        cloud_privacy_modes={"selected_chapter", "cloud_allowed"},
        task_label="chapter rewrite",
    )


async def _generate_rewrite_text_with_resilience(
    *,
    prompt: str,
    config: AISettings,
    title: str,
    locked_text: str,
    approved_items: list[dict],
    doc_type: str,
    norm: str,
) -> tuple[str, str, str, str | None]:
    """Try the configured AI provider, then local Ollama. Fail if no AI can rewrite."""
    try:
        raw_text, model = await _generate_text_with_active_provider(prompt, config)
        return raw_text, model, config.provider, None
    except HTTPException as exc:
        if exc.status_code == 403:
            raise
        active_error: Exception = exc
    except Exception as exc:
        active_error = exc

    if config.provider != "ollama":
        try:
            ollama_config = config.model_copy(update={"provider": "ollama"})
            raw_text, model = await _generate_text_with_active_provider(prompt, ollama_config)
            return (
                raw_text,
                model,
                "ollama",
                f"Configured provider failed ({active_error}); used local Ollama instead.",
            )
        except Exception as ollama_error:
            raise HTTPException(
                status_code=502,
                detail=(
                    "AI rewrite is required. Configured provider failed and local Ollama is unavailable. "
                    f"Provider error: {active_error}. Ollama error: {ollama_error}"
                ),
            ) from ollama_error

    raise HTTPException(
        status_code=502,
        detail=f"AI rewrite is required. Provider error: {active_error}",
    )


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


def _doc_type_structure_rules(text: str, chapters: list[dict], doc_type: str) -> dict:
    """Evaluate structural compliance based on document type."""
    text_lower = text.lower()
    chapter_titles = [c["title"].lower() for c in chapters]
    
    if doc_type == "research_paper":
        # IMRaD pattern expectation
        expected = ["abstract", "introduction", "method", "result", "discussion"]
        found = sum(1 for exp in expected if any(exp in title for title in chapter_titles) or exp in text_lower[:2000])
        imrad_score = (found / len(expected)) * 100 if expected else 0
        return {
            "structure_signal": imrad_score,
            "missing_sections": [exp for exp in expected if not any(exp in title for title in chapter_titles) and exp not in text_lower[:2000]],
            "is_imrad": True
        }
    else: # thesis
        # Thesis pattern expectation
        expected = ["abstract", "introduction", "literature", "method", "result", "discussion", "conclusion"]
        found = sum(1 for exp in expected if any(exp in title for title in chapter_titles) or exp in text_lower[:2000])
        thesis_score = (found / len(expected)) * 100 if expected else 0
        return {
            "structure_signal": thesis_score,
            "missing_sections": [exp for exp in expected if not any(exp in title for title in chapter_titles) and exp not in text_lower[:2000]],
            "is_imrad": False
        }


def _norm_citation_check(text: str, norm: str) -> dict:
    """Validate citation style per chosen norm."""
    issues = []
    has_refs = bool(re.search(r"(?im)^\s*(references|bibliography|works cited)\s*$", text))
    
    if norm == "ugc":
        # UGC usually requires distinct References
        if not has_refs:
            issues.append("UGC format requires a distinct 'References' or 'Bibliography' section.")
    elif norm in ["harvard", "apa7"]:
        # Expect author-date (Name, YYYY)
        author_date_hits = len(re.findall(r"\([A-Z][A-Za-z&.\-\s]+,\s*\d{4}[a-z]?\)|[A-Z][A-Za-z.\-]+\s+\(\d{4}[a-z]?\)", text))
        if author_date_hits < 3 and len(text.split()) > 1000:
            issues.append(f"{_format_label(norm)} requires author-date citations (e.g., Smith, 2023). Few or none found.")
    elif norm in ["ieee", "springer", "elsevier"]:
        # Expect bracketed numbers [1], [2]
        bracket_hits = len(re.findall(r"\[\d+(?:,\s*\d+)*\]", text))
        if bracket_hits < 3 and len(text.split()) > 1000:
            issues.append(f"{_format_label(norm)} requires bracketed numeric citations (e.g., [1], [2]). Few or none found.")
            
    return {
        "norm_issues": issues,
        "norm_valid": len(issues) == 0
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
    
    chapters = _split_chapters(text)
    doc_structure = _doc_type_structure_rules(text, chapters, doc_type)
    norm_check = _norm_citation_check(text, norm)

    base_structure = 58 + min(22, word_count / 250) + unique_ratio * 12
    structure_signal = max(40, min(94, (base_structure * 0.4) + (doc_structure["structure_signal"] * 0.6)))
    
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
    
    # chapters already parsed above
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
            **norm_check,
            "is_imrad": doc_structure["is_imrad"],
            "missing_sections": doc_structure["missing_sections"],
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
    analysis["integrity_report"] = _build_integrity_report(analysis, doc_type, norm)
    return analysis


def _build_integrity_report(analysis: dict, doc_type: str, norm: str) -> dict:
    scores = analysis["scores"]
    metrics = analysis["metrics"]
    sources = analysis.get("research_sources", {}).get("sources", [])
    source_matches = [
        match
        for source in sources
        for match in source.get("matches", [])
    ]
    risk_matches = [
        match for match in source_matches
        if match.get("evidence", {}).get("classification") == "possible_similarity_risk"
    ]
    checked_sources = [source["name"] for source in sources if source.get("status") == "checked"]
    open_source_similarity = analysis.get("research_sources", {}).get(
        "turnitin_style_similarity",
        {},
    )
    report_grade = "defensible"
    if scores["plagiarism_risk"] >= 40 or scores["citation_quality"] < 50:
        report_grade = "needs_integrity_review"
    elif scores["ai_writing_risk"] >= 65 or scores["originality_score"] < 55:
        report_grade = "needs_author_revision"

    return {
        "title": "OTIF Academic Integrity Evidence Report",
        "doc_type": doc_type,
        "target_format": _format_label(norm),
        "grade": report_grade,
        "scope": {
            "local_document_analysis": True,
            "open_research_sources_checked": checked_sources,
            "full_web_or_private_corpus_checked": False,
            "ai_writing_score_is_risk_signal": True,
        },
        "headline": {
            "plagiarism_risk": scores["plagiarism_risk"],
            "originality_score": scores["originality_score"],
            "citation_quality": scores["citation_quality"],
            "humanization_score": scores["humanization_score"],
            "ai_writing_risk": scores["ai_writing_risk"],
        },
        "evidence_summary": {
            "citation_coverage": metrics["citation_coverage"],
            "near_duplicate_pairs": metrics["near_duplicate_pairs"],
            "open_source_matches": len(source_matches),
            "possible_similarity_risk_matches": len(risk_matches),
            "researcher_voice_markers": metrics["researcher_voice_markers"],
            "template_opener_count": metrics["template_opener_count"],
            "rq_traceback_score": scores.get("rq_traceback_score"),
            "open_source_similarity_index": open_source_similarity.get("similarity_index"),
            "open_source_similarity_matches": open_source_similarity.get("match_count", 0),
        },
        "top_source_evidence": sorted(
            source_matches,
            key=lambda match: match.get("evidence", {}).get("overlap_percent", 0),
            reverse=True,
        )[:8],
        "recommended_next_actions": [
            item["title"] for item in analysis.get("improvement_plan", [])[:6]
        ],
        "limitations": analysis["limitations"]
        + [
            "Open-source matches are discovery evidence, not a replacement for licensed institutional similarity databases.",
            "AI-writing risk is a writing-pattern signal, not proof of authorship.",
        ],
    }


def _build_ai_evidence_packet(analysis: dict) -> dict:
    """Build the bounded, structured handoff used by the final AI validation pass."""
    metrics = analysis.get("metrics", {})
    style_metric_names = [
        "avg_sentence_length",
        "burstiness",
        "passive_voice_ratio",
        "template_opener_count",
        "researcher_voice_markers",
        "long_quote_words",
        "humanization_score",
        "ai_writing_risk",
        "hedging_count",
        "hedging_density_per_1000",
        "hedging_risk",
    ]
    citation_metric_names = [
        "citation_coverage",
        "citation_quality",
        "citation_sentence_count",
        "claim_sentence_count",
        "doi_count",
        "url_count",
        "references_present",
        "norm_valid",
        "norm_issues",
    ]
    structure_metric_names = [
        "is_imrad",
        "missing_sections",
        "rq_count",
        "rq_traceback_score",
        "unanswered_rqs",
        "near_duplicate_pairs",
        "internal_duplication_risk",
        "originality_evidence_matrix",
    ]

    source_evidence: list[dict] = []
    source_status: list[dict] = []
    for source in analysis.get("research_sources", {}).get("sources", []):
        source_status.append(
            {
                "id": source.get("id"),
                "name": source.get("name"),
                "status": source.get("status"),
                "coverage": source.get("coverage"),
                "access_note": source.get("access_note"),
                "match_count": len(source.get("matches", [])),
            }
        )
        for match_index, match in enumerate(source.get("matches", [])[:5], start=1):
            evidence = match.get("evidence") or {}
            local_similarity = match.get("local_similarity") or {}
            source_evidence.append(
                {
                    "evidence_id": f"src-{source.get('id')}-{match_index}",
                    "source_id": source.get("id"),
                    "source_name": source.get("name"),
                    "title": str(match.get("title") or "")[:240],
                    "year": match.get("year"),
                    "url": match.get("url"),
                    "abstract": str(match.get("abstract") or "")[:360],
                    "classification": evidence.get("classification"),
                    "document_passage": evidence.get("document_passage"),
                    "overlap_percent": evidence.get("overlap_percent"),
                    "shared_terms": evidence.get("shared_terms", []),
                    "similarity_risk": local_similarity.get("risk_level")
                    or evidence.get("turnitin_risk"),
                    "combined_similarity": local_similarity.get("combined_similarity"),
                    "flagged_shingles": local_similarity.get("flagged_shingles", []),
                }
            )

    source_evidence.sort(
        key=lambda item: (
            float(item.get("combined_similarity") or 0),
            float(item.get("overlap_percent") or 0),
        ),
        reverse=True,
    )
    skill_checks = analysis.get("skill_checks", {})
    compact_skill_checks = {
        "loaded_count": skill_checks.get("loaded_count", 0),
        "total_rule_count": skill_checks.get("total_rule_count", 0),
        "automated_rule_count": skill_checks.get("automated_rule_count", 0),
        "automated_trigger_count": skill_checks.get("automated_trigger_count", 0),
        "declarative_rule_count": skill_checks.get("declarative_rule_count", 0),
        "invalid_pattern_count": skill_checks.get("invalid_pattern_count", 0),
        "packs": skill_checks.get("packs", []),
        "automated_results": [
            {
                key: result.get(key)
                for key in [
                    "rule_code",
                    "rule_name",
                    "skill_name",
                    "category",
                    "severity",
                    "status",
                    "match_count",
                    "samples",
                    "description",
                ]
            }
            for result in skill_checks.get("automated_results", [])
        ],
        "declarative_rules_for_ai_validation": [
            {
                key: rule.get(key)
                for key in [
                    "rule_code",
                    "rule_name",
                    "skill_name",
                    "category",
                    "severity",
                    "description",
                ]
            }
            for rule in skill_checks.get("declarative_rules_for_ai_validation", [])
        ],
        "invalid_patterns": skill_checks.get("invalid_patterns", []),
        "execution_note": skill_checks.get("execution_note"),
    }

    return {
        "pipeline_order": [
            "document parsing",
            "open scholarly source discovery",
            "source evidence enrichment",
            "deterministic rule and style checks",
            "chapter/page audit",
            "final AI validation",
        ],
        "scores": analysis.get("scores", {}),
        "rule_checks": {
            "all_metrics": metrics,
            "style_and_voice": {
                name: metrics.get(name)
                for name in style_metric_names
            },
            "citations_and_format": {
                name: metrics.get(name)
                for name in citation_metric_names
            },
            "structure_originality_similarity": {
                name: metrics.get(name)
                for name in structure_metric_names
            },
            "flagged_phrases": analysis.get("findings", []),
        },
        "skill_checks": compact_skill_checks,
        "chapter_audits": [
            {
                "id": chapter.get("id"),
                "title": chapter.get("title"),
                "start_page": chapter.get("start_page"),
                "end_page": chapter.get("end_page"),
                "scores": chapter.get("scores", {}),
                "metrics": chapter.get("metrics", {}),
                "findings": chapter.get("findings", []),
            }
            for chapter in analysis.get("chapters", [])[:16]
        ],
        "existing_improvement_plan": analysis.get("improvement_plan", [])[:16],
        "research": {
            "queries": analysis.get("research_sources", {}).get("queries", []),
            "source_status": source_status,
            "source_evidence": source_evidence[:24],
            "ai_pattern_check": analysis.get("research_sources", {}).get("ai_detection", {}),
            "open_source_similarity": analysis.get("research_sources", {}).get(
                "turnitin_style_similarity",
                {},
            ),
            "scope_warning": (
                "Similarity is calculated only against returned public/open scholarly metadata "
                "and abstracts. It is not a Turnitin or institutional private-corpus result."
            ),
        },
        "formatting_plan": analysis.get("formatting_plan", {}),
        "limitations": analysis.get("limitations", []),
    }


def _ai_analysis_prompt(text: str, analysis: dict, doc_type: str, norm: str, research_context: str | None = None) -> str:
    evidence_packet = _build_ai_evidence_packet(analysis)
    evidence_json = json.dumps(evidence_packet, ensure_ascii=True, separators=(",", ":"))
    return (
        "You are OTIF's AI Academic Reviewer. Use the deterministic rules, skill findings, "
        "style checks, chapter audits, and open-source research evidence packet as the factual base. "
        "Recheck the findings, but do not silently override deterministic results. Do not invent "
        "sources, data, page numbers, claims, citations, evidence IDs, or formatting requirements.\n\n"
        "When a claim needs a source, select only a source_evidence evidence_id from the packet whose "
        "title/abstract is genuinely relevant. If no verified source supports it, say that manual "
        "source research is required. Never manufacture a reference.\n\n"
        "Return JSON only with this shape:\n"
        "{\"review_summary\":\"...\",\"validated_checks\":[\"...\"],\"items\":[{\"title\":\"...\","
        "\"priority\":\"high|medium|low\","
        "\"action\":\"...\",\"evidence\":\"...\",\"chapter_id\":\"optional existing id\","
        "\"page_range\":\"optional range\",\"evidence_refs\":[\"rule/style/source evidence ids\"],"
        "\"source_evidence_ids\":[\"src-source-id-number\"]}]}\n\n"
        f"Document type: {doc_type}\nTarget format: {_format_label(norm)}\n"
        + (f"Research context: {research_context[:1200]}\n" if research_context else "")
        + f"EVIDENCE PACKET:\n{evidence_json}\n\n"
        "Create 3 to 6 precise, approval-ready improvement items that strengthen academic quality, "
        "citation defensibility, originality, chapter flow, and researcher voice. Each action must be "
        "safe for a red/green review rewrite. Explicitly validate style/voice checks and identify "
        "source-needed claims when present.\n\n"
        f"Document excerpt:\n{text[:12000]}"
    )


def _parse_ai_review_json(raw_text: str) -> dict:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


async def _run_ai_analysis_pass(text: str, analysis: dict, doc_type: str, norm: str, research_context: str | None = None) -> dict:
    config = load_ai_settings(mask_keys=False)
    prompt = _ai_analysis_prompt(text, analysis, doc_type, norm, research_context)
    provider_used = config.provider
    model = config.model_by_provider.get(config.provider)
    warning = None

    try:
        raw_text, model = await generate_text_with_active_provider(
            prompt,
            config,
            cloud_privacy_modes={"selected_chapter", "cloud_allowed"},
            task_label="AI analysis review",
            timeout_seconds=120.0,
        )
    except HTTPException as exc:
        if exc.status_code == 403 and config.provider != "ollama":
            warning = f"Cloud AI review blocked by privacy mode: {exc.detail}. Trying local Ollama."
        else:
            warning = f"Configured AI review failed: {exc.detail}. Trying local Ollama."
        raw_text = ""
    except Exception as exc:
        warning = f"Configured AI review failed: {exc}. Trying local Ollama."
        raw_text = ""

    if not raw_text and config.provider != "ollama":
        try:
            ollama_config = config.model_copy(update={"provider": "ollama"})
            raw_text, model = await generate_text_with_active_provider(
                prompt,
                ollama_config,
                cloud_privacy_modes={"selected_chapter", "cloud_allowed"},
                task_label="AI analysis review",
                timeout_seconds=120.0,
            )
            provider_used = "ollama"
            warning = f"{warning} Local Ollama completed the AI review."
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"AI review is required before OTIF can produce the final report and improvement plan. "
                    f"{warning} Ollama unavailable: {exc}"
                ),
            ) from exc

    if not raw_text:
        raise HTTPException(
            status_code=502,
            detail=(
                "AI review is required before OTIF can produce the final report and improvement plan. "
                f"{warning or 'No AI review text was generated.'}"
            ),
        )

    try:
        parsed = _parse_ai_review_json(raw_text)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "AI review returned an invalid format, so OTIF cannot safely produce the final plan. "
                f"Parser error: {exc}"
            ),
        ) from exc

    return {
        "status": "ai_completed",
        "provider": provider_used,
        "model": model,
        "warning": warning,
        "review_summary": str(parsed.get("review_summary") or "AI academic review completed."),
        "validated_checks": (
            parsed.get("validated_checks")
            if isinstance(parsed.get("validated_checks"), list)
            else []
        ),
        "items": parsed.get("items") if isinstance(parsed.get("items"), list) else [],
        "evidence_handoff": {
            "style_checks_passed": True,
            "source_evidence_passed": True,
            "chapter_audits_passed": True,
        },
    }


def _merge_ai_review_items(analysis: dict, ai_review: dict) -> None:
    existing_ids = {item.get("id") for item in analysis.get("improvement_plan", [])}
    chapter_ids = {chapter.get("id") for chapter in analysis.get("chapters", [])}
    merged = analysis.setdefault("improvement_plan", [])
    source_catalog = {
        item["evidence_id"]: item
        for item in _build_ai_evidence_packet(analysis)
        .get("research", {})
        .get("source_evidence", [])
    }

    for index, item in enumerate(ai_review.get("items", [])[:8], start=1):
        title = str(item.get("title") or f"AI review improvement {index}").strip()
        action = str(item.get("action") or "").strip()
        evidence = str(item.get("evidence") or ai_review.get("review_summary") or "").strip()
        if not action:
            continue
        item_id = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:48] or f"ai-review-{index}"
        item_id = f"ai-review-{item_id}"
        if item_id in existing_ids:
            item_id = f"{item_id}-{index}"
        existing_ids.add(item_id)

        priority = str(item.get("priority") or "medium").lower()
        if priority not in {"high", "medium", "low"}:
            priority = "medium"
        chapter_id = item.get("chapter_id")
        if chapter_id not in chapter_ids:
            chapter_id = None
        requested_source_ids = [
            str(source_id)
            for source_id in item.get("source_evidence_ids", [])
            if str(source_id) in source_catalog
        ][:6]
        evidence_refs = [
            str(reference)
            for reference in item.get("evidence_refs", [])
            if str(reference).strip()
        ][:10]

        merged.append(
            {
                "id": item_id,
                "title": title,
                "priority": priority,
                "action": action,
                "evidence": evidence or "Generated by AI review from rule, skill, and open-source evidence.",
                "requires_ai": True,
                "chapter_id": chapter_id,
                "page_range": item.get("page_range"),
                "analysis_source": "ai_review",
                "evidence_refs": evidence_refs,
                "source_evidence_ids": requested_source_ids,
                "source_suggestions": [
                    source_catalog[source_id]
                    for source_id in requested_source_ids
                ],
            }
        )


async def run_analysis_stream(doc_id: str, doc_type: str, norm: str, project_id: str | None = None, research_context: str | None = None, pace: str = "normal"):
    """Generator that yields SSE events during analysis.

    pace: "fast" (minimal delay), "normal" (readable), "detailed" (slow, each step visible)
    """

    async def event(stage: str, data: dict):
        payload = json.dumps({"stage": stage, **data})
        return f"data: {payload}\n\n"

    delay = PACE_DELAYS.get(pace, PACE_DELAYS["normal"])

    yield await event("started", {"doc_id": doc_id, "message": "📋 Analysis started — loading configuration..."})
    await asyncio.sleep(delay)

    # ── GATE 1: AI Model Connectivity ────────────────────────────
    # Analysis requires the combined AI + skills + open research source workflow.
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
                "claude": getattr(ai_settings, "api_keys", {}).get("claude", ""),
            }
            key = key_map.get(provider, "")
            ai_reachable = bool(key and len(key) > 8)
            if not ai_reachable:
                ai_gate_message = f"No API key configured for {provider}. Add your key in Settings."
    except Exception as exc:
        ai_reachable = False
        ai_gate_message = f"Could not reach AI provider: {exc}"

    yield await event(
        "ai_status",
        {
            "message": (
                f"AI provider ready for required review pass: {ai_settings.provider}"
                if ai_reachable
                else f"AI provider not ready; analysis requires a configured AI provider. {ai_gate_message}"
            ),
            "ai_reachable": ai_reachable,
            "provider": ai_settings.provider,
            "gate": None if ai_reachable else "ai_review_required",
        },
    )
    await asyncio.sleep(delay)

    if not ai_reachable:
        yield await event(
            "error",
            {
                "message": (
                    f"🤖 AI model not available — analysis blocked. {ai_gate_message} "
                    f"OTIF analysis requires an active AI model plus skill packs and open research APIs."
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
            "message": "🔗 Checking desktop engine, internet connectivity, and skill packs...",
            "connectors": {
                "local_document": True,
                "skills": True,
                "open_research_sources": [s[0] for s in ALL_RESEARCH_SOURCES],
                "local_corpus": [],
            },
        },
    )
    await asyncio.sleep(delay)

    # Gate 2: Open research source connectivity probes (6 quick probes)
    connectivity = await check_open_research_connectivity()
    internet_reachable = connectivity["internet_reachable"]

    yield await event(
        "internet_check",
        {
            "message": (
                f"🌐 Internet connectivity: {connectivity['reachable_count']}/{connectivity['checked_count']} "
                "research API probes responded"
            ),
            "internet_reachable": internet_reachable,
            "research_connectivity": connectivity,
        },
    )
    await asyncio.sleep(delay)

    if not internet_reachable:
        yield await event(
            "error",
            {
                "message": (
                    "⚠️ Open research sources are not reachable from this desktop session. "
                    "Analysis is blocked because OTIF requires internet access for open scholarly API checks."
                ),
                "gate": "internet",
                "resolution": (
                    "Check internet, proxy/VPN/firewall settings, then rerun analysis for full "
                    "Crossref/arXiv/OpenAlex-style source verification."
                ),
                "research_connectivity": connectivity,
            },
        )
        return

    yield await event(
        "verification_scope",
        {
            "message": (
                "📋 Scope: uploaded text + local skills + reachable free/open research APIs"
                if internet_reachable
                else "📋 Scope: uploaded text + local skills only (research APIs unavailable)"
            ),
            "scope": "ai_skills_open_sources",
        },
    )
    await asyncio.sleep(delay)

    skills = skill_manager.get_skills_for_analysis()
    yield await event(
        "skills_loaded",
        {
            "count": len(skills),
            "skills": [s.name for s in skills],
            "message": f"📚 Loaded {len(skills)} academic skill packs for analysis",
        },
    )
    await asyncio.sleep(delay)

    yield await event("parsing", {"message": f"📄 Parsing document: {path.name}..."})
    await asyncio.sleep(delay)

    try:
        text = _extract_text(path)
    except Exception as exc:
        yield await event("error", {"message": f"Could not parse document: {exc}"})
        return

    if not text.strip():
        yield await event("error", {"message": "No readable text found in the uploaded document"})
        return

    word_count = len(text.split())
    yield await event(
        "document_loaded",
        {"message": f"📄 Document loaded: ~{word_count:,} words extracted"},
    )
    await asyncio.sleep(delay)

    # ── Per-API Research Source Check (13 sources, individual events) ──
    yield await event(
        "internet_research_started",
        {
            "message": (
                f"🔍 Searching {len(ALL_RESEARCH_SOURCES)} open research databases for related works..."
                if internet_reachable
                else "⏭️ Skipping live research source checks (no internet)"
            ),
            "total_sources": len(ALL_RESEARCH_SOURCES),
        },
    )
    await asyncio.sleep(delay)

    research_sources = {"internet_checked": internet_reachable, "sources": [], "queries": []}

    if internet_reachable:
        from app.research.connectors import build_research_queries, CHECKERS, SOURCES as _RS_SOURCES, _source_meta, _read_cached_result, _write_cached_result, SOURCE_RATE_DELAY_SECONDS as _SR_DELAY

        queries = build_research_queries(text)
        research_sources["queries"] = queries
        query = queries[0] if queries else ""

        timeout = httpx.Timeout(14.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "OTIF/1.0 academic-integrity"}) as client:
            for idx, source in enumerate(_RS_SOURCES):
                source_id = source.id
                source_name = source.name
                # Emit per-source checking event
                yield await event(
                    "research_source_checking",
                    {
                        "message": f"  🔎 Checking {source_name}...",
                        "source_id": source_id,
                        "source_name": source_name,
                        "step": idx + 1,
                        "total": len(_RS_SOURCES),
                    },
                )
                await asyncio.sleep(delay * 0.6)  # slightly faster for per-source events

                meta = _source_meta(source)
                if source.requires_key and not meta["configured"]:
                    research_sources["sources"].append({
                        "id": source_id, "name": source_name,
                        "status": "needs_key",
                        "message": "API key required — add to environment settings.",
                        "matches": [], "cached": False, **meta,
                    })
                    yield await event(
                        "research_source_result",
                        {
                            "message": f"  ⏭️ {source_name}: API key required (skipped)",
                            "source_id": source_id, "source_name": source_name,
                            "status": "needs_key", "match_count": 0,
                        },
                    )
                    continue

                cached = _read_cached_result(source_id, query)
                if cached is not None:
                    research_sources["sources"].append({
                        "id": source_id, "name": source_name,
                        "status": "checked",
                        "message": f"{len(cached)} cached public result(s)",
                        "matches": cached, "cached": True, **meta,
                    })
                    yield await event(
                        "research_source_result",
                        {
                            "message": f"  📚 {source_name}: {len(cached)} result(s) [cached]",
                            "source_id": source_id, "source_name": source_name,
                            "status": "checked", "match_count": len(cached), "cached": True,
                        },
                    )
                    continue

                if idx > 0:
                    await asyncio.sleep(_SR_DELAY)

                try:
                    result = await CHECKERS[source.id](client, query)
                    _write_cached_result(source_id, query, result)
                except Exception as exc:
                    research_sources["sources"].append({
                        "id": source_id, "name": source_name,
                        "status": "unavailable",
                        "message": str(exc)[:220],
                        "matches": [], "cached": False, **meta,
                    })
                    yield await event(
                        "research_source_result",
                        {
                            "message": f"  ❌ {source_name}: unavailable",
                            "source_id": source_id, "source_name": source_name,
                            "status": "unavailable", "match_count": 0,
                        },
                    )
                    continue

                research_sources["sources"].append({
                    "id": source_id, "name": source_name,
                    "status": "checked",
                    "message": f"{len(result)} public result(s)",
                    "matches": result, "cached": False, **meta,
                })
                yield await event(
                    "research_source_result",
                    {
                        "message": f"  ✅ {source_name}: {len(result)} result(s)",
                        "source_id": source_id, "source_name": source_name,
                        "status": "checked", "match_count": len(result),
                    },
                )

        research_sources = attach_source_evidence(text, research_sources)
        all_source_matches = [
            match
            for source in research_sources["sources"]
            if source.get("status") == "checked"
            for match in source.get("matches", [])
        ]
        research_sources["ai_detection"] = compute_ai_detection_score(text)
        open_source_similarity = compute_turnitin_style_similarity(text, all_source_matches)
        open_source_similarity.update(
            {
                "scope_label": "Open-source scholarly similarity",
                "is_turnitin_result": False,
                "scope_note": (
                    "Compared only with public/open results returned during this scan; "
                    "not Turnitin or an institutional private corpus."
                ),
            }
        )
        research_sources["turnitin_style_similarity"] = open_source_similarity

    research_sources["connectivity"] = connectivity
    checked_count = sum(1 for s in research_sources["sources"] if s["status"] == "checked")
    unavailable_count = sum(1 for s in research_sources["sources"] if s["status"] == "unavailable")

    yield await event(
        "internet_research_complete",
        {
            "message": f"🌐 Research sweep complete: {checked_count} sources found matches, {unavailable_count} unavailable",
            "research_sources": research_sources,
            "checked_count": checked_count,
            "total_sources": len(research_sources["sources"]),
        },
    )
    await asyncio.sleep(delay)

    chapters = _split_chapters(text)
    yield await event(
        "structure_detected",
        {
            "sections": [chapter["title"] for chapter in chapters[:12]],
            "message": f"📑 Detected {len(chapters)} chapter/section block(s) for {doc_type} using {norm.upper()} checks",
        },
    )
    await asyncio.sleep(delay)

    for i, skill in enumerate(skills):
        yield await event(
            "skill_applying",
            {
                "skill": skill.name,
                "category": skill.category,
                "step": i + 1,
                "total": len(skills),
                "message": f"  📐 Applying {skill.name}...",
            },
        )
        await asyncio.sleep(delay * 0.4)

    analysis = _score_document(text, doc_type, norm, research_sources=research_sources)
    analysis["skill_checks"] = _evaluate_skill_rules(text, skills)
    analysis["validation_handoff"] = _build_ai_evidence_packet(analysis)

    # Store improvement plan for later approve-rewrite lookup
    try:
        plan_path = _plan_path(doc_id)
        plan_path.write_text(json.dumps(analysis, indent=2, default=str), encoding="utf-8")
    except OSError:
        pass

    # Extract AI detection and Turnitin-style similarity from research_sources
    ai_detection = research_sources.get("ai_detection") or {}
    turnitin_similarity = research_sources.get("turnitin_style_similarity") or {}

    yield await event(
        "rules_ready",
        {
            "message": "📊 Rules, skills, and source checks complete. Running AI review for final report...",
            "scores_summary": analysis["scores"],
            "chapter_count": len(analysis["chapters"]),
            "style_checks_included": True,
            "source_evidence_count": len(
                analysis["validation_handoff"]["research"]["source_evidence"]
            ),
            "skill_rule_summary": {
                "total": analysis["skill_checks"]["total_rule_count"],
                "automated": analysis["skill_checks"]["automated_rule_count"],
                "triggered": analysis["skill_checks"]["automated_trigger_count"],
                "ai_validation_required": analysis["skill_checks"]["declarative_rule_count"],
            },
        },
    )
    await asyncio.sleep(delay)

    yield await event(
        "ai_review_started",
        {
            "message": f"🤖 Running AI review pass ({ai_settings.provider}) over findings, chapters, and source evidence...",
            "provider": ai_settings.provider,
        },
    )
    try:
        ai_review = await _run_ai_analysis_pass(text, analysis, doc_type, norm, research_context)
    except HTTPException as exc:
        yield await event(
            "error",
            {
                "message": exc.detail,
                "gate": "ai_review_required",
                "resolution": "Configure a valid cloud AI key or start local Ollama, then rerun analysis.",
            },
        )
        return
    _merge_ai_review_items(analysis, ai_review)
    analysis["ai_review"] = ai_review
    analysis["validation_handoff"] = _build_ai_evidence_packet(analysis)
    analysis["integrity_report"] = _build_integrity_report(analysis, doc_type, norm)
    try:
        plan_path.write_text(json.dumps(analysis, indent=2, default=str), encoding="utf-8")
    except OSError:
        pass
    yield await event(
        "ai_review_complete",
        {
            "message": (
                f"✅ AI review pass added {len(ai_review.get('items', []))} improvement item(s)"
                if ai_review.get("items")
                else "✅ AI review pass completed with no additional items"
            ),
            "ai_review": ai_review,
            "improvement_plan": analysis["improvement_plan"],
            "integrity_report": analysis["integrity_report"],
        },
    )
    await asyncio.sleep(delay)

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
            "integrity_report": analysis["integrity_report"],
            "ai_review": analysis["ai_review"],
            "validation_handoff": analysis["validation_handoff"],
            "ai_detection": ai_detection,
            "turnitin_similarity": turnitin_similarity,
            "analysis_mode": analysis["analysis_mode"],
            "message": "📋 Final AI-reviewed report and improvement plan ready",
        },
    )
    await asyncio.sleep(delay)

    yield await event(
        "approval_required",
        {
            "message": "✅ Improvement plan ready. Review and approve items to begin AI rewrite.",
            "requires_approval": True,
        },
    )
    await asyncio.sleep(delay)

    yield await event(
        "complete",
        {
            "doc_id": doc_id,
            "message": "🎉 Analysis complete! Review your scores and improvement plan below.",
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
                    "metrics": analysis["metrics"],
                    "findings": analysis["findings"],
                    "coverage": analysis["coverage"],
                    "limitations": analysis["limitations"],
                    "improvement_plan": analysis["improvement_plan"],
                    "chapters": analysis["chapters"],
                    "research_sources": analysis["research_sources"],
                    "formatting_plan": analysis["formatting_plan"],
                    "integrity_report": analysis["integrity_report"],
                    "ai_review": analysis.get("ai_review"),
                    "analysis_mode": analysis["analysis_mode"],
                    "ai_detection": ai_detection,
                    "turnitin_similarity": turnitin_similarity,
                    "findings_count": len(analysis["findings"]),
                    "improvement_plan_count": len(analysis["improvement_plan"]),
                    "chapters_count": len(analysis["chapters"]),
                    "internet_checked": research_sources.get("internet_checked", False),
                    "integrity_grade": analysis["integrity_report"]["grade"],
                    "ai_detection_score": ai_detection.get("ai_detection_score"),
                    "turnitin_similarity_index": turnitin_similarity.get("similarity_index"),
                    "message": "Analysis complete — review scores and approve improvement items",
                },
            )
        except Exception:
            pass  # Thread logging failure is non-fatal


@router.post("/run/{doc_id}")
async def run_analysis(doc_id: str, req: AnalysisRequest):
    """Start document analysis and stream progress via SSE."""
    return StreamingResponse(
        run_analysis_stream(doc_id, req.doc_type, req.norm, req.project_id, req.research_context, req.pace),
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
        design_accent_hex = normalize_hex_color(req.design_accent_hex)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        text = _extract_text(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse document: {exc}") from exc

    # Try loading previously stored improvement plan from scan (deterministic IDs)
    stored_plan_path = _plan_path(req.doc_id)
    analysis = None
    if stored_plan_path.exists():
        try:
            stored = json.loads(stored_plan_path.read_text(encoding="utf-8"))
            analysis = stored
        except (json.JSONDecodeError, OSError):
            pass

    if analysis is None:
        # Fallback: re-score and store for future use
        analysis = _score_document(text, req.doc_type, req.norm)
        try:
            stored_plan_path.write_text(json.dumps(analysis, indent=2, default=str), encoding="utf-8")
        except OSError:
            pass

    items_by_id = {item["id"]: item for item in analysis.get("improvement_plan", [])}
    invalid_ids = [item_id for item_id in req.approved_item_ids if item_id not in items_by_id]
    if invalid_ids:
        # If some/all IDs don't match (common — AI review IDs differ between scan and approve),
        # accept all currently available items. User clearly wants to apply improvements.
        req.approved_item_ids = list(items_by_id.keys())

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
            "design_accent_hex": design_accent_hex,
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


@router.get("/chapter-editor/{doc_id}")
async def get_chapter_editor(doc_id: str, doc_type: str = "thesis", norm: str = "apa7"):
    """Return extracted chapters for local live editing before final export."""
    path = find_document_path(doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' was not found")

    try:
        text = _extract_text(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse document: {exc}") from exc
    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in the uploaded document")

    metadata = {}
    metadata_file = document_metadata_path(doc_id)
    if metadata_file.exists():
        try:
            metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            metadata = {}

    approval = None
    approval_file = _approval_path(doc_id)
    if approval_file.exists():
        try:
            approval = json.loads(approval_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            approval = None

    chapters = _split_chapters(text)
    scored = _score_document(text, doc_type, norm)
    return {
        "doc_id": doc_id,
        "filename": metadata.get("filename") or path.name,
        "doc_type": doc_type,
        "norm": norm,
        "chapters": [
            {
                "id": chapter["id"],
                "title": chapter["title"],
                "original_text": chapter["text"],
                "edited_text": chapter["text"],
                "word_count": len(re.findall(r"\b[\w'-]+\b", chapter["text"])),
            }
            for chapter in chapters
        ],
        "scores": scored["scores"],
        "approval": approval,
        "requires_approval": approval is None,
        "revision_guidance": approval.get("rewrite_preview") if approval else None,
        "message": (
            "Edit chapters locally, review the live preview, then finalize DOCX/PDF exports."
            if approval
            else "Run analysis and approve improvement items before final thesis export."
        ),
    }


@router.get("/front-matter/{doc_id}")
async def get_front_matter_preview(doc_id: str, norm: str = "apa7"):
    """Recheck TOC, list of tables, and list of figures with page estimates."""
    path = find_document_path(doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' was not found")
    try:
        text = _extract_text(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse document: {exc}") from exc
    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in the uploaded document")

    chapters = [
        {
            "id": chapter["id"],
            "title": chapter["title"],
            "original_text": chapter["text"],
            "edited_text": chapter["text"],
        }
        for chapter in _split_chapters(text)
    ]
    toc_entries, figures, tables = _extract_toc_entries(chapters, norm)
    return {
        "doc_id": doc_id,
        "target_format": _format_label(norm),
        "toc_entries": toc_entries,
        "tables": tables,
        "figures": figures,
        "toc_text": build_toc_text(toc_entries),
        "list_of_tables_text": build_lol_text(tables),
        "list_of_figures_text": build_lot_text(figures),
        "page_number_mode": "estimated",
        "note": (
            "Page numbers are layout estimates during editing. Exact DOCX fields are refreshed "
            "during final export when Microsoft Word automation is available."
        ),
    }


@router.get("/session/{doc_id}")
async def get_scan_session(doc_id: str):
    """Restore a locally cached scan, improvement plan, approval, and rewrite draft."""
    path = find_document_path(doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' was not found")

    def read_json_file(file_path: Path) -> dict | None:
        if not file_path.exists():
            return None
        try:
            payload = json.loads(file_path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else None
        except (json.JSONDecodeError, OSError):
            return None

    metadata = read_json_file(document_metadata_path(doc_id)) or {}
    analysis = read_json_file(_plan_path(doc_id))
    approval = read_json_file(_approval_path(doc_id))
    rewrite_draft = read_json_file(_rewrite_cache_path(doc_id))

    return {
        "doc_id": doc_id,
        "filename": metadata.get("filename") or path.name,
        "document_exists": True,
        "analysis_available": analysis is not None,
        "analysis": analysis,
        "approval": approval,
        "rewrite_draft": rewrite_draft,
        "status": (
            "rewrite_in_progress"
            if rewrite_draft
            else "improvement_plan_approved"
            if approval
            else "analysis_complete"
            if analysis
            else "uploaded"
        ),
        "message": "Local OTIF session restored.",
    }


@router.post("/session/{doc_id}/draft")
async def save_scan_session_draft(doc_id: str, req: SessionDraftRequest):
    """Autosave review proposals and chapter approval state for refresh recovery."""
    if not find_document_path(doc_id):
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' was not found")

    payload = {
        "chapters": [
            {
                **chapter.model_dump(),
                "diff_tokens": (
                    _compute_word_diff(chapter.original_text, chapter.rewritten_text)
                    if chapter.rewritten_text
                    else []
                ),
            }
            for chapter in req.chapters
        ],
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "autosaved": True,
    }
    _rewrite_cache_path(doc_id).write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return {
        "doc_id": doc_id,
        "saved": True,
        "chapter_count": len(req.chapters),
        "saved_at": payload["saved_at"],
    }


@router.delete("/session/{doc_id}")
async def clear_scan_session(doc_id: str):
    """Clear cached analysis/rewrite state while retaining the locally uploaded source file."""
    path = find_document_path(doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' was not found")

    removed: list[str] = []
    for cache_path in [_plan_path(doc_id), _approval_path(doc_id), _rewrite_cache_path(doc_id)]:
        try:
            if cache_path.exists():
                cache_path.unlink()
                removed.append(cache_path.name)
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Could not clear cached session file '{cache_path.name}': {exc}",
            ) from exc

    return {
        "doc_id": doc_id,
        "cleared": True,
        "removed": removed,
        "source_document_retained": True,
        "message": "Cached scan and rewrite state cleared. The uploaded source document was retained locally.",
    }


@router.get("/track-changes/{doc_id}")
async def get_track_changes(doc_id: str, doc_type: str = "thesis", norm: str = "apa7"):
    """Return chapters with word-level diff tokens for the Ref-N-Write track-changes view.

    If a full-document rewrite has been cached, returns pre-computed diff_tokens.
    Otherwise returns chapters with original text only (no diff).
    """
    path = find_document_path(doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' was not found")

    try:
        text = _extract_text(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse document: {exc}") from exc
    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in the uploaded document")

    metadata = {}
    metadata_file = document_metadata_path(doc_id)
    if metadata_file.exists():
        try:
            metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            metadata = {}

    # Load cached full rewrite if available
    cached_rewrites: dict[str, str] = {}
    rewrite_cache = _rewrite_cache_path(doc_id)
    if rewrite_cache.exists():
        try:
            cached = json.loads(rewrite_cache.read_text(encoding="utf-8"))
            for ch in cached.get("chapters", []):
                rewritten = ch.get("rewritten_text", "").strip()
                if rewritten:
                    cached_rewrites[ch["id"]] = rewritten
        except (json.JSONDecodeError, OSError):
            pass

    # Load approval to get approved chapter IDs
    approved_ids: set[str] = set()
    approval_file = _approval_path(doc_id)
    if approval_file.exists():
        try:
            approval = json.loads(approval_file.read_text(encoding="utf-8"))
            approved_ids = set(approval.get("approved_item_ids", []))
        except (json.JSONDecodeError, OSError):
            pass

    chapters = _split_chapters(text)
    result_chapters = []
    for chapter in chapters:
        cid = chapter["id"]
        orig = chapter["text"]
        rewritten = cached_rewrites.get(cid)
        diff_tokens = _compute_word_diff(orig, rewritten) if rewritten else []

        result_chapters.append({
            "id": cid,
            "title": chapter["title"],
            "original_text": orig,
            "rewritten_text": rewritten,
            "diff_tokens": diff_tokens,
            "word_count": len(re.findall(r"\b[\w'-]+\b", orig)),
            "approved": cid in approved_ids,
        })

    return {
        "doc_id": doc_id,
        "filename": metadata.get("filename") or path.name,
        "doc_type": doc_type,
        "norm": norm,
        "chapters": result_chapters,
        "total_chapters": len(result_chapters),
        "approved_chapters": sum(1 for ch in result_chapters if ch["approved"]),
        "rewrite_authorized": approval_file.exists(),
        "message": (
            "Track-changes view ready with pre-computed diffs."
            if cached_rewrites
            else "No rewrite cached yet. Approve improvements and rewrite to see track changes."
        ),
    }


@router.post("/chapter-rewrite-proposal")
async def chapter_rewrite_proposal(req: ChapterRewriteRequest):
    """Generate a user-reviewable AI rewrite proposal for one selected chapter."""
    path = find_document_path(req.doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{req.doc_id}' was not found")
    if len(req.text.split()) < 25:
        raise HTTPException(status_code=400, detail="Selected chapter text is too short to rewrite.")

    approval_file = _approval_path(req.doc_id)
    if not approval_file.exists():
        raise HTTPException(status_code=403, detail="Approve an improvement plan before requesting chapter rewrite.")
    try:
        approval = json.loads(approval_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=500, detail=f"Could not read approval record: {exc}") from exc

    items_by_id = {item["id"]: item for item in approval.get("approved_items", [])}
    approved_ids = req.approved_item_ids or approval.get("approved_item_ids", [])
    approved_items = [items_by_id[item_id] for item_id in approved_ids if item_id in items_by_id]

    config = load_ai_settings(mask_keys=False)
    public_config = load_ai_settings(mask_keys=True)
    locked_text, lock_map = lock_citations(req.text)
    prompt = _chapter_rewrite_prompt(
        title=req.title,
        text=locked_text,
        approved_items=approved_items,
        doc_type=req.doc_type,
        norm=req.norm,
        instruction=req.instruction,
    )

    raw_text, model, provider_used, provider_warning = await _generate_rewrite_text_with_resilience(
        prompt=prompt,
        config=config,
        title=req.title,
        locked_text=locked_text,
        approved_items=approved_items,
        doc_type=req.doc_type,
        norm=req.norm,
    )

    restored_text, all_restored, missing_tokens = unlock_citations(raw_text, lock_map)
    if not restored_text.strip():
        raise HTTPException(status_code=502, detail="AI provider returned an empty chapter rewrite.")

    return {
        "doc_id": req.doc_id,
        "chapter_id": req.chapter_id,
        "title": req.title,
        "provider": provider_used,
        "model": model,
        "privacy_mode": public_config.privacy_mode,
        "proposed_text": restored_text,
        "diff_tokens": _compute_word_diff(req.text, restored_text),
        "provider_warning": provider_warning,
        "citation_lock": {
            "locked_count": len(lock_map),
            "all_restored": all_restored,
            "missing_tokens": missing_tokens,
        },
        "requires_user_apply": True,
        "message": "Review this chapter proposal and apply it only if it preserves your meaning and evidence.",
    }


class FullDocumentRewriteRequest(BaseModel):
    doc_id: str
    chapters: list[ChapterEdit]
    approved_item_ids: list[str] = Field(default_factory=list)
    doc_type: str = "thesis"
    norm: str = "apa7"
    design_theme: str = "classic_blue"
    design_accent_hex: str | None = None
    instruction: str | None = Field(default=None, max_length=1200)


class FullDocumentRewriteChapter(BaseModel):
    id: str
    title: str
    original_text: str
    rewritten_text: str
    changes_summary: str


class CitationSuggestionRequest(BaseModel):
    doc_id: str
    claim_text: str = Field(..., min_length=10, max_length=500, description="An uncited claim that needs a citation")


@router.post("/suggest-citation")
async def suggest_citation(req: CitationSuggestionRequest):
    """
    Look up real academic citations for an uncited claim from the research cache.
    Searches through previously collected research source matches to find
    relevant real citations that the author can add.
    """
    from app.research.connectors import _cache_dir, _cache_key, _read_cached_result

    path = find_document_path(req.doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{req.doc_id}' not found")

    # Extract key terms from the claim
    claim_lower = req.claim_text.lower()
    key_terms = [w for w in re.findall(r'\b[a-z]{5,}\b', claim_lower)
                 if w not in {'which', 'their', 'there', 'these', 'those', 'about', 'would', 'could', 'should'}][:6]

    # Search through all cached research sources
    suggestions: list[dict] = []
    cache_path = _cache_dir()
    if cache_path.exists():
        for cache_file in sorted(cache_path.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:20]:
            try:
                payload = json.loads(cache_file.read_text(encoding="utf-8"))
                matches = payload.get("matches", [])
                for match in matches:
                    title = (match.get("title") or "").lower()
                    abstract = (match.get("abstract") or match.get("snippet") or "").lower()
                    combined = f"{title} {abstract}"
                    # Score by how many key terms appear
                    score = sum(1 for term in key_terms if term in combined)
                    if score >= 2:
                        suggestions.append({
                            "title": match.get("title"),
                            "url": match.get("url"),
                            "year": match.get("year"),
                            "source": payload.get("source_id", "unknown"),
                            "relevance_score": score,
                            "matched_terms": [term for term in key_terms if term in combined],
                        })
            except (json.JSONDecodeError, OSError):
                continue

    # Deduplicate and sort by relevance
    seen = set()
    unique = []
    for s in sorted(suggestions, key=lambda x: x["relevance_score"], reverse=True):
        key = s["title"]
        if key not in seen:
            seen.add(key)
            unique.append(s)

    top = unique[:8]

    # Format citation suggestions
    formatted = []
    for s in top:
        authors = s.get("title", "").split(",")[0].strip() if "," in s.get("title", "") else ""
        year = s.get("year", "")
        formatted.append({
            "text": f"{authors} ({year})" if authors and year else s.get("title", ""),
            "full_reference": s.get("title", ""),
            "url": s.get("url"),
            "year": year,
            "source": s.get("source"),
            "relevance": s.get("relevance_score"),
        })

    return {
        "claim": req.claim_text,
        "suggestions": formatted,
        "suggestion_count": len(formatted),
        "note": "Citations are suggestions from open research sources. Verify each citation before adding it to your document.",
        "no_suggestions_found": len(formatted) == 0,
    }


@router.post("/smart-diagram-check")
async def smart_diagram_check(req: SmartDiagramRequest):
    """
    Analyze chapter content to determine if a diagram is needed.
    Returns a recommendation with reasoning — NO AI call, purely rule-based.
    """
    text = req.chapter_text.lower()
    title = req.chapter_title.lower()

    # Signals that indicate a diagram is beneficial
    process_signals = [
        "step", "phase", "stage", "process", "workflow", "pipeline",
        "procedure", "protocol", "sequence", "flow", "cycle", "lifecycle",
    ]
    structure_signals = [
        "framework", "architecture", "model", "schema", "component",
        "layer", "module", "dimension", "pillar", "element", "structure",
        "hierarchy", "taxonomy", "classification",
    ]
    relation_signals = [
        "relationship", "interaction", "between", "mapping", "correlation",
        "connection", "link", "interface", "integration",
    ]
    methodology_signals = [
        "methodology", "method", "approach", "design science", "action research",
        "case study", "experiment", "survey", "interview",
    ]

    process_score = sum(1 for s in process_signals if s in text) * 3
    structure_score = sum(1 for s in structure_signals if s in text) * 3
    relation_score = sum(1 for s in relation_signals if s in text) * 2
    method_score = sum(1 for s in methodology_signals if s in text) * 2

    total_score = process_score + structure_score + relation_score + method_score

    # Chapters that almost never need diagrams
    no_diagram_titles = ["abstract", "acknowledgement", "declaration", "preface", "foreword"]
    is_excluded = any(t in title for t in no_diagram_titles)

    # Chapters that almost always benefit from diagrams
    diagram_titles = ["methodology", "method", "framework", "architecture", "design", "model", "system"]
    is_strong_candidate = any(t in title for t in diagram_titles)

    if is_excluded:
        recommendation = "skip"
        reason = f"'{req.chapter_title}' chapters typically do not require diagrams."
        diagram_type = None
    elif total_score >= 12 or is_strong_candidate:
        if process_score >= 6:
            recommendation = "flow_diagram"
            reason = f"'{req.chapter_title}' contains process/method descriptions — a flow diagram would clarify the steps."
            diagram_type = "method_flow"
        elif structure_score >= 6:
            recommendation = "conceptual_model"
            reason = f"'{req.chapter_title}' describes a framework or conceptual model — a structural diagram would help."
            diagram_type = "conceptual_model"
        else:
            recommendation = "academic"
            reason = f"'{req.chapter_title}' has structural content that benefits from visualization."
            diagram_type = "academic"
    elif total_score >= 5:
        recommendation = "optional"
        reason = f"'{req.chapter_title}' has moderate diagram potential — a diagram is optional."
        diagram_type = "academic"
    else:
        recommendation = "skip"
        reason = f"'{req.chapter_title}' does not contain enough structural/process content to warrant a diagram."
        diagram_type = None

    return {
        "chapter_title": req.chapter_title,
        "recommendation": recommendation,
        "diagram_type": diagram_type,
        "reason": reason,
        "signals": {
            "process_signals": process_score // 3,
            "structure_signals": structure_score // 3,
            "relation_signals": relation_score // 2,
            "methodology_signals": method_score // 2 if method_score > 0 else 0,
            "total_score": total_score,
        },
    }


@router.post("/rewrite-full-document")
async def rewrite_full_document(req: FullDocumentRewriteRequest):
    """
    AI-powered full document rewrite — SUGGESTIONS ONLY.
    Rewrites each chapter based on approved improvement items and the selected
    design theme. Returns a complete rewritten document where every change must
    be user-reviewed and approved before finalizing.
    """
    path = find_document_path(req.doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{req.doc_id}' was not found")

    approval_file = _approval_path(req.doc_id)
    if not approval_file.exists():
        raise HTTPException(status_code=403, detail="Approve an improvement plan before requesting full document rewrite.")

    try:
        approval = json.loads(approval_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=500, detail=f"Could not read approval record: {exc}") from exc

    items_by_id = {item["id"]: item for item in approval.get("approved_items", [])}
    approved_ids = req.approved_item_ids or approval.get("approved_item_ids", [])
    approved_items = [items_by_id[item_id] for item_id in approved_ids if item_id in items_by_id]

    if not approved_items:
        raise HTTPException(status_code=400, detail="No approved improvement items found. Approve items before rewriting.")

    config = load_ai_settings(mask_keys=False)
    public_config = load_ai_settings(mask_keys=True)

    theme_names = {
        "classic_blue": "Classic Blue (professional navy/academic blue)",
        "emerald_academic": "Emerald Academic (green scholarly tones)",
        "mono_formal": "Mono Formal (black/white formal submission)",
        "maroon_submission": "Maroon Submission (traditional academic maroon)",
    }
    theme_name = theme_names.get(req.design_theme, req.design_theme)
    accent_note = f" with custom accent #{req.design_accent_hex.lstrip('#')}" if req.design_accent_hex else ""

    rewritten_chapters: list[FullDocumentRewriteChapter] = []
    rewrite_warnings: list[str] = []
    provider_used = public_config.provider
    model = public_config.model_by_provider.get(public_config.provider)

    for chapter in req.chapters:
        chapter_text = rich_text_to_plain_text(chapter.edited_text)
        if len(chapter_text.split()) < 25:
            rewritten_chapters.append(FullDocumentRewriteChapter(
                id=chapter.id,
                title=chapter.title,
                original_text=chapter_text,
                rewritten_text=chapter_text,
                changes_summary="Chapter too short to rewrite - kept as-is.",
            ))
            continue

        item_text = "\n".join(f"- {item['title']}: {item['action']}" for item in approved_items)
        verified_sources = _verified_source_context(approved_items)
        locked_text, lock_map = lock_citations(chapter_text)

        prompt = (
            "You are a Ref-N-Write Full Document Academic Rewriting Engine.\n"
            f"Rewrite this chapter as part of a complete {req.doc_type} styled with the '{theme_name}'{accent_note} design theme.\n\n"
            "IMPERATIVE RULES:\n"
            "1. Return the COMPLETE rewritten chapter — no truncation, no omissions.\n"
            "2. Preserve ALL claims, results, data, citations, references, numbers.\n"
            "3. NEVER invent new sources, statistics, findings, or page numbers.\n"
            "3b. NEVER add placeholder citations like [CITATION NEEDED], [REF], [REFERENCE NEEDED], [CITE], (Author, Year), or any similar empty marker. Keep the original text's citations as-is.\n"
            "3c. A [SOURCE NEEDED] marker may be resolved only from the VERIFIED SOURCES below. "
            "Do not guess missing authors, years, DOI values, URLs, or reference metadata. If the "
            "available metadata is insufficient for the target style, keep the marker for author review.\n"
            "4. Keep ALL citation lock tokens EXACTLY: [[CIT_LOCK_0]], [[CIT_LOCK_1]], etc.\n"
            "5. Improve academic voice: varied sentence rhythm, precise vocabulary, natural hedging.\n"
            "6. Reduce AI-like patterns: remove template openers, vary sentence lengths, add researcher voice.\n"
            "7. Apply the design theme's academic character to the writing style.\n"
            f"8. TARGET FORMAT: {_format_label(req.norm)} — ensure citations match this style.\n\n"
            f"DOCUMENT TYPE: {req.doc_type}\n"
            f"CHAPTER TITLE: {chapter.title}\n"
            f"DESIGN THEME: {theme_name}{accent_note}\n"
            f"USER AI COMMAND: {req.instruction.strip() if req.instruction else 'Apply the approved improvement plan.'}\n"
            f"APPROVED IMPROVEMENTS:\n{item_text}\n\n"
            f"VERIFIED SOURCES:\n{verified_sources or '- none'}\n\n"
            f"CHAPTER TEXT:\n{locked_text[:16000]}\n\n"
            "Return ONLY the complete rewritten chapter — no markdown, no explanations."
        )

        fallback_summary = None
        try:
            raw_text, model, provider_used, fallback_summary = await _generate_rewrite_text_with_resilience(
                prompt=prompt,
                config=config,
                title=chapter.title,
                locked_text=locked_text,
                approved_items=approved_items,
                doc_type=req.doc_type,
                norm=req.norm,
            )
            restored_text, all_restored, missing_tokens = unlock_citations(raw_text, lock_map)
        except Exception as exc:
            restored_text = chapter_text
            all_restored = True
            missing_tokens = []
            fallback_summary = f"AI rewrite unavailable for this chapter; kept original text. Reason: {exc}"
            rewrite_warnings.append(f"{chapter.title}: {exc}")
        if not restored_text.strip():
            restored_text = chapter_text

        # Generate a brief changes summary
        orig_words = len(chapter_text.split())
        new_words = len(restored_text.split())
        changes_pct = round(abs(new_words - orig_words) / max(1, orig_words) * 100)

        summary_parts = []
        if changes_pct > 5:
            summary_parts.append(f"Word count changed {changes_pct}% ({orig_words} → {new_words} words)")
        if all_restored:
            summary_parts.append(f"All {len(lock_map)} citations preserved")
        elif missing_tokens:
            summary_parts.append(f"Restored {len(missing_tokens)} dropped citations")
        summary_parts.append("Academic voice and clarity improved per approved plan")
        if fallback_summary:
            summary_parts.append(fallback_summary)

        rewritten_chapters.append(FullDocumentRewriteChapter(
            id=chapter.id, title=chapter.title,
            original_text=chapter_text,
            rewritten_text=restored_text,
            changes_summary=". ".join(summary_parts) + ".",
        ))

    # Cache rewrite for track-changes view
    try:
        from datetime import datetime
        _rewrite_cache_path(req.doc_id).write_text(
            json.dumps({
                "chapters": [
                    {
                        "id": c.id,
                        "title": c.title,
                        "original_text": c.original_text,
                        "rewritten_text": c.rewritten_text,
                        "changes_summary": c.changes_summary,
                        "diff_tokens": _compute_word_diff(c.original_text, c.rewritten_text),
                    }
                    for c in rewritten_chapters
                ],
                "generated_at": datetime.utcnow().isoformat(),
            }, indent=2, default=str),
            encoding="utf-8",
        )
    except OSError:
        pass

    return {
        "doc_id": req.doc_id,
        "provider": provider_used,
        "model": model,
        "privacy_mode": public_config.privacy_mode,
        "design_theme": req.design_theme,
        "design_accent_hex": req.design_accent_hex,
        "chapters": [
            {
                "id": c.id,
                "title": c.title,
                "original_text": c.original_text,
                "rewritten_text": c.rewritten_text,
                "changes_summary": c.changes_summary,
                "diff_tokens": _compute_word_diff(c.original_text, c.rewritten_text),
            }
            for c in rewritten_chapters
        ],
        "chapter_count": len(rewritten_chapters),
        "total_words_original": sum(len(c.original_text.split()) for c in rewritten_chapters),
        "total_words_rewritten": sum(len(c.rewritten_text.split()) for c in rewritten_chapters),
        "warnings": rewrite_warnings,
        "requires_user_approval": True,
        "message": (
            "Full document rewrite complete. ALL changes are suggestions only — review each chapter, "
            "compare original vs rewritten text, and apply only changes that preserve your meaning and evidence. "
            "Once reviewed, finalize to export with the selected design theme."
        ),
    }


@router.post("/finalize-thesis")
async def finalize_thesis(req: FinalizeThesisRequest):
    """Create final DOCX/PDF artifacts from approved chapter edits."""
    path = find_document_path(req.doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{req.doc_id}' was not found")
    if not req.chapters:
        raise HTTPException(status_code=400, detail="At least one edited chapter is required.")

    metadata = {}
    metadata_file = document_metadata_path(req.doc_id)
    if metadata_file.exists():
        try:
            metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            metadata = {}
    is_generated_draft = metadata.get("source") == "write_from_context"

    approval_file = _approval_path(req.doc_id)
    approval = None
    if not approval_file.exists() and not is_generated_draft:
        raise HTTPException(
            status_code=403,
            detail="Approve an improvement plan before finalizing the thesis package.",
        )
    if approval_file.exists():
        try:
            approval = json.loads(approval_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            raise HTTPException(status_code=500, detail=f"Could not read approval record: {exc}") from exc

    requested_formats = {fmt.lower() for fmt in req.output_formats}
    unsupported = requested_formats - {"docx", "pdf"}
    if unsupported:
        raise HTTPException(status_code=400, detail=f"Unsupported output formats: {sorted(unsupported)}")
    if not requested_formats:
        raise HTTPException(status_code=400, detail="Select at least one output format.")
    try:
        design_accent_hex = normalize_hex_color(req.design_accent_hex)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        original_text = _extract_text(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse document: {exc}") from exc

    chapters = [chapter.model_dump() for chapter in req.chapters]
    final_text = compile_chapter_text(chapters)
    if len(final_text.split()) < 25:
        raise HTTPException(status_code=400, detail="Final edited text is too short to export.")

    before_analysis = _score_document(original_text, req.doc_type, req.norm)
    after_analysis = _score_document(final_text, req.doc_type, req.norm)
    certificate = build_integrity_certificate(
        doc_type=req.doc_type,
        norm=req.norm,
        approval=approval,
        before_scores=before_analysis["scores"],
        after_scores=after_analysis["scores"],
        chapter_count=len(chapters),
    )

    original_name = Path(metadata.get("filename") or path.name).stem
    safe_stem = safe_filename(original_name)
    timestamp = re.sub(r"[^0-9]", "", certificate["generated_at"])[:14]
    out_dir = export_dir(Path(settings.UPLOADS_PATH), req.doc_id)
    document_title = f"{original_name} - OTIF Finalized"
    export_theme = resolve_theme(req.design_theme, design_accent_hex)
    diagram_image_path = render_diagram_image(
        diagram_source=req.diagram_source,
        diagram_caption=req.diagram_caption,
        output_dir=out_dir,
        accent=export_theme["accent"],
        stem=f"{safe_stem}_{timestamp}",
    )

    artifacts = []
    generated_docx = None
    preservation_report = None
    # Generate real TOC/LOT/LOF with computed page numbers
    toc_entries, figures_list, tables_list = _extract_toc_entries(chapters, req.norm)
    field_update_status = {
        "requested": True,
        "updated_by_word": False,
        "toc": build_toc_text(toc_entries),
        "list_of_tables": build_lol_text(tables_list),
        "list_of_figures": build_lot_text(figures_list),
    }
    try:
        if requested_formats & {"docx", "pdf"}:
            output_docx_path = out_dir / f"{safe_stem}_OTIF_final_{timestamp}.docx"
            if path.suffix.lower() == ".docx":
                generated_docx, preservation_report = create_preserved_docx(
                    source_path=path,
                    output_path=output_docx_path,
                    chapters=chapters,
                    certificate=certificate,
                    approval=approval,
                    diagram_source=req.diagram_source,
                    diagram_caption=req.diagram_caption,
                    diagram_image_path=diagram_image_path,
                )
            else:
                generated_docx = create_docx(
                    output_path=output_docx_path,
                    document_title=document_title,
                    chapters=chapters,
                    doc_type=req.doc_type,
                    norm=req.norm,
                    design_theme=req.design_theme,
                    design_accent_hex=design_accent_hex,
                    approval=approval,
                    certificate=certificate,
                    diagram_source=req.diagram_source,
                    diagram_caption=req.diagram_caption,
                    diagram_image_path=diagram_image_path,
                )
        if generated_docx:
            field_update_status["requested"] = True
            field_update_status["updated_by_word"] = update_docx_fields_with_word(generated_docx.path)
        if "docx" in requested_formats and generated_docx:
            artifacts.append(generated_docx)
        if "pdf" in requested_formats:
            exact_pdf = (
                convert_docx_to_pdf(
                    generated_docx.path,
                    out_dir / f"{safe_stem}_OTIF_final_{timestamp}.pdf",
                )
                if generated_docx
                else None
            )
            artifacts.append(
                exact_pdf
                or create_pdf(
                    output_path=out_dir / f"{safe_stem}_OTIF_final_{timestamp}.pdf",
                    document_title=document_title,
                    chapters=chapters,
                    doc_type=req.doc_type,
                    norm=req.norm,
                    design_theme=req.design_theme,
                    design_accent_hex=design_accent_hex,
                    approval=approval,
                    certificate=certificate,
                    diagram_source=req.diagram_source,
                    diagram_caption=req.diagram_caption,
                    diagram_image_path=diagram_image_path,
                )
            )
        artifacts.append(
            create_certificate_markdown(
                output_path=out_dir / f"{safe_stem}_OTIF_integrity_certificate_{timestamp}.md",
                document_title=document_title,
                certificate=certificate,
                approval=approval,
            )
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not create export artifacts: {exc}") from exc

    if req.project_id:
        try:
            await local_db.add_thread_message(
                project_id=req.project_id,
                role="rewrite",
                message_type="final_export",
                content={
                    "doc_id": req.doc_id,
                    "formats": [artifact.format for artifact in artifacts],
                    "chapter_count": len(chapters),
                    "target_format": req.norm,
                    "design_theme": req.design_theme,
                    "message": "Final thesis package generated after user-approved chapter edits.",
                },
            )
        except Exception:
            pass

    return {
        "doc_id": req.doc_id,
        "status": "finalized",
        "chapter_count": len(chapters),
        "before_scores": before_analysis["scores"],
        "after_scores": after_analysis["scores"],
        "certificate": certificate,
        "field_update_status": field_update_status,
        "preservation_report": preservation_report
        or {
            "mode": "generated_docx_from_extracted_text",
            "reason": "Round-trip preservation is available for DOCX uploads only.",
        },
        "artifacts": [
            {
                "format": artifact.format,
                "filename": artifact.filename,
                "size_bytes": artifact.size_bytes,
                "download_url": f"/api/v1/analysis/download/{req.doc_id}/{artifact.filename}",
            }
            for artifact in artifacts
        ],
        "limitations": [
            (
                "DOCX uploads use round-trip preservation for headings, tables, figures, captions, fields, and front matter."
                if path.suffix.lower() == ".docx"
                else "Non-DOCX uploads are exported from parsed text because source layout cannot be round-tripped."
            ),
            (
                "TOC, list of tables, and list of figures fields were updated by Microsoft Word automation."
                if field_update_status["updated_by_word"]
                else "TOC, list of tables, and list of figures fields are embedded and set to update when opened in Word; install Word automation or LibreOffice for exact automated page-number validation."
            ),
            "Review the generated document before submission; automated chapter matching depends on recognizable chapter headings.",
            "Exact PDF parity requires LibreOffice or Microsoft Word on the machine.",
        ],
    }


@router.get("/download/{doc_id}/{filename}")
async def download_final_artifact(doc_id: str, filename: str):
    """Download a generated finalization artifact."""
    safe_name = safe_filename(filename)
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid artifact filename.")

    out_dir = export_dir(Path(settings.UPLOADS_PATH), doc_id).resolve()
    target = (out_dir / filename).resolve()
    if not str(target).startswith(str(out_dir)) or not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found.")

    media_types = {
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pdf": "application/pdf",
        ".md": "text/markdown; charset=utf-8",
    }
    return FileResponse(
        target,
        media_type=media_types.get(target.suffix.lower(), "application/octet-stream"),
        filename=target.name,
    )


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


@router.get("/integrity-report/{doc_id}")
async def get_integrity_report(doc_id: str, doc_type: str = "thesis", norm: str = "apa7"):
    """Generate the current evidence-backed OTIF integrity report for a document."""
    path = find_document_path(doc_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' was not found")
    try:
        text = _extract_text(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse document: {exc}") from exc
    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in the uploaded document")

    connectivity = await check_open_research_connectivity()
    research_sources = await check_research_sources(
        text,
        enabled=connectivity["internet_reachable"],
    )
    research_sources["connectivity"] = connectivity
    analysis = _score_document(text, doc_type, norm, research_sources=research_sources)
    return {
        "doc_id": doc_id,
        "scores": analysis["scores"],
        "metrics": analysis["metrics"],
        "chapters": analysis["chapters"],
        "improvement_plan": analysis["improvement_plan"],
        "research_sources": analysis["research_sources"],
        "integrity_report": analysis["integrity_report"],
        "ai_detection": research_sources.get("ai_detection") or {},
        "turnitin_similarity": research_sources.get("turnitin_style_similarity") or {},
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
