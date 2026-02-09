"""Interior partition extraction route."""

from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from typing import List, Literal
from pydantic import BaseModel

from src.vision.providers.gemini_vision import analyze_with_gemini
from src.vision.prompts.partition_extraction import COMBINED_PARTITION_AND_DIMENSION_PROMPT


router = APIRouter(prefix="/api/partitions", tags=["partitions"])


class InteriorPartition(BaseModel):
    """Interior partition wall with orientation."""
    id: str
    orientation: Literal["V", "H"]
    rooms_separated: str
    dimension_string: str
    length_ft: float
    notes: str = ""


class PartitionExtractionResponse(BaseModel):
    """Response from partition extraction."""
    status: str
    model: str
    vertical_partitions: List[InteriorPartition]
    horizontal_partitions: List[InteriorPartition]
    vertical_count: int
    horizontal_count: int
    vertical_linear_ft: float
    horizontal_linear_ft: float
    total_linear_ft: float
    total_drywall_area_sqft: float
    raw_analysis: str


@router.post("/extract", response_model=PartitionExtractionResponse)
async def extract_interior_partitions(
    file: UploadFile = File(...),
    ceiling_height_ft: float = Form(9.0)
):
    """
    Extract interior partition walls with V/H orientation from floor plan.
    
    Args:
        file: Floor plan PDF or image
        ceiling_height_ft: Wall height for drywall calculation (default 9.0 ft)
        
    Returns:
        Structured partition data with V/H breakdown
    """
    # Validate file type
    ALLOWED_MIME = {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp"
    }
    
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Must be PDF or image. Got: {file.content_type}"
        )
    
    try:
        # Read file
        file_bytes = await file.read()
        
        # Call vision model
        analysis = await analyze_with_gemini(
            file_bytes=file_bytes,
            mime_type=file.content_type,
            prompt=COMBINED_PARTITION_AND_DIMENSION_PROMPT,
            model_name="gemini-3-pro-preview"
        )
        
        # TODO: Parse the raw analysis into structured data
        # For now, return raw with computed totals from the analysis
        
        # Parse the summary section (simplified for MVP)
        raw = analysis["analysis"]
        vertical_ft = 0.0
        horizontal_ft = 0.0
        total_ft = 0.0
        
        # Try to extract totals from summary
        if "Vertical (V) partitions:" in raw:
            try:
                v_line = [l for l in raw.split("\n") if "Vertical (V) partitions:" in l][0]
                vertical_ft = float(v_line.split("=")[-1].replace("linear ft", "").strip())
            except:
                pass
        
        if "Horizontal (H) partitions:" in raw:
            try:
                h_line = [l for l in raw.split("\n") if "Horizontal (H) partitions:" in l][0]
                horizontal_ft = float(h_line.split("=")[-1].replace("linear ft", "").strip())
            except:
                pass
        
        if "TOTAL INTERIOR PARTITIONS:" in raw:
            try:
                t_line = [l for l in raw.split("\n") if "TOTAL INTERIOR PARTITIONS:" in l][0]
                total_ft = float(t_line.split("=")[-1].replace("linear ft", "").strip())
            except:
                total_ft = vertical_ft + horizontal_ft
        
        # Calculate drywall area
        drywall_area = total_ft * ceiling_height_ft * 2.0  # Double-sided
        
        return PartitionExtractionResponse(
            status="ok",
            model=analysis["model"],
            vertical_partitions=[],  # TODO: Parse from table
            horizontal_partitions=[],  # TODO: Parse from table
            vertical_count=0,  # TODO: Count from table
            horizontal_count=0,  # TODO: Count from table
            vertical_linear_ft=vertical_ft,
            horizontal_linear_ft=horizontal_ft,
            total_linear_ft=total_ft,
            total_drywall_area_sqft=drywall_area,
            raw_analysis=raw
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/extract-simple")
async def extract_partitions_simple(
    file: UploadFile = File(...),
    ceiling_height_ft: float = Form(9.0)
):
    """
    Simple partition extraction returning just the raw analysis and totals.
    
    Use this endpoint for quick extraction without structured parsing.
    """
    ALLOWED_MIME = {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp"
    }
    
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Must be PDF or image."
        )
    
    try:
        file_bytes = await file.read()
        
        analysis = await analyze_with_gemini(
            file_bytes=file_bytes,
            mime_type=file.content_type,
            prompt=COMBINED_PARTITION_AND_DIMENSION_PROMPT,
            model_name="gemini-3-pro-preview"
        )
        
        # Extract summary totals
        raw = analysis["analysis"]
        
        # Try to find the calculated drywall area from the model's response
        drywall_area = 0.0
        if "sq ft" in raw.lower():
            try:
                # Look for the final calculation line
                calc_lines = [l for l in raw.split("\n") if "sq ft" in l.lower() and "×" in l]
                if calc_lines:
                    last_calc = calc_lines[-1]
                    # Extract number before "sq ft"
                    parts = last_calc.split("sq ft")[0].strip().split()
                    drywall_area = float(parts[-1].replace(",", ""))
            except:
                pass
        
        return {
            "status": "ok",
            "model": analysis["model"],
            "ceiling_height_ft": ceiling_height_ft,
            "total_drywall_area_sqft": drywall_area,
            "analysis": raw
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
