"""
OTIF — Diagrams API
Generates Mermaid diagrams from approved plan text and applies design themes.
Triggered when user ticks "draw diagrams" and approves the improvement plan.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.v1.diagram_studio import (
    build_design_rewrite_payload,
    extract_design_elements,
    generate_caption,
    generate_mermaid,
)
from app.config import settings

router = APIRouter()

# ──────────────────────────────────────────────────────────────────
# Mermaid Theme Map
# design_theme → Mermaid init block
# ──────────────────────────────────────────────────────────────────

_THEME_VARS: dict[str, dict] = {
    "classic_blue": {
        "theme": "base",
        "themeVariables": {
            "primaryColor": "#1e40af",
            "primaryTextColor": "#ffffff",
            "primaryBorderColor": "#1d4ed8",
            "lineColor": "#3b82f6",
            "secondaryColor": "#dbeafe",
            "tertiaryColor": "#eff6ff",
            "background": "#f8faff",
            "mainBkg": "#dbeafe",
            "nodeBorder": "#1e40af",
            "clusterBkg": "#eff6ff",
            "titleColor": "#1e3a8a",
            "edgeLabelBackground": "#f0f9ff",
            "fontFamily": "Inter, sans-serif",
            "fontSize": "14px",
        },
    },
    "mono_formal": {
        "theme": "base",
        "themeVariables": {
            "primaryColor": "#1f2937",
            "primaryTextColor": "#ffffff",
            "primaryBorderColor": "#374151",
            "lineColor": "#6b7280",
            "secondaryColor": "#f3f4f6",
            "tertiaryColor": "#f9fafb",
            "background": "#ffffff",
            "mainBkg": "#e5e7eb",
            "nodeBorder": "#374151",
            "clusterBkg": "#f3f4f6",
            "titleColor": "#111827",
            "edgeLabelBackground": "#f9fafb",
            "fontFamily": "Georgia, serif",
            "fontSize": "14px",
        },
    },
    "emerald_academic": {
        "theme": "base",
        "themeVariables": {
            "primaryColor": "#065f46",
            "primaryTextColor": "#ffffff",
            "primaryBorderColor": "#047857",
            "lineColor": "#10b981",
            "secondaryColor": "#d1fae5",
            "tertiaryColor": "#ecfdf5",
            "background": "#f0fdf4",
            "mainBkg": "#a7f3d0",
            "nodeBorder": "#065f46",
            "clusterBkg": "#ecfdf5",
            "titleColor": "#064e3b",
            "edgeLabelBackground": "#f0fdf4",
            "fontFamily": "Inter, sans-serif",
            "fontSize": "14px",
        },
    },
    "maroon_submission": {
        "theme": "base",
        "themeVariables": {
            "primaryColor": "#7f1d1d",
            "primaryTextColor": "#ffffff",
            "primaryBorderColor": "#991b1b",
            "lineColor": "#ef4444",
            "secondaryColor": "#fee2e2",
            "tertiaryColor": "#fff5f5",
            "background": "#fff5f5",
            "mainBkg": "#fecaca",
            "nodeBorder": "#7f1d1d",
            "clusterBkg": "#fff5f5",
            "titleColor": "#450a0a",
            "edgeLabelBackground": "#fff5f5",
            "fontFamily": "Times New Roman, serif",
            "fontSize": "14px",
        },
    },
}


def _make_themed_mermaid(mermaid_source: str, design_theme: str) -> str:
    """Prepend a Mermaid theme init block to the diagram source."""
    vars_block = _THEME_VARS.get(design_theme, _THEME_VARS["classic_blue"])
    init_line = f"%%{{init: {json.dumps(vars_block)}}}%%"
    return f"{init_line}\n{mermaid_source}"


def _diagrams_dir() -> Path:
    path = Path(settings.PROJECTS_PATH) / "diagrams"
    path.mkdir(parents=True, exist_ok=True)
    return path


# ──────────────────────────────────────────────────────────────────
# Request Models
# ──────────────────────────────────────────────────────────────────

class GenerateDiagramRequest(BaseModel):
    plan_text: str
    doc_id: str
    project_id: str | None = None
    design_theme: str = "classic_blue"
    diagram_style: str = "academic"
    figure_start: int = 1
    is_researchers_own: bool = True
    custom_citation: str = ""


class SaveDiagramRequest(BaseModel):
    diagram_id: str
    approved_source: str     # User-edited Mermaid source
    caption: str
    project_id: str | None = None


# ──────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_diagram(req: GenerateDiagramRequest):
    """
    Generate a themed Mermaid diagram from approved plan text.
    Called when user ticks 'draw diagrams' and approves the improvement plan.

    Returns:
      - design_elements: extracted framework structure
      - mermaid_source: raw Mermaid source (editable by user)
      - themed_source: Mermaid with design-theme init block applied
      - caption: auto-generated figure caption
      - diagram_id: UUID for this diagram (used to save approved version)
    """
    if not req.plan_text.strip():
        raise HTTPException(status_code=400, detail="plan_text must not be empty")

    elements = extract_design_elements(req.plan_text)

    # Choose layout style
    style_map = {
        "academic": "flowchart_td",
        "method_flow": "flowchart_lr",
        "conceptual_model": "flowchart_td",
    }
    style = style_map.get(req.diagram_style, "flowchart_td")
    mermaid_source = generate_mermaid(elements, style=style)
    themed_source = _make_themed_mermaid(mermaid_source, req.design_theme)

    figure_number = f"1.{req.figure_start}"
    caption = generate_caption(
        diagram_title=elements.framework_name or "Proposed Framework",
        figure_number=figure_number,
        is_researchers_own=req.is_researchers_own,
        citation=req.custom_citation,
    )

    diagram_id = str(uuid.uuid4())

    # Persist raw diagram data for reference
    diagram_meta = {
        "diagram_id": diagram_id,
        "doc_id": req.doc_id,
        "project_id": req.project_id,
        "design_theme": req.design_theme,
        "diagram_style": req.diagram_style,
        "framework_name": elements.framework_name,
        "figure_number": figure_number,
        "caption": caption,
        "mermaid_source": mermaid_source,
        "themed_source": themed_source,
        "approved": False,
    }
    diagram_path = _diagrams_dir() / f"{diagram_id}.json"
    diagram_path.write_text(
        json.dumps(diagram_meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    return {
        **diagram_meta,
        "design_elements": {
            "framework_name": elements.framework_name,
            "layers": elements.layers,
            "components": elements.components,
            "research_questions": elements.research_questions,
            "methodology_phases": elements.methodology_phases,
            "artefacts": elements.artefacts,
            "validation_claims": elements.validation_claims,
        },
        "edit_hint": "You can edit 'mermaid_source' in the UI before saving. Call /diagrams/save with the updated source.",
        "requires_approval": True,
        "ethical_note": (
            "Diagrams labelled 'Author's Own Design' must represent the researcher's "
            "own framework. Do not use this label for diagrams adapted from published works."
        ),
    }


@router.post("/save")
async def save_diagram(req: SaveDiagramRequest):
    """
    Save a user-approved (possibly edited) Mermaid source.
    Marks the diagram as approved and returns the final themed version.
    """
    diagram_path = _diagrams_dir() / f"{req.diagram_id}.json"
    if not diagram_path.exists():
        raise HTTPException(status_code=404, detail=f"Diagram '{req.diagram_id}' not found")

    meta = json.loads(diagram_path.read_text(encoding="utf-8"))
    meta["mermaid_source"] = req.approved_source
    meta["themed_source"] = _make_themed_mermaid(req.approved_source, meta.get("design_theme", "classic_blue"))
    meta["caption"] = req.caption
    meta["approved"] = True

    diagram_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")

    return {
        "diagram_id": req.diagram_id,
        "approved": True,
        "mermaid_source": meta["mermaid_source"],
        "themed_source": meta["themed_source"],
        "caption": meta["caption"],
        "message": "Diagram saved and approved. Include in export when ready.",
    }


@router.get("/{diagram_id}")
async def get_diagram(diagram_id: str):
    """Retrieve a stored diagram by ID."""
    diagram_path = _diagrams_dir() / f"{diagram_id}.json"
    if not diagram_path.exists():
        raise HTTPException(status_code=404, detail=f"Diagram '{diagram_id}' not found")
    return json.loads(diagram_path.read_text(encoding="utf-8"))


@router.get("/themes/list")
async def list_themes():
    """Return available design themes with their colour variables."""
    return {
        "themes": [
            {
                "id": theme_id,
                "label": theme_id.replace("_", " ").title(),
                "primary_color": vars_["themeVariables"]["primaryColor"],
                "secondary_color": vars_["themeVariables"]["secondaryColor"],
                "font_family": vars_["themeVariables"]["fontFamily"],
            }
            for theme_id, vars_ in _THEME_VARS.items()
        ]
    }
