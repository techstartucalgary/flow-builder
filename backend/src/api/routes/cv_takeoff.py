"""
CV Takeoff API route — deterministic computer-vision extraction.
================================================================
Accepts a signed URL (or direct upload) of a floor plan, runs the
OpenCV pipeline, and returns vectorised wall segments, tag anchors,
and opening bounding boxes as JSON the frontend can render as
SVG / Canvas primitives.
"""

from __future__ import annotations

import httpx
import base64
import hashlib
import json
import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from typing import Optional

from src.vision.cv.models import CVTakeoffResult
from src.vision.cv import pipeline
from src.vision.cv.preprocessing import load_image, crop_drawing_area

router = APIRouter(prefix="/api/cv-takeoff", tags=["cv-takeoff"])

ALLOWED_MIME = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf",
})


# ---------------------------------------------------------------------------
# POST /api/cv-takeoff/analyze-url — accepts a signed URL
# ---------------------------------------------------------------------------

from pydantic import BaseModel, Field


class CVUrlRequest(BaseModel):
    file_url: str = Field(description="Signed URL to the PDF or image file")
    file_mime: str = Field(default="application/pdf", description="MIME type")
    page_number: int = Field(default=1, ge=1, description="1-indexed page number for PDF input")
    dpi: int = Field(default=200, ge=72, le=600, description="Render DPI for PDFs")
    h_kernel: int = Field(default=50, ge=10, le=200, description="Horizontal kernel length (px)")
    v_kernel: int = Field(default=50, ge=10, le=200, description="Vertical kernel length (px)")
    crop_left: float = Field(default=0.02, ge=0.0, le=1.0, description="Crop left boundary (fraction)")
    crop_top: float = Field(default=0.05, ge=0.0, le=1.0, description="Crop top boundary (fraction)")
    crop_right: float = Field(default=0.72, ge=0.0, le=1.0, description="Crop right boundary (fraction)")
    crop_bottom: float = Field(default=0.95, ge=0.0, le=1.0, description="Crop bottom boundary (fraction)")
    scale_px_per_ft: Optional[float] = Field(default=None, description="Pixels-per-foot if known")
    sheet: Optional[str] = Field(default=None, description="Sheet number override")
    floor_level: Optional[str] = Field(default=None, description="Floor level override")
    address: Optional[str] = Field(default=None, description="Address override")


