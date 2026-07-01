"""Free/open research source checks used by the analysis stream."""
import asyncio
import hashlib
import json
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.config import settings


@dataclass(frozen=True)
class ResearchSource:
    id: str
    name: str
    base_url: str
    requires_key: bool = False


SOURCES = [
    ResearchSource("arxiv", "arXiv", "https://export.arxiv.org/api/query"),
    ResearchSource("crossref", "Crossref", "https://api.crossref.org/works"),
    ResearchSource("europe_pmc", "Europe PMC", "https://www.ebi.ac.uk/europepmc/webservices/rest/search"),
    ResearchSource("zenodo", "Zenodo", "https://zenodo.org/api/records"),
    ResearchSource("semantic_scholar", "Semantic Scholar", "https://api.semanticscholar.org/graph/v1/paper/search"),
    ResearchSource("openalex", "OpenAlex", "https://api.openalex.org/works"),
]

RESEARCH_CACHE_TTL_SECONDS = 24 * 60 * 60
SOURCE_RATE_DELAY_SECONDS = 0.35


def _cache_dir() -> Path:
    path = Path(settings.PROJECTS_PATH).parent / "research_cache"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _cache_key(source_id: str, query: str) -> Path:
    digest = hashlib.sha256(f"{source_id}:{query}".encode("utf-8")).hexdigest()
    return _cache_dir() / f"{digest}.json"


def _read_cached_result(source_id: str, query: str) -> list[dict] | None:
    path = _cache_key(source_id, query)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if time.time() - float(payload.get("created_at", 0)) > RESEARCH_CACHE_TTL_SECONDS:
            return None
        matches = payload.get("matches", [])
        return matches if isinstance(matches, list) else None
    except (OSError, json.JSONDecodeError, ValueError):
        return None


def _write_cached_result(source_id: str, query: str, matches: list[dict]) -> None:
    path = _cache_key(source_id, query)
    payload = {
        "source_id": source_id,
        "query": query,
        "created_at": time.time(),
        "matches": matches,
    }
    try:
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        pass


