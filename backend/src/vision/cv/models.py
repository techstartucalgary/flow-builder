"""
Pydantic models for the CV pipeline output.

These are the *primitives* that the frontend renders as SVG/Canvas
elements the user can drag or resize to correct the takeoff.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ── enums ──────────────────────────────────────────────────────────────

class Orientation(str, Enum):
    HORIZONTAL = "H"
    VERTICAL = "V"


class TagClass(str, Enum):
    DOOR = "door"
    WINDOW = "window"


# ── primitives ─────────────────────────────────────────────────────────

class WallSegment(BaseModel):
    """A single wall line expressed in pixel coordinates."""

    id: str = Field(description="Unique segment ID, e.g. H-01 or V-12")
    orientation: Orientation
    start: tuple[int, int] = Field(description="(x, y) start point in px")
    end: tuple[int, int] = Field(description="(x, y) end point in px")
    thickness: int = Field(description="Morphological face thickness in px")
    visual_thickness: int = Field(
        default=0,
        description="Full visual wall width (both faces) in px — used for annotation",
    )
    length_px: int = Field(description="Pixel length of this segment")
    length_ft: Optional[float] = Field(
        default=None,
        description="Length in feet (populated when scale is known)",
    )
    parent_wall_id: Optional[str] = Field(
        default=None,
        description="Optional lineage pointer when this segment was split from a parent wall.",
    )
    split_origin: Optional[Literal["detected_gap", "manual_split", "tag_split_legacy"]] = Field(
        default=None,
        description="Why this segment was split from its parent wall, if applicable.",
    )


class TagAnchor(BaseModel):
    """A detected tag symbol (circle → door, hexagon → window)."""

    id: str = Field(description="Unique tag ID, e.g. D-01 or W-03")
    tag_class: TagClass
    center: tuple[int, int] = Field(description="(x, y) centre in px")
    radius: int = Field(description="Approximate radius in px")
    confidence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Heuristic confidence score for this tag classification.",
    )
    is_double: bool = Field(
        default=False,
        description="True if this tag is part of a double-door pair",
    )
    pair_id: Optional[str] = Field(
        default=None,
        description="ID of the paired tag when is_double=True",
    )
    symbol_source: Literal["generic", "legend_calibrated"] = Field(
        default="generic",
        description="Whether this tag was detected with generic heuristics or legend-informed calibration.",
    )
    legend_symbol_id: Optional[str] = Field(
        default=None,
        description="Optional symbol identifier from a detected legend / schedule.",
    )


class Opening(BaseModel):
    """
    A door or window opening — a gap in a wall correlated with a tag.
    Expressed as a bounding box the frontend can render and resize.
    """

    id: str = Field(description="Unique opening ID, e.g. OP-01")
    tag_class: TagClass
    bbox: tuple[int, int, int, int] = Field(
        description="(x, y, width, height) bounding box in px",
    )
    center: tuple[int, int]
    wall_id: Optional[str] = Field(
        default=None,
        description="ID of the parent wall this opening sits in",
    )
    tag_ids: list[str] = Field(
        default_factory=list,
        description="Tag(s) that anchor this opening",
    )
    is_double_door: bool = False
    source: Literal["gap_verified", "gap_verified_tag_classified", "opening_feature_verified", "symbol_projected", "fused"] = Field(
        default="gap_verified",
        description="How this opening was verified/classified.",
    )
    confidence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Heuristic confidence score for this opening.",
    )
    verification: dict[str, float | str | None] = Field(
        default_factory=dict,
        description="Verification and classification details for this opening.",
    )
    projected_center: Optional[tuple[float, float]] = Field(
        default=None,
        description="Opening center projected onto the host wall centerline.",
    )
    axis_span_px: Optional[float] = Field(
        default=None,
        description="Opening span measured along the host wall axis in px.",
    )
    normal_span_px: Optional[float] = Field(
        default=None,
        description="Opening depth measured across wall thickness in px.",
    )
    rotation_deg: Optional[float] = Field(
        default=None,
        description="Host-wall-aligned rotation for rendering the opening overlay.",
    )
    host_score: Optional[float] = Field(
        default=None,
        description="Heuristic score for the selected host wall assignment.",
    )
    symbol_source: Literal["none", "generic", "legend_calibrated"] = Field(
        default="none",
        description="Provenance for the symbol evidence that supported this opening.",
    )
    legend_symbol_id: Optional[str] = Field(
        default=None,
        description="Optional legend symbol identifier associated with this opening.",
    )
    width_ft: Optional[float] = None
    height_ft: Optional[float] = None


# ── metadata ───────────────────────────────────────────────────────────

class CropMetadata(BaseModel):
    left: float = 0.0
    top: float = 0.0
    right: float = 1.0
    bottom: float = 1.0
    dpi: int = 200
    page_number: int = 0

class PlanMetadata(BaseModel):
    sheet: Optional[str] = None
    floor_level: Optional[str] = None
    address: Optional[str] = None
    image_width: int = 0
    image_height: int = 0
    scale_px_per_ft: Optional[float] = Field(
        default=None,
        description="Pixels-per-foot ratio derived from the plan scale",
    )
    coordinate_space_id: str = Field(
        default="",
        description="Deterministic identifier for the image coordinate frame.",
    )
    crop: CropMetadata = Field(default_factory=CropMetadata)


class DebugInfo(BaseModel):
    """Counts and diagnostics returned alongside the extraction."""

    horizontal_walls: int = 0
    vertical_walls: int = 0
    total_wall_segments: int = 0
    walls_raw: int = 0
    walls_after_suppression: int = 0
    plan_region_area_px: int = 0
    walls_from_thin_branch: int = 0
    short_segments_promoted: int = 0
    walls_suppressed_as_text: int = 0
    door_tags: int = 0
    window_tags: int = 0
    door_tags_raw: int = 0
    door_tags_after_dedupe: int = 0
    window_tags_raw: int = 0
    window_tags_after_dedupe: int = 0
    double_door_pairs: int = 0
    openings: int = 0
    gaps_detected: int = 0
    tags_total: int = 0
    tags_hosted: int = 0
    tags_unhosted: int = 0
    openings_gap_matched: int = 0
    openings_tag_projected: int = 0
    gaps_considered: int = 0
    gaps_matched: int = 0
    openings_hidden_recommended: int = 0
    opening_candidates_raw: int = 0
    opening_candidates_verified: int = 0
    opening_candidates_rejected: int = 0
    door_openings_emitted: int = 0
    window_openings_emitted: int = 0
    door_candidates_symbol_recovered: int = 0
    window_candidates_frame_recovered: int = 0
    door_candidates_rejected_after_symbol_check: int = 0
    window_candidates_rejected_after_frame_check: int = 0
    tags_unmatched_to_verified_openings: int = 0
    solid_wall_projection_rejections: int = 0
    openings_rejected_host_fit: int = 0
    openings_rejected_endpoint_projection: int = 0


# ── top-level response ─────────────────────────────────────────────────

class CVTakeoffResult(BaseModel):
    """
    The full JSON payload returned by the CV pipeline.

    walls      – vectorised wall line segments
    openings   – bounding boxes centred on detected tags
    tags       – raw tag anchor positions
    metadata   – sheet / scale / image info
    debug      – counts for validation
    """

    walls: list[WallSegment] = Field(default_factory=list)
    openings: list[Opening] = Field(default_factory=list)
    tags: list[TagAnchor] = Field(default_factory=list)
    metadata: PlanMetadata = Field(default_factory=PlanMetadata)
    debug: DebugInfo = Field(default_factory=DebugInfo)
    preview_image: Optional[str] = Field(
        default=None,
        description="Optional base64-encoded PNG of the analyzed (cropped) page for frontend overlays.",
    )
