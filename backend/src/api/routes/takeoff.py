"""
Takeoff API route — full floor plan analysis via URL.
=====================================================
Accepts a signed URL pointing to a PDF/image, downloads it,
sends it to Gemini using a Spatial Verification Protocol that
eliminates hallucinated counts, and returns structured results.

Also runs the deterministic CV pipeline to extract accurate
door/window counts and an annotated floor plan image.
"""

import base64
import math
import httpx
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from src.core.config import get_settings
from src.vision.providers.gemini_vision import DEFAULT_MODEL, analyze_image
from src.vision.cv import pipeline as cv_pipeline
from src.vision.cv.preprocessing import load_image, crop_drawing_area
from src.vision.cv.models import TagClass

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
    page_number: int = Field(
        default=1,
        description="1-indexed page number to analyze (for multi-page PDFs)",
    )


class TakeoffResult(BaseModel):
    """Takeoff analysis result."""
    status: str = "ok"
    model: str = ""
    analysis: str = ""
    error: Optional[str] = None
    # CV pipeline outputs — accurate door/window counts
    cv_doors: int = 0
    cv_windows: int = 0
    cv_walls: int = 0
    # Annotated image as base64-encoded PNG (no Supabase storage)
    annotated_image: Optional[str] = None


# ---------------------------------------------------------------------------
# CV annotation helper
# ---------------------------------------------------------------------------

WALL_COLOR   = (0, 180, 0)    # green (BGR)
DOOR_COLOR   = (0, 0, 255)    # red
WINDOW_COLOR = (255, 150, 0)  # blue
FONT         = cv2.FONT_HERSHEY_SIMPLEX

# Junction corner fill — max endpoint distance to consider a corner pair
CORNER_MAX_DIST_PX = 50


