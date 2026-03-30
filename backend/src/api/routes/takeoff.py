"""
Takeoff API route — full floor plan analysis via URL.
=====================================================
Accepts a signed URL pointing to a PDF/image, downloads it,
runs the deterministic CV pipeline for door/window/wall counts
and drywall calculation, and returns structured results.
No LLM usage — all calculations from CV pipeline.
"""

from __future__ import annotations

import base64
from collections.abc import Iterable
from dataclasses import dataclass, field
import httpx
import cv2
from hashlib import sha1
import json
from math import hypot, isfinite
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Literal, Optional

from src.api.annotation_store import _apply_sanitization_if_needed, _load_state
from src.api.assumptions_store import load_assumptions, load_locked_keys, apply_locked_assumptions
from src.api.pricing_store import load_catalog
from src.schemas.estimate import AssumptionsSnapshot, LineItem, FlooringMaterialSummary
from src.estimators.drywall.annotation_geometry import (
    TakeoffGeometrySnapshot,
    build_takeoff_geometry_snapshot,
)
from src.estimators.drywall.board_estimator import estimate_board_requirements
from src.estimators.drywall.room_closure import compute_enclosed_regions
from src.estimators.drywall.surface_classification import classify_wall_surfaces
from src.vision.cv import pipeline as cv_pipeline
from src.vision.cv.preprocessing import load_image, crop_drawing_area
from src.vision.cv.scale_inference import (
    extract_pdf_dimension_candidates,
    infer_scale_px_per_ft_from_dimensions,
)

router = APIRouter(prefix="/api/takeoff", tags=["takeoff"])

DOOR_OPENING_SQFT = 21
WINDOW_OPENING_SQFT = 12
AREA_HEAL_KERNEL_SIZE = 5
MIN_INTERIOR_REGION_SQFT = 100.0
PERIMETER_MARGIN_PX = 30
PERIMETER_ALIGNMENT_TOL_PX = 14
PERIMETER_MAX_GAP_FT = 4.0
PERIMETER_MAX_GAP_PX_FALLBACK = 70
AREA_GROWTH_GUARDRAIL_RATIO = 1.35
AREA_GROWTH_SMALL_CLOSURE_FT = 12.0
CONVEX_HULL_SANITY_MULTIPLIER = 2.5
MIN_SCALE_FOR_INFERENCE_CONFIDENCE = 0.8


class TakeoffRequest(BaseModel):
    """Request body for takeoff analysis."""

    file_url: str = Field(description="Signed URL to the PDF or image file")
    project_id: Optional[str] = Field(default=None, description="Project id for saved annotation geometry lookup.")
    file_mime: str = Field(
        default="application/pdf",
        description="MIME type of the file",
    )
    page_number: int = Field(
        default=1,
        description="1-indexed page number to analyze (for multi-page PDFs)",
    )
    use_saved_annotations: bool = Field(
        default=False,
        description="Whether to compute takeoff from the saved annotation document instead of rerunning CV geometry.",
    )
    annotation_revision: Optional[int] = Field(
        default=None,
        description="Expected saved annotation revision. Used to reject stale regenerate requests.",
    )
    scale_px_per_ft: Optional[float] = Field(
        default=None,
        description='Pixels per foot (e.g. 50 for 1/4"=1\' at 200 DPI). Required for drywall calculation.',
    )
    ceiling_height_ft: float = Field(
        default=9.0,
        description="Wall height in feet for drywall calculation",
    )
    reference_floor_area_sqft: Optional[float] = Field(
        default=None,
        description="Optional reference floor area used only for comparison warnings.",
    )
    include_ceiling: bool = Field(
        default=True,
        description="Whether to include ceiling board equal to calculated floor area.",
    )
    waste_factor: float = Field(
        default=0.15,
        ge=0.0,
        le=1.0,
        description="Waste factor applied after wall and ceiling board area are combined.",
    )
    sheet_width_ft: float = Field(default=4.0, gt=0.0, description="Sheet width in feet.")
    sheet_length_ft: float = Field(default=12.0, gt=0.0, description="Sheet length in feet.")
    crop_left: float = Field(default=0.0, ge=0.0, le=1.0, description="Crop left boundary (fraction of width).")
    crop_top: float = Field(default=0.0, ge=0.0, le=1.0, description="Crop top boundary (fraction of height).")
    crop_right: float = Field(default=1.0, ge=0.0, le=1.0, description="Crop right boundary (fraction of width).")
    crop_bottom: float = Field(default=1.0, ge=0.0, le=1.0, description="Crop bottom boundary (fraction of height).")


class TakeoffResult(BaseModel):
    """Takeoff analysis result — all from deterministic CV pipeline."""

    status: str = "ok"
    analysis: str = ""
    error: Optional[str] = None
    cv_doors: int = 0
    cv_windows: int = 0
    cv_walls: int = 0
    total_area_sqft: float = 0.0
    floor_area_sqft: float = 0.0
    floor_area_method: Literal["enclosed_regions", "legacy_convex_hull_fallback", "missing_scale", "failed"] = "failed"
    reference_floor_area_sqft: float = 0.0
    reference_area_delta_sqft: float = 0.0
    reference_area_delta_pct: float = 0.0
    ceiling_height_ft: float = 9.0
    net_drywall_sqft: float = 0.0
    total_linear_ft: float = 0.0
    gross_drywall_sqft: float = 0.0
    gross_wall_board_sqft: float = 0.0
    opening_deduction_sqft: float = 0.0
    net_wall_board_sqft: float = 0.0
    ceiling_board_sqft: float = 0.0
    net_board_area_sqft: float = 0.0
    waste_factor: float = 0.15
    waste_sqft: float = 0.0
    area_with_waste_sqft: float = 0.0
    sheet_width_ft: float = 4.0
    sheet_length_ft: float = 12.0
    sheet_size_sqft: float = 48.0
    sheets_required: int = 0
    geometry_source: Literal["annotation_document", "cv_pipeline"] = "cv_pipeline"
    geometry_revision_used: int = 0
    geometry_hash: str = ""
    estimate_ready: bool = False
    blocked_reasons: list[str] = Field(default_factory=list)
    takeoff_confidence: Literal["high", "medium", "low"] = "low"
    surface_classification_confidence: Literal["high", "medium", "low"] = "low"
    room_closure_status: Literal["closed", "open", "ambiguous"] = "open"
    unclosed_gap_count: int = 0
    largest_boundary_gap_ft: float = 0.0
    unmatched_opening_count: int = 0
    matched_opening_count: int = 0
    fallback_opening_count: int = 0
    opening_deduction_mode: Literal["measured", "mixed", "fallback_constants"] = "measured"
    sheet_count_method: Literal["area_based"] = "area_based"
    perimeter_linear_ft: float = 0.0
    partition_linear_ft: float = 0.0
    unknown_linear_ft: float = 0.0
    perimeter_board_sqft: float = 0.0
    partition_board_sqft: float = 0.0
    unknown_board_sqft: float = 0.0
    unknown_wall_count: int = 0
    normalized_wall_count: int = 0
    normalized_opening_count: int = 0
    effective_scale_px_per_ft: float = 0.0
    scale_source: Literal["request", "annotation_document", "pdf_dimension_inference", "missing"] = "missing"
    scale_confidence: float = 0.0
    floor_area_guardrail_applied: bool = False
    area_debug: dict[str, float | int | str] = Field(default_factory=dict)
    annotated_image: Optional[str] = None
    assumptions_applied: Optional[AssumptionsSnapshot] = None
    material_cost_usd: Optional[float] = None
    markup_usd: Optional[float] = None
    tax_usd: Optional[float] = None
    total_cost_usd: Optional[float] = None
    line_items: list[LineItem] = Field(default_factory=list)
    flooring_by_material: dict[str, FlooringMaterialSummary] = Field(default_factory=dict)


WALL_COLOR = (0, 180, 0)
DOOR_COLOR = (0, 0, 255)
WINDOW_COLOR = (255, 150, 0)
FONT = cv2.FONT_HERSHEY_SIMPLEX


@dataclass
class GeometryWall:
    id: str
    start: tuple[int, int]
    end: tuple[int, int]
    thickness: float
    visual_thickness: float
    length_px: float


