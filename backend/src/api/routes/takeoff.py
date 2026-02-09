"""
Takeoff API route — full floor plan analysis via URL.
=====================================================
Accepts a signed URL pointing to a PDF/image, downloads it,
sends it to Gemini for full extraction, and returns structured results.
"""

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

from src.core.config import get_settings
from src.vision.providers.gemini_vision import DEFAULT_MODEL, analyze_image

router = APIRouter(prefix="/api/takeoff", tags=["takeoff"])

TAKEOFF_PROMPT = """You are a construction takeoff specialist analyzing a floor plan.

Extract ALL of the following from this floor plan. Be precise and thorough.

## 1. METADATA
- Sheet number
- Scale (e.g., 1/4" = 1'-0")
- Floor level (e.g., Basement, Main, Upper)
- Total area (sq ft) if noted on the plan

## 2. ROOMS
List every room/space with its name exactly as labeled on the plan.

## 3. DOORS
For each door, provide:
- Tag number (from the circle symbol)
- Size (width × height) from the door schedule if visible
- Location (which room(s) it connects)
- Type (swing, slider, double, pocket, bi-fold)
Count the TOTAL number of door symbols on the plan.

## 4. WINDOWS 
For each window, provide:
- Tag number (from the hexagon symbol)
- Size (width × height) from the window schedule if visible
- Location (which wall / room)
Count the TOTAL number of window symbols on the plan.

## 5. PERIMETER WALLS
List each perimeter (exterior) wall with its dimension string exactly as shown.
Parse each to decimal feet.

## 6. INTERIOR PARTITIONS
List each interior partition wall with:
- Rooms it separates
- Dimension string as shown on plan
- Orientation: V (vertical/north-south) or H (horizontal/east-west)

## 7. SPECIAL FEATURES
- Dropped ceilings / soffits
- Bulkheads
- Any notes about wall types (e.g., moisture-resistant, fire-rated)

## 8. MATERIAL ESTIMATE
Using a 9 ft ceiling height:
- Calculate total perimeter wall area (length × 9 × 1 side)
- Calculate total partition wall area (length × 9 × 2 sides)
- Calculate total door opening area to deduct
- Calculate total window opening area to deduct
- Net drywall area = gross wall area - openings
- Add 15% waste factor
- Calculate sheets needed (4' × 12' = 48 sq ft per sheet)

FORMAT YOUR RESPONSE AS STRUCTURED TEXT with clear headers and numbers.
"""


class TakeoffRequest(BaseModel):
    """Request body for takeoff analysis."""
    file_url: str = Field(description="Signed URL to the PDF or image file")
    file_mime: str = Field(default="application/pdf", description="MIME type of the file")


class TakeoffResult(BaseModel):
    """Takeoff analysis result."""
    status: str = "ok"
    model: str = ""
    analysis: str = ""
    error: Optional[str] = None


@router.post("/analyze", response_model=TakeoffResult)
async def analyze_takeoff(req: TakeoffRequest):
    """
    Analyze a floor plan for material takeoff.
    
    Accepts a signed URL to a PDF/image, downloads it, sends to Gemini,
    and returns the full extraction and material estimate.
    """
    settings = get_settings()
    if not settings.gemini_configured and not settings.vertex_configured:
        raise HTTPException(
            status_code=503,
            detail="Configure GEMINI_API_KEY or Vertex AI in backend/.env",
        )

    # Download the file from the signed URL
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(req.file_url)
            resp.raise_for_status()
            file_bytes = resp.content
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to download file: {str(e)}")

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Downloaded file is empty")

    # Send to Gemini for analysis
    try:
        analysis = analyze_image(
            image_bytes=file_bytes,
            mime_type=req.file_mime,
            prompt=TAKEOFF_PROMPT,
            model=DEFAULT_MODEL,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")

    return TakeoffResult(
        status="ok",
        model=DEFAULT_MODEL,
        analysis=analysis.strip(),
    )