def _generate_annotated_image(file_bytes: bytes, mime_type: str, cv_result, page_number: int = 0) -> str:
    """
    Draw CV detections on the floor plan and return as a base64 PNG string.
    """
    bgr = load_image(file_bytes, mime_type, dpi=200, page_number=page_number)
    bgr = crop_drawing_area(bgr)
    annotated = bgr.copy()

    # Draw walls (full-thickness semi-transparent fill)
    wall_overlay = annotated.copy()
    for w in cv_result.walls:
        vt = w.visual_thickness if w.visual_thickness > 0 else w.thickness
        half_t = max(vt // 2, 3)
        if w.orientation.value == "H":
            pt1 = (w.start[0], w.start[1] - half_t)
            pt2 = (w.end[0],   w.end[1]   + half_t)
        else:
            pt1 = (w.start[0] - half_t, w.start[1])
            pt2 = (w.end[0]   + half_t, w.end[1])
        cv2.rectangle(wall_overlay, pt1, pt2, WALL_COLOR, -1)

    # Fill junction corners (bridge gaps from morphological erosion)
    for i, w1 in enumerate(cv_result.walls):
        for w2 in cv_result.walls[i + 1:]:
            if w1.orientation == w2.orientation:
                continue
            vt1 = w1.visual_thickness if w1.visual_thickness > 0 else w1.thickness
            vt2 = w2.visual_thickness if w2.visual_thickness > 0 else w2.thickness
            ht1 = max(vt1 // 2, 3)
            ht2 = max(vt2 // 2, 3)
            for ep1 in [w1.start, w1.end]:
                for ep2 in [w2.start, w2.end]:
                    d = math.hypot(ep1[0] - ep2[0], ep1[1] - ep2[1])
                    if d < CORNER_MAX_DIST_PX:
                        mx = (ep1[0] + ep2[0]) // 2
                        my = (ep1[1] + ep2[1]) // 2
                        if w1.orientation.value == "H":
                            h_ht, v_ht = ht1, ht2
                        else:
                            h_ht, v_ht = ht2, ht1
                        cp1 = (mx - v_ht, my - h_ht)
                        cp2 = (mx + v_ht, my + h_ht)
                        cv2.rectangle(wall_overlay, cp1, cp2, WALL_COLOR, -1)

    cv2.addWeighted(wall_overlay, 0.4, annotated, 0.6, 0, annotated)

    # Wall labels on top
    for w in cv_result.walls:
        mx = (w.start[0] + w.end[0]) // 2
        my = (w.start[1] + w.end[1]) // 2
        cv2.putText(annotated, w.id, (mx - 20, my - 8), FONT, 0.45, WALL_COLOR, 1, cv2.LINE_AA)

    # Draw door tags
    for t in cv_result.tags:
        if t.tag_class == TagClass.DOOR:
            cv2.circle(annotated, t.center, t.radius + 6, DOOR_COLOR, 2)
            cv2.putText(annotated, t.id, (t.center[0] - 15, t.center[1] - t.radius - 10),
                        FONT, 0.4, DOOR_COLOR, 1, cv2.LINE_AA)

    # Draw window tags (hexagon outline)
    for t in cv_result.tags:
        if t.tag_class == TagClass.WINDOW:
            r = t.radius + 8
            pts = []
            for i in range(6):
                angle = i * np.pi / 3
                px = int(t.center[0] + r * np.cos(angle))
                py = int(t.center[1] + r * np.sin(angle))
                pts.append([px, py])
            pts_arr = np.array(pts, np.int32).reshape((-1, 1, 2))
            cv2.polylines(annotated, [pts_arr], True, WINDOW_COLOR, 2)
            cv2.putText(annotated, t.id, (t.center[0] - 15, t.center[1] - t.radius - 12),
                        FONT, 0.4, WINDOW_COLOR, 1, cv2.LINE_AA)

    # Draw legend
    doors = [t for t in cv_result.tags if t.tag_class == TagClass.DOOR]
    wins  = [t for t in cv_result.tags if t.tag_class == TagClass.WINDOW]
    lx, ly = 20, 30
    cv2.rectangle(annotated, (10, 10), (320, 110), (255, 255, 255), -1)
    cv2.rectangle(annotated, (10, 10), (320, 110), (0, 0, 0), 1)
    cv2.putText(annotated, "LEGEND", (lx, ly), FONT, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.rectangle(annotated, (lx, ly + 8), (lx + 30, ly + 16), WALL_COLOR, -1)
    cv2.putText(annotated, f"Walls ({len(cv_result.walls)})", (lx + 40, ly + 16), FONT, 0.4, WALL_COLOR, 1, cv2.LINE_AA)
    ly += 28
    cv2.circle(annotated, (lx + 12, ly + 4), 8, DOOR_COLOR, 2)
    cv2.putText(annotated, f"Door tags ({len(doors)})", (lx + 40, ly + 8), FONT, 0.4, DOOR_COLOR, 1, cv2.LINE_AA)
    ly += 28
    cv2.circle(annotated, (lx + 12, ly + 4), 8, WINDOW_COLOR, 2)
    cv2.putText(annotated, f"Window tags ({len(wins)})", (lx + 40, ly + 8), FONT, 0.4, WINDOW_COLOR, 1, cv2.LINE_AA)

    # Encode to PNG → base64
    _, buf = cv2.imencode('.png', annotated)
    return base64.b64encode(buf.tobytes()).decode('utf-8')


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/analyze", response_model=TakeoffResult)
async def analyze_takeoff(req: TakeoffRequest):
    """
    Analyze a floor plan for material takeoff.

    1. Downloads the file from *file_url*.
    2. Sends it to Gemini for full text extraction.
    3. Runs the deterministic CV pipeline for accurate door/window counts
       and generates an annotated floor plan image.
    4. Returns both: Gemini analysis text + CV counts/annotated image.
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

    # ------ send to Gemini ------
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

    # ------ run CV pipeline for doors/windows/walls + annotated image ------
    cv_doors = 0
    cv_windows = 0
    cv_walls = 0
    annotated_b64: Optional[str] = None

    try:
        # page_number in the request is 1-indexed; pipeline uses 0-indexed
        cv_page = max(0, req.page_number - 1)
        print(f"[takeoff/cv] file size={len(file_bytes)} bytes, mime={req.file_mime}, page={cv_page}")
        cv_result = cv_pipeline.run(file_bytes, req.file_mime, page_number=cv_page)
        cv_doors = sum(1 for t in cv_result.tags if t.tag_class == TagClass.DOOR)
        cv_windows = sum(1 for t in cv_result.tags if t.tag_class == TagClass.WINDOW)
        cv_walls = len(cv_result.walls)
        print(f"[takeoff/cv] walls={cv_walls} doors={cv_doors} windows={cv_windows}")
        print(f"[takeoff/cv] debug: {cv_result.debug}")
        annotated_b64 = _generate_annotated_image(file_bytes, req.file_mime, cv_result, page_number=cv_page)
        print(f"[takeoff/cv] annotated image size={len(annotated_b64)} chars (base64)")
    except Exception as e:
        # CV pipeline failure is non-fatal; Gemini results still return
        import traceback
        print(f"[takeoff] CV pipeline error (non-fatal): {e}")
        traceback.print_exc()

    return TakeoffResult(
        status="ok",
        model=DEFAULT_MODEL,
        analysis=analysis.strip(),
        cv_doors=cv_doors,
        cv_windows=cv_windows,
        cv_walls=cv_walls,
        annotated_image=annotated_b64,
    )