@dataclass
class GeometryOpening:
    id: str
    tag_class: str
    bbox: tuple[int, int, int, int]
    width_ft: Optional[float] = None
    height_ft: Optional[float] = None


@dataclass
class GeometryMetadata:
    image_width: int = 0
    image_height: int = 0
    scale_px_per_ft: Optional[float] = None


@dataclass
class GeometryResult:
    walls: list[GeometryWall] = field(default_factory=list)
    openings: list[GeometryOpening] = field(default_factory=list)
    metadata: GeometryMetadata = field(default_factory=GeometryMetadata)


@dataclass
class ScaleResolution:
    scale_px_per_ft: Optional[float]
    source: Literal["request", "annotation_document", "pdf_dimension_inference", "missing"]
    confidence: float = 0.0
    reason: str = ""


@dataclass
class SavedAnnotationPayload:
    document: dict[str, Any]
    revision: int


def _tag_name(value: Any) -> str:
    if hasattr(value, "value"):
        raw = value.value
    else:
        raw = value
    return str(raw or "").lower()


def _is_door(opening: Any) -> bool:
    return _tag_name(getattr(opening, "tag_class", None)) == "door"


def _is_window(opening: Any) -> bool:
    return _tag_name(getattr(opening, "tag_class", None)) == "window"


def _positive_float(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not isfinite(number) or number <= 0:
        return None
    return number


def _int_coord(value: Any) -> int:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0
    if not isfinite(number):
        return 0
    return int(round(number))


def _count_geometry_openings(geometry_result) -> tuple[int, int]:
    doors = sum(
        1
        for opening in geometry_result.openings
        if _is_door(opening) and getattr(opening, "matched", True)
    )
    windows = sum(
        1
        for opening in geometry_result.openings
        if _is_window(opening) and getattr(opening, "matched", True)
    )
    return doors, windows


def _generic_geometry_hash(geometry_result, scale_px_per_ft: Optional[float]) -> str:
    payload = {
        "scale_px_per_ft": round(float(scale_px_per_ft), 4) if scale_px_per_ft else 0.0,
        "walls": [
            {
                "start": [int(wall.start[0]), int(wall.start[1])],
                "end": [int(wall.end[0]), int(wall.end[1])],
                "thickness": round(float(getattr(wall, "thickness", 0.0)), 3),
                "visual_thickness": round(float(getattr(wall, "visual_thickness", 0.0)), 3),
            }
            for wall in sorted(
                geometry_result.walls,
                key=lambda wall: (wall.start[0], wall.start[1], wall.end[0], wall.end[1], getattr(wall, "id", "")),
            )
        ],
        "openings": [
            {
                "tag_class": _tag_name(getattr(opening, "tag_class", "")),
                "bbox": [
                    int(opening.bbox[0]),
                    int(opening.bbox[1]),
                    int(opening.bbox[2]),
                    int(opening.bbox[3]),
                ],
                "matched": bool(getattr(opening, "matched", True)),
            }
            for opening in sorted(
                geometry_result.openings,
                key=lambda opening: (
                    _tag_name(getattr(opening, "tag_class", "")),
                    tuple(int(value) for value in opening.bbox),
                    getattr(opening, "id", ""),
                ),
            )
        ],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha1(encoded).hexdigest()[:16]


def _wall_orientation(wall: GeometryWall) -> Literal["horizontal", "vertical"]:
    dx = abs(wall.end[0] - wall.start[0])
    dy = abs(wall.end[1] - wall.start[1])
    return "horizontal" if dx >= dy else "vertical"


def _resolve_effective_scale(
    req: TakeoffRequest,
    geometry_result,
    file_bytes: bytes,
    page_number: int,
) -> ScaleResolution:
    requested = _positive_float(req.scale_px_per_ft)
    if requested is not None:
        return ScaleResolution(
            scale_px_per_ft=requested,
            source="request",
            confidence=1.0,
            reason="Using requested scale_px_per_ft",
        )

    geometry_scale = _positive_float(getattr(geometry_result.metadata, "scale_px_per_ft", None))
    if geometry_scale is not None:
        return ScaleResolution(
            scale_px_per_ft=geometry_scale,
            source="annotation_document",
            confidence=1.0,
            reason="Using annotation document base image scale",
        )

    if req.file_mime == "application/pdf":
        candidates = extract_pdf_dimension_candidates(file_bytes, page_number)
        inference = infer_scale_px_per_ft_from_dimensions(candidates, geometry_result)
        if inference.scale_px_per_ft is not None and inference.confidence >= MIN_SCALE_FOR_INFERENCE_CONFIDENCE:
            return ScaleResolution(
                scale_px_per_ft=inference.scale_px_per_ft,
                source="pdf_dimension_inference",
                confidence=inference.confidence,
                reason=inference.reason,
            )
        return ScaleResolution(
            scale_px_per_ft=None,
            source="missing",
            confidence=inference.confidence,
            reason=inference.reason or "No reliable PDF measurement-derived scale found",
        )

    return ScaleResolution(
        scale_px_per_ft=None,
        source="missing",
        confidence=0.0,
        reason="Scale missing and no inference source available",
    )


def _annotation_document_to_geometry_result(
    document: dict[str, Any],
    requested_scale_px_per_ft: Optional[float],
) -> GeometryResult:
    base_image = document.get("baseImage") if isinstance(document, dict) else None
    if not isinstance(base_image, dict):
        base_image = {}

    geometry_result = GeometryResult(
        metadata=GeometryMetadata(
            image_width=max(0, _int_coord(base_image.get("widthPx"))),
            image_height=max(0, _int_coord(base_image.get("heightPx"))),
            scale_px_per_ft=requested_scale_px_per_ft
            if _positive_float(requested_scale_px_per_ft) is not None
            else _positive_float(base_image.get("scalePxPerFt")),
        )
    )

    raw_elements = document.get("elements")
    if not isinstance(raw_elements, list):
        return geometry_result

    for index, element in enumerate(raw_elements):
        if not isinstance(element, dict):
            continue
        element_type = element.get("type")
        geometry = element.get("geometry")
        if not isinstance(geometry, dict):
            continue

        element_id = str(element.get("id") or f"{element_type}_{index}")

        if element_type == "wall" and geometry.get("kind") == "segment":
            x1 = _int_coord(geometry.get("x1"))
            y1 = _int_coord(geometry.get("y1"))
            x2 = _int_coord(geometry.get("x2"))
            y2 = _int_coord(geometry.get("y2"))
            thickness = _positive_float(geometry.get("thicknessPx")) or 1.0
            geometry_result.walls.append(
                GeometryWall(
                    id=element_id,
                    start=(x1, y1),
                    end=(x2, y2),
                    thickness=thickness,
                    visual_thickness=thickness,
                    length_px=hypot(x2 - x1, y2 - y1),
                )
            )
            continue

        if element_type in {"door", "window"} and geometry.get("kind") == "rect":
            x = _int_coord(geometry.get("x"))
            y = _int_coord(geometry.get("y"))
            width = max(0, _int_coord(geometry.get("width")))
            height = max(0, _int_coord(geometry.get("height")))
            if width <= 0 or height <= 0:
                continue
            geometry_result.openings.append(
                GeometryOpening(
                    id=element_id,
                    tag_class=element_type,
                    bbox=(x, y, width, height),
                )
            )

    return geometry_result


def _load_saved_annotation_document(req: TakeoffRequest) -> Optional[SavedAnnotationPayload]:
    if not req.project_id:
        raise HTTPException(status_code=422, detail="project_id is required when use_saved_annotations=true")

    state = _load_state(req.project_id, req.page_number)
    state = _apply_sanitization_if_needed(state, req.project_id, req.page_number)

    if req.annotation_revision is not None and state.document is not None and req.annotation_revision != state.latest_revision:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Saved annotation revision changed: requested={req.annotation_revision}, "
                f"latest={state.latest_revision}"
            ),
        )

    if not state.document:
        return None

    return SavedAnnotationPayload(document=state.document, revision=state.latest_revision)


