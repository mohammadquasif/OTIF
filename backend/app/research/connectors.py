"""Free/open research source checks used by the analysis stream."""
import asyncio
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
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
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "OTIF/0.1 academic-integrity"}) as client:
        tasks = [CHECKERS[source.id](client, query) for source in SOURCES]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    source_results = []
    for source, result in zip(SOURCES, results):
        if isinstance(result, Exception):
            source_results.append(
                {
                    "id": source.id,
                    "name": source.name,
                    "status": "unavailable",
                    "message": str(result)[:220],
                    "matches": [],
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
            }
        )

    return {
        "internet_checked": True,
        "queries": queries,
        "sources": source_results,
    }
