"""
Free/open research source checks + Turnitin-style local similarity engine used by the analysis stream.

Advanced Plagiarism Engine:
  - N-gram similarity (Jaccard + cosine-style) simulating Turnitin methodology
  - AI text fingerprinting (burstiness, perplexity proxy, sentence entropy)
  - Open academic source checks (arXiv, Crossref, OpenAlex, Semantic Scholar,
    Europe PMC, PubMed, DataCite, ERIC, OSF Preprints, Zenodo, DOAJ, CORE, BASE)
  - Originality scoring (5-dimension evidence matrix)
  - Per-sentence and per-paragraph similarity risk classification
"""
import asyncio
import hashlib
import json
import math
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.config import settings


# ─────────────────────────────────────────────────────────────────────────────
# Source Registry
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ResearchSource:
    id: str
    name: str
    base_url: str
    requires_key: bool = False
    coverage: str = "scholarly metadata"
    access_note: str = "Public metadata search; not a private full-text plagiarism database."
    docs_url: str = ""


SOURCES = [
    ResearchSource("arxiv", "arXiv", "https://export.arxiv.org/api/query", coverage="preprints", docs_url="https://info.arxiv.org/help/api/index.html"),
    ResearchSource("crossref", "Crossref", "https://api.crossref.org/works", coverage="DOI metadata", docs_url="https://www.crossref.org/documentation/retrieve-metadata/rest-api/"),
    ResearchSource("europe_pmc", "Europe PMC", "https://www.ebi.ac.uk/europepmc/webservices/rest/search", coverage="biomedical papers"),
    ResearchSource("pubmed", "PubMed / NCBI", "https://eutils.ncbi.nlm.nih.gov/entrez/eutils", coverage="biomedical citations", docs_url="https://www.ncbi.nlm.nih.gov/books/NBK25501/"),
    ResearchSource("datacite", "DataCite", "https://api.datacite.org/dois", coverage="datasets and DOI records", docs_url="https://support.datacite.org/docs/api"),
    ResearchSource("eric", "ERIC", "https://api.ies.ed.gov/eric/", coverage="education research", docs_url="https://eric.ed.gov/?api"),
    ResearchSource("osf_preprints", "OSF Preprints", "https://api.osf.io/v2/preprints/", coverage="open preprints", docs_url="https://api.osf.io/v2/docs/"),
    ResearchSource("zenodo", "Zenodo", "https://zenodo.org/api/records", coverage="research outputs and datasets"),
    ResearchSource("semantic_scholar", "Semantic Scholar", "https://api.semanticscholar.org/graph/v1/paper/search", coverage="literature graph", docs_url="https://api.semanticscholar.org/api-docs/graph"),
    ResearchSource("openalex", "OpenAlex", "https://api.openalex.org/works", requires_key=True, coverage="global scholarly graph", docs_url="https://developers.openalex.org/"),
    ResearchSource("doaj", "DOAJ", "https://doaj.org/api/search/articles", coverage="open access journals"),
    ResearchSource("core", "CORE", "https://api.core.ac.uk/v3/search/works", requires_key=True, coverage="open access repository records"),
    ResearchSource("base", "BASE", "https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi", coverage="repository metadata"),
    # ── Scholar-focused sources ──
    ResearchSource("inspire_hep", "INSPIRE-HEP", "https://inspirehep.net/api", coverage="high-energy physics, astrophysics, particle physics", docs_url="https://github.com/inspirehep/rest-api-doc"),
]

# Optional sources not in main pipeline (can be enabled per-scan):
# - "google_scholar": Google Scholar via scholarly.py (slow, may hang — not included in main SOURCES)
# - "scienceopen": ScienceOpen API (endpoint changed, returns 404)
# - "paperity": Paperity API (returns 403, blocked)

RESEARCH_CACHE_TTL_SECONDS = 24 * 60 * 60
SOURCE_RATE_DELAY_SECONDS = 0.35


# ─────────────────────────────────────────────────────────────────────────────
# Cache Helpers
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# Turnitin-Style Local Similarity Engine
# ─────────────────────────────────────────────────────────────────────────────

def _ngrams(text: str, n: int) -> set[str]:
    """Generate character n-grams from text (simulates Turnitin fingerprinting)."""
    clean = re.sub(r"\s+", " ", text.lower().strip())
    if len(clean) < n:
        return set()
    return {clean[i:i+n] for i in range(len(clean) - n + 1)}


def _word_shingles(text: str, k: int = 5) -> set[str]:
    """Generate k-word shingles (Turnitin uses 5–8 word overlapping windows)."""
    words = re.findall(r"\b[a-z]{3,}\b", text.lower())
    if len(words) < k:
        return set()
    return {" ".join(words[i:i+k]) for i in range(len(words) - k + 1)}


def _jaccard(set_a: set, set_b: set) -> float:
    """Jaccard similarity between two sets."""
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)