def build_research_queries(text: str, max_queries: int = 3) -> list[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    title = next((line for line in lines if 8 <= len(line) <= 180), "")
    candidates = [title]

    words = [
        word
        for word in re.findall(r"\b[A-Za-z][A-Za-z-]{4,}\b", text.lower())
        if word
        not in {
            "about",
            "after",
            "among",
            "based",
            "between",
            "chapter",
            "could",
            "found",
            "paper",
            "research",
            "study",
            "their",
            "there",
            "these",
            "those",
            "thesis",
            "using",
            "which",
            "within",
            "would",
        }
    ]
    frequency: dict[str, int] = {}
    for word in words:
        frequency[word] = frequency.get(word, 0) + 1
    keywords = [word for word, _ in sorted(frequency.items(), key=lambda item: item[1], reverse=True)[:8]]
    if keywords:
        candidates.append(" ".join(keywords[:5]))
        candidates.append(" ".join(keywords[3:8]))

    queries: list[str] = []
    for candidate in candidates:
        normalized = " ".join(candidate.split())
        if normalized and normalized not in queries:
            queries.append(normalized[:160])
        if len(queries) >= max_queries:
            break
    return queries or ["academic research integrity"]


def _result_item(title: str | None, url: str | None, year: Any = None) -> dict:
    return {
        "title": (title or "Untitled result").strip()[:240],
        "url": url,
        "year": year,
    }


def _tokens(value: str) -> set[str]:
    stop_words = {
        "about",
        "after",
        "also",
        "among",
        "based",
        "before",
        "between",
        "could",
        "from",
        "have",
        "into",
        "more",
        "paper",
        "research",
        "study",
        "that",
        "their",
        "there",
        "these",
        "this",
        "those",
        "through",
        "using",
        "which",
        "with",
        "within",
        "would",
    }
    return {
        token
        for token in re.findall(r"\b[a-z][a-z\-]{3,}\b", value.lower())
        if token not in stop_words
    }


def _document_evidence_passages(text: str, max_passages: int = 6) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    candidates = [
        " ".join(sentence.split())
        for sentence in sentences
        if 12 <= len(sentence.split()) <= 45
    ]
    candidates.sort(key=lambda sentence: len(_tokens(sentence)), reverse=True)
    return candidates[:max_passages]


def _classify_overlap(overlap_percent: float) -> str:
    if overlap_percent >= 58:
        return "possible_similarity_risk"
    if overlap_percent >= 35:
        return "citation_candidate"
    if overlap_percent >= 18:
        return "context_match"
    return "weak_context"


def attach_source_evidence(text: str, report: dict) -> dict:
    passages = _document_evidence_passages(text)
    for source in report.get("sources", []):
        enriched_matches = []
        for match in source.get("matches", []):
            title = match.get("title") or ""
            title_tokens = _tokens(title)
            best_passage = ""
            best_overlap = 0.0
            best_terms: list[str] = []
            for passage in passages:
                passage_tokens = _tokens(passage)
                if not title_tokens or not passage_tokens:
                    continue
                shared = sorted(title_tokens & passage_tokens)
                overlap = len(shared) / max(1, min(len(title_tokens), len(passage_tokens))) * 100
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_passage = passage
                    best_terms = shared[:8]
            enriched_matches.append(
                {
                    **match,
                    "evidence": {
                        "document_passage": best_passage[:360],
                        "overlap_percent": round(best_overlap, 1),
                        "shared_terms": best_terms,
                        "classification": _classify_overlap(best_overlap),
                        "note": (
                            "Overlap is based on title/query token comparison only; inspect the source before treating it as plagiarism evidence."
                        ),
                    },
                }
            )
        source["matches"] = enriched_matches
    return report


async def _get_json(client: httpx.AsyncClient, url: str, params: dict, headers: dict | None = None) -> dict:
    response = await client.get(url, params=params, headers=headers or {})
    response.raise_for_status()
    return response.json()


async def _check_arxiv(client: httpx.AsyncClient, query: str) -> list[dict]:
    response = await client.get(
        "https://export.arxiv.org/api/query",
        params={"search_query": f"all:{query}", "start": 0, "max_results": 3},
    )
    response.raise_for_status()
    root = ET.fromstring(response.text)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    results = []
    for entry in root.findall("atom:entry", ns)[:3]:
        title = entry.findtext("atom:title", default="", namespaces=ns)
        url = entry.findtext("atom:id", default="", namespaces=ns)
        published = entry.findtext("atom:published", default="", namespaces=ns)
        results.append(_result_item(title, url, published[:4] if published else None))
    return results


async def _check_crossref(client: httpx.AsyncClient, query: str) -> list[dict]:
    data = await _get_json(client, "https://api.crossref.org/works", {"query": query, "rows": 3})
    items = data.get("message", {}).get("items", [])
    return [
        _result_item(
            (item.get("title") or ["Untitled result"])[0],
            item.get("URL"),
            (item.get("published-print") or item.get("published-online") or {}).get("date-parts", [[None]])[0][0],
        )
        for item in items[:3]
    ]


async def _check_europe_pmc(client: httpx.AsyncClient, query: str) -> list[dict]:
    data = await _get_json(
        client,
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
        {"query": query, "format": "json", "pageSize": 3},
    )
    items = data.get("resultList", {}).get("result", [])
    return [_result_item(item.get("title"), item.get("doi") or item.get("pmcid"), item.get("pubYear")) for item in items[:3]]


async def _check_zenodo(client: httpx.AsyncClient, query: str) -> list[dict]:
    data = await _get_json(client, "https://zenodo.org/api/records", {"q": query, "size": 3})
    items = data.get("hits", {}).get("hits", [])
    return [
        _result_item(
            item.get("metadata", {}).get("title"),
            item.get("links", {}).get("html"),
            item.get("metadata", {}).get("publication_date", "")[:4],
        )
        for item in items[:3]
    ]


async def _check_semantic_scholar(client: httpx.AsyncClient, query: str) -> list[dict]:
    headers = {}
    if settings.SEMANTIC_SCHOLAR_API_KEY:
        headers["x-api-key"] = settings.SEMANTIC_SCHOLAR_API_KEY
    data = await _get_json(
        client,
        "https://api.semanticscholar.org/graph/v1/paper/search",
        {"query": query, "limit": 3, "fields": "title,url,year"},
        headers=headers,
    )
    return [_result_item(item.get("title"), item.get("url"), item.get("year")) for item in data.get("data", [])[:3]]


async def _check_openalex(client: httpx.AsyncClient, query: str) -> list[dict]:
    params = {"search": query, "per-page": 3}
    if settings.OPENALEX_EMAIL:
        params["mailto"] = settings.OPENALEX_EMAIL
    if settings.OPENALEX_API_KEY:
        params["api_key"] = settings.OPENALEX_API_KEY
    data = await _get_json(client, "https://api.openalex.org/works", params)
    return [
        _result_item(item.get("display_name"), item.get("id"), item.get("publication_year"))
        for item in data.get("results", [])[:3]
    ]


CHECKERS = {
    "arxiv": _check_arxiv,
    "crossref": _check_crossref,
    "europe_pmc": _check_europe_pmc,
    "zenodo": _check_zenodo,
    "semantic_scholar": _check_semantic_scholar,
    "openalex": _check_openalex,
}


async def check_research_sources(text: str, enabled: bool = True) -> dict:
    queries = build_research_queries(text)
    if not enabled:
        return {
            "internet_checked": False,
            "queries": queries,
            "sources": [
                {
                    "id": source.id,
                    "name": source.name,
                    "status": "skipped",
                    "message": "Internet research checks are disabled for this run.",
                    "matches": [],
                }
                for source in SOURCES
            ],
        }

    query = queries[0]
    timeout = httpx.Timeout(12.0, connect=5.0)
    source_results = []
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "OTIF/0.1 academic-integrity"}) as client:
        for index, source in enumerate(SOURCES):
            cached = _read_cached_result(source.id, query)
            if cached is not None:
                source_results.append(
                    {
                        "id": source.id,
                        "name": source.name,
                        "status": "checked",
                        "message": f"{len(cached)} cached public result(s) found for the document query.",
                        "matches": cached,
                        "cached": True,
                    }
                )
                continue
            if index > 0:
                await asyncio.sleep(SOURCE_RATE_DELAY_SECONDS)
            try:
                result = await CHECKERS[source.id](client, query)
                _write_cached_result(source.id, query, result)
            except Exception as exc:
                source_results.append(
                    {
                        "id": source.id,
                        "name": source.name,
                        "status": "unavailable",
                        "message": str(exc)[:220],
                        "matches": [],
                        "cached": False,
                    }
                )
                continue
            source_results.append(
                {
                    "id": source.id,
                    "name": source.name,
                    "status": "checked",
                    "message": f"{len(result)} public result(s) found for the document query.",
                    "matches": result,
                    "cached": False,
                }
            )

    return attach_source_evidence(text, {
        "internet_checked": True,
        "queries": queries,
        "sources": source_results,
        "cache_ttl_seconds": RESEARCH_CACHE_TTL_SECONDS,
        "rate_limit_delay_seconds": SOURCE_RATE_DELAY_SECONDS,
    })
