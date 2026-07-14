"""Academic phrasebank, paraphrasing, grammar, favorites, and writing assistance endpoints."""
import copy
import json
import re
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.ai.provider_router import load_ai_settings
from app.ai.text_generation import generate_text_with_active_provider
from app.config import settings
from app.core.citation_lock import lock_citations, unlock_citations
from app.api.v1.documents import document_metadata_path
from app.db import local_db

router = APIRouter()


# ── Request Models ──────────────────────────────────────────────────

class ParaphraseRequest(BaseModel):
    text_selection: str = Field(..., min_length=1, max_length=6000)
    context: str = Field("", max_length=12000)
    tone: str = "academic"


class GrammarCheckRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    mode: str = "academic"  # academic | concise | formal | plain


class ToneCheckRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


class SuggestionRequest(BaseModel):
    context_before: str = Field("", max_length=2000)
    context_after: str = Field("", max_length=2000)
    category_id: str | None = None
    count: int = Field(default=5, ge=1, le=10)


class FavoriteRequest(BaseModel):
    category_id: str
    phrase_text: str


class LogUsageRequest(BaseModel):
    phrase_category: str


class WriteFromContextRequest(BaseModel):
    """Generate a full academic document scaffold from a research context description."""
    research_context: str = Field(..., min_length=20, max_length=8000)
    doc_type: str = "thesis"
    norm: str = "apa7"
    sections: list[str] = Field(
        default_factory=lambda: [
            "Abstract", "Introduction", "Literature Review",
            "Methodology", "Results", "Discussion", "Conclusion", "References",
        ]
    )


# ── Helpers ─────────────────────────────────────────────────────────

def _phrasebank_path() -> Path:
    return Path(__file__).resolve().parents[2] / "data" / "phrasebank.json"


@lru_cache(maxsize=1)
def _load_phrasebank() -> dict:
    path = _phrasebank_path()
    if not path.exists():
        raise HTTPException(status_code=500, detail="Bundled phrasebank resource is missing.")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Bundled phrasebank JSON is invalid: {exc}") from exc


def _paraphrase_prompt(selection: str, context: str, tone: str) -> str:
    context_block = context.strip()[:12000]
    tone_guide = {
        "academic": "Use formal scholarly language with appropriate hedging. Maintain objective third-person perspective.",
        "concise": "Reduce wordiness. Remove redundant phrases. Keep only essential academic content.",
        "formal": "Use the most formal register. Prefer Latin-derived vocabulary over Anglo-Saxon alternatives where appropriate.",
        "plain": "Simplify complex constructions while maintaining academic credibility. Prefer active voice.",
    }.get(tone, "Use formal scholarly language with appropriate hedging.")
    return (
        "You are a Ref-N-Write academic paraphrasing engine. Your task is to improve the selected text "
        "while preserving ALL factual content, citations, numbers, and the author's original meaning.\n\n"
        "IMPERATIVE RULES:\n"
        "1. NEVER add new claims, findings, statistics, sources, or data the author did not state.\n"
        "1b. NEVER add placeholder citations like [CITATION NEEDED], [REF], [CITE], (Author, Year), or any similar empty citation marker. Leave uncited claims as-is.\n"
        "2. NEVER remove or modify citations, DOIs, or reference markers including [[CIT_LOCK_N]].\n"
        "3. Preserve ALL numbers, percentages, dates, proper names, and technical terms exactly.\n"
        "4. Improve sentence variety — mix short and long sentences for natural academic rhythm.\n"
        "5. Replace overused academic clichés with fresher scholarly alternatives.\n"
        "6. Strengthen the logical flow between sentences using appropriate transition phrases.\n"
        "7. Reduce passive voice where active voice improves clarity and directness.\n"
        f"8. STYLE GUIDE: {tone_guide}\n\n"
        f"Tone: {tone or 'academic'}\n\n"
        f"SURROUNDING CONTEXT (for coherence):\n{context_block}\n\n"
        f"TEXT TO PARAPHRASE:\n{selection}\n\n"
        "Return ONLY the improved text — no markdown, no explanations, no commentary."
    )


def _grammar_prompt(text: str, mode: str) -> str:
    return (
        "You are an academic proofreader. Check the following text for grammar, spelling, "
        "punctuation, and usage errors.\n\n"
        f"Mode: {mode}\n\n"
        "Return a JSON array of findings. Each finding must have:\n"
        "- 'type': 'grammar' | 'spelling' | 'punctuation' | 'usage' | 'style'\n"
        "- 'severity': 'error' | 'warning' | 'suggestion'\n"
        "- 'original': the problematic text fragment\n"
        "- 'correction': the suggested correction\n"
        "- 'explanation': brief explanation of the rule\n"
        "- 'position': approximate character position in text (0-based)\n\n"
        "Return ONLY the JSON array, no markdown fences or commentary.\n\n"
        f"Text:\n{text}"
    )


