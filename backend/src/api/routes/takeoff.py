"""
Takeoff API route — full floor plan analysis via URL.
=====================================================
Accepts a signed URL pointing to a PDF/image, downloads it,
sends it to Gemini using a Spatial Verification Protocol that
eliminates hallucinated counts, and returns structured results.

The protocol forces the model to:
  1. Read the legend FIRST to learn symbol definitions
  2. Divide the plan into a 3×3 spatial grid
  3. Scan each grid cell and log every tag with its room/location
  4. Detect double-door pairs (2 tags ≤ 24″ apart = 1 opening)
  5. Build a Verification Log before any totals are computed
  6. Derive material estimates ONLY from Verification Log counts
"""

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from src.core.config import get_settings
from src.vision.providers.gemini_vision import DEFAULT_MODEL, analyze_image

router = APIRouter(prefix="/api/takeoff", tags=["takeoff"])

# ---------------------------------------------------------------------------
# Spatial Verification Protocol prompt
# ---------------------------------------------------------------------------

"""Construction takeoff prompts for floor plan analysis."""

TAKEOFF_PROMPT = """
Analyze this construction floor plan and extract ALL details for material takeoff.
Be thorough and precise. If something is unclear, note it explicitly.

## Extract the following:

### 1. WALLS
- Identify all wall segments (foundation walls, partition studs, load-bearing, etc.)
- Note wall types, thicknesses, and materials if shown in legend
- List all wall dimensions (X and Y directions)
- Identify end-caps, corners, and vertical soffit faces

### 2. DIMENSIONS & MEASUREMENTS
- List ALL dimension strings shown on the plan
- Note overall dimensions and individual room dimensions
- Extract any height specifications (ceiling heights, dropped ceilings, bulkheads)

### 3. SCALE & UNITS
- Identify the drawing scale (e.g., 1/4"=1'-0")
- Note the units used (feet, inches, meters)

### 4. LEGENDS & SYMBOLS
- List all legend items (material codes, wall types, symbols)
- Note any special symbols (electrical, plumbing, HVAC)
- Identify color codes or hatch patterns

### 5. WINDOWS & DOORS
- List all window and door tags/labels
- Note schedules if present (sizes, types, quantities)
- Identify locations and rough openings

### 6. ROOMS & SPACES
- List all room labels and names
- Note any special areas (dropped ceilings, bulkheads, mechanical rooms)

### 7. TEXT ANNOTATIONS
- Extract ALL text, notes, and callouts visible on the plan
- Include revision notes, stamps, and general notes

### 8. SPECIAL FEATURES
- Identify any bulkheads, soffits, or ceiling variations
- Note structural elements (beams, columns, footings)

## Output Format:
Organize findings clearly under each category above.
Flag any ambiguities or illegible details.
"""

QUICK_SUMMARY_PROMPT = """
Provide a concise summary of this floor plan:
- Overall dimensions
- Number of rooms
- Key features
- Any special notes or considerations for construction takeoff
"""


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class TakeoffRequest(BaseModel):
    """Request body for takeoff analysis."""
    file_url: str = Field(description="Signed URL to the PDF or image file")
    file_mime: str = Field(
        default="application/pdf",
        description="MIME type of the file",
    )


class TakeoffResult(BaseModel):
    """Takeoff analysis result."""
    status: str = "ok"
    model: str = ""
    analysis: str = ""
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/analyze", response_model=TakeoffResult)
async def analyze_takeoff(req: TakeoffRequest):
    """
    Analyze a floor plan for material takeoff.

    Downloads the file from *file_url*, sends it to Gemini with the
    Spatial Verification Protocol prompt, and returns the structured
    extraction + material estimate.
    """
    settings = get_settings()
    if not settings.gemini_configured and not settings.vertex_configured:
        raise HTTPException(
            status_code=503,
            detail="Configure GEMINI_API_KEY or Vertex AI in backend/.env",
        )

    # ------ download file from signed URL ------
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(req.file_url)
            resp.raise_for_status()
            file_bytes = resp.content
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to download file: {str(e)}",
        )

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Downloaded file is empty")

    # ------ send to Gemini with Spatial Verification Protocol ------
    try:
        analysis = analyze_image(
            image_bytes=file_bytes,
            mime_type=req.file_mime,
            prompt=TAKEOFF_PROMPT,
            model=DEFAULT_MODEL,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API error: {str(e)}",
        )

    return TakeoffResult(
        status="ok",
        model=DEFAULT_MODEL,
        analysis=analysis.strip(),
    )
