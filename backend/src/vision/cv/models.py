"""
Pydantic models for the CV pipeline output.

These are the *primitives* that the frontend renders as SVG/Canvas
elements the user can drag or resize to correct the takeoff.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

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


class TagAnchor(BaseModel):
    """A detected tag symbol (circle → door, hexagon → window)."""

    id: str = Field(description="Unique tag ID, e.g. D-01 or W-03")
    tag_class: TagClass
    center: tuple[int, int] = Field(description="(x, y) centre in px")
    radius: int = Field(description="Approximate radius in px")
    is_double: bool = Field(
        default=False,
        description="True if this tag is part of a double-door pair",
    )
    pair_id: Optional[str] = Field(
        default=None,
        description="ID of the paired tag when is_double=True",
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
    width_ft: Optional[float] = None
    height_ft: Optional[float] = None


# ── metadata ───────────────────────────────────────────────────────────

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


class DebugInfo(BaseModel):
    """Counts and diagnostics returned alongside the extraction."""

    horizontal_walls: int = 0
    vertical_walls: int = 0
    total_wall_segments: int = 0
    door_tags: int = 0
    window_tags: int = 0
    double_door_pairs: int = 0
    openings: int = 0
    gaps_detected: int = 0


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
