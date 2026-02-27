"""Interior partition extraction route — derived from CV pipeline."""

from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from typing import List, Literal, Optional
from pydantic import BaseModel

from src.vision.cv import pipeline as cv_pipeline
from src.vision.cv.models import Orientation

router = APIRouter(prefix="/api/partitions", tags=["partitions"])


class InteriorPartition(BaseModel):
    """Interior partition wall with orientation."""
    id: str
    orientation: Literal["V", "H"]
    rooms_separated: str = ""
    dimension_string: str = ""
    length_ft: float
    notes: str = ""


class PartitionExtractionResponse(BaseModel):
    """Response from partition extraction."""
    status: str = "ok"
    vertical_partitions: List[InteriorPartition]
    horizontal_partitions: List[InteriorPartition]
    vertical_count: int
    horizontal_count: int
    vertical_linear_ft: float
    horizontal_linear_ft: float
    total_linear_ft: float
    total_drywall_area_sqft: float
    raw_analysis: str = ""


ALLOWED_MIME = frozenset({
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
})


@router.post("/extract", response_model=PartitionExtractionResponse)
async def extract_interior_partitions(
    file: UploadFile = File(...),
    ceiling_height_ft: float = Form(9.0),
    scale_px_per_ft: Optional[float] = Form(None),
):
    """
    Extract interior partition walls with V/H orientation from floor plan.
    Uses deterministic CV pipeline — no LLM.
    """
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Must be PDF or image. Got: {file.content_type}",
        )

    try:
        file_bytes = await file.read()
        cv_result = cv_pipeline.run(
            file_bytes,
            file.content_type,
            scale_px_per_ft=scale_px_per_ft,
        )

        vertical_partitions: List[InteriorPartition] = []
        horizontal_partitions: List[InteriorPartition] = []
        vertical_linear_ft = 0.0
        horizontal_linear_ft = 0.0

        for w in cv_result.walls:
            length_ft = w.length_ft
            if length_ft is None and scale_px_per_ft and scale_px_per_ft > 0:
                length_ft = w.length_px / scale_px_per_ft
            elif length_ft is None:
                length_ft = 0.0

            partition = InteriorPartition(
                id=w.id,
                orientation=w.orientation.value,
                rooms_separated="",
                dimension_string=f"{length_ft:.2f} ft" if length_ft else "",
                length_ft=round(length_ft, 2),
            )
            if w.orientation == Orientation.VERTICAL:
                vertical_partitions.append(partition)
                vertical_linear_ft += length_ft
            else:
                horizontal_partitions.append(partition)
                horizontal_linear_ft += length_ft

        total_linear_ft = vertical_linear_ft + horizontal_linear_ft
        total_drywall_area_sqft = total_linear_ft * ceiling_height_ft * 2.0

        raw_analysis = (
            f"CV Pipeline: {len(cv_result.walls)} walls "
            f"(V={len(vertical_partitions)}, H={len(horizontal_partitions)}). "
            f"Total linear ft: {total_linear_ft:.2f}. "
            f"Drywall area: {total_drywall_area_sqft:.2f} sq ft."
        )

        return PartitionExtractionResponse(
            status="ok",
            vertical_partitions=vertical_partitions,
            horizontal_partitions=horizontal_partitions,
            vertical_count=len(vertical_partitions),
            horizontal_count=len(horizontal_partitions),
            vertical_linear_ft=round(vertical_linear_ft, 2),
            horizontal_linear_ft=round(horizontal_linear_ft, 2),
            total_linear_ft=round(total_linear_ft, 2),
            total_drywall_area_sqft=round(total_drywall_area_sqft, 2),
            raw_analysis=raw_analysis,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/extract-simple")
async def extract_partitions_simple(
    file: UploadFile = File(...),
    ceiling_height_ft: float = Form(9.0),
    scale_px_per_ft: Optional[float] = Form(None),
):
    """Simple partition extraction — totals only."""
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Must be PDF or image.",
        )

    try:
        file_bytes = await file.read()
        cv_result = cv_pipeline.run(
            file_bytes,
            file.content_type,
            scale_px_per_ft=scale_px_per_ft,
        )

        total_length_px = sum(w.length_px for w in cv_result.walls)
        total_linear_ft = (
            total_length_px / scale_px_per_ft if scale_px_per_ft and scale_px_per_ft > 0 else 0.0
        )
        drywall_area = total_linear_ft * ceiling_height_ft * 2.0

        v_count = sum(1 for w in cv_result.walls if w.orientation == Orientation.VERTICAL)
        h_count = sum(1 for w in cv_result.walls if w.orientation == Orientation.HORIZONTAL)
        raw = (
            f"CV Pipeline: {len(cv_result.walls)} walls (V={v_count}, H={h_count}). "
            f"Total linear ft: {total_linear_ft:.2f}. Drywall: {drywall_area:.2f} sq ft."
        )

        return {
            "status": "ok",
            "ceiling_height_ft": ceiling_height_ft,
            "total_drywall_area_sqft": round(drywall_area, 2),
            "analysis": raw,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