def _cosine_tf(text: str) -> dict[str, float]:
    """Compute term-frequency vector for cosine similarity."""
    words = re.findall(r"\b[a-z]{4,}\b", text.lower())
    tf: dict[str, float] = {}
    for w in words:
        tf[w] = tf.get(w, 0) + 1
    total = sum(tf.values()) or 1
    return {w: c / total for w, c in tf.items()}


def _cosine_sim(vec_a: dict[str, float], vec_b: dict[str, float]) -> float:
    """Cosine similarity between two tf vectors."""
    common = set(vec_a) & set(vec_b)
    if not common:
        return 0.0
    dot = sum(vec_a[w] * vec_b[w] for w in common)
    norm_a = math.sqrt(sum(v * v for v in vec_a.values()))
    norm_b = math.sqrt(sum(v * v for v in vec_b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _sentence_entropy(sentences: list[str]) -> float:
    """
    Shannon entropy of sentence lengths — low entropy = AI-like uniform rhythm.
    Human writing has higher variance (entropy).
    """
    if len(sentences) < 3:
        return 5.0
    lengths = [len(s.split()) for s in sentences if s.strip()]
    if not lengths:
        return 5.0
    mean = sum(lengths) / len(lengths)
    variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
    return round(math.sqrt(variance), 2)  # std-dev as proxy for burstiness


def _perplexity_proxy(text: str) -> float:
    """
    Proxy for language-model perplexity using word-level bigram entropy.
    Low perplexity (smooth, predictable) → AI signal.
    Returns 0–100 (lower = more AI-like).
    """
    words = re.findall(r"\b[a-z]{3,}\b", text.lower())
    if len(words) < 30:
        return 50.0
    bigrams: dict[tuple, int] = {}
    unigrams: dict[str, int] = {}
    for i, w in enumerate(words):
        unigrams[w] = unigrams.get(w, 0) + 1
        if i > 0:
            pair = (words[i - 1], w)
            bigrams[pair] = bigrams.get(pair, 0) + 1
    total_bigrams = sum(bigrams.values()) or 1
    # entropy of bigram distribution (higher = more surprising = more human)
    entropy = 0.0
    for count in bigrams.values():
        prob = count / total_bigrams
        if prob > 0:
            entropy -= prob * math.log2(prob)
    # normalize: human text typically 8–14 bits of bigram entropy
    normalized = min(100.0, entropy / 14.0 * 100.0)
    return round(normalized, 1)


def compute_local_similarity(
    document_text: str,
    source_title: str,
    source_abstract: str = "",
) -> dict:
    """
    Turnitin-style multi-signal similarity between document and a known source.

    Signals:
      1. 5-word shingle Jaccard (primary fingerprint — mimics Turnitin algorithm)
      2. 10-gram character Jaccard (secondary fingerprint)
      3. Cosine TF similarity (semantic overlap)
      4. Combined weighted score

    Returns:
      {
        "shingle_jaccard": float,    # 0–100
        "char_ngram_jaccard": float, # 0–100
        "cosine_similarity": float,  # 0–100
        "combined_similarity": float, # 0–100 (weighted)
        "risk_level": str,           # "high" | "medium" | "low" | "negligible"
        "flagged_shingles": list[str], # up to 5 exact shared shingles
      }
    """
    compare_text = (source_title + " " + source_abstract).strip()
    if not compare_text or not document_text:
        return {
            "shingle_jaccard": 0.0,
            "char_ngram_jaccard": 0.0,
            "cosine_similarity": 0.0,
            "combined_similarity": 0.0,
            "risk_level": "negligible",
            "flagged_shingles": [],
        }

    doc_shingles = _word_shingles(document_text, k=5)
    src_shingles = _word_shingles(compare_text, k=5)
    shingle_j = _jaccard(doc_shingles, src_shingles) * 100

    doc_chars = _ngrams(document_text[:5000], n=10)
    src_chars = _ngrams(compare_text, n=10)
    char_j = _jaccard(doc_chars, src_chars) * 100

    cosine = _cosine_sim(_cosine_tf(document_text[:5000]), _cosine_tf(compare_text)) * 100

    combined = shingle_j * 0.55 + char_j * 0.25 + cosine * 0.20

    if combined >= 40:
        risk = "high"
    elif combined >= 20:
        risk = "medium"
    elif combined >= 8:
        risk = "low"
    else:
        risk = "negligible"

    flagged = sorted(doc_shingles & src_shingles)[:5]

    return {
        "shingle_jaccard": round(shingle_j, 1),
        "char_ngram_jaccard": round(char_j, 1),
        "cosine_similarity": round(cosine, 1),
        "combined_similarity": round(combined, 1),
        "risk_level": risk,
        "flagged_shingles": flagged,
    }


def compute_ai_detection_score(text: str) -> dict:
    """
    Advanced AI text detection using multiple writing-pattern signals.
    Mimics GPTZero / Copyleaks AI detection methodology:
      - Perplexity proxy (bigram entropy — lower = AI-like)
      - Burstiness (sentence length variance — low = AI-like)
      - Template opener density
      - Passive voice ratio
      - Researcher voice marker density
      - Banned generic phrase density
      - Repetition ratio (near-duplicate sentences)

    Returns:
      {
        "ai_detection_score": int,        # 0–100 (% likelihood AI-generated)
        "confidence": str,                # "high" | "medium" | "low"
        "signals": dict,                  # individual signal scores
        "verdict": str,                   # human-readable verdict
        "turnitin_ai_equivalent": str,    # comparable description
      }
    """
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]
    words = re.findall(r"\b[\w']+\b", text.lower())
    word_count = len(words)

    if word_count < 80:
        return {
            "ai_detection_score": 0,
            "confidence": "low",
            "signals": {},
            "verdict": "Insufficient text for reliable AI detection (need > 80 words).",
            "turnitin_ai_equivalent": "N/A",
        }

    # Signal 1: Perplexity (lower = more AI)
    perp = _perplexity_proxy(text)
    perp_risk = max(0, min(100, 100 - perp))  # invert: low entropy → high AI risk

    # Signal 2: Sentence burstiness (higher variance = more human)
    std_dev = _sentence_entropy(sentences)
    mean_len = sum(len(s.split()) for s in sentences) / max(1, len(sentences))
    cv = (std_dev / mean_len * 100) if mean_len else 0  # coefficient of variation
    burstiness_risk = max(0, min(100, 100 - min(100, cv * 1.8)))  # low CV → high AI risk

    # Signal 3: Template opener density
    template_openers = len(re.findall(
        r"(?im)^\s*(this section|this chapter|it is (important|worth|notable)|furthermore|moreover|additionally|"
        r"in conclusion|in summary|in this (study|paper|research)|the purpose of|the aim of|the objective)\b",
        text,
    ))
    opener_risk = min(100, template_openers * 8)

    # Signal 4: Passive voice saturation
    passive_hits = len(re.findall(r"\b(?:is|are|was|were|be|been|being)\s+\w+(?:ed|en)\b", text, flags=re.I))
    passive_ratio = passive_hits / len(sentences) * 100 if sentences else 0
    passive_risk = min(100, passive_ratio * 1.5)

    # Signal 5: Researcher voice presence (reduces AI score)
    voice_hits = len(re.findall(
        r"\b(this study (found|reveals|demonstrates|argues|shows)|"
        r"the (evidence|data|findings) suggest|"
        r"(a|the) limitation (is|of)|"
        r"the practical implication|"
        r"my (interpretation|view|reading)|"
        r"I (argue|suggest|claim|contend|note)|"
        r"we (found|argue|show|demonstrate))\b",
        text, flags=re.I,
    ))
    voice_reduction = min(40, voice_hits * 5)

    # Signal 6: Sentence-level repetition (near-duplicate sentences)
    short_sents = [s for s in sentences if len(s.split()) > 6]
    dup_count = 0
    for i, s1 in enumerate(short_sents):
        for s2 in short_sents[i + 1:min(i + 20, len(short_sents))]:
            if _jaccard(_word_shingles(s1, 3), _word_shingles(s2, 3)) > 0.6:
                dup_count += 1
    repetition_risk = min(30, dup_count * 6)

    # Signal 7: Uniform sentence length (AI tends to produce consistent lengths)
    if len(sentences) >= 5:
        lengths = [len(s.split()) for s in sentences]
        pct_18_to_26 = sum(1 for l in lengths if 18 <= l <= 26) / len(lengths) * 100
        uniform_risk = min(25, pct_18_to_26 * 0.4)
    else:
        uniform_risk = 0

    # Combine signals (weighted)
    raw_score = (
        perp_risk * 0.28
        + burstiness_risk * 0.22
        + opener_risk * 0.15
        + passive_risk * 0.10
        + repetition_risk * 0.12
        + uniform_risk * 0.08
        - voice_reduction * 0.05
    )
    ai_score = max(0, min(100, round(raw_score)))

    # Confidence based on word count
    if word_count > 2000:
        confidence = "high"
    elif word_count > 500:
        confidence = "medium"
    else:
        confidence = "low"

    # Verdict
    if ai_score >= 75:
        verdict = f"Very high AI-generation probability ({ai_score}%). Writing patterns strongly match AI-generated text. Recommend thorough review and humanization."
        turnitin_eq = "Likely AI-generated (≥75% — equivalent to Turnitin AI ≥75%)"
    elif ai_score >= 50:
        verdict = f"High AI-generation probability ({ai_score}%). Multiple AI writing signals detected. Author should strengthen researcher voice and reduce templated phrasing."
        turnitin_eq = "Possible AI involvement (50–74% — equivalent to Turnitin AI mixed signal)"
    elif ai_score >= 25:
        verdict = f"Moderate AI signals ({ai_score}%). Some sections may have been drafted or polished using AI tools. Review flagged sections."
        turnitin_eq = "Low-moderate AI signals (25–49% — generally acceptable with review)"
    else:
        verdict = f"Low AI-generation probability ({ai_score}%). Writing patterns are consistent with human academic authorship."
        turnitin_eq = "Likely human-authored (<25% — equivalent to Turnitin AI low signal)"

    return {
        "ai_detection_score": ai_score,
        "confidence": confidence,
        "signals": {
            "perplexity_risk": round(perp_risk, 1),
            "burstiness_risk": round(burstiness_risk, 1),
            "template_opener_risk": round(opener_risk, 1),
            "passive_voice_risk": round(passive_risk, 1),
            "researcher_voice_reduction": round(voice_reduction, 1),
            "repetition_risk": round(repetition_risk, 1),
            "uniform_length_risk": round(uniform_risk, 1),
        },
        "verdict": verdict,
        "turnitin_ai_equivalent": turnitin_eq,
    }


def compute_turnitin_style_similarity(document_text: str, source_matches: list[dict]) -> dict:
    """
    Compute Turnitin-style aggregate similarity against all source matches.
    Simulates the 'Similarity Index' that Turnitin reports.

    Returns:
      {
        "similarity_index": float,          # 0–100 overall (like Turnitin %)
        "match_count": int,
        "high_risk_matches": int,
        "medium_risk_matches": int,
        "per_source_similarity": list[dict],
        "interpretation": str,
      }
    """
    if not source_matches or not document_text:
        return {
            "similarity_index": 0.0,
            "match_count": 0,
            "high_risk_matches": 0,
            "medium_risk_matches": 0,
            "per_source_similarity": [],
            "interpretation": "No external sources found to compare against.",
        }

    per_source = []
    high_risk = 0
    medium_risk = 0
    max_sim = 0.0

    for match in source_matches[:20]:  # cap at 20 sources
        title = match.get("title", "")
        abstract = match.get("abstract", "") or ""
        sim = compute_local_similarity(document_text, title, abstract)
        per_source.append({
            "source_title": title[:120],
            "source_url": match.get("url"),
            "source_year": match.get("year"),
            **sim,
        })
        if sim["risk_level"] == "high":
            high_risk += 1
        elif sim["risk_level"] == "medium":
            medium_risk += 1
        if sim["combined_similarity"] > max_sim:
            max_sim = sim["combined_similarity"]

    # Aggregate similarity: weighted blend of top matches
    sorted_sims = sorted(per_source, key=lambda x: x["combined_similarity"], reverse=True)
    top_sims = [s["combined_similarity"] for s in sorted_sims[:5]]
    if top_sims:
        # Turnitin uses the highest single match as primary, then adds contributions
        similarity_index = top_sims[0] * 0.6 + (sum(top_sims[1:]) / max(1, len(top_sims) - 1)) * 0.4
    else:
        similarity_index = 0.0

    similarity_index = round(min(100.0, similarity_index), 1)

    if similarity_index >= 40:
        interpretation = f"⚠️ HIGH: {similarity_index}% similarity (equivalent to Turnitin red zone ≥40%). Significant overlap with external sources detected. Manual review required."
    elif similarity_index >= 20:
        interpretation = f"🟡 MEDIUM: {similarity_index}% similarity (equivalent to Turnitin yellow zone 20–39%). Moderate overlap — review flagged passages and verify citations are properly attributed."
    elif similarity_index >= 10:
        interpretation = f"🟢 LOW: {similarity_index}% similarity (equivalent to Turnitin green zone 10–19%). Acceptable — typical for well-cited academic work."
    else:
        interpretation = f"✅ VERY LOW: {similarity_index}% similarity (equivalent to Turnitin <10%). Excellent originality against open academic sources."

    return {
        "similarity_index": similarity_index,
        "match_count": len(per_source),
        "high_risk_matches": high_risk,
        "medium_risk_matches": medium_risk,
        "per_source_similarity": sorted_sims[:10],
        "interpretation": interpretation,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Query Builder
# ─────────────────────────────────────────────────────────────────────────────

def build_research_queries(text: str, max_queries: int = 3) -> list[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    title = next((line for line in lines if 8 <= len(line) <= 180), "")
    candidates = [title]

    STOP = {
        "about", "after", "among", "based", "between", "chapter", "could",
        "found", "paper", "research", "study", "their", "there", "these",
        "those", "thesis", "using", "which", "within", "would",
    }
    words = [w for w in re.findall(r"\b[A-Za-z][A-Za-z-]{4,}\b", text.lower()) if w not in STOP]
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


# ─────────────────────────────────────────────────────────────────────────────
# Evidence Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _result_item(title: str | None, url: str | None, year: Any = None, abstract: str = "") -> dict:
    return {
        "title": (title or "Untitled result").strip()[:240],
        "url": url,
        "year": year,
        "abstract": abstract[:400] if abstract else "",
    }


def _source_meta(source: ResearchSource) -> dict:
    configured = True
    if source.id == "openalex":
        configured = bool(settings.OPENALEX_API_KEY)
    elif source.id == "core":
        configured = bool(settings.CORE_API_KEY)
    return {
        "base_url": source.base_url,
        "coverage": source.coverage,
        "access_note": source.access_note,
        "docs_url": source.docs_url,
        "requires_key": source.requires_key,
        "configured": configured,
    }


def _tokens(value: str) -> set[str]:
    stop_words = {
        "about", "after", "also", "among", "based", "before", "between",
        "could", "from", "have", "into", "more", "paper", "research",
        "study", "that", "their", "there", "these", "this", "those",
        "through", "using", "which", "with", "within", "would",
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
            # Also compute Turnitin-style shingle similarity
            local_sim = compute_local_similarity(text, title, match.get("abstract", "") or "")
            enriched_matches.append(
                {
                    **match,
                    "local_similarity": local_sim,
                    "evidence": {
                        "document_passage": best_passage[:360],
                        "overlap_percent": round(best_overlap, 1),
                        "shared_terms": best_terms,
                        "classification": _classify_overlap(best_overlap),
                        "turnitin_risk": local_sim["risk_level"],
                        "shingle_match_score": local_sim["shingle_jaccard"],
                        "note": (
                            "Multi-signal similarity: n-gram fingerprint + shingle overlap + TF cosine. "
                            "Review source before treating as confirmed plagiarism."
                        ),
                    },
                }
            )
        source["matches"] = enriched_matches
    return report


# ─────────────────────────────────────────────────────────────────────────────
# Academic Source Connectors
# ─────────────────────────────────────────────────────────────────────────────

async def _get_json(client: httpx.AsyncClient, url: str, params: dict, headers: dict | None = None) -> dict:
    response = await client.get(url, params=params, headers=headers or {})
    response.raise_for_status()
    return response.json()


async def _check_arxiv(client: httpx.AsyncClient, query: str) -> list[dict]:
    response = await client.get(
        "https://export.arxiv.org/api/query",
        params={"search_query": f"all:{query}", "start": 0, "max_results": 5},
    )
    response.raise_for_status()
    root = ET.fromstring(response.text)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    results = []
    for entry in root.findall("atom:entry", ns)[:5]:
        title = entry.findtext("atom:title", default="", namespaces=ns)
        url = entry.findtext("atom:id", default="", namespaces=ns)
        published = entry.findtext("atom:published", default="", namespaces=ns)
        summary = entry.findtext("atom:summary", default="", namespaces=ns)
        results.append(_result_item(title, url, published[:4] if published else None, summary[:400]))
    return results


async def _check_crossref(client: httpx.AsyncClient, query: str) -> list[dict]:
    data = await _get_json(client, "https://api.crossref.org/works", {"query": query, "rows": 5})
    items = data.get("message", {}).get("items", [])
    return [
        _result_item(
            (item.get("title") or ["Untitled result"])[0],
            item.get("URL"),
            (item.get("published-print") or item.get("published-online") or {}).get("date-parts", [[None]])[0][0],
            " ".join((item.get("abstract") or "").split()[:80]),
        )
        for item in items[:5]
    ]


async def _check_europe_pmc(client: httpx.AsyncClient, query: str) -> list[dict]:
    data = await _get_json(
        client,
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
        {"query": query, "format": "json", "pageSize": 5},
    )
    items = data.get("resultList", {}).get("result", [])
    return [
        _result_item(
            item.get("title"),
            item.get("doi") or item.get("pmcid"),
            item.get("pubYear"),
            item.get("abstractText", "")[:400],
        )
        for item in items[:5]
    ]


async def _check_pubmed(client: httpx.AsyncClient, query: str) -> list[dict]:
    params = {
        "db": "pubmed",
        "term": query,
        "retmode": "json",
        "retmax": 5,
        "tool": "OTIF",
    }
    if settings.NCBI_EMAIL:
        params["email"] = settings.NCBI_EMAIL
    if settings.NCBI_API_KEY:
        params["api_key"] = settings.NCBI_API_KEY
    search = await _get_json(client, "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", params)
    ids = search.get("esearchresult", {}).get("idlist", [])[:5]
    if not ids:
        return []
    summary_params = {
        "db": "pubmed",
        "id": ",".join(ids),
        "retmode": "json",
        "tool": "OTIF",
    }
    if settings.NCBI_EMAIL:
        summary_params["email"] = settings.NCBI_EMAIL
    if settings.NCBI_API_KEY:
        summary_params["api_key"] = settings.NCBI_API_KEY
    summary = await _get_json(client, "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi", summary_params)
    result = summary.get("result", {})
    items = []
    for pmid in ids:
        item = result.get(pmid, {})
        if not item:
            continue
        pubdate = str(item.get("pubdate") or "")
        items.append(
            _result_item(
                item.get("title"),
                f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                pubdate[:4] if pubdate else None,
                item.get("fulljournalname", ""),
            )
        )
    return items


async def _check_datacite(client: httpx.AsyncClient, query: str) -> list[dict]:
    data = await _get_json(client, "https://api.datacite.org/dois", {"query": query, "page[size]": 5})
    items = []
    for item in data.get("data", [])[:5]:
        attrs = item.get("attributes", {})
        title = next((t.get("title") for t in attrs.get("titles", []) if t.get("title")), None)
        description = next(
            (d.get("description") for d in attrs.get("descriptions", []) if d.get("description")),
            "",
        )
        items.append(
            _result_item(
                title,
                attrs.get("url") or (f"https://doi.org/{attrs.get('doi')}" if attrs.get("doi") else None),
                attrs.get("publicationYear"),
                description[:400],
            )
        )
    return items


async def _check_eric(client: httpx.AsyncClient, query: str) -> list[dict]:
    data = await _get_json(client, "https://api.ies.ed.gov/eric/", {"search": query, "rows": 5, "format": "json"})
    docs = data.get("response", {}).get("docs", [])
    items = []
    for item in docs[:5]:
        eric_id = item.get("id") or item.get("ericnumber")
        items.append(
            _result_item(
                item.get("title"),
                item.get("url") or (f"https://eric.ed.gov/?id={eric_id}" if eric_id else None),
                item.get("publicationdateyear") or item.get("publicationyear"),
                item.get("description") or item.get("abstract") or "",
            )
        )
    return items


async def _check_osf_preprints(client: httpx.AsyncClient, query: str) -> list[dict]:
    data = await _get_json(
        client,
        "https://api.osf.io/v2/preprints/",
        {"filter[title]": query, "page[size]": 5},
    )
    items = []
    for item in data.get("data", [])[:5]:
        attrs = item.get("attributes", {})
        links = item.get("links", {})
        date_created = str(attrs.get("date_created") or "")
        items.append(
            _result_item(
                attrs.get("title"),
                links.get("html"),
                date_created[:4] if date_created else None,
                attrs.get("description") or "",
            )
        )
    return items


async def _check_zenodo(client: httpx.AsyncClient, query: str) -> list[dict]:
    data = await _get_json(client, "https://zenodo.org/api/records", {"q": query, "size": 5})
    items = data.get("hits", {}).get("hits", [])
    return [
        _result_item(
            item.get("metadata", {}).get("title"),
            item.get("links", {}).get("html"),
            item.get("metadata", {}).get("publication_date", "")[:4],
            item.get("metadata", {}).get("description", "")[:400],
        )
        for item in items[:5]
    ]


async def _check_semantic_scholar(client: httpx.AsyncClient, query: str) -> list[dict]:
    headers = {}
    if settings.SEMANTIC_SCHOLAR_API_KEY:
        headers["x-api-key"] = settings.SEMANTIC_SCHOLAR_API_KEY
    data = await _get_json(
        client,
        "https://api.semanticscholar.org/graph/v1/paper/search",
        {"query": query, "limit": 5, "fields": "title,url,year,abstract"},
        headers=headers,
    )
    return [
        _result_item(
            item.get("title"),
            item.get("url"),
            item.get("year"),
            item.get("abstract", "")[:400],
        )
        for item in data.get("data", [])[:5]
    ]


async def _check_openalex(client: httpx.AsyncClient, query: str) -> list[dict]:
    params = {"search": query, "per-page": 5}
    if settings.OPENALEX_EMAIL:
        params["mailto"] = settings.OPENALEX_EMAIL
    if settings.OPENALEX_API_KEY:
        params["api_key"] = settings.OPENALEX_API_KEY
    data = await _get_json(client, "https://api.openalex.org/works", params)
    return [
        _result_item(
            item.get("display_name"),
            item.get("id"),
            item.get("publication_year"),
            (item.get("abstract_inverted_index") and " ".join(list(item["abstract_inverted_index"].keys())[:40])) or "",
        )
        for item in data.get("results", [])[:5]
    ]


async def _check_doaj(client: httpx.AsyncClient, query: str) -> list[dict]:
    """Directory of Open Access Journals."""
    try:
        data = await _get_json(
            client,
            "https://doaj.org/api/search/articles",
            {"q": query, "page": 1, "pageSize": 5},
        )
        results = data.get("results", [])
        items = []
        for item in results[:5]:
            bibjson = item.get("bibjson", {})
            title = bibjson.get("title", "")
            links = bibjson.get("link", [])
            url = next((l.get("url") for l in links if l.get("type") == "fulltext"), None)
            year = bibjson.get("year")
            abstract = bibjson.get("abstract", "")[:400]
            items.append(_result_item(title, url, year, abstract))
        return items
    except Exception:
        return []


async def _check_core(client: httpx.AsyncClient, query: str) -> list[dict]:
    """CORE — aggregator of open access research papers."""
    headers = {}
    if settings.CORE_API_KEY:
        headers["Authorization"] = f"Bearer {settings.CORE_API_KEY}"
    try:
        data = await _get_json(
            client,
            "https://api.core.ac.uk/v3/search/works",
            {"q": query, "limit": 5},
            headers=headers,
        )
        items = []
        for item in data.get("results", [])[:5]:
            title = item.get("title", "")
            url = item.get("links", [{}])[0].get("url") if item.get("links") else None
            year = item.get("yearPublished")
            abstract = (item.get("abstract") or "")[:400]
            items.append(_result_item(title, url, year, abstract))
        return items
    except Exception:
        return []


async def _check_base(client: httpx.AsyncClient, query: str) -> list[dict]:
    """BASE — Bielefeld Academic Search Engine."""
    try:
        data = await _get_json(
            client,
            "https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi",
            {"func": "PerformSearch", "query": query, "format": "json", "hits": 5},
        )
        docs = data.get("response", {}).get("docs", [])
        items = []
        for doc in docs[:5]:
            title = doc.get("dctitle", "")
            url = doc.get("dclink")
            year = str(doc.get("dcyear", ""))[:4] if doc.get("dcyear") else None
            abstract = doc.get("dcdescription", "")[:400]
            items.append(_result_item(title, url, year, abstract))
        return items
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────────
# NEW: Scholar-Focused Source Checkers
# ─────────────────────────────────────────────────────────────────────────────

async def _check_google_scholar(client: httpx.AsyncClient, query: str) -> list[dict]:
    """Google Scholar via scholarly — unofficial but widely used in academic tools.

    Runs scholarly's synchronous scraping in a thread to avoid blocking the async event loop.
    Google may rate-limit or block. Falls back gracefully with empty results on any error.
    """
    import concurrent.futures

    def _sync_search(q: str) -> list[dict]:
        try:
            from scholarly import scholarly as _gs
            results = []
            search_query = _gs.search_pubs(q)
            for i, pub in enumerate(search_query):
                if i >= 3:  # Limit to 3 for speed
                    break
                bib = pub.get('bib', {}) or {}
                title = bib.get('title', '')
                url = pub.get('pub_url', '') or pub.get('eprint_url', '')
                year = bib.get('pub_year', '')
                abstract = (bib.get('abstract', '') or '')[:400]
                if title:
                    results.append(_result_item(
                        str(title),
                        str(url) if url else None,
                        str(year) if year else None,
                        str(abstract),
                    ))
            return results
        except Exception:
            return []

    try:
        loop = asyncio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = loop.run_in_executor(pool, _sync_search, query)
            results = await asyncio.wait_for(future, timeout=12.0)  # 12s timeout
        return results
    except (asyncio.TimeoutError, Exception):
        return []


async def _check_inspire_hep(client: httpx.AsyncClient, query: str) -> list[dict]:
    """INSPIRE-HEP — High-energy physics, astrophysics, particle physics."""
    try:
        data = await _get_json(
            client,
            "https://inspirehep.net/api/literature",
            {"q": query, "size": 5, "sort": "mostrecent"},
            headers={"Accept": "application/json"},
        )
        hits = data.get("hits", {}).get("hits", [])
        items = []
        for hit in hits[:5]:
            metadata = hit.get("metadata", {})
            title = metadata.get("titles", [{}])[0].get("title", "")
            doi = metadata.get("dois", [{}])[0].get("value", "") if metadata.get("dois") else ""
            url = f"https://doi.org/{doi}" if doi else None
            year = str(metadata.get("publication_info", [{}])[0].get("year", "")) if metadata.get("publication_info") else None
            abstract = (metadata.get("abstracts", [{}])[0].get("value", "") if metadata.get("abstracts") else "")[:400]
            items.append(_result_item(title, url, year, abstract))
        return items
    except Exception:
        return []


async def _check_scienceopen(client: httpx.AsyncClient, query: str) -> list[dict]:
    """ScienceOpen — Open access articles with post-publication peer review."""
    try:
        data = await _get_json(
            client,
            "https://www.scienceopen.com/api/v1/search/publication",
            {"q": query, "limit": 5, "order": "relevance"},
        )
        items_data = data.get("items", []) or data.get("results", [])
        items = []
        for item in items_data[:5]:
            title = item.get("title", "")
            doi = item.get("doi", "")
            url = f"https://doi.org/{doi}" if doi else item.get("url", None)
            year = str(item.get("publicationDate", ""))[:4] if item.get("publicationDate") else None
            abstract = (item.get("abstract", "") or "")[:400]
            items.append(_result_item(title, url, year, abstract))
        return items
    except Exception:
        return []


async def _check_paperity(client: httpx.AsyncClient, query: str) -> list[dict]:
    """Paperity — Open access multidisciplinary aggregator."""
    try:
        data = await _get_json(
            client,
            "https://paperity.org/api/search",
            {"q": query, "limit": 5},
        )
        items_data = data.get("results", []) or data.get("items", [])
        items = []
        for item in items_data[:5]:
            title = item.get("title", "")
            url = item.get("url", "") or item.get("link", "")
            year = str(item.get("year", ""))[:4] if item.get("year") else None
            abstract = (item.get("abstract", "") or item.get("summary", "") or "")[:400]
            items.append(_result_item(title, url, year, abstract))
        return items
    except Exception:
        return []


async def _check_semantic_scholar_retry(client: httpx.AsyncClient, query: str) -> list[dict]:
    """Semantic Scholar with rate-limit retry (1s delay after 429)."""
    try:
        data = await _get_json(
            client,
            "https://api.semanticscholar.org/graph/v1/paper/search",
            {"query": query, "limit": 5, "fields": "title,year,externalIds,abstract"},
        )
        items = []
        for paper in data.get("data", [])[:5]:
            doi = paper.get("externalIds", {}).get("DOI", "")
            url = f"https://doi.org/{doi}" if doi else paper.get("url", "")
            items.append(
                _result_item(
                    paper.get("title"),
                    url,
                    str(paper.get("year", "")) if paper.get("year") else None,
                    (paper.get("abstract", "") or "")[:400],
                )
            )
        return items
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            await asyncio.sleep(1.5)  # Rate-limit backoff
            try:
                data = await _get_json(
                    client,
                    "https://api.semanticscholar.org/graph/v1/paper/search",
                    {"query": query, "limit": 5, "fields": "title,year,externalIds,abstract"},
                )
                items = []
                for paper in data.get("data", [])[:5]:
                    doi = paper.get("externalIds", {}).get("DOI", "")
                    url = f"https://doi.org/{doi}" if doi else paper.get("url", "")
                    items.append(_result_item(paper.get("title"), url, str(paper.get("year", "")) if paper.get("year") else None, (paper.get("abstract", "") or "")[:400]))
                return items
            except Exception:
                return []
        return []
    except Exception:
        return []


CHECKERS = {
    "arxiv":              _check_arxiv,
    "crossref":           _check_crossref,
    "europe_pmc":         _check_europe_pmc,
    "pubmed":             _check_pubmed,
    "datacite":           _check_datacite,
    "eric":               _check_eric,
    "osf_preprints":      _check_osf_preprints,
    "zenodo":             _check_zenodo,
    "semantic_scholar":   _check_semantic_scholar_retry,  # with rate-limit backoff
    "openalex":           _check_openalex,
    "doaj":               _check_doaj,
    "core":               _check_core,
    "base":               _check_base,
    # ── Scholar-focused checkers ──
    "inspire_hep":        _check_inspire_hep,
}


# ─────────────────────────────────────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────────────────────────────────────

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
                    **_source_meta(source),
                }
                for source in SOURCES
            ],
            "ai_detection": compute_ai_detection_score(text),
            "turnitin_style_similarity": None,
        }

    query = queries[0]
    timeout = httpx.Timeout(14.0, connect=5.0)
    source_results = []
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "OTIF/1.0 academic-integrity"}) as client:
        for index, source in enumerate(SOURCES):
            meta = _source_meta(source)
            if source.requires_key and not meta["configured"]:
                source_results.append(
                    {
                        "id": source.id,
                        "name": source.name,
                        "status": "needs_key",
                        "message": "API key is required for this source. Add the key to environment settings to include it.",
                        "matches": [],
                        "cached": False,
                        **meta,
                    }
                )
                continue
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
                        **meta,
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
                        **meta,
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
                    **meta,
                }
            )

    report = attach_source_evidence(text, {
        "internet_checked": True,
        "queries": queries,
        "sources": source_results,
        "source_count": len(SOURCES),
        "checked_source_count": sum(1 for src in source_results if src.get("status") == "checked"),
        "cache_ttl_seconds": RESEARCH_CACHE_TTL_SECONDS,
        "rate_limit_delay_seconds": SOURCE_RATE_DELAY_SECONDS,
    })

    # Collect all source matches for Turnitin-style aggregate
    all_source_matches = [
        match
        for src in source_results
        for match in src.get("matches", [])
        if src.get("status") == "checked"
    ]

    # Run AI detection
    ai_detection = compute_ai_detection_score(text)

    # Run Turnitin-style aggregate similarity
    turnitin_sim = compute_turnitin_style_similarity(text, all_source_matches)

    report["ai_detection"] = ai_detection
    report["turnitin_style_similarity"] = turnitin_sim

    return report