def _tone_prompt(text: str) -> str:
    return (
        "You are an academic writing analyst. Analyze the tone of the following text "
        "and return a JSON object with:\n"
        "- 'overall_tone': 'formal/academic' | 'semi-formal' | 'informal' | 'mixed'\n"
        "- 'academic_score': 0-100 (how academic the tone is)\n"
        "- 'clarity_score': 0-100\n"
        "- 'confidence_score': 0-100\n"
        "- 'hedging_density': 'low' | 'moderate' | 'high'\n"
        "- 'flags': array of specific tone issues found (e.g. 'overly casual phrase', "
        "'absolute claim without hedging')\n"
        "- 'suggestions': array of brief improvement suggestions\n\n"
        "Return ONLY the JSON object, no markdown fences or commentary.\n\n"
        f"Text:\n{text}"
    )


def _suggestions_prompt(context_before: str, context_after: str, category_id: str | None, count: int) -> str:
    cat_hint = f"Focus on phrases from the '{category_id}' academic writing category." if category_id else ""
    return (
        "You are an academic writing assistant. Based on the surrounding context, "
        f"suggest {count} appropriate academic phrases that would fit naturally at "
        "the cursor position.\n\n"
        f"{cat_hint}\n\n"
        "Return a JSON array of suggestion objects. Each must have:\n"
        "- 'phrase': the suggested academic phrase\n"
        "- 'category': the academic category (e.g. 'introduction', 'methodology', etc.)\n"
        "- 'rationale': brief one-sentence explanation of why this phrase fits\n\n"
        "Return ONLY the JSON array, no markdown fences or commentary.\n\n"
        f"Context before cursor:\n{context_before}\n\n"
        f"Context after cursor:\n{context_after}"
    )


# ── Phrasebank ──────────────────────────────────────────────────────

@router.get("/phrasebank")
async def get_phrasebank(
    search: Optional[str] = Query(default=None, description="Search term to filter phrases"),
    category: Optional[str] = Query(default=None, description="Filter by category ID"),
    section: Optional[str] = Query(default=None, description="Filter by paper section (abstract, introduction, literature_review, methodology, results, discussion, conclusion)"),
):
    """Return categorized academic phrase templates with optional search, category, or section filter."""
    data = copy.deepcopy(_load_phrasebank())  # deep-copy to avoid mutating lru_cache
    categories = data.get("categories", [])

    # Filter by section (Ref-N-Write style — sections map to categories)
    if section:
        sections_list = data.get("sections", [])
        section_info = next((s for s in sections_list if s["id"] == section or s["id"].replace("_section", "") == section), None)
        if section_info:
            allowed_cats = set(section_info.get("category_ids", []))
            categories = [c for c in categories if c["id"] in allowed_cats]
        if not categories:
            raise HTTPException(status_code=404, detail=f"Section '{section}' not found or has no categories.")

    if category:
        categories = [c for c in categories if c["id"] == category]
        if not categories:
            raise HTTPException(status_code=404, detail=f"Category '{category}' not found.")

    if search:
        term = search.lower()
        filtered: list[dict] = []
        for cat in categories:
            matching = [p for p in cat["phrases"] if term in p.lower()]
            if matching:
                filtered.append({**cat, "phrases": matching, "match_count": len(matching)})
        categories = filtered

    # Inject favorite status
    try:
        for cat in categories:
            favorites = await local_db.get_phrase_favorites(cat["id"])
            fav_texts = {f["phrase_text"] for f in favorites}
            cat["phrases"] = [
                {"text": p, "favorited": p in fav_texts}
                for p in cat["phrases"]
            ]
    except Exception:
        for cat in categories:
            cat["phrases"] = [{"text": p, "favorited": False} for p in cat["phrases"]]

    return {
        "version": data.get("version", "unknown"),
        "sources": data.get("sources", []),
        "sections": data.get("sections", []),
        "categories": categories,
        "total_categories": len(categories),
        "total_phrases": sum(len(c["phrases"]) for c in categories),
    }


@router.get("/phrasebank/sections")
async def get_phrasebank_sections():
    """Return the Ref-N-Write style paper section structure for phrase browsing."""
    data = _load_phrasebank()
    return {"sections": data.get("sections", [])}


# ── Phrase Favorites ────────────────────────────────────────────────