def _load_saved_annotation_geometry(req: TakeoffRequest) -> tuple[Optional[GeometryResult], int]:
    payload = _load_saved_annotation_document(req)
    if payload is None:
        return None, 0

    geometry_result = _annotation_document_to_geometry_result(payload.document, req.scale_px_per_ft)
    if not geometry_result.walls:
        raise HTTPException(status_code=422, detail="Saved annotation document has no wall geometry for takeoff")

    return geometry_result, payload.revision


def _geometry_result_to_snapshot(
    geometry_result,
    revision: int,
    effective_scale_px_per_ft: Optional[float],
) -> TakeoffGeometrySnapshot:
    document = {
        "baseImage": {
            "widthPx": int(getattr(geometry_result.metadata, "image_width", 0) or 0),
            "heightPx": int(getattr(geometry_result.metadata, "image_height", 0) or 0),
            "scalePxPerFt": effective_scale_px_per_ft or getattr(geometry_result.metadata, "scale_px_per_ft", None),
        },
        "elements": [],
    }

    for index, wall in enumerate(geometry_result.walls):
        document["elements"].append({
            "id": str(getattr(wall, "id", f"wall_{index + 1}")),
            "type": "wall",
            "geometry": {
                "kind": "segment",
                "x1": int(wall.start[0]),
                "y1": int(wall.start[1]),
                "x2": int(wall.end[0]),
                "y2": int(wall.end[1]),
                "thicknessPx": float(getattr(wall, "thickness", 14.0) or 14.0),
            },
        })

    for index, opening in enumerate(geometry_result.openings):
        relations: dict[str, Any] = {}
        wall_id = getattr(opening, "wall_id", None)
        if wall_id:
            relations["hostWallId"] = str(wall_id)
        document["elements"].append({
            "id": str(getattr(opening, "id", f"opening_{index + 1}")),
            "type": "door" if _is_door(opening) else "window",
            "geometry": {
                "kind": "rect",
                "x": int(opening.bbox[0]),
                "y": int(opening.bbox[1]),
                "width": int(opening.bbox[2]),
                "height": int(opening.bbox[3]),
                "rotationDeg": 0,
            },
            "relations": relations,
        })

    return build_takeoff_geometry_snapshot(document, revision=revision, effective_scale_px_per_ft=effective_scale_px_per_ft)


