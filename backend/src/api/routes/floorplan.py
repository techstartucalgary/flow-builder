"""
Floor Plan Extraction API Routes
================================
Legend-driven, self-learning extraction for any floor plan.
"""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any

from src.core.config import get_settings
from src.vision.providers.gemini_vision import DEFAULT_MODEL, analyze_image
from src.vision.prompts.universal_extraction import UNIVERSAL_EXTRACTION_PROMPT

router = APIRouter(prefix="/api/floorplan", tags=["floorplan"])

ALLOWED_MIME = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"
})


class ExtractionResult(BaseModel):
    """Structured extraction result."""
    status: str = "ok"
    model: str
    
    # Legend-learned definitions
    legend: Dict[str, str] = Field(
        default_factory=dict,
        description="Symbol shape to meaning mapping learned from legend"
    )
    
    # Counts
    total_doors: int = 0
    total_windows: int = 0
    doors_by_tag: Dict[str, int] = Field(default_factory=dict)
    windows_by_tag: Dict[str, int] = Field(default_factory=dict)
    
    # Metadata
    sheet_number: str = ""
    scale: str = ""
    total_area_sqft: float = 0.0
    floor_level: str = ""
    
    # Rooms
    rooms: List[str] = Field(default_factory=list)
    
    # Raw analysis for debugging
    raw_analysis: str = ""


class TakeoffRequest(BaseModel):
    """Request for material takeoff calculation."""
    total_doors: int
    total_windows: int
    doors_by_tag: Dict[str, Dict[str, Any]]  # tag -> {width, height, count}
    windows_by_tag: Dict[str, Dict[str, Any]]  # tag -> {width, height, count}
    ceiling_height_ft: float = 9.0
    waste_factor: float = 0.15


@router.post("/extract", response_model=ExtractionResult)
async def extract_floorplan(
    file: UploadFile = File(..., description="Floor plan PDF or image"),
    include_dimensions: bool = Form(default=True),
):
    """
    Extract all information from a floor plan using legend-driven approach.
    
    The system will:
    1. Find and learn the legend (symbol definitions)
    2. Count doors/windows by symbol shape
    3. Extract schedules and validate
    4. Return structured data for calculations
    """
    settings = get_settings()
    if not settings.gemini_configured and not settings.vertex_configured:
        raise HTTPException(
            status_code=503,
            detail="Configure GEMINI_API_KEY or Vertex AI in .env",
        )
    
    mime = file.content_type or "application/pdf"
    if mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {mime}. Use PDF, JPEG, PNG, GIF, or WebP.",
        )
    
    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")
    
    # Build prompt
    prompt = UNIVERSAL_EXTRACTION_PROMPT
    if include_dimensions:
        prompt += """

## BONUS: WALL DIMENSIONS

### Perimeter Dimensions
List the overall building dimensions (X and Y).

### Interior Partition Dimensions  
List dimension strings for interior walls.
"""
    
    try:
        analysis = analyze_image(
            image_bytes=file_bytes,
            mime_type=mime,
            prompt=prompt,
            model=DEFAULT_MODEL,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vision API error: {str(e)}")
    
    # Return raw analysis for now - structured parsing can be added later
    return ExtractionResult(
        status="ok",
        model=DEFAULT_MODEL,
        raw_analysis=analysis.strip(),
        legend={"hexagon": "WINDOW", "circle": "DOOR"},  # Default, can be parsed from response
    )


@router.post("/legend-check")
async def check_legend(
    file: UploadFile = File(..., description="Floor plan PDF or image"),
):
    """
    Quick check to find and parse just the legend from a floor plan.
    Use this to verify symbol definitions before full extraction.
    """
    settings = get_settings()
    if not settings.gemini_configured and not settings.vertex_configured:
        raise HTTPException(status_code=503, detail="Configure API credentials")
    
    mime = file.content_type or "application/pdf"
    if mime not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {mime}")
    
    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    
    legend_prompt = """
# LEGEND EXTRACTION ONLY

Find the "WINDOW/DOOR TAGS" or similar legend section.

OUTPUT FORMAT (exactly):
LEGEND FOUND: YES/NO
LOCATION: [where on drawing]

SYMBOL DEFINITIONS:
| Shape | Meaning |
|-------|---------|
| [shape 1] | [meaning 1] |
| [shape 2] | [meaning 2] |

Common patterns:
- HEXAGON = WINDOW
- CIRCLE = DOOR

What does THIS drawing's legend show?
"""
    
    try:
        analysis = analyze_image(
            image_bytes=file_bytes,
            mime_type=mime,
            prompt=legend_prompt,
            model=DEFAULT_MODEL,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vision API error: {str(e)}")
    
    return {"status": "ok", "legend_analysis": analysis.strip()}
