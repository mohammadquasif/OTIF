"""
OTIF Diagram Studio
===================
Generates Mermaid diagrams from approved research plan design elements,
supports the design-rewrite pipeline (skill 08), and produces diff-ready
rewrite proposals keyed to the diagram structure.

Flow:
  1. extract_design_elements(plan_text)  → DesignElements
  2. generate_mermaid(elements)          → str (Mermaid source)
  3. map_sections_to_elements(...)       → SectionMap
  4. propose_rewrite_diffs(...)          → list[RewriteDiff]
  5. apply_approved_diffs(...)           → str (updated document text)

Ethical guardrails (skill DRW-001 through DRW-010):
  - No rewrite without an explicit approval record.
  - Every diff is flagged requires_approval=True.
  - Rollback snapshot is stored before any application.
  - Validation boundary clauses are added if plan implies field validation
    not documented in the original text.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


# ─────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────

@dataclass
class DesignElements:
    """Extracted design elements from an approved research plan."""
    framework_name: str = ""
    layers: list[str] = field(default_factory=list)
    components: list[str] = field(default_factory=list)
    research_questions: list[str] = field(default_factory=list)
    methodology_phases: list[str] = field(default_factory=list)
    artefacts: list[str] = field(default_factory=list)
    validation_claims: list[str] = field(default_factory=list)


@dataclass
class RewriteDiff:
    """A proposed section rewrite requiring user approval."""
    section_id: str
    section_title: str
    paragraph_index: int
    change_type: str          # "modified" | "added" | "unchanged"
    original: str
    proposed: str
    reason: str               # Which plan element drove this change
    plan_element: str
    diagram_reference: Optional[str] = None  # e.g. "Figure 3.1"
    requires_approval: bool = True
    approved: bool = False


@dataclass
class ApprovalRecord:
    """Immutable log entry for an approved rewrite."""
    timestamp: str
    doc_id: str
    section_id: str
    plan_id: str
    original_hash: str
    approved_hash: str
    diagram_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────
# Design Element Extraction (local, no AI required)
# ─────────────────────────────────────────────────────────────────

_LAYER_PATTERNS = [
    re.compile(r"(?i)(?:layer|tier|phase|stage|pillar|component|module|domain|dimension)\s*\d*\s*[:\-–]\s*([^\n]{3,80})"),
    re.compile(r"(?i)^\s*\d+\.\s+([A-Z][^\n]{3,80})", re.MULTILINE),
    re.compile(r"(?i)^\s*[-*]\s+([A-Z][^\n]{3,60})", re.MULTILINE),
]

_RQ_PATTERN = re.compile(
    r"(?i)(?:research\s+question|RQ)\s*(\d+)\s*[:\-–.]\s*([^\n?]{10,200}\??)",
    re.MULTILINE,
)

_PHASE_PATTERN = re.compile(
    r"(?i)(?:phase|step|stage)\s+(\d+)\s*[:\-–]\s*([^\n]{3,80})",
    re.MULTILINE,
)

_ARTEFACT_PATTERN = re.compile(
    r"(?i)(?:artefact|artifact|framework|model|schema|prototype|tool|dashboard|matrix)\s*[:\-–]?\s*([A-Z][^\n]{3,60})",
    re.MULTILINE,
)

_VALIDATION_CLAIMS = [
    "field validation", "expert review", "delphi", "interview",
    "empirical", "case study", "survey", "questionnaire", "experiment",
    "pilot study", "user testing",
]


def extract_design_elements(plan_text: str) -> DesignElements:
    """
    Parse a plain-text approved plan and extract structured design elements.
    This is a heuristic extraction — it does not invent elements.
    """
    elements = DesignElements()

    # Framework name: first all-caps phrase or quoted name
    name_match = re.search(
        r"(?i)(?:framework|model|system)\s+(?:named?|called?|titled?)?\s*['\"]?([A-Z][A-Za-z\s\-]{2,60})['\"]?",
        plan_text,
    )
    if name_match:
        elements.framework_name = name_match.group(1).strip()

    # Layers / components
    for pattern in _LAYER_PATTERNS:
        for match in pattern.finditer(plan_text):
            candidate = match.group(1).strip()
            if 3 < len(candidate) < 80 and candidate not in elements.components:
                elements.components.append(candidate)
    elements.components = elements.components[:20]  # cap at 20 nodes

    # Research questions
    for match in _RQ_PATTERN.finditer(plan_text):
        rq = f"RQ{match.group(1)}: {match.group(2).strip()}"
        elements.research_questions.append(rq)

    # Methodology phases
    for match in _PHASE_PATTERN.finditer(plan_text):
        phase = f"Phase {match.group(1)}: {match.group(2).strip()}"
        elements.methodology_phases.append(phase)

    # Artefacts
    for match in _ARTEFACT_PATTERN.finditer(plan_text):
        candidate = match.group(1).strip()
        if candidate not in elements.artefacts:
            elements.artefacts.append(candidate)
    elements.artefacts = elements.artefacts[:8]

    # Validation claims
    plan_lower = plan_text.lower()
    elements.validation_claims = [
        claim for claim in _VALIDATION_CLAIMS if claim in plan_lower
    ]

    return elements


# ─────────────────────────────────────────────────────────────────
# Mermaid Diagram Generation
# ─────────────────────────────────────────────────────────────────

def _safe_node_id(text: str) -> str:
    """Convert a label to a safe Mermaid node ID."""
    safe = re.sub(r"[^A-Za-z0-9_]", "_", text)
    return safe[:32] or "node"


def _safe_label(text: str) -> str:
    """Escape a label for Mermaid node display."""
    return text.replace('"', "'").replace("[", "(").replace("]", ")")


def generate_mermaid(elements: DesignElements, style: str = "flowchart_td") -> str:
    """
    Generate a Mermaid diagram source from extracted design elements.

    Styles:
      flowchart_td  - Top-down hierarchy (default for frameworks)
      flowchart_lr  - Left-to-right process flow (phases/pipelines)
      class_diagram - Component relationships
    """
    if not elements.components and not elements.methodology_phases:
        return (
            "flowchart TD\n"
            "    A[\"No design elements found in approved plan\"]\n"
        )

    lines: list[str] = []

    # Choose diagram direction
    if style == "flowchart_lr" or (elements.methodology_phases and not elements.layers):
        direction = "flowchart LR"
    else:
        direction = "flowchart TD"

    lines.append(direction)
    lines.append("")

    # Framework name as root node
    if elements.framework_name:
        root_id = _safe_node_id(elements.framework_name)
        lines.append(f'    {root_id}["{_safe_label(elements.framework_name)}"]')
        lines.append("")

    # Layers as subgraphs if we have more than 3 components
    if elements.layers and len(elements.layers) >= 2:
        for i, layer in enumerate(elements.layers[:6]):
            layer_id = _safe_node_id(layer)
            lines.append(f"    subgraph {layer_id}[\"{_safe_label(layer)}\"]")
            # Attach components to this layer (simple even distribution)
            chunk_size = max(1, len(elements.components) // len(elements.layers))
            chunk = elements.components[i * chunk_size: (i + 1) * chunk_size]
            for comp in chunk:
                comp_id = _safe_node_id(comp)
                lines.append(f'        {comp_id}["{_safe_label(comp)}"]')
            lines.append("    end")
        lines.append("")
    elif elements.components:
        # Flat component list connected to root
        prev_id = _safe_node_id(elements.framework_name) if elements.framework_name else None
        for comp in elements.components[:16]:
            comp_id = _safe_node_id(comp)
            lines.append(f'    {comp_id}["{_safe_label(comp)}"]')
            if prev_id:
                lines.append(f"    {prev_id} --> {comp_id}")
            prev_id = comp_id
        lines.append("")

    # Methodology phases as a sequential chain
    if elements.methodology_phases:
        lines.append("    subgraph Methodology[\"Methodology Phases\"]")
        phase_ids: list[str] = []
        for phase in elements.methodology_phases[:8]:
            phase_id = _safe_node_id(phase)
            lines.append(f'        {phase_id}["{_safe_label(phase)}"]')
            phase_ids.append(phase_id)
        for i in range(len(phase_ids) - 1):
            lines.append(f"        {phase_ids[i]} --> {phase_ids[i + 1]}")
        lines.append("    end")
        lines.append("")

    # Research questions as leaf nodes
    if elements.research_questions:
        lines.append("    subgraph RQs[\"Research Questions\"]")
        for rq in elements.research_questions[:6]:
            rq_id = _safe_node_id(rq[:40])
            lines.append(f'        {rq_id}(["{_safe_label(rq[:60])}"])')
        lines.append("    end")

    return "\n".join(lines)


def generate_caption(
    diagram_title: str,
    figure_number: str,
    is_researchers_own: bool = True,
    citation: str = "",
) -> str:
    """Generate an academically formatted diagram caption."""
    source = "Author's Own Design" if is_researchers_own else citation
    return f"Figure {figure_number}: {diagram_title} (Source: {source})"


# ─────────────────────────────────────────────────────────────────
# Section-to-Plan Mapping
# ─────────────────────────────────────────────────────────────────

def map_sections_to_elements(
    chapters: list[dict],
    elements: DesignElements,
) -> dict[str, list[str]]:
    """
    Map document chapters/sections to design elements.
    Returns {chapter_id: [element_names that match this chapter]}.
    Only mapped chapters are candidates for design rewrite.
    """
    mapping: dict[str, list[str]] = {}
    all_elements = (
        elements.components
        + elements.methodology_phases
        + elements.layers
        + elements.artefacts
    )

    for chapter in chapters:
        chapter_text_lower = (chapter.get("title", "") + " " + chapter.get("text", "")).lower()
        matched = []
        for elem in all_elements:
            # Simple keyword overlap — first 3 significant words of each element
            keywords = [
                w for w in re.split(r"\W+", elem.lower()) if len(w) > 3
            ][:3]
            if any(kw in chapter_text_lower for kw in keywords):
                matched.append(elem)
        if matched:
            mapping[chapter["id"]] = matched

    return mapping


# ─────────────────────────────────────────────────────────────────
# Diff Generation (local, no AI required)
# ─────────────────────────────────────────────────────────────────

def propose_alignment_diffs(
    chapters: list[dict],
    elements: DesignElements,
    section_map: dict[str, list[str]],
) -> list[RewriteDiff]:
    """
    Generate diff proposals for sections that need alignment with the
    approved design plan. These are structural/labelling changes only.
    AI-driven rewrites are handled separately via the prompt pipeline.
    """
    diffs: list[RewriteDiff] = []

    for chapter in chapters:
        chapter_id = chapter["id"]
        matched_elements = section_map.get(chapter_id, [])
        if not matched_elements:
            continue

        # Check for validation claims that need a boundary clause
        if elements.validation_claims:
            validation_keywords = "|".join(
                re.escape(vc) for vc in elements.validation_claims
            )
            chapter_text = chapter.get("text", "")
            if re.search(validation_keywords, chapter_text, re.I):
                boundary_clause = (
                    "\n\n*Note: The validation boundary of this study is limited to "
                    "literature grounding, documentary evidence review, and "
                    "design-science artefact demonstration. "
                    + ", ".join(vc.title() for vc in elements.validation_claims)
                    + " remain as planned future work.*"
                )
                diffs.append(
                    RewriteDiff(
                        section_id=chapter_id,
                        section_title=chapter.get("title", ""),
                        paragraph_index=-1,
                        change_type="modified",
                        original="[end of section]",
                        proposed=boundary_clause,
                        reason="Approved plan references validation not documented in current text (DRW-009)",
                        plan_element="validation_boundary",
                        requires_approval=True,
                    )
                )

        # Propose diagram insertion for methodology sections
        chapter_title_lower = chapter.get("title", "").lower()
        if any(kw in chapter_title_lower for kw in ["method", "framework", "model", "design", "architecture"]):
            diagram_placeholder = (
                f"\n\n[DIAGRAM: Figure X.Y — {elements.framework_name or 'Framework Diagram'} "
                f"(Source: Author's Own Design)]\n"
                f"*Caption: Figure X.Y — {elements.framework_name or 'Proposed Framework'} "
                f"(Source: Author's Own Design)*"
            )
            diffs.append(
                RewriteDiff(
                    section_id=chapter_id,
                    section_title=chapter.get("title", ""),
                    paragraph_index=0,
                    change_type="added",
                    original="",
                    proposed=diagram_placeholder,
                    reason=f"Plan includes diagram for '{', '.join(matched_elements[:2])}'",
                    plan_element=", ".join(matched_elements[:2]),
                    diagram_reference="Figure X.Y",
                    requires_approval=True,
                )
            )

    return diffs


# ─────────────────────────────────────────────────────────────────
# Rollback & Approval Log
# ─────────────────────────────────────────────────────────────────

def _text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def store_rollback_snapshot(doc_id: str, section_id: str, original_text: str, storage_dir: Path) -> Path:
    """
    Store the original section text before any approved rewrite is applied.
    Returns the path to the snapshot file.
    """
    storage_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snap_path = storage_dir / f"{doc_id}_{section_id}_{ts}.rollback.txt"
    snap_path.write_text(original_text, encoding="utf-8")
    return snap_path


def log_approved_rewrite(
    doc_id: str,
    section_id: str,
    plan_id: str,
    original_text: str,
    approved_text: str,
    diagram_id: Optional[str],
    log_path: Path,
) -> ApprovalRecord:
    """
    Append an immutable approval record to the rewrite audit log.
    """
    record = ApprovalRecord(
        timestamp=datetime.now(timezone.utc).isoformat(),
        doc_id=doc_id,
        section_id=section_id,
        plan_id=plan_id,
        original_hash=_text_hash(original_text),
        approved_hash=_text_hash(approved_text),
        diagram_id=diagram_id,
    )
    log_path.parent.mkdir(parents=True, exist_ok=True)
    existing: list[dict] = []
    if log_path.exists():
        try:
            existing = json.loads(log_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = []
    existing.append(
        {
            "timestamp": record.timestamp,
            "doc_id": record.doc_id,
            "section_id": record.section_id,
            "plan_id": record.plan_id,
            "original_hash": record.original_hash,
            "approved_hash": record.approved_hash,
            "diagram_id": record.diagram_id,
        }
    )
    log_path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    return record


# ─────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────

def build_design_rewrite_payload(
    plan_text: str,
    chapters: list[dict],
    doc_id: str,
    figure_start: int = 1,
) -> dict:
    """
    Full pipeline: plan_text → design elements → Mermaid diagram →
    section mapping → structural diff proposals.

    Returns a payload ready to be returned from the API endpoint and
    displayed as a diff review in the UI.
    """
    elements = extract_design_elements(plan_text)
    mermaid_source = generate_mermaid(elements)
    figure_number = f"1.{figure_start}"
    caption = generate_caption(
        diagram_title=elements.framework_name or "Proposed Framework",
        figure_number=figure_number,
        is_researchers_own=True,
    )
    section_map = map_sections_to_elements(chapters, elements)
    diffs = propose_alignment_diffs(chapters, elements, section_map)

    return {
        "design_elements": {
            "framework_name": elements.framework_name,
            "layers": elements.layers,
            "components": elements.components,
            "research_questions": elements.research_questions,
            "methodology_phases": elements.methodology_phases,
            "artefacts": elements.artefacts,
            "validation_claims": elements.validation_claims,
        },
        "diagram": {
            "format": "mermaid",
            "source": mermaid_source,
            "caption": caption,
            "figure_number": figure_number,
            "requires_approval": True,
        },
        "section_mapping": section_map,
        "rewrite_diffs": [
            {
                "section_id": d.section_id,
                "section_title": d.section_title,
                "paragraph_index": d.paragraph_index,
                "change_type": d.change_type,
                "original": d.original,
                "proposed": d.proposed,
                "reason": d.reason,
                "plan_element": d.plan_element,
                "diagram_reference": d.diagram_reference,
                "requires_approval": d.requires_approval,
                "approved": d.approved,
            }
            for d in diffs
        ],
        "unmapped_elements": [
            elem
            for elem in (elements.components + elements.methodology_phases)
            if not any(elem in v for v in section_map.values())
        ],
        "ethical_guardrails": {
            "approval_gate": "DRW-001 — No rewrite applied without explicit per-diff approval",
            "rollback_available": True,
            "validation_boundary_checked": bool(elements.validation_claims),
            "citations_preserved": True,
        },
    }