def _generate_annotated_image(
    file_bytes: bytes,
    mime_type: str,
    geometry_result,
    page_number: int = 0,
    crop_left: float = 0.0,
    crop_top: float = 0.0,
    crop_right: float = 1.0,
    crop_bottom: float = 1.0,
) -> str:
    """Draw CV detections on the floor plan and return as a base64 PNG string."""
    bgr = load_image(file_bytes, mime_type, dpi=200, page_number=page_number)
    bgr = crop_drawing_area(bgr, crop_left, crop_top, crop_right, crop_bottom)
    annotated = bgr.copy()

    wall_overlay = annotated.copy()
    for wall in geometry_result.walls:
        visual_thickness = wall.visual_thickness if wall.visual_thickness > 0 else wall.thickness
        line_t = max(3, int(visual_thickness))
        cv2.line(wall_overlay, wall.start, wall.end, WALL_COLOR, line_t, cv2.LINE_AA)

    cv2.addWeighted(wall_overlay, 0.4, annotated, 0.6, 0, annotated)

    for wall in geometry_result.walls:
        mx = (wall.start[0] + wall.end[0]) // 2
        my = (wall.start[1] + wall.end[1]) // 2
        cv2.putText(annotated, wall.id, (mx - 20, my - 8), FONT, 0.45, WALL_COLOR, 1, cv2.LINE_AA)

    door_openings = [opening for opening in geometry_result.openings if _is_door(opening)]
    window_openings = [opening for opening in geometry_result.openings if _is_window(opening)]

    for opening in door_openings:
        x, y, width, height = opening.bbox
        cv2.rectangle(annotated, (x, y), (x + width, y + height), DOOR_COLOR, 2)
        cv2.putText(annotated, opening.id, (x, max(12, y - 6)), FONT, 0.4, DOOR_COLOR, 1, cv2.LINE_AA)

    for opening in window_openings:
        x, y, width, height = opening.bbox
        cv2.rectangle(annotated, (x, y), (x + width, y + height), WINDOW_COLOR, 2)
        cv2.putText(annotated, opening.id, (x, max(12, y - 6)), FONT, 0.4, WINDOW_COLOR, 1, cv2.LINE_AA)

    lx, ly = 20, 30
    cv2.rectangle(annotated, (10, 10), (320, 110), (255, 255, 255), -1)
    cv2.rectangle(annotated, (10, 10), (320, 110), (0, 0, 0), 1)
    cv2.putText(annotated, "LEGEND", (lx, ly), FONT, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.rectangle(annotated, (lx, ly + 8), (lx + 30, ly + 16), WALL_COLOR, -1)
    cv2.putText(annotated, f"Walls ({len(geometry_result.walls)})", (lx + 40, ly + 16), FONT, 0.4, WALL_COLOR, 1, cv2.LINE_AA)
    ly += 28
    cv2.rectangle(annotated, (lx + 4, ly - 3), (lx + 20, ly + 11), DOOR_COLOR, 2)
    cv2.putText(annotated, f"Doors ({len(door_openings)})", (lx + 40, ly + 8), FONT, 0.4, DOOR_COLOR, 1, cv2.LINE_AA)
    ly += 28
    cv2.rectangle(annotated, (lx + 4, ly - 3), (lx + 20, ly + 11), WINDOW_COLOR, 2)
    cv2.putText(annotated, f"Windows ({len(window_openings)})", (lx + 40, ly + 8), FONT, 0.4, WINDOW_COLOR, 1, cv2.LINE_AA)

    _, buf = cv2.imencode(".png", annotated)
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def _compute_total_linear_ft(cv_result, scale_px_per_ft: Optional[float]) -> float:
    if scale_px_per_ft is None or scale_px_per_ft <= 0:
        return 0.0
    return sum(wall.length_px for wall in cv_result.walls) / scale_px_per_ft


def _opening_area_sqft(opening, scale_px_per_ft: Optional[float]) -> float:
    width_ft = getattr(opening, "width_ft", None)
    height_ft = getattr(opening, "height_ft", None)
    if width_ft and height_ft and width_ft > 0 and height_ft > 0:
        return float(width_ft * height_ft)

    if scale_px_per_ft is not None and scale_px_per_ft > 0:
        _, _, width_px, height_px = opening.bbox
        width_ft = width_px / scale_px_per_ft
        height_ft = height_px / scale_px_per_ft
        if width_ft > 0 and height_ft > 0:
            return float(width_ft * height_ft)

    return DOOR_OPENING_SQFT if _is_door(opening) else WINDOW_OPENING_SQFT


def _compute_opening_deduction_sqft(cv_result, scale_px_per_ft: Optional[float]) -> float:
    return sum(
        _opening_area_sqft(opening, scale_px_per_ft)
        for opening in cv_result.openings
        if getattr(opening, "matched", True)
    )


def _compute_wall_board_sqft(
    total_linear_ft: float,
    ceiling_height_ft: float,
    opening_deduction_sqft: float,
) -> tuple[float, float]:
    gross_wall_board_sqft = total_linear_ft * ceiling_height_ft * 2
    net_wall_board_sqft = max(0.0, gross_wall_board_sqft - opening_deduction_sqft)
    return gross_wall_board_sqft, net_wall_board_sqft


def _compute_ceiling_board_sqft(floor_area_sqft: float, include_ceiling: bool) -> float:
    return floor_area_sqft if include_ceiling and floor_area_sqft > 0 else 0.0


def _compute_materials(
    net_wall_board_sqft: float,
    ceiling_board_sqft: float,
    waste_factor: float,
    sheet_size_sqft: float,
) -> tuple[float, float, float, int]:
    net_board_area_sqft = net_wall_board_sqft + ceiling_board_sqft
    waste_sqft = net_board_area_sqft * waste_factor
    area_with_waste_sqft = net_board_area_sqft + waste_sqft
    rounded_area_with_waste_sqft = round(area_with_waste_sqft, 2)
    sheets_required = (
        int(np.ceil(rounded_area_with_waste_sqft / sheet_size_sqft))
        if sheet_size_sqft > 0 and rounded_area_with_waste_sqft > 0
        else 0
    )
    return net_board_area_sqft, waste_sqft, area_with_waste_sqft, sheets_required


def _compute_reference_area_delta(
    floor_area_sqft: float,
    reference_floor_area_sqft: Optional[float],
) -> tuple[float, float]:
    if reference_floor_area_sqft is None or reference_floor_area_sqft <= 0 or floor_area_sqft <= 0:
        return 0.0, 0.0
    delta_sqft = floor_area_sqft - reference_floor_area_sqft
    delta_pct = (abs(delta_sqft) / reference_floor_area_sqft) * 100
    return delta_sqft, delta_pct


def _snapshot_convex_hull_floor_area_sqft(snapshot: TakeoffGeometrySnapshot) -> float:
    if not snapshot.scale_px_per_ft or snapshot.scale_px_per_ft <= 0 or not snapshot.walls:
        return 0.0
    points = []
    for wall in snapshot.walls:
        points.append(wall.start)
        points.append(wall.end)
    if len(points) < 3:
        return 0.0
    points_np = np.array(points, dtype=np.int32)
    hull = cv2.convexHull(points_np)
    area_px2 = float(cv2.contourArea(hull))
    if area_px2 <= 0:
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        area_px2 = float(max(0, max(xs) - min(xs)) * max(0, max(ys) - min(ys)))
    return area_px2 / (snapshot.scale_px_per_ft ** 2)


def _compute_legacy_convex_hull_floor_area_sqft(cv_result, scale_px_per_ft: Optional[float]) -> float:
    if scale_px_per_ft is None or scale_px_per_ft <= 0 or not cv_result.walls:
        return 0.0

    points = []
    for wall in cv_result.walls:
        points.append(wall.start)
        points.append(wall.end)

    if len(points) < 3:
        return 0.0

    points_np = np.array(points, dtype=np.int32)
    hull = cv2.convexHull(points_np)
    area_px2 = float(cv2.contourArea(hull))
    if area_px2 <= 0:
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        area_px2 = float(max(0, max(xs) - min(xs)) * max(0, max(ys) - min(ys)))

    return area_px2 / (scale_px_per_ft * scale_px_per_ft)


def _resolve_mask_dimensions(cv_result) -> tuple[int, int]:
    width = int(getattr(cv_result.metadata, "image_width", 0) or 0)
    height = int(getattr(cv_result.metadata, "image_height", 0) or 0)
    if width > 0 and height > 0:
        return width, height

    max_x = 0
    max_y = 0
    for wall in cv_result.walls:
        max_x = max(max_x, wall.start[0], wall.end[0])
        max_y = max(max_y, wall.start[1], wall.end[1])
    for opening in cv_result.openings:
        x, y, w, h = opening.bbox
        max_x = max(max_x, x + w)
        max_y = max(max_y, y + h)
    return max_x + 8, max_y + 8


def _build_floor_occupancy_mask(cv_result, width_px: int, height_px: int) -> np.ndarray:
    mask = np.zeros((height_px, width_px), dtype=np.uint8)
    for wall in cv_result.walls:
        thickness = wall.visual_thickness if wall.visual_thickness > 0 else wall.thickness
        line_thickness = max(1, int(round(thickness)))
        cv2.line(mask, wall.start, wall.end, 255, line_thickness, cv2.LINE_8)
    return mask


def _seal_opening_rects(mask: np.ndarray, cv_result) -> None:
    max_x = mask.shape[1] - 1
    max_y = mask.shape[0] - 1
    for opening in cv_result.openings:
        x, y, width, height = opening.bbox
        x0 = max(0, min(max_x, int(x)))
        y0 = max(0, min(max_y, int(y)))
        x1 = max(0, min(max_x, int(x + width)))
        y1 = max(0, min(max_y, int(y + height)))
        cv2.rectangle(mask, (x0, y0), (x1, y1), 255, -1)


def _point_perimeter_distance(x: int, y: int, width_px: int, height_px: int) -> int:
    return min(x, max(0, width_px - 1 - x), y, max(0, height_px - 1 - y))


def _wall_is_near_perimeter(wall: GeometryWall, width_px: int, height_px: int, margin_px: int) -> bool:
    sx, sy = wall.start
    ex, ey = wall.end
    return (
        _point_perimeter_distance(sx, sy, width_px, height_px) <= margin_px
        or _point_perimeter_distance(ex, ey, width_px, height_px) <= margin_px
    )


def _closure_candidate_between_walls(
    wall_a: GeometryWall,
    wall_b: GeometryWall,
) -> Optional[tuple[tuple[int, int], tuple[int, int], int]]:
    orientation = _wall_orientation(wall_a)
    if orientation != _wall_orientation(wall_b):
        return None

    if orientation == "horizontal":
        y_a = int(round((wall_a.start[1] + wall_a.end[1]) / 2))
        y_b = int(round((wall_b.start[1] + wall_b.end[1]) / 2))
        if abs(y_a - y_b) > PERIMETER_ALIGNMENT_TOL_PX:
            return None
        a0, a1 = sorted((wall_a.start[0], wall_a.end[0]))
        b0, b1 = sorted((wall_b.start[0], wall_b.end[0]))
        if a0 > b0:
            a0, a1, b0, b1 = b0, b1, a0, a1
        gap_px = b0 - a1
        if gap_px <= 0:
            return None
        y = int(round((y_a + y_b) / 2))
        return (a1, y), (b0, y), gap_px

    x_a = int(round((wall_a.start[0] + wall_a.end[0]) / 2))
    x_b = int(round((wall_b.start[0] + wall_b.end[0]) / 2))
    if abs(x_a - x_b) > PERIMETER_ALIGNMENT_TOL_PX:
        return None
    a0, a1 = sorted((wall_a.start[1], wall_a.end[1]))
    b0, b1 = sorted((wall_b.start[1], wall_b.end[1]))
    if a0 > b0:
        a0, a1, b0, b1 = b0, b1, a0, a1
    gap_px = b0 - a1
    if gap_px <= 0:
        return None
    x = int(round((x_a + x_b) / 2))
    return (x, a1), (x, b0), gap_px


def _seal_perimeter_leaks(mask: np.ndarray, cv_result, scale_px_per_ft: Optional[float]) -> dict[str, float | int]:
    width_px = mask.shape[1]
    height_px = mask.shape[0]
    max_gap_px = (
        int(round(PERIMETER_MAX_GAP_FT * scale_px_per_ft))
        if scale_px_per_ft is not None and scale_px_per_ft > 0
        else PERIMETER_MAX_GAP_PX_FALLBACK
    )
    max_gap_px = max(12, min(140, max_gap_px))

    closure_gap_count = 0
    closure_length_px_added = 0.0
    seen: set[tuple[int, int, int, int]] = set()
    walls = list(cv_result.walls)

    for idx, wall_a in enumerate(walls):
        if not _wall_is_near_perimeter(wall_a, width_px, height_px, PERIMETER_MARGIN_PX):
            continue
        for wall_b in walls[idx + 1:]:
            if not _wall_is_near_perimeter(wall_b, width_px, height_px, PERIMETER_MARGIN_PX):
                continue
            candidate = _closure_candidate_between_walls(wall_a, wall_b)
            if candidate is None:
                continue
            start, end, gap_px = candidate
            if gap_px > max_gap_px:
                continue

            mid_x = int(round((start[0] + end[0]) / 2))
            mid_y = int(round((start[1] + end[1]) / 2))
            if _point_perimeter_distance(mid_x, mid_y, width_px, height_px) > PERIMETER_MARGIN_PX:
                continue

            key = (start[0], start[1], end[0], end[1]) if start <= end else (end[0], end[1], start[0], start[1])
            if key in seen:
                continue
            seen.add(key)

            thickness = max(1, int(round((wall_a.visual_thickness + wall_b.visual_thickness) / 2)))
            cv2.line(mask, start, end, 255, thickness, cv2.LINE_8)
            closure_gap_count += 1
            closure_length_px_added += float(gap_px)

    return {
        "closure_gap_count": closure_gap_count,
        "closure_length_px_added": round(closure_length_px_added, 2),
    }


def _heal_small_boundary_gaps(mask: np.ndarray) -> np.ndarray:
    kernel = np.ones((AREA_HEAL_KERNEL_SIZE, AREA_HEAL_KERNEL_SIZE), dtype=np.uint8)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)


