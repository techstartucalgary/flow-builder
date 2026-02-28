"""
Takeoff API route — full floor plan analysis via URL.
=====================================================
Accepts a signed URL pointing to a PDF/image, downloads it,
runs the deterministic CV pipeline for door/window/wall counts
and drywall calculation, and returns structured results.
No LLM usage — all calculations from CV pipeline.
"""

import base64
import httpx
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from src.vision.cv import pipeline as cv_pipeline
from src.vision.cv.preprocessing import load_image, crop_drawing_area
from src.vision.cv.models import TagClass

router = APIRouter(prefix="/api/takeoff", tags=["takeoff"])

# Standard opening sizes (sq ft) for deduction — door ~3x7, window ~3x4
DOOR_OPENING_SQFT = 21
WINDOW_OPENING_SQFT = 12

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
    scale_px_per_ft: Optional[float] = Field(
        default=None,
        description="Pixels per foot (e.g. 50 for 1/4\"=1' at 200 DPI). Required for drywall calculation.",
    )
    ceiling_height_ft: float = Field(
        default=9.0,
        description="Wall height in feet for drywall calculation",
    )
    crop_left: float = Field(
        default=0.02,
        ge=0.0,
        le=1.0,
        description="Crop left boundary (fraction of width).",
    )
    crop_top: float = Field(
        default=0.05,
        ge=0.0,
        le=1.0,
        description="Crop top boundary (fraction of height).",
    )
    crop_right: float = Field(
        default=0.72,
        ge=0.0,
        le=1.0,
        description="Crop right boundary (fraction of width).",
    )
    crop_bottom: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="Crop bottom boundary (fraction of height).",
    )


class TakeoffResult(BaseModel):
    """Takeoff analysis result — all from deterministic CV pipeline."""
    status: str = "ok"
    analysis: str = ""
    error: Optional[str] = None
    cv_doors: int = 0
    cv_windows: int = 0
    cv_walls: int = 0
    total_area_sqft: float = 0.0
    net_drywall_sqft: float = 0.0
    total_linear_ft: float = 0.0
    gross_drywall_sqft: float = 0.0
    opening_deduction_sqft: float = 0.0
    annotated_image: Optional[str] = None


# ---------------------------------------------------------------------------
# CV annotation helper
# ---------------------------------------------------------------------------

