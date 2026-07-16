from app.api.v1.analysis import (
    _ai_analysis_prompt,
    _build_ai_evidence_packet,
    _merge_ai_review_items,
)
from app.skills.skill_manager import skill_manager


def _analysis_fixture() -> dict:
    return {
        "scores": {
            "plagiarism_risk": 22.0,
            "citation_quality": 48.0,
            "humanization_score": 61.0,
            "ai_writing_risk": 53.0,
            "originality_score": 66.0,
            "structure_signal": 72.0,
        },
        "metrics": {
            "word_count": 1200,
            "avg_sentence_length": 26.2,
            "burstiness": 19.5,
            "passive_voice_ratio": 34.0,
            "template_opener_count": 7,
            "researcher_voice_markers": 1,
            "long_quote_words": 0,
            "humanization_score": 61.0,
            "ai_writing_risk": 53.0,
            "hedging_count": 3,
            "hedging_density_per_1000": 2.5,
            "hedging_risk": "over_assertive",
            "citation_coverage": 21.0,
            "citation_quality": 48.0,
            "citation_sentence_count": 8,
            "claim_sentence_count": 38,
            "doi_count": 2,
            "url_count": 1,
            "references_present": True,
            "norm_valid": True,
            "norm_issues": [],
            "is_imrad": False,
            "missing_sections": ["discussion"],
            "rq_count": 1,
            "rq_traceback_score": 0,
            "unanswered_rqs": ["RQ1"],
            "near_duplicate_pairs": 1,
            "internal_duplication_risk": 7,
            "originality_evidence_matrix": 62,
        },
        "findings": [
            {
                "word": "it is important to note",
                "replacement": "state the specific consequence",
                "severity": "medium",
                "count": 2,
            }
        ],
        "chapters": [
            {
                "id": "chapter-1",
                "title": "Introduction",
                "start_page": 1,
                "end_page": 8,
                "scores": {"citation_signal": 42},
                "metrics": {"word_count": 900},
                "findings": [],
            }
        ],
        "improvement_plan": [
            {
                "id": "citation-strength",
                "title": "Strengthen citation signal",
                "priority": "high",
                "action": "Add verified support to unsupported claims.",
                "evidence": "Citation coverage is low.",
                "requires_ai": True,
            }
        ],
        "skill_checks": {
            "loaded_count": 1,
            "packs": [{"name": "Academic writing improvement", "category": "writing"}],
        },
        "research_sources": {
            "queries": ["strategic leadership artificial intelligence"],
            "ai_detection": {
                "ai_detection_score": 53,
                "signals": {"burstiness_risk": 71},
            },
            "turnitin_style_similarity": {
                "similarity_index": 12.5,
                "match_count": 1,
                "scope_label": "Open-source scholarly similarity",
                "is_turnitin_result": False,
            },
            "sources": [
                {
                    "id": "crossref",
                    "name": "Crossref",
                    "status": "checked",
                    "coverage": "DOI metadata",
                    "access_note": "Public metadata only.",
                    "matches": [
                        {
                            "title": "Strategic leadership and artificial intelligence",
                            "year": 2024,
                            "url": "https://example.test/source",
                            "abstract": "Evidence about strategic leadership and AI adoption.",
                            "local_similarity": {
                                "risk_level": "low",
                                "combined_similarity": 11.2,
                                "flagged_shingles": [],
                            },
                            "evidence": {
                                "classification": "citation_candidate",
                                "document_passage": "Leadership affects AI adoption.",
                                "overlap_percent": 40,
                                "shared_terms": ["leadership", "adoption"],
                            },
                        }
                    ],
                }
            ],
        },
        "formatting_plan": {
            "target": "APA 7",
            "maintain_table_of_contents": True,
        },
        "limitations": ["Public-source coverage is not exhaustive."],
    }


def test_ai_evidence_packet_contains_style_and_source_details():
    packet = _build_ai_evidence_packet(_analysis_fixture())

    assert packet["rule_checks"]["style_and_voice"]["burstiness"] == 19.5
    assert packet["rule_checks"]["flagged_phrases"][0]["word"] == "it is important to note"
    assert packet["research"]["source_evidence"][0]["evidence_id"] == "src-crossref-1"
    assert packet["research"]["open_source_similarity"]["is_turnitin_result"] is False


def test_ai_prompt_passes_complete_evidence_packet():
    prompt = _ai_analysis_prompt(
        "Leadership affects adoption and requires verified evidence.",
        _analysis_fixture(),
        "thesis",
        "apa7",
    )

    assert "EVIDENCE PACKET" in prompt
    assert "passive_voice_ratio" in prompt
    assert "src-crossref-1" in prompt
    assert "not a Turnitin or institutional private-corpus result" in prompt


def test_ai_review_source_ids_are_resolved_to_verified_suggestions():
    analysis = _analysis_fixture()
    _merge_ai_review_items(
        analysis,
        {
            "review_summary": "A source-backed revision is needed.",
            "items": [
                {
                    "title": "Support the leadership claim",
                    "priority": "high",
                    "action": "Add verified evidence to the claim.",
                    "evidence": "The claim is currently unsupported.",
                    "chapter_id": "chapter-1",
                    "source_evidence_ids": ["src-crossref-1", "made-up-id"],
                    "evidence_refs": ["src-crossref-1"],
                }
            ],
        },
    )

    merged = analysis["improvement_plan"][-1]
    assert merged["source_evidence_ids"] == ["src-crossref-1"]
    assert merged["source_suggestions"][0]["title"].startswith("Strategic leadership")


def test_all_bundled_skill_packs_load_including_indian_formats():
    skills = skill_manager._read_seed_skill_files()
    skill_ids = {skill.skill_id for skill in skills}

    assert "indian-phd-standards" in skill_ids
    assert "indian-academic-journals" in skill_ids
    assert len(skills) >= 11