def _compute_enclosed_floor_area_sqft(mask: np.ndarray, scale_px_per_ft: Optional[float]) -> tuple[float, dict[str, float | int | str]]:
    if scale_px_per_ft is None or scale_px_per_ft <= 0:
        return 0.0, {
            "interior_region_count": 0,
            "interior_area_px": 0,
            "exterior_area_px": 0,
            "healed_gap_radius_px": AREA_HEAL_KERNEL_SIZE // 2,
            "mask_width_px": int(mask.shape[1]),
            "mask_height_px": int(mask.shape[0]),
            "min_region_area_px": 0,
        }

    padded = np.zeros((mask.shape[0] + 2, mask.shape[1] + 2), dtype=np.uint8)
    padded[1:-1, 1:-1] = mask
    empty = (padded == 0).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(empty, connectivity=4)

    border_labels = set(np.unique(np.concatenate((
        labels[0, :],
        labels[-1, :],
        labels[:, 0],
        labels[:, -1],
    ))).tolist())

    min_region_area_px = int(round(MIN_INTERIOR_REGION_SQFT * (scale_px_per_ft ** 2)))
    interior_area_px = 0
    interior_region_count = 0

    for label in range(1, num_labels):
        if label in border_labels:
            continue
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < min_region_area_px:
            continue
        interior_region_count += 1
        interior_area_px += area

    exterior_area_px = int(sum(
        int(stats[label, cv2.CC_STAT_AREA])
        for label in border_labels
        if 0 <= label < num_labels
    ))
    floor_area_sqft = interior_area_px / (scale_px_per_ft ** 2)

    return floor_area_sqft, {
        "interior_region_count": interior_region_count,
        "interior_area_px": interior_area_px,
        "exterior_area_px": exterior_area_px,
        "healed_gap_radius_px": AREA_HEAL_KERNEL_SIZE // 2,
        "mask_width_px": int(mask.shape[1]),
        "mask_height_px": int(mask.shape[0]),
        "min_region_area_px": min_region_area_px,
    }


def _compute_floor_area_sqft(cv_result, scale_px_per_ft: Optional[float]) -> tuple[float, str, dict[str, float | int | str]]:
    if scale_px_per_ft is None or scale_px_per_ft <= 0:
        width_px, height_px = _resolve_mask_dimensions(cv_result)
        return 0.0, "missing_scale", {
            "interior_region_count": 0,
            "interior_area_px": 0,
            "exterior_area_px": 0,
            "healed_gap_radius_px": AREA_HEAL_KERNEL_SIZE // 2,
            "mask_width_px": int(width_px),
            "mask_height_px": int(height_px),
            "min_region_area_px": 0,
        }

    width_px, height_px = _resolve_mask_dimensions(cv_result)
    if width_px <= 0 or height_px <= 0:
        return 0.0, "failed", {
            "interior_region_count": 0,
            "interior_area_px": 0,
            "exterior_area_px": 0,
            "healed_gap_radius_px": AREA_HEAL_KERNEL_SIZE // 2,
            "mask_width_px": int(width_px),
            "mask_height_px": int(height_px),
            "min_region_area_px": 0,
        }

    base_mask = _build_floor_occupancy_mask(cv_result, width_px, height_px)
    _seal_opening_rects(base_mask, cv_result)

    healed_mask_a = _heal_small_boundary_gaps(base_mask)
    pass_a_floor_area_sqft, pass_a_debug = _compute_enclosed_floor_area_sqft(healed_mask_a, scale_px_per_ft)

    pass_b_mask = base_mask.copy()
    closure_debug = _seal_perimeter_leaks(pass_b_mask, cv_result, scale_px_per_ft)
    healed_mask_b = _heal_small_boundary_gaps(pass_b_mask)
    pass_b_floor_area_sqft, pass_b_debug = _compute_enclosed_floor_area_sqft(healed_mask_b, scale_px_per_ft)

    area_debug: dict[str, float | int | str] = dict(pass_a_debug)
    area_debug["pass_a_floor_area_sqft"] = round(float(pass_a_floor_area_sqft), 4)
    area_debug["pass_b_floor_area_sqft"] = round(float(pass_b_floor_area_sqft), 4)
    area_debug["closure_gap_count"] = int(closure_debug["closure_gap_count"])
    area_debug["closure_length_px_added"] = float(closure_debug["closure_length_px_added"])

    if scale_px_per_ft is not None and scale_px_per_ft > 0:
        closure_length_ft_added = float(closure_debug["closure_length_px_added"]) / scale_px_per_ft
    else:
        closure_length_ft_added = 0.0
    area_debug["closure_length_ft_added"] = round(closure_length_ft_added, 4)

    if pass_a_floor_area_sqft > 0 or pass_b_floor_area_sqft > 0:
        chosen_area = max(pass_a_floor_area_sqft, pass_b_floor_area_sqft)
        guardrail_applied = False
        area_growth_ratio = 1.0

        if pass_a_floor_area_sqft > 0 and pass_b_floor_area_sqft > 0:
            area_growth_ratio = pass_b_floor_area_sqft / pass_a_floor_area_sqft
            if (
                area_growth_ratio > AREA_GROWTH_GUARDRAIL_RATIO
                and closure_length_ft_added < AREA_GROWTH_SMALL_CLOSURE_FT
            ):
                chosen_area = pass_a_floor_area_sqft
                guardrail_applied = True
                area_debug["guardrail_reason"] = "rejected_disproportionate_growth_from_small_perimeter_closure"
            else:
                chosen_area = pass_b_floor_area_sqft
        elif pass_b_floor_area_sqft > 0:
            chosen_area = pass_b_floor_area_sqft
        else:
            chosen_area = pass_a_floor_area_sqft

        area_debug.update(pass_b_debug)
        area_debug["area_growth_ratio"] = round(float(area_growth_ratio), 4)
        area_debug["floor_area_guardrail_applied"] = int(guardrail_applied)
        return chosen_area, "enclosed_regions", area_debug

    legacy_floor_area_sqft = _compute_legacy_convex_hull_floor_area_sqft(cv_result, scale_px_per_ft)
    area_debug.update(pass_b_debug)
    area_debug["fallback_floor_area_sqft"] = round(float(legacy_floor_area_sqft), 4)
    area_debug["area_growth_ratio"] = 0.0
    area_debug["floor_area_guardrail_applied"] = 0

    best_enclosed = max(pass_a_floor_area_sqft, pass_b_floor_area_sqft)
    if (
        legacy_floor_area_sqft > 0
        and best_enclosed > 0
        and legacy_floor_area_sqft > (best_enclosed * CONVEX_HULL_SANITY_MULTIPLIER)
    ):
        area_debug["guardrail_reason"] = "legacy_convex_hull_rejected_as_disproportionate"
        return 0.0, "failed", area_debug

    if legacy_floor_area_sqft > 0:
        return legacy_floor_area_sqft, "legacy_convex_hull_fallback", area_debug
    return 0.0, "failed", area_debug


def _compute_annotation_floor_area_sqft(
    snapshot: TakeoffGeometrySnapshot,
) -> tuple[float, str, dict[str, float | int | str], Literal["closed", "open", "ambiguous"], Literal["high", "medium", "low"], int, float]:
    closure = compute_enclosed_regions(snapshot)
    floor_area_method: Literal["enclosed_regions", "legacy_convex_hull_fallback", "missing_scale", "failed"]
    floor_area = closure.floor_area_sqft
    area_debug = dict(closure.debug)

    if not snapshot.scale_px_per_ft or snapshot.scale_px_per_ft <= 0:
        floor_area_method = "missing_scale"
    elif closure.status == "closed" and floor_area > 0:
        floor_area_method = "enclosed_regions"
    else:
        if floor_area <= 0:
            hull_area = _snapshot_convex_hull_floor_area_sqft(snapshot)
            if hull_area > 0:
                floor_area = hull_area
                floor_area_method = "legacy_convex_hull_fallback"
                area_debug["convex_hull_floor_area_sqft"] = round(hull_area, 4)
            else:
                floor_area_method = "failed"
        else:
            floor_area_method = "enclosed_regions"

    return (
        floor_area,
        floor_area_method,
        area_debug,
        closure.status,
        closure.confidence,
        closure.unclosed_gap_count,
        closure.largest_boundary_gap_px / snapshot.scale_px_per_ft if snapshot.scale_px_per_ft else 0.0,
    )