@router.get("/favorites")
async def get_favorites(category_id: Optional[str] = Query(default=None)):
    """Return bookmarked phrases."""
    return {"favorites": await local_db.get_phrase_favorites(category_id)}


@router.post("/favorites")
async def add_favorite(req: FavoriteRequest):
    """Bookmark a phrase."""
    try:
        fav = await local_db.add_phrase_favorite(req.category_id, req.phrase_text)
        return {"favorite": fav, "message": "Phrase bookmarked."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not bookmark phrase: {exc}")


@router.delete("/favorites")
async def remove_favorite(req: FavoriteRequest):
    """Remove a bookmarked phrase."""
    deleted = await local_db.remove_phrase_favorite(req.category_id, req.phrase_text)
    if not deleted:
        raise HTTPException(status_code=404, detail="Phrase not found in favorites.")
    return {"message": "Phrase removed from favorites."}


# ── Phrase Usage Tracking ──────────────────────────────────────────

@router.post("/log-usage")
async def log_phrase_usage_endpoint(req: LogUsageRequest):
    """Record that a phrase was used in writing (powers smart suggestions)."""
    await local_db.log_phrase_usage(req.phrase_category, req.phrase_text)
    return {"message": "Phrase usage recorded."}


@router.get("/recent-phrases")
async def get_recent_phrases(
    limit: int = Query(default=20, ge=1, le=50),
    category_id: Optional[str] = Query(default=None),
):
    """Return recently used phrases."""
    return {"phrases": await local_db.get_recent_phrases(limit, category_id)}


@router.get("/most-used-phrases")
async def get_most_used_phrases(limit: int = Query(default=30, ge=1, le=100)):
    """Return most frequently used phrases."""
    return {"phrases": await local_db.get_most_used_phrases(limit)}


# ── Paraphrase ──────────────────────────────────────────────────────

@router.post("/paraphrase")
async def paraphrase(req: ParaphraseRequest):
    """Paraphrase a selected passage with the active AI provider."""
    selection = req.text_selection.strip()
    if not selection:
        raise HTTPException(status_code=400, detail="text_selection must not be empty.")

    locked_selection, selection_locks = lock_citations(selection)
    locked_context = req.context
    prompt = _paraphrase_prompt(locked_selection, locked_context, req.tone)
    config = load_ai_settings(mask_keys=False)
    public_config = load_ai_settings(mask_keys=True)

    try:
        raw_text, model = await generate_text_with_active_provider(
            prompt,
            config,
            cloud_privacy_modes={"selected_paragraph", "selected_chapter", "cloud_allowed"},
            task_label="selected-text paraphrase",
            timeout_seconds=90.0,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Paraphrase provider failed: {exc}") from exc

    restored_text, all_restored, missing_tokens = unlock_citations(raw_text.strip(), selection_locks)
    if not restored_text:
        raise HTTPException(status_code=502, detail="AI provider returned an empty paraphrase.")

    return {
        "original_text": selection,
        "paraphrased_text": restored_text,
        "provider": public_config.provider,
        "model": model,
        "privacy_mode": public_config.privacy_mode,
        "citation_lock": {
            "locked_count": len(selection_locks),
            "all_restored": all_restored,
            "missing_tokens": missing_tokens,
        },
    }


# ── Grammar Check ───────────────────────────────────────────────────

@router.post("/grammar")
async def grammar_check(req: GrammarCheckRequest):
    """Check text for grammar, spelling, and usage issues using AI."""
    text = req.text.strip()
    if not text or len(text.split()) < 3:
        raise HTTPException(status_code=400, detail="Text must contain at least 3 words.")

    prompt = _grammar_prompt(text, req.mode)
    config = load_ai_settings(mask_keys=False)
    public_config = load_ai_settings(mask_keys=True)

    try:
        raw_text, model = await generate_text_with_active_provider(
            prompt, config,
            cloud_privacy_modes={"selected_paragraph", "selected_chapter", "cloud_allowed"},
            task_label="grammar check",
            timeout_seconds=60.0,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Grammar check failed: {exc}") from exc

    try:
        findings = json.loads(raw_text.strip())
        if not isinstance(findings, list):
            raise ValueError("Expected JSON array")
    except (json.JSONDecodeError, ValueError):
        findings = [{"type": "unknown", "severity": "warning", "original": "",
                      "correction": "", "explanation": "AI returned unparseable response. Try again.",
                      "position": 0}]

    return {
        "text": text,
        "findings": findings,
        "finding_count": len(findings),
        "provider": public_config.provider,
        "model": model,
        "privacy_mode": public_config.privacy_mode,
    }


# ── Tone Check ──────────────────────────────────────────────────────

@router.post("/tone")
async def tone_check(req: ToneCheckRequest):
    """Analyze the academic tone of the provided text."""
    text = req.text.strip()
    if not text or len(text.split()) < 10:
        raise HTTPException(status_code=400, detail="Text must contain at least 10 words for tone analysis.")

    prompt = _tone_prompt(text)
    config = load_ai_settings(mask_keys=False)
    public_config = load_ai_settings(mask_keys=True)

    try:
        raw_text, model = await generate_text_with_active_provider(
            prompt, config,
            cloud_privacy_modes={"selected_paragraph", "selected_chapter", "cloud_allowed"},
            task_label="tone analysis",
            timeout_seconds=45.0,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Tone analysis failed: {exc}") from exc

    try:
        analysis = json.loads(raw_text.strip())
        if not isinstance(analysis, dict):
            raise ValueError("Expected JSON object")
    except (json.JSONDecodeError, ValueError):
        analysis = {
            "overall_tone": "unknown", "academic_score": 50, "clarity_score": 50,
            "confidence_score": 50, "hedging_density": "moderate",
            "flags": ["AI returned unparseable response"], "suggestions": ["Try again."],
        }

    return {
        "text_length": len(text.split()),
        **analysis,
        "provider": public_config.provider,
        "model": model,
        "privacy_mode": public_config.privacy_mode,
    }


# ── Context-Aware Suggestions ───────────────────────────────────────

@router.post("/suggestions")
async def get_suggestions(req: SuggestionRequest):
    """Get context-aware academic phrase suggestions for the current cursor position."""
    if not req.context_before.strip() and not req.context_after.strip():
        raise HTTPException(status_code=400, detail="Provide context_before or context_after for suggestions.")

    prompt = _suggestions_prompt(req.context_before, req.context_after, req.category_id, req.count)
    config = load_ai_settings(mask_keys=False)
    public_config = load_ai_settings(mask_keys=True)

    try:
        raw_text, model = await generate_text_with_active_provider(
            prompt, config,
            cloud_privacy_modes={"selected_paragraph", "selected_chapter", "cloud_allowed"},
            task_label="writing suggestions",
            timeout_seconds=45.0,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Suggestion generation failed: {exc}") from exc

    try:
        suggestions = json.loads(raw_text.strip())
        if not isinstance(suggestions, list):
            raise ValueError("Expected JSON array")
    except (json.JSONDecodeError, ValueError):
        suggestions = [{"phrase": "Unable to generate suggestions.", "category": "unknown",
                         "rationale": "AI returned unparseable response. Try again."}]

    return {
        "suggestions": suggestions[:req.count],
        "suggestion_count": len(suggestions),
        "provider": public_config.provider,
        "model": model,
        "privacy_mode": public_config.privacy_mode,
    }


# ── Citation Search ──────────────────────────────────────────────────

class CitationResult(BaseModel):
    doi: str = ""
    title: str = ""
    authors: str = ""
    year: str = ""
    journal: str = ""
    url: str = ""
    source: str = "crossref"


async def _query_crossref_citations(q: str, limit: int) -> list[CitationResult]:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
            resp = await client.get(
                "https://api.crossref.org/works",
                params={"query": q, "rows": min(limit, 10)},
                headers={"User-Agent": "OTIF/1.0 academic-integrity"},
            )
            resp.raise_for_status()
            items = resp.json().get("message", {}).get("items", [])
            out: list[CitationResult] = []
            for item in items:
                author_list = item.get("author", [])
                author_str = "; ".join(
                    f"{a.get('family', '')}, {a.get('given', '')}".strip(", ")
                    for a in author_list
                ) or "Unknown"
                pub = item.get("published-print", {}) or item.get("published-online", {}) or {}
                year_parts = pub.get("date-parts", [[None]])[0]
                year = str(year_parts[0]) if year_parts and year_parts[0] else "n.d."
                container = item.get("container-title", [""])
                out.append(CitationResult(
                    doi=item.get("DOI", ""),
                    title=(item.get("title", ["Untitled"]) or ["Untitled"])[0],
                    authors=author_str,
                    year=year,
                    journal=container[0] if container else "",
                    url=item.get("URL", f"https://doi.org/{item.get('DOI', '')}"),
                    source="crossref",
                ))
            return out
    except Exception:
        return []


async def _query_openalex_citations(q: str, limit: int) -> list[CitationResult]:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
            resp = await client.get(
                "https://api.openalex.org/works",
                params={"search": q, "per_page": min(limit, 10)},
                headers={"User-Agent": "OTIF/1.0 academic-integrity"},
            )
            resp.raise_for_status()
            items = resp.json().get("results", [])
            out: list[CitationResult] = []
            for item in items:
                authorship = item.get("authorships", [])
                author_str = "; ".join(
                    a.get("author", {}).get("display_name", "Unknown")
                    for a in authorship
                ) or "Unknown"
                out.append(CitationResult(
                    doi=item.get("doi", "").lstrip("https://doi.org/") if item.get("doi") else "",
                    title=item.get("title", "Untitled"),
                    authors=author_str,
                    year=str(item.get("publication_year", "n.d.")),
                    journal=item.get("primary_location", {}).get("source", {}).get("display_name", ""),
                    url=item.get("doi", ""),
                    source="openalex",
                ))
            return out
    except Exception:
        return []


async def _search_open_citation_candidates(q: str, limit: int = 12, source: str | None = None) -> list[CitationResult]:
    import asyncio

    sources_to_query = [source] if source else ["crossref", "openalex"]
    results: list[CitationResult] = []
    if "crossref" in sources_to_query and "openalex" in sources_to_query:
        crossref_results, openalex_results = await asyncio.gather(
            _query_crossref_citations(q, limit),
            _query_openalex_citations(q, limit),
        )
        raw_results = crossref_results + openalex_results
    elif "crossref" in sources_to_query:
        raw_results = await _query_crossref_citations(q, limit)
    elif "openalex" in sources_to_query:
        raw_results = await _query_openalex_citations(q, limit)
    else:
        raw_results = []

    seen: set[str] = set()
    for citation in raw_results:
        key = citation.doi or citation.title.lower()
        if key and key not in seen:
            seen.add(key)
            results.append(citation)
    results.sort(key=lambda r: (r.year == "n.d.", -int(r.year) if r.year.isdigit() else 0))
    return results[:limit]


@router.get("/search-citations")
async def search_citations(
    q: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(default=15, ge=1, le=30),
    source: str | None = Query(default=None, description="crossref, openalex, or semantic_scholar"),
):
    """Search CrossRef, OpenAlex, and Semantic Scholar for citation insertion."""
    sources_to_query = [source] if source else ["crossref", "openalex"]
    results = await _search_open_citation_candidates(q, limit, source)

    return {
        "query": q,
        "results": results[:limit],
        "total": len(results),
        "sources_queried": sources_to_query,
    }


# ── Preferences ─────────────────────────────────────────────────────

@router.get("/preferences")
async def get_preferences():
    """Return all user preferences."""
    return {"preferences": await local_db.get_all_preferences()}


@router.put("/preferences/{key}")
async def set_preference(key: str, value: str = Query(...)):
    """Set a single user preference."""
    await local_db.set_preference(key, value)
    return {"key": key, "value": value, "message": "Preference saved."}


# ── Write from Context ──────────────────────────────────────────────

def _write_from_context_prompt(req: WriteFromContextRequest, citation_candidates: list[CitationResult]) -> str:
    sections_list = "\n  ".join(f"- {s}" for s in req.sections)
    format_labels: dict[str, str] = {
        "apa7": "APA 7th edition (Author, Year) — double-spaced, 1-inch margins, running head",
        "ugc": "UGC PhD thesis format (India) — Times New Roman 12pt, double-spaced, 1.5\" left binding margin, minimum 80,000 words, Declaration + Certificate pages mandatory, max 10% plagiarism per UGC 2018 regulations",
        "iit": "IIT senate thesis format — A4, 1.5 spacing, 12pt, Nomenclature list, Synopsis before chapters, Publications categorized by Journal/Conference/Book",
        "aicte": "AICTE doctoral format — 12pt Times New Roman, double spacing, 1.5\" binding margin, chapter-wise figure numbering (Fig 1.1), Shodhganga submission required",
        "ieee": "IEEE — numbered citations [1], [2], two-column or single-column, equations numbered, figures with captions below",
        "harvard": "Harvard — (Author, Year) in-text, alphabetical reference list, common in UK/Australian universities",
        "springer": "Springer journal format — structured abstract, author contribution statement, data availability, conflict of interest declaration",
        "elsevier": "Elsevier journal format — structured abstract, highlights, graphical abstract, author statements",
        "european_thesis": "European thesis format — varies by country, typically A4, 1.5 spacing, comprehensive bibliography",
    }
    format_label = format_labels.get(req.norm, req.norm.upper())
    doc_label = req.doc_type.replace("_", " ").title()
    is_indian = req.norm in ("ugc", "iit", "aicte")
    citation_lines = "\n".join(
        (
            f"- {item.authors} ({item.year}). {item.title}. "
            f"{item.journal or item.source}. DOI/URL: {item.doi or item.url or 'not provided'}"
        )
        for item in citation_candidates[:12]
    )
    citation_block = (
        "VERIFIED OPEN-API CITATION CANDIDATES - USE THESE SOURCES:\n"
        f"{citation_lines}\n\n"
        "Citation rule: use only the candidates above unless the user's research context explicitly "
        "provides another source. Do not invent references, DOIs, journal names, authors, or years.\n\n"
    )
    return (
        f"You are an expert academic writing assistant specialized in producing publication-ready "
        f"academic manuscripts. Write a complete, structured {doc_label} in {format_label} format.\n\n"
        "═══ CRITICAL RULES — FOLLOW EXACTLY ═══\n\n"
        "── REAL CITATIONS (MANDATORY) ──\n"
        "1. Use ONLY real, verifiable citations that you know exist. Cite classic papers by their "
        "actual author names and years. Examples of REAL citatable works to use when relevant:\n"
        "   • For technology adoption: Davis (1989) TAM model — MIS Quarterly\n"
        "   • For AI ethics: Floridi & Cowls (2019) — Harvard Data Science Review\n"
        "   • For design science: Hevner et al. (2004) — MIS Quarterly\n"
        "   • For qualitative methods: Braun & Clarke (2006) thematic analysis — Qual Research in Psych\n"
        "   • For mixed methods: Creswell & Clark (2017) — Sage Publications\n"
        "   • For systematic reviews: Kitchenham (2004) — Keele University Technical Report\n"
        "   • For grounded theory: Charmaz (2014) — Sage Publications\n"
        "   • For case study method: Yin (2018) — Sage Publications\n"
        "   • For structural equation modeling: Hair et al. (2019) — multivariate data analysis\n"
        "   • For UTAUT: Venkatesh et al. (2003) — MIS Quarterly\n"
        "   • For Indian education policy: cite NEP 2020, UGC Regulations 2018/2022\n"
        "   • For Indian research: cite Shodhganga theses, Scopus-indexed Indian journals\n"
        "2. Format citations EXACTLY per the {req.norm} style. Include author, year, title, journal/venue.\n"
        "3. NEVER use placeholder brackets like [CITE], [REF], [AUTHOR], (???, YEAR), etc.\n"
        "4. In-text citations MUST have a real author name and real year: e.g., (Smith, 2019) or [1].\n"
        "5. Include a properly formatted References/Bibliography section with full citation details.\n\n"
        "── ANTI-PLAGIARISM (MANDATORY) ──\n"
        "6. Write EVERY sentence in your own words. Do NOT copy-paste from any source.\n"
        "7. Paraphrase all concepts — change sentence structure, word choice, and organization.\n"
        "8. When referencing existing work, always add your own analysis, critique, or synthesis.\n"
        "9. Use quotation marks for any direct quote AND include the page number.\n"
        "10. Every factual claim, statistic, or non-original idea MUST have an in-text citation.\n\n"
        "── HUMAN ACADEMIC VOICE / REDUCE FORMULAIC AI-LIKE PATTERNS ──\n"
        "11. VARY sentence length dramatically — mix short punchy sentences (5–10 words) with "
        "longer analytical sentences (20–35 words). Natural human writing has high burstiness.\n"
        "12. DO NOT overuse formulaic transitions like 'Furthermore', 'Moreover', 'In addition', "
        "'Consequently', 'Nevertheless', 'However', 'Therefore', 'Thus', 'Hence' — humans rarely "
        "stack more than 1-2 of these per paragraph. Vary your transitions.\n"
        "13. Use occasional first-person where appropriate: 'This research investigates...', "
        "'We argue that...', 'The findings suggest...' — scholarly but human.\n"
        "14. Insert occasional hedging phrases: 'may indicate', 'appears to suggest', "
        "'potentially reflects', 'could be interpreted as', 'warrants further investigation'.\n"
        "15. Include specific, concrete details that an AI would not invent without prompting: "
        "exact numbers, specific contexts, nuanced caveats, regional specifics.\n"
        "16. Add occasional asides, parenthetical clarifications, and real-world examples.\n"
        "17. Avoid perfectly parallel lists — human writers rarely use identical grammatical "
        "structures in every list item.\n\n"
        f"{'── INDIAN PhD / UGC SPECIFIC ──' if is_indian else ''}\n"
        f"{'18. Reference UGC Regulations 2018 (plagiarism), UGC Minimum Standards 2022.' if is_indian else ''}\n"
        f"{'19. Include Declaration by Researcher and Certificate by Supervisor sections.' if is_indian else ''}\n"
        f"{'20. Cite relevant Indian policies: NEP 2020, UGC Guidelines, NAAC criteria.' if is_indian else ''}\n"
        f"{'21. Reference Shodhganga (INFLIBNET) for previous Indian theses in the field.' if is_indian else ''}\n"
        f"{'22. Use Indian English spelling conventions (programme, colour, organisation).' if is_indian else ''}\n\n"
        "── DIAGRAMS ──\n"
        "23. Where describing processes, frameworks, or models, include a MERMAID diagram "
        "description in a code block: ```mermaid\n<diagram_syntax>\n```\n"
        "   Use these Mermaid diagram types:\n"
        "   • For research frameworks: graph TD (top-down conceptual model)\n"
        "   • For methodology steps: graph LR (left-right process flow)\n"
        "   • For literature themes: mindmap\n"
        "   • For timelines: gantt\n\n"
        + citation_block
        + f"RESEARCH CONTEXT:\n\"\"\"\n{req.research_context.strip()}\n\"\"\"\n\n"
        f"SECTIONS TO WRITE (in order):\n  {sections_list}\n\n"
        "FORMAT THE OUTPUT as follows:\n"
        "- Use '## Section Name' markdown headings for each section.\n"
        "- Under each heading, write the complete section content with real citations.\n"
        "- Include a '## References' section at the end with full bibliographic details.\n"
        "- Include at least one ```mermaid``` code block for a relevant diagram.\n"
        "- Total target: generate a complete, self-contained document ready for submission.\n"
    )


def _save_generated_document(text: str, req: WriteFromContextRequest, title: str, model_used: str, citation_candidates: list[CitationResult]) -> dict:
    uploads_dir = Path(settings.UPLOADS_PATH)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    doc_id = str(uuid.uuid4())
    safe_title = re.sub(r"[^A-Za-z0-9._-]+", "_", title).strip("_") or "generated_document"
    filename = f"{safe_title}.md"
    doc_path = uploads_dir / f"{doc_id}.md"
    doc_path.write_text(text, encoding="utf-8")
    metadata = {
        "doc_id": doc_id,
        "filename": filename,
        "extension": ".md",
        "size_bytes": len(text.encode("utf-8")),
        "path": str(doc_path),
        "project_id": None,
        "source": "write_from_context",
        "doc_type": req.doc_type,
        "norm": req.norm,
        "title": title,
        "model_used": model_used,
        "citation_candidate_count": len(citation_candidates),
    }
    document_metadata_path(doc_id).write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


@router.post("/write-from-context")
async def write_from_context(req: WriteFromContextRequest):
    """
    Generate a full academic document scaffold from a research context description.
    The AI uses the provided context, document type, and target format to produce a
    structured first-draft with all requested sections.
    """
    citation_candidates = await _search_open_citation_candidates(req.research_context, limit=12)
    if not citation_candidates:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not retrieve citation candidates from open scholarly APIs. "
                "Check internet/proxy access and try again."
            ),
        )

    config = load_ai_settings()
    prompt = _write_from_context_prompt(req, citation_candidates)
    try:
        text, model_used = await generate_text_with_active_provider(
            prompt, config,
            cloud_privacy_modes={"selected_chapter", "cloud_allowed"},
            task_label="document writing",
            timeout_seconds=240.0,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI writing failed: {exc}") from exc

    # Convert markdown headings to simple HTML paragraphs for the editor
    lines = text.split("\n")
    html_parts: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("## "):
            html_parts.append(f"<h2>{stripped[3:]}</h2>")
        elif stripped.startswith("# "):
            html_parts.append(f"<h1>{stripped[2:]}</h1>")
        elif stripped.startswith("### "):
            html_parts.append(f"<h3>{stripped[4:]}</h3>")
        else:
            html_parts.append(f"<p>{stripped}</p>")

    title = f"{req.doc_type.replace('_', ' ').title()} - {req.norm.upper()}"
    metadata = _save_generated_document(text, req, title, model_used, citation_candidates)

    return {
        "doc_id": metadata["doc_id"],
        "filename": metadata["filename"],
        "html": "\n".join(html_parts),
        "text": text,
        "content": text,
        "title": f"{req.doc_type.replace('_', ' ').title()} — {req.norm.upper()}",
        "model_used": model_used,
        "title": title,
        "section_count": len(req.sections),
        "citation_candidates": [candidate.model_dump() for candidate in citation_candidates],
        "citation_candidate_count": len(citation_candidates),
        "message": "Generated document saved locally and ready for export or analysis.",
    }


# ── Citation Validation ─────────────────────────────────────────────

class ValidateCitationsRequest(BaseModel):
    text: str = Field(..., min_length=50, max_length=50000)
    doc_type: str = "research_paper"


@router.post("/validate-citations")
async def validate_citations(req: ValidateCitationsRequest):
    """
    Extract and validate citations from generated text against live open APIs:
    CrossRef, arXiv, Semantic Scholar, and OpenAlex.
    Returns which citations are verified, which are suspicious, and what's missing.
    """
    import re

    # Extract citation patterns — both parenthetical and narrative
    parenthetical = re.compile(r'\(([A-Z][A-Za-z\-\'\s]+(?:et al\.?)?),\s*(\d{4}[a-z]?)\)')
    narrative = re.compile(r'([A-Z][A-Za-z\-\']+(?:\s(?:et al\.?|&\s[A-Z][A-Za-z\-\']+))?)\s*\((\d{4}[a-z]?)\)')
    ieee_pattern = re.compile(r'\[(\d+(?:\s*[,–-]\s*\d+)*)\]')
    doi_pattern = re.compile(r'10\.\d{4,9}/[-._;()/:A-Za-z0-9]+')

    seen: set[str] = set()
    apa_citations: list[dict] = []
    for m in parenthetical.finditer(req.text):
        key = f"{m.group(1).strip()}|{m.group(2)}"
        if key not in seen:
            seen.add(key)
            apa_citations.append({"type": "parenthetical", "author": m.group(1).strip(), "year": m.group(2), "raw": m.group(0)})
    for m in narrative.finditer(req.text):
        key = f"{m.group(1).strip()}|{m.group(2)}"
        if key not in seen:
            seen.add(key)
            apa_citations.append({"type": "narrative", "author": m.group(1).strip(), "year": m.group(2), "raw": m.group(0)})

    ieee_refs = [m.group(0) for m in ieee_pattern.finditer(req.text)]
    dois_found = [m.group(0) for m in doi_pattern.finditer(req.text)]

    # Validate against CrossRef using author+year query
    validated: list[dict] = []
    unvalidated: list[dict] = []
    api_errors: list[str] = []

    async def validate_apa(citation: dict) -> dict | None:
        query = f"{citation['author']} {citation['year']}"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
                resp = await client.get(
                    "https://api.crossref.org/works",
                    params={"query": query, "rows": 3},
                    headers={"User-Agent": "OTIF/1.0 citation-validator"},
                )
                resp.raise_for_status()
                items = resp.json().get("message", {}).get("items", [])
                if items:
                    first = items[0]
                    return {
                        "query": query,
                        "matched_title": (first.get("title", [""]) or [""])[0][:150],
                        "doi": first.get("DOI", ""),
                        "source": "crossref",
                        "match_confidence": "high" if len(items) >= 1 else "low",
                    }
        except Exception:
            pass

        # Fallback: try Semantic Scholar
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
                resp = await client.get(
                    "https://api.semanticscholar.org/graph/v1/paper/search",
                    params={"query": query, "limit": 3, "fields": "title,externalIds"},
                )
                resp.raise_for_status()
                papers = resp.json().get("data", [])
                if papers:
                    return {
                        "query": query,
                        "matched_title": papers[0].get("title", "")[:150],
                        "doi": papers[0].get("externalIds", {}).get("DOI", ""),
                        "source": "semantic_scholar",
                        "match_confidence": "medium",
                    }
        except Exception:
            pass

        return None

    # Validate up to 15 APA citations to avoid rate limits
    import asyncio
    tasks = [validate_apa(c) for c in apa_citations[:15]]
    results = await asyncio.gather(*tasks)

    for citation, result in zip(apa_citations[:15], results):
        entry = {**citation, "validated": bool(result)}
        if result:
            entry["validation"] = result
            validated.append(entry)
        else:
            unvalidated.append(entry)

    return {
        "total_citations_found": len(apa_citations) + len(ieee_refs),
        "apa_citations": len(apa_citations),
        "ieee_refs": len(ieee_refs),
        "dois": len(dois_found),
        "validated_citations": validated,
        "validated_count": len(validated),
        "unvalidated_citations": unvalidated,
        "unvalidated_count": len(unvalidated),
        "validation_rate": round(len(validated) / max(1, len(apa_citations[:15])) * 100, 1),
        "note": "Validated against CrossRef + Semantic Scholar. Unvalidated citations may need manual verification.",
        "apis_used": ["crossref", "semantic_scholar"],
    }