def _coordinate_space_id(
    *,
    page_number: int,
    dpi: int,
    crop_left: float,
    crop_top: float,
    crop_right: float,
    crop_bottom: float,
    image_width: int,
    image_height: int,
) -> str:
    payload = {
        "page_number": int(page_number),
        "dpi": int(dpi),
        "crop_left": round(float(crop_left), 5),
        "crop_top": round(float(crop_top), 5),
        "crop_right": round(float(crop_right), 5),
        "crop_bottom": round(float(crop_bottom), 5),
        "image_width": int(image_width),
        "image_height": int(image_height),
    }
    digest = hashlib.sha1(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[:16]
    return f"coord_{digest}"


def _ensure_coordinate_metadata(
    result: CVTakeoffResult,
    *,
    page_number: int,
    dpi: int,
    crop_left: float,
    crop_top: float,
    crop_right: float,
    crop_bottom: float,
) -> None:
    result.metadata.coordinate_space_id = _coordinate_space_id(
        page_number=page_number,
        dpi=dpi,
        crop_left=crop_left,
        crop_top=crop_top,
        crop_right=crop_right,
        crop_bottom=crop_bottom,
        image_width=result.metadata.image_width,
        image_height=result.metadata.image_height,
    )
    result.metadata.crop.left = crop_left
    result.metadata.crop.top = crop_top
    result.metadata.crop.right = crop_right
    result.metadata.crop.bottom = crop_bottom
    result.metadata.crop.dpi = dpi
    result.metadata.crop.page_number = page_number


def _preview_image_b64(
    file_bytes: bytes,
    mime_type: str,
    *,
    dpi: int,
    page_number: int,
    crop_left: float,
    crop_top: float,
    crop_right: float,
    crop_bottom: float,
) -> Optional[str]:
    try:
        bgr = load_image(file_bytes, mime_type, dpi=dpi, page_number=max(0, page_number - 1))
        bgr = crop_drawing_area(bgr, crop_left, crop_top, crop_right, crop_bottom)
        ok, buf = cv2.imencode(".png", bgr)
        if not ok:
            return None
        return base64.b64encode(buf.tobytes()).decode("utf-8")
    except Exception:
        return None


def _log_debug_summary(result: CVTakeoffResult, context: str) -> None:
    debug = result.debug
    print(
        "[cv-takeoff]"
        f" {context}"
        f" door_tags_raw={debug.door_tags_raw}"
        f" door_tags_after_dedupe={debug.door_tags_after_dedupe}"
        f" window_tags_raw={debug.window_tags_raw}"
        f" window_tags_after_dedupe={debug.window_tags_after_dedupe}"
        f" openings_gap_matched={debug.openings_gap_matched}"
        f" openings_tag_projected={debug.openings_tag_projected}"
        f" openings_hidden_recommended={debug.openings_hidden_recommended}"
    )


@router.post("/analyze-url", response_model=CVTakeoffResult)
async def analyze_url(req: CVUrlRequest):
    """Download a file from a signed URL and run the CV pipeline."""
    if req.file_mime not in ALLOWED_MIME:
        raise HTTPException(400, f"Unsupported MIME type: {req.file_mime}")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(req.file_url)
            resp.raise_for_status()
            file_bytes = resp.content
    except Exception as e:
        raise HTTPException(400, f"Failed to download file: {e}")

    if not file_bytes:
        raise HTTPException(400, "Downloaded file is empty")

    try:
        result = pipeline.run(
            file_bytes,
            req.file_mime,
            dpi=req.dpi,
            page_number=max(0, req.page_number - 1),
            h_kernel=req.h_kernel,
            v_kernel=req.v_kernel,
            crop_left=req.crop_left,
            crop_top=req.crop_top,
            crop_right=req.crop_right,
            crop_bottom=req.crop_bottom,
            scale_px_per_ft=req.scale_px_per_ft,
            sheet=req.sheet,
            floor_level=req.floor_level,
            address=req.address,
        )
        # Keep suppression counters explicit in API output for observability.
        result.debug.walls_raw = result.debug.walls_raw or len(result.walls)
        result.debug.walls_after_suppression = result.debug.walls_after_suppression or len(result.walls)
        _ensure_coordinate_metadata(
            result,
            page_number=max(0, req.page_number - 1),
            dpi=req.dpi,
            crop_left=req.crop_left,
            crop_top=req.crop_top,
            crop_right=req.crop_right,
            crop_bottom=req.crop_bottom,
        )
        result.preview_image = _preview_image_b64(
            file_bytes,
            req.file_mime,
            dpi=req.dpi,
            page_number=req.page_number,
            crop_left=req.crop_left,
            crop_top=req.crop_top,
            crop_right=req.crop_right,
            crop_bottom=req.crop_bottom,
        )
        _log_debug_summary(result, "analyze-url")
    except Exception as e:
        raise HTTPException(502, f"CV pipeline error: {e}")

    return result


# ---------------------------------------------------------------------------
# POST /api/cv-takeoff/analyze — direct file upload
# ---------------------------------------------------------------------------

@router.post("/analyze", response_model=CVTakeoffResult)
async def analyze_upload(
    file: UploadFile = File(..., description="Floor plan image or PDF"),
    page_number: int = Form(default=1, description="1-indexed page number for PDF input"),
    dpi: int = Form(default=200, description="Render DPI for PDFs"),
    h_kernel: int = Form(default=50, description="Horizontal kernel length (px)"),
    v_kernel: int = Form(default=50, description="Vertical kernel length (px)"),
    crop_left: float = Form(default=0.02, description="Crop left boundary (fraction)"),
    crop_top: float = Form(default=0.05, description="Crop top boundary (fraction)"),
    crop_right: float = Form(default=0.72, description="Crop right boundary (fraction)"),
    crop_bottom: float = Form(default=0.95, description="Crop bottom boundary (fraction)"),
    scale_px_per_ft: Optional[float] = Form(default=None, description="Pixels-per-foot if known"),
    sheet: Optional[str] = Form(default=None, description="Sheet number override"),
    floor_level: Optional[str] = Form(default=None, description="Floor level override"),
    address: Optional[str] = Form(default=None, description="Address override"),
):
    """Upload a floor plan directly and run the CV pipeline."""
    mime = file.content_type or "application/pdf"
    if mime not in ALLOWED_MIME:
        raise HTTPException(400, f"Unsupported file type: {mime}")

    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(400, f"Failed to read file: {e}")

    if not file_bytes:
        raise HTTPException(400, "Empty file")

    try:
        result = pipeline.run(
            file_bytes,
            mime,
            dpi=dpi,
            page_number=max(0, page_number - 1),
            h_kernel=h_kernel,
            v_kernel=v_kernel,
            crop_left=crop_left,
            crop_top=crop_top,
            crop_right=crop_right,
            crop_bottom=crop_bottom,
            scale_px_per_ft=scale_px_per_ft,
            sheet=sheet,
            floor_level=floor_level,
            address=address,
        )
        # Keep suppression counters explicit in API output for observability.
        result.debug.walls_raw = result.debug.walls_raw or len(result.walls)
        result.debug.walls_after_suppression = result.debug.walls_after_suppression or len(result.walls)
        _ensure_coordinate_metadata(
            result,
            page_number=max(0, page_number - 1),
            dpi=dpi,
            crop_left=crop_left,
            crop_top=crop_top,
            crop_right=crop_right,
            crop_bottom=crop_bottom,
        )
        result.preview_image = _preview_image_b64(
            file_bytes,
            mime,
            dpi=dpi,
            page_number=page_number,
            crop_left=crop_left,
            crop_top=crop_top,
            crop_right=crop_right,
            crop_bottom=crop_bottom,
        )
        _log_debug_summary(result, "analyze-upload")
    except Exception as e:
        raise HTTPException(502, f"CV pipeline error: {e}")

    return result