def _derive_takeoff_confidence(
    geometry_source: Literal["annotation_document", "cv_pipeline"],
    base_confidence: Literal["high", "medium", "low"],
    scale_source: Literal["request", "annotation_document", "pdf_dimension_inference", "missing"],
    estimate_ready: bool,
    room_closure_status: Literal["closed", "open", "ambiguous"],
    surface_classification_confidence: Literal["high", "medium", "low"],
) -> Literal["high", "medium", "low"]:
    if not estimate_ready or room_closure_status != "closed":
        return "low"
    if surface_classification_confidence == "low" or scale_source == "missing":
        return "low"
    if geometry_source == "annotation_document" and base_confidence == "high" and surface_classification_confidence == "high":
        return "high" if scale_source != "pdf_dimension_inference" else "medium"
    if base_confidence == "high" and surface_classification_confidence != "low":
        return "medium"
    return "low"


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


def _analysis_lines(lines: Iterable[str]) -> str:
    return "\n".join(lines)


@router.post("/analyze", response_model=TakeoffResult)
async def analyze_takeoff(req: TakeoffRequest):
    """Analyze a floor plan for material takeoff."""
    if req.use_saved_annotations and not req.project_id:
        raise HTTPException(status_code=422, detail="project_id is required when use_saved_annotations=true")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(req.file_url)
            resp.raise_for_status()
            file_bytes = resp.content
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to download file: {str(exc)}") from exc

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Downloaded file is empty")

    cv_doors = 0
    cv_windows = 0
    cv_walls = 0
    floor_area_sqft = 0.0
    floor_area_method: Literal["enclosed_regions", "legacy_convex_hull_fallback", "missing_scale", "failed"] = "failed"
    reference_floor_area_sqft = float(req.reference_floor_area_sqft or 0.0)
    reference_area_delta_sqft = 0.0
    reference_area_delta_pct = 0.0
    net_wall_board_sqft = 0.0
    total_linear_ft = 0.0
    gross_wall_board_sqft = 0.0
    opening_deduction_sqft = 0.0
    ceiling_board_sqft = 0.0
    net_board_area_sqft = 0.0
    waste_sqft = 0.0
    area_with_waste_sqft = 0.0
    sheet_size_sqft = req.sheet_width_ft * req.sheet_length_ft
    sheets_required = 0
    annotated_b64: Optional[str] = None
    geometry_source: Literal["annotation_document", "cv_pipeline"] = "cv_pipeline"
    geometry_revision_used = 0
    geometry_hash = ""
    estimate_ready = False
    blocked_reasons: list[str] = []
    takeoff_confidence: Literal["high", "medium", "low"] = "low"
    surface_classification_confidence: Literal["high", "medium", "low"] = "low"
    room_closure_status: Literal["closed", "open", "ambiguous"] = "open"
    unclosed_gap_count = 0
    largest_boundary_gap_ft = 0.0
    unmatched_opening_count = 0
    matched_opening_count = 0
    fallback_opening_count = 0
    opening_deduction_mode: Literal["measured", "mixed", "fallback_constants"] = "measured"
    sheet_count_method: Literal["area_based"] = "area_based"
    perimeter_linear_ft = 0.0
    partition_linear_ft = 0.0
    unknown_linear_ft = 0.0
    perimeter_board_sqft = 0.0
    partition_board_sqft = 0.0
    unknown_board_sqft = 0.0
    unknown_wall_count = 0
    normalized_wall_count = 0
    normalized_opening_count = 0
    effective_scale_px_per_ft: Optional[float] = None
    scale_source: Literal["request", "annotation_document", "pdf_dimension_inference", "missing"] = "missing"
    scale_confidence = 0.0
    scale_reason = ""
    floor_area_guardrail_applied = False
    area_debug: dict[str, float | int | str] = {}

    # Load saved assumptions; locked keys override request params.
    saved_assumptions = load_assumptions(req.project_id, req.page_number) if req.project_id else None
    if req.project_id and saved_assumptions:
        locked_keys = load_locked_keys(req.project_id, req.page_number)
        if locked_keys:
            req_dict = apply_locked_assumptions(
                {
                    "ceiling_height_ft": req.ceiling_height_ft,
                    "waste_factor": req.waste_factor,
                    "sheet_width_ft": req.sheet_width_ft,
                    "sheet_length_ft": req.sheet_length_ft,
                },
                saved_assumptions,
                locked_keys,
            )
            req = req.model_copy(update=req_dict)

    flooring_by_material: dict[str, FlooringMaterialSummary] = {}

    try:
        cv_page = max(0, req.page_number - 1)
        _validate_crop_bounds(req.crop_left, req.crop_top, req.crop_right, req.crop_bottom)
        geometry_result = None
        geometry_snapshot: Optional[TakeoffGeometrySnapshot] = None
        saved_annotation = None

        if req.use_saved_annotations:
            saved_annotation = _load_saved_annotation_document(req)
            if saved_annotation is not None:
                geometry_source = "annotation_document"
                geometry_revision_used = saved_annotation.revision
                geometry_result = _annotation_document_to_geometry_result(saved_annotation.document, req.scale_px_per_ft)
                if not geometry_result.walls:
                    raise HTTPException(status_code=422, detail="Saved annotation document has no wall geometry for takeoff")
                print(
                    f"[takeoff/annotations] file size={len(file_bytes)} bytes, mime={req.file_mime}, "
                    f"page={cv_page}, revision={geometry_revision_used}"
                )

        # Flooring rollup from room elements in the saved annotation document.
        if saved_annotation is not None:
            flooring_areas: dict[str, float] = {}
            for element in (saved_annotation.document.get("elements") or []):
                if not isinstance(element, dict) or element.get("type") != "room":
                    continue
                relations = element.get("relations") or {}
                material = relations.get("material")
                area = relations.get("areaSqFt")
                if material and isinstance(area, (int, float)) and area > 0:
                    flooring_areas[material] = flooring_areas.get(material, 0.0) + float(area)
            flooring_by_material = {
                mat: FlooringMaterialSummary(area_sqft=round(area, 2), quantity_required=round(area, 2))
                for mat, area in flooring_areas.items()
            }

        if geometry_result is None:
            print(f"[takeoff/cv] file size={len(file_bytes)} bytes, mime={req.file_mime}, page={cv_page}")
            geometry_result = cv_pipeline.run(
                file_bytes,
                req.file_mime,
                page_number=cv_page,
                scale_px_per_ft=req.scale_px_per_ft,
                crop_left=req.crop_left,
                crop_top=req.crop_top,
                crop_right=req.crop_right,
                crop_bottom=req.crop_bottom,
                )

        scale_resolution = _resolve_effective_scale(req, geometry_result, file_bytes, cv_page)
        effective_scale_px_per_ft = scale_resolution.scale_px_per_ft
        scale_source = scale_resolution.source
        scale_confidence = scale_resolution.confidence
        scale_reason = scale_resolution.reason

        if geometry_source == "annotation_document":
            if saved_annotation is None:
                raise HTTPException(status_code=500, detail="Saved annotation payload missing during takeoff")
            geometry_snapshot = build_takeoff_geometry_snapshot(
                saved_annotation.document,
                geometry_revision_used,
                effective_scale_px_per_ft,
            )
            if not geometry_snapshot.walls:
                raise HTTPException(status_code=422, detail="Saved annotation document has no usable wall geometry for takeoff")
        else:
            geometry_snapshot = _geometry_result_to_snapshot(geometry_result, revision=0, effective_scale_px_per_ft=effective_scale_px_per_ft)

        cv_doors, cv_windows = _count_geometry_openings(geometry_snapshot)
        cv_walls = len(geometry_snapshot.walls)
        normalized_wall_count = geometry_snapshot.wall_count
        normalized_opening_count = geometry_snapshot.opening_count
        unmatched_opening_count = geometry_snapshot.unmatched_opening_count
        geometry_hash = geometry_snapshot.geometry_hash

        (
            floor_area_sqft,
            floor_area_method,
            area_debug,
            room_closure_status,
            base_confidence,
            unclosed_gap_count,
            largest_boundary_gap_ft,
        ) = _compute_annotation_floor_area_sqft(geometry_snapshot)
        surface_result = classify_wall_surfaces(geometry_snapshot)
        surface_classification_confidence = surface_result.confidence
        unknown_wall_count = surface_result.unknown_wall_count
        estimate = estimate_board_requirements(
            walls=surface_result.walls,
            openings=geometry_snapshot.openings,
            scale_px_per_ft=effective_scale_px_per_ft,
            ceiling_height_ft=req.ceiling_height_ft,
            include_ceiling=req.include_ceiling,
            room_closure_status=room_closure_status,
            floor_area_sqft=floor_area_sqft,
            unmatched_opening_count=unmatched_opening_count,
            waste_factor=req.waste_factor,
            sheet_size_sqft=sheet_size_sqft,
            classification_confidence=surface_classification_confidence,
        )

        estimate_ready = estimate.estimate_ready
        blocked_reasons = estimate.blocked_reasons
        perimeter_linear_ft = estimate.perimeter_linear_ft
        partition_linear_ft = estimate.partition_linear_ft
        unknown_linear_ft = estimate.unknown_linear_ft
        perimeter_board_sqft = estimate.perimeter_board_sqft
        partition_board_sqft = estimate.partition_board_sqft
        unknown_board_sqft = estimate.unknown_board_sqft
        total_linear_ft = perimeter_linear_ft + partition_linear_ft + unknown_linear_ft
        gross_wall_board_sqft = estimate.gross_wall_board_sqft
        opening_deduction_sqft = estimate.opening_deduction_sqft
        net_wall_board_sqft = estimate.net_wall_board_sqft
        ceiling_board_sqft = estimate.ceiling_board_sqft
        net_board_area_sqft = estimate.net_board_area_sqft
        waste_sqft = estimate.waste_sqft
        area_with_waste_sqft = estimate.area_with_waste_sqft
        sheets_required = estimate.sheets_required
        matched_opening_count = estimate.matched_opening_count
        fallback_opening_count = estimate.fallback_opening_count
        opening_deduction_mode = estimate.opening_deduction_mode
        sheet_count_method = estimate.sheet_count_method

        takeoff_confidence = _derive_takeoff_confidence(
            geometry_source,
            base_confidence,
            scale_source,
            estimate_ready,
            room_closure_status,
            surface_classification_confidence,
        )

        area_debug.update({
            "geometry_hash": geometry_hash,
            "room_closure_status": room_closure_status,
            "estimate_ready": int(estimate_ready),
            "surface_classification_confidence": surface_classification_confidence,
            "blocked_reason_count": len(blocked_reasons),
            "unmatched_opening_count": unmatched_opening_count,
            "matched_opening_count": matched_opening_count,
            "fallback_opening_count": fallback_opening_count,
            "unknown_wall_count": unknown_wall_count,
            "normalized_wall_count": normalized_wall_count,
            "normalized_opening_count": normalized_opening_count,
            "perimeter_linear_ft": round(float(perimeter_linear_ft), 4),
            "partition_linear_ft": round(float(partition_linear_ft), 4),
            "unknown_linear_ft": round(float(unknown_linear_ft), 4),
        })
        area_debug.update(geometry_snapshot.diagnostics)
        area_debug.update(surface_result.diagnostics)
        area_debug.update(estimate.diagnostics)

        area_debug["effective_scale_px_per_ft"] = round(float(effective_scale_px_per_ft), 4) if effective_scale_px_per_ft else 0.0
        area_debug["scale_source"] = scale_source
        area_debug["scale_confidence"] = round(float(scale_confidence), 3)
        if scale_reason:
            area_debug["scale_reason"] = scale_reason
        area_debug["geometry_hash"] = geometry_hash
        area_debug["takeoff_confidence"] = takeoff_confidence
        area_debug["room_closure_status"] = room_closure_status
        area_debug["unclosed_gap_count"] = int(unclosed_gap_count)
        area_debug["largest_boundary_gap_ft"] = round(float(largest_boundary_gap_ft), 4)
        reference_area_delta_sqft, reference_area_delta_pct = _compute_reference_area_delta(
            floor_area_sqft,
            req.reference_floor_area_sqft,
        )
        area_debug["takeoff_confidence"] = takeoff_confidence

        annotated_b64 = _generate_annotated_image(
            file_bytes,
            req.file_mime,
            geometry_snapshot if geometry_snapshot is not None else geometry_result,
            page_number=cv_page,
            crop_left=req.crop_left,
            crop_top=req.crop_top,
            crop_right=req.crop_right,
            crop_bottom=req.crop_bottom,
        )
        print(
            f"[takeoff/{geometry_source}] "
            f"floor_area_sqft={floor_area_sqft:.1f} floor_area_method={floor_area_method} "
            f"total_linear_ft={total_linear_ft:.1f} gross_wall_board={gross_wall_board_sqft:.1f} "
            f"opening_deduction={opening_deduction_sqft:.1f} net_wall_board={net_wall_board_sqft:.1f} "
            f"ceiling_board={ceiling_board_sqft:.1f} area_with_waste={area_with_waste_sqft:.1f} "
            f"sheets_required={sheets_required} ready={estimate_ready} closure={room_closure_status} confidence={takeoff_confidence}"
        )
    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        if geometry_source == "annotation_document":
            raise HTTPException(status_code=500, detail=f"Failed to analyze saved annotation geometry: {exc}") from exc
        print(f"[takeoff] CV pipeline error: {exc}")
        traceback.print_exc()

    # --- Cost computation (Phases 3 & 4) ---
    line_items: list[LineItem] = []
    material_cost_usd: Optional[float] = None
    markup_usd: Optional[float] = None
    tax_usd: Optional[float] = None
    total_cost_usd: Optional[float] = None

    effective_assumptions = saved_assumptions or AssumptionsSnapshot(
        ceiling_height_ft=req.ceiling_height_ft,
        waste_factor=req.waste_factor,
        sheet_width_ft=req.sheet_width_ft,
        sheet_length_ft=req.sheet_length_ft,
    )

    drywall_unit_cost = effective_assumptions.drywall_unit_cost_usd
    pricing_catalog = {item.material_key: item for item in load_catalog()}

    if sheets_required > 0:
        drywall_item = pricing_catalog.get("drywall_board")
        unit_cost = drywall_unit_cost if drywall_unit_cost is not None else (
            drywall_item.unit_cost_usd if drywall_item else None
        )
        line_total = round(sheets_required * unit_cost, 2) if unit_cost is not None else None
        line_items.append(LineItem(
            material_key="drywall_board",
            display_name=drywall_item.display_name if drywall_item else "Drywall Board",
            quantity=float(sheets_required),
            unit="board",
            unit_cost_usd=unit_cost,
            line_total_usd=line_total,
        ))

    for mat_key, summary in flooring_by_material.items():
        catalog_item = pricing_catalog.get(mat_key)
        unit_cost = catalog_item.unit_cost_usd if catalog_item else None
        line_total = round(summary.area_sqft * unit_cost, 2) if unit_cost is not None else None
        line_items.append(LineItem(
            material_key=mat_key,
            display_name=catalog_item.display_name if catalog_item else mat_key.replace("_", " ").title(),
            quantity=summary.area_sqft,
            unit="sqft",
            unit_cost_usd=unit_cost,
            line_total_usd=line_total,
        ))

    priced_items = [item for item in line_items if item.line_total_usd is not None]
    if priced_items:
        subtotal = sum(item.line_total_usd for item in priced_items)  # type: ignore[misc]
        material_cost_usd = round(subtotal, 2)
        markup_pct = effective_assumptions.markup_pct
        tax_pct = effective_assumptions.tax_rate_pct
        if markup_pct is not None:
            markup_usd = round(subtotal * markup_pct, 2)
            taxable_base = subtotal + markup_usd
        else:
            taxable_base = subtotal
        if tax_pct is not None:
            tax_usd = round(taxable_base * tax_pct, 2)
            total_cost_usd = round(taxable_base + tax_usd, 2)
        elif markup_usd is not None:
            total_cost_usd = round(taxable_base, 2)
        else:
            total_cost_usd = material_cost_usd

    # Pricing blocker — append to backend blocked_reasons if no unit cost set.
    if effective_assumptions.drywall_unit_cost_usd is None and pricing_catalog.get("drywall_board") and pricing_catalog["drywall_board"].unit_cost_usd is None:
        blocked_reasons = list(blocked_reasons) + ["No drywall unit cost set — cost estimate unavailable."]
    # estimate_ready only reflects quantity/geometry readiness (not cost), so don't flip it here.

    source_label = "Saved annotation document" if geometry_source == "annotation_document" else "CV pipeline"
    scale_warning = "Scale missing. Floor area, wall lengths, and deductions are provisional." if floor_area_method == "missing_scale" else ""
    effective_scale_text = f"{effective_scale_px_per_ft:.3f}" if effective_scale_px_per_ft else "missing"
    analysis_lines = [
        f"Geometry source: {source_label}",
        f"Geometry revision used: {geometry_revision_used}",
        f"Geometry hash: {geometry_hash}",
        f"Estimate ready: {estimate_ready}",
        f"Blocked reasons: {'; '.join(blocked_reasons) if blocked_reasons else 'None'}",
        f"Takeoff confidence: {takeoff_confidence}",
        f"Surface classification confidence: {surface_classification_confidence}",
        f"Effective scale (px/ft): {effective_scale_text}",
        f"Scale source: {scale_source}",
        f"Scale confidence: {scale_confidence:.2f}",
        f"Geometry walls / doors / windows: {cv_walls} / {cv_doors} / {cv_windows}",
        f"Normalized walls / openings: {normalized_wall_count} / {normalized_opening_count}",
        f"Perimeter / partition / unknown linear ft: {perimeter_linear_ft:.2f} / {partition_linear_ft:.2f} / {unknown_linear_ft:.2f}",
        f"Perimeter / partition / unknown board sqft: {perimeter_board_sqft:.2f} / {partition_board_sqft:.2f} / {unknown_board_sqft:.2f}",
        f"Unmatched openings: {unmatched_opening_count}",
        f"Matched openings: {matched_opening_count}",
        f"Fallback opening deductions: {fallback_opening_count}",
        f"Opening deduction mode: {opening_deduction_mode}",
        f"Room closure status: {room_closure_status}",
        f"Unclosed boundary gaps: {unclosed_gap_count}",
        f"Largest boundary gap: {largest_boundary_gap_ft:.2f} ft",
        f"Floor area: {floor_area_sqft:.2f} sq ft",
        f"Floor area method: {floor_area_method}",
        f"Reference floor area: {reference_floor_area_sqft:.2f} sq ft",
        f"Reference variance: {reference_area_delta_sqft:.2f} sq ft ({reference_area_delta_pct:.2f}%)",
        f"Total linear feet: {total_linear_ft:.2f} ft",
        f"Gross wall board: {gross_wall_board_sqft:.2f} sq ft",
        f"Opening deductions: {opening_deduction_sqft:.2f} sq ft",
        f"Net wall board: {net_wall_board_sqft:.2f} sq ft",
        f"Ceiling board: {ceiling_board_sqft:.2f} sq ft",
        f"Board before waste: {net_board_area_sqft:.2f} sq ft",
        f"Waste ({req.waste_factor * 100:.0f}%): {waste_sqft:.2f} sq ft",
        f"Area with waste: {area_with_waste_sqft:.2f} sq ft",
        f"Sheets required: {sheets_required}",
    ]
    if scale_warning:
        analysis_lines.append(scale_warning)
    if unknown_wall_count > 0:
        analysis_lines.append(
            "Wall board is provisional because some walls are still unclassified. "
            "Unknown walls are currently counted as one-sided draft surfaces."
        )
        analysis_lines.append("Unknown wall treatment: provisional_1_side_draft")

    return TakeoffResult(
        status="ok",
        analysis=_analysis_lines(analysis_lines),
        cv_doors=cv_doors,
        cv_windows=cv_windows,
        cv_walls=cv_walls,
        total_area_sqft=round(floor_area_sqft, 2),
        floor_area_sqft=round(floor_area_sqft, 2),
        floor_area_method=floor_area_method,
        reference_floor_area_sqft=round(reference_floor_area_sqft, 2),
        reference_area_delta_sqft=round(reference_area_delta_sqft, 2),
        reference_area_delta_pct=round(reference_area_delta_pct, 2),
        ceiling_height_ft=req.ceiling_height_ft,
        net_drywall_sqft=round(net_wall_board_sqft, 2),
        total_linear_ft=round(total_linear_ft, 2),
        gross_drywall_sqft=round(gross_wall_board_sqft, 2),
        gross_wall_board_sqft=round(gross_wall_board_sqft, 2),
        opening_deduction_sqft=round(opening_deduction_sqft, 2),
        net_wall_board_sqft=round(net_wall_board_sqft, 2),
        ceiling_board_sqft=round(ceiling_board_sqft, 2),
        net_board_area_sqft=round(net_board_area_sqft, 2),
        waste_factor=req.waste_factor,
        waste_sqft=round(waste_sqft, 2),
        area_with_waste_sqft=round(area_with_waste_sqft, 2),
        sheet_width_ft=req.sheet_width_ft,
        sheet_length_ft=req.sheet_length_ft,
        sheet_size_sqft=round(sheet_size_sqft, 2),
        sheets_required=sheets_required,
        geometry_source=geometry_source,
        geometry_revision_used=geometry_revision_used,
        geometry_hash=geometry_hash,
        estimate_ready=estimate_ready,
        blocked_reasons=blocked_reasons,
        takeoff_confidence=takeoff_confidence,
        surface_classification_confidence=surface_classification_confidence,
        room_closure_status=room_closure_status,
        unclosed_gap_count=unclosed_gap_count,
        largest_boundary_gap_ft=round(largest_boundary_gap_ft, 2),
        unmatched_opening_count=unmatched_opening_count,
        matched_opening_count=matched_opening_count,
        fallback_opening_count=fallback_opening_count,
        opening_deduction_mode=opening_deduction_mode,
        sheet_count_method=sheet_count_method,
        perimeter_linear_ft=round(perimeter_linear_ft, 2),
        partition_linear_ft=round(partition_linear_ft, 2),
        unknown_linear_ft=round(unknown_linear_ft, 2),
        perimeter_board_sqft=round(perimeter_board_sqft, 2),
        partition_board_sqft=round(partition_board_sqft, 2),
        unknown_board_sqft=round(unknown_board_sqft, 2),
        unknown_wall_count=unknown_wall_count,
        normalized_wall_count=normalized_wall_count,
        normalized_opening_count=normalized_opening_count,
        effective_scale_px_per_ft=round(float(effective_scale_px_per_ft), 3) if effective_scale_px_per_ft else 0.0,
        scale_source=scale_source,
        scale_confidence=round(float(scale_confidence), 3),
        floor_area_guardrail_applied=floor_area_guardrail_applied,
        area_debug=area_debug,
        annotated_image=annotated_b64,
        assumptions_applied=AssumptionsSnapshot(
            ceiling_height_ft=req.ceiling_height_ft,
            waste_factor=req.waste_factor,
            sheet_width_ft=req.sheet_width_ft,
            sheet_length_ft=req.sheet_length_ft,
            drywall_unit_cost_usd=saved_assumptions.drywall_unit_cost_usd if saved_assumptions else None,
            markup_pct=saved_assumptions.markup_pct if saved_assumptions else None,
            tax_rate_pct=saved_assumptions.tax_rate_pct if saved_assumptions else None,
        ),
        flooring_by_material=flooring_by_material,
        line_items=line_items,
        material_cost_usd=material_cost_usd,
        markup_usd=markup_usd,
        tax_usd=tax_usd,
        total_cost_usd=total_cost_usd,
    )