WALL_COLOR   = (0, 180, 0)    # green (BGR)
DOOR_COLOR   = (0, 0, 255)    # red
WINDOW_COLOR = (255, 150, 0)  # blue
FONT         = cv2.FONT_HERSHEY_SIMPLEX
def _generate_annotated_image(
    file_bytes: bytes,
    mime_type: str,
    cv_result,
    page_number: int = 0,
    crop_left: float = 0.02,
    crop_top: float = 0.05,
    crop_right: float = 0.72,
    crop_bottom: float = 0.95,
) -> str:
    """Draw CV detections on the floor plan and return as a base64 PNG string."""
    bgr = load_image(file_bytes, mime_type, dpi=200, page_number=page_number)
    # Keep annotation coordinates aligned with the exact CV crop window.
    bgr = crop_drawing_area(bgr, crop_left, crop_top, crop_right, crop_bottom)
    annotated = bgr.copy()

    wall_overlay = annotated.copy()
    for w in cv_result.walls:
        vt = w.visual_thickness if w.visual_thickness > 0 else w.thickness
        line_t = max(3, int(vt))
        # Anti-aliased centerline rendering avoids blocky corner overpaint.
        cv2.line(wall_overlay, w.start, w.end, WALL_COLOR, line_t, cv2.LINE_AA)

    cv2.addWeighted(wall_overlay, 0.4, annotated, 0.6, 0, annotated)

    for w in cv_result.walls:
        mx = (w.start[0] + w.end[0]) // 2
        my = (w.start[1] + w.end[1]) // 2
        cv2.putText(annotated, w.id, (mx - 20, my - 8), FONT, 0.45, WALL_COLOR, 1, cv2.LINE_AA)

    door_openings = [o for o in cv_result.openings if o.tag_class == TagClass.DOOR]
    window_openings = [o for o in cv_result.openings if o.tag_class == TagClass.WINDOW]

    for opening in door_openings:
        x, y, w, h = opening.bbox
        cv2.rectangle(annotated, (x, y), (x + w, y + h), DOOR_COLOR, 2)
        cv2.putText(annotated, opening.id, (x, max(12, y - 6)), FONT, 0.4, DOOR_COLOR, 1, cv2.LINE_AA)

    for opening in window_openings:
        x, y, w, h = opening.bbox
        cv2.rectangle(annotated, (x, y), (x + w, y + h), WINDOW_COLOR, 2)
        cv2.putText(annotated, opening.id, (x, max(12, y - 6)), FONT, 0.4, WINDOW_COLOR, 1, cv2.LINE_AA)

    lx, ly = 20, 30
    cv2.rectangle(annotated, (10, 10), (320, 110), (255, 255, 255), -1)
    cv2.rectangle(annotated, (10, 10), (320, 110), (0, 0, 0), 1)
    cv2.putText(annotated, "LEGEND", (lx, ly), FONT, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.rectangle(annotated, (lx, ly + 8), (lx + 30, ly + 16), WALL_COLOR, -1)
    cv2.putText(annotated, f"Walls ({len(cv_result.walls)})", (lx + 40, ly + 16), FONT, 0.4, WALL_COLOR, 1, cv2.LINE_AA)
    ly += 28
    cv2.rectangle(annotated, (lx + 4, ly - 3), (lx + 20, ly + 11), DOOR_COLOR, 2)
    cv2.putText(annotated, f"Doors ({len(door_openings)})", (lx + 40, ly + 8), FONT, 0.4, DOOR_COLOR, 1, cv2.LINE_AA)
    ly += 28
    cv2.rectangle(annotated, (lx + 4, ly - 3), (lx + 20, ly + 11), WINDOW_COLOR, 2)
    cv2.putText(annotated, f"Windows ({len(window_openings)})", (lx + 40, ly + 8), FONT, 0.4, WINDOW_COLOR, 1, cv2.LINE_AA)

    _, buf = cv2.imencode('.png', annotated)
    return base64.b64encode(buf.tobytes()).decode('utf-8')


def _compute_drywall(
    cv_result,
    deduction_doors: int,
    deduction_windows: int,
    scale_px_per_ft: Optional[float],
    ceiling_height_ft: float,
) -> tuple[float, float, float, float]:
    """Compute total_linear_ft and net_drywall_sqft from CV walls when scale known."""
    if scale_px_per_ft is None or scale_px_per_ft <= 0:
        return 0.0, 0.0, 0.0, 0.0

    total_length_px = sum(w.length_px for w in cv_result.walls)
    total_linear_ft = total_length_px / scale_px_per_ft
    gross_drywall_sqft = total_linear_ft * ceiling_height_ft * 2  # double-sided interior
    opening_deduction = deduction_doors * DOOR_OPENING_SQFT + deduction_windows * WINDOW_OPENING_SQFT
    net_drywall_sqft = max(0.0, gross_drywall_sqft - opening_deduction)
    return total_linear_ft, gross_drywall_sqft, opening_deduction, net_drywall_sqft


def _compute_total_area_sqft(cv_result, scale_px_per_ft: Optional[float]) -> float:
    """
    Estimate plan area in sq ft from the convex hull of detected wall endpoints.
    Requires scale to convert px² -> ft².
    """
    if scale_px_per_ft is None or scale_px_per_ft <= 0:
        return 0.0
    if not cv_result.walls:
        return 0.0

    pts = []
    for w in cv_result.walls:
        pts.append(w.start)
        pts.append(w.end)

    if len(pts) < 3:
        return 0.0

    pts_np = np.array(pts, dtype=np.int32)
    hull = cv2.convexHull(pts_np)
    area_px2 = float(cv2.contourArea(hull))

    # Fallback for degenerate hulls (e.g., near-collinear points)
    if area_px2 <= 0:
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        width = max(xs) - min(xs)
        height = max(ys) - min(ys)
        area_px2 = float(max(0, width) * max(0, height))

    return area_px2 / (scale_px_per_ft * scale_px_per_ft)


def _validate_crop_bounds(
    crop_left: float,
    crop_top: float,
    crop_right: float,
    crop_bottom: float,
) -> None:
    if crop_left >= crop_right:
        raise HTTPException(status_code=422, detail="Invalid crop bounds: crop_left must be < crop_right")
    if crop_top >= crop_bottom:
        raise HTTPException(status_code=422, detail="Invalid crop bounds: crop_top must be < crop_bottom")


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/analyze", response_model=TakeoffResult)
async def analyze_takeoff(req: TakeoffRequest):
    """
    Analyze a floor plan for material takeoff.

    1. Downloads the file from *file_url*.
    2. Runs the deterministic CV pipeline for door/window/wall counts.
    3. Computes drywall from wall lengths when scale_px_per_ft provided.
    4. Returns structured results and annotated image.
    """
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

    cv_doors = 0
    cv_windows = 0
    cv_walls = 0
    annotated_b64: Optional[str] = None
    total_area_sqft = 0.0
    net_drywall_sqft = 0.0
    total_linear_ft = 0.0
    gross_drywall_sqft = 0.0
    opening_deduction_sqft = 0.0
    cv_result = None

    try:
        cv_page = max(0, req.page_number - 1)
        _validate_crop_bounds(req.crop_left, req.crop_top, req.crop_right, req.crop_bottom)
        print(f"[takeoff/cv] file size={len(file_bytes)} bytes, mime={req.file_mime}, page={cv_page}")
        cv_result = cv_pipeline.run(
            file_bytes,
            req.file_mime,
            page_number=cv_page,
            scale_px_per_ft=req.scale_px_per_ft,
            crop_left=req.crop_left,
            crop_top=req.crop_top,
            crop_right=req.crop_right,
            crop_bottom=req.crop_bottom,
        )
        cv_doors = sum(1 for o in cv_result.openings if o.tag_class == TagClass.DOOR)
        cv_windows = sum(1 for o in cv_result.openings if o.tag_class == TagClass.WINDOW)
        cv_walls = len(cv_result.walls)
        total_length_px = sum(w.length_px for w in cv_result.walls)
        print(f"[takeoff/cv] scale_px_per_ft={req.scale_px_per_ft} walls={cv_walls} doors={cv_doors} windows={cv_windows} total_length_px={total_length_px}")

        deduction_doors = cv_doors
        deduction_windows = cv_windows

        total_linear_ft, gross_drywall_sqft, opening_deduction_sqft, net_drywall_sqft = _compute_drywall(
            cv_result, deduction_doors, deduction_windows,
            req.scale_px_per_ft, req.ceiling_height_ft,
        )
        total_area_sqft = _compute_total_area_sqft(cv_result, req.scale_px_per_ft)

        annotated_b64 = _generate_annotated_image(
            file_bytes,
            req.file_mime,
            cv_result,
            page_number=cv_page,
            crop_left=req.crop_left,
            crop_top=req.crop_top,
            crop_right=req.crop_right,
            crop_bottom=req.crop_bottom,
        )
        print(
            "[takeoff/cv] "
            f"total_linear_ft={total_linear_ft:.1f} gross={gross_drywall_sqft:.1f} "
            f"openings_deduction={opening_deduction_sqft:.1f} net={net_drywall_sqft:.1f} "
            f"total_area_sqft={total_area_sqft:.1f} "
            f"annotated image size={len(annotated_b64)} chars (base64)"
        )
    except Exception as e:
        import traceback
        print(f"[takeoff] CV pipeline error: {e}")
        traceback.print_exc()

    scale_note = " (provide scale_px_per_ft for drywall calculation)" if not req.scale_px_per_ft else ""
    analysis_lines = [
        f"CV Pipeline: {cv_walls} walls, {cv_doors} verified doors, {cv_windows} verified windows.",
        f"Estimated total area: {total_area_sqft:.0f} sq ft{scale_note}.",
        (
            f"Net drywall: {net_drywall_sqft:.0f} sq ft "
            f"(gross {gross_drywall_sqft:.0f} - openings {opening_deduction_sqft:.0f}){scale_note}."
        ),
    ]
    analysis = " ".join(analysis_lines)

    return TakeoffResult(
        status="ok",
        analysis=analysis,
        cv_doors=cv_doors,
        cv_windows=cv_windows,
        cv_walls=cv_walls,
        total_area_sqft=round(total_area_sqft, 2),
        net_drywall_sqft=round(net_drywall_sqft, 2),
        total_linear_ft=round(total_linear_ft, 2),
        gross_drywall_sqft=round(gross_drywall_sqft, 2),
        opening_deduction_sqft=round(opening_deduction_sqft, 2),
        annotated_image=annotated_b64,
    )
