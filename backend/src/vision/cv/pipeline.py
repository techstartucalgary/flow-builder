"""
Pipeline orchestrator — wires preprocessing → wall detection → tag detection
into a single ``run()`` call that returns a ``CVTakeoffResult``.

Public API
----------
run(file_bytes, mime_type, **opts) → CVTakeoffResult
"""

from __future__ import annotations

import math
from typing import Optional

import cv2
import numpy as np

from src.vision.cv.models import (
    CVTakeoffResult,
    DebugInfo,
    Opening,
    Orientation,
    PlanMetadata,
    TagAnchor,
    TagClass,
    WallSegment,
)
from src.vision.cv.preprocessing import binarise, crop_drawing_area, isolate_walls, load_image
from src.vision.cv.tag_detection import detect_tags
from src.vision.cv.wall_detection import Gap, detect_gaps, extract_wall_segments

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------
DOUBLE_DOOR_RADIUS_PX = 50      # max distance between paired door tags
GAP_TAG_MATCH_RADIUS_PX = 200   # max distance to correlate a gap with a tag
                                 # (tags are often offset from the gap via leader lines)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _euclidean(a: tuple[int, int], b: tuple[int, int]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _mark_double_doors(tags: list[TagAnchor]) -> int:
    """
    If two circle (door) tags are within ``DOUBLE_DOOR_RADIUS_PX`` of
    each other, flag them as a double-door pair.

    Returns the number of pairs detected.
    """
    door_tags = [t for t in tags if t.tag_class == TagClass.DOOR]
    used: set[str] = set()
    pairs = 0

    for i, a in enumerate(door_tags):
        if a.id in used:
            continue
        for b in door_tags[i + 1 :]:
            if b.id in used:
                continue
            if _euclidean(a.center, b.center) <= DOUBLE_DOOR_RADIUS_PX:
                a.is_double = True
                a.pair_id = b.id
                b.is_double = True
                b.pair_id = a.id
                used.update({a.id, b.id})
                pairs += 1
                break

    return pairs


def _correlate_gaps_and_tags(
    gaps: list[Gap],
    tags: list[TagAnchor],
    walls: list[WallSegment],
) -> list[Opening]:
    """
    Match each gap to the nearest tag within ``GAP_TAG_MATCH_RADIUS_PX``.
    If no tag is nearby the gap is still emitted (the frontend can review).
    """
    openings: list[Opening] = []
    tag_claimed: set[str] = set()
    idx = 1

    for gap in gaps:
        best_tag: Optional[TagAnchor] = None
        best_dist = float("inf")

        for tag in tags:
            if tag.id in tag_claimed:
                continue
            d = _euclidean(gap.center, tag.center)
            if d < best_dist:
                best_dist = d
                best_tag = tag

        tag_ids: list[str] = []
        tag_class = TagClass.DOOR  # default
        is_double = False

        if best_tag is not None and best_dist <= GAP_TAG_MATCH_RADIUS_PX:
            tag_ids.append(best_tag.id)
            tag_class = best_tag.tag_class
            tag_claimed.add(best_tag.id)

            # If it's a double-door, claim the pair too
            if best_tag.is_double and best_tag.pair_id:
                tag_ids.append(best_tag.pair_id)
                tag_claimed.add(best_tag.pair_id)
                is_double = True

        openings.append(
            Opening(
                id=f"OP-{idx:02d}",
                tag_class=tag_class,
                bbox=gap.bbox,
                center=gap.center,
                wall_id=gap.wall_id,
                tag_ids=tag_ids,
                is_double_door=is_double,
            )
        )
        idx += 1

    return openings


def _apply_scale(
    walls: list[WallSegment],
    openings: list[Opening],
    scale_px_per_ft: float,
) -> None:
    """Populate ``length_ft`` / ``width_ft`` / ``height_ft`` fields."""
    for w in walls:
        w.length_ft = round(w.length_px / scale_px_per_ft, 2)
    for op in openings:
        bw, bh = op.bbox[2], op.bbox[3]
        op.width_ft = round(bw / scale_px_per_ft, 2)
        op.height_ft = round(bh / scale_px_per_ft, 2)


# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------

def run(
    file_bytes: bytes,
    mime_type: str,
    *,
    dpi: int = 200,
    h_kernel: int = 50,
    v_kernel: int = 50,
    crop_left: float = 0.02,
    crop_top: float = 0.05,
    crop_right: float = 0.72,
    crop_bottom: float = 0.95,
    scale_px_per_ft: Optional[float] = None,
    sheet: Optional[str] = None,
    floor_level: Optional[str] = None,
    address: Optional[str] = None,
) -> CVTakeoffResult:
    """
    Execute the full deterministic CV pipeline.

    Parameters
    ----------
    file_bytes : Raw bytes of the floor plan (PDF or image).
    mime_type  : MIME type (``application/pdf``, ``image/png``, …).
    dpi        : Render DPI for PDFs (default 200).
    h_kernel   : Horizontal morphological kernel length (px).
    v_kernel   : Vertical morphological kernel length (px).
    crop_left, crop_top, crop_right, crop_bottom :
        Fractional crop boundaries to isolate the drawing area and
        exclude the title block / legend column.  Set all to 0.0 / 1.0
        to disable cropping.
    scale_px_per_ft : Optional pixels-per-foot scale factor.
                      When provided, all lengths are converted to feet.
    sheet, floor_level, address : Optional metadata overrides.

    Returns
    -------
    CVTakeoffResult — ready for JSON serialisation to the frontend.
    """

    # ── 1. Load & preprocess ───────────────────────────────────────────
    bgr = load_image(file_bytes, mime_type, dpi=dpi)
    bgr = crop_drawing_area(bgr, crop_left, crop_top, crop_right, crop_bottom)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    binary = binarise(gray)
    h_mask, v_mask = isolate_walls(binary, h_kernel_len=h_kernel, v_kernel_len=v_kernel)

    # ── 2. Vectorise walls ─────────────────────────────────────────────
    walls = extract_wall_segments(h_mask, v_mask)
    combined_wall_mask = cv2.bitwise_or(h_mask, v_mask)

    # ── 3. Detect gaps (opening candidates) ────────────────────────────
    gaps = detect_gaps(walls, combined_wall_mask)

    # ── 4. Detect tags (circles → doors, hexagons → windows) ──────────
    #       Tags are filtered to only those near a detected wall segment.
    tags = detect_tags(gray, binary, combined_wall_mask, walls)

    # ── 5. Double-door pair grouping ───────────────────────────────────
    double_pairs = _mark_double_doors(tags)

    # ── 6. Correlate gaps with tags → openings ─────────────────────────
    openings = _correlate_gaps_and_tags(gaps, tags, walls)

    # ── 7. Apply scale conversion (if provided) ───────────────────────
    if scale_px_per_ft is not None:
        _apply_scale(walls, openings, scale_px_per_ft)

    # ── 8. Build metadata ──────────────────────────────────────────────
    img_h, img_w = gray.shape[:2]
    metadata = PlanMetadata(
        sheet=sheet,
        floor_level=floor_level,
        address=address,
        image_width=img_w,
        image_height=img_h,
        scale_px_per_ft=scale_px_per_ft,
    )

    h_count = sum(1 for w in walls if w.orientation == Orientation.HORIZONTAL)
    v_count = sum(1 for w in walls if w.orientation == Orientation.VERTICAL)

    debug = DebugInfo(
        horizontal_walls=h_count,
        vertical_walls=v_count,
        total_wall_segments=len(walls),
        door_tags=sum(1 for t in tags if t.tag_class == TagClass.DOOR),
        window_tags=sum(1 for t in tags if t.tag_class == TagClass.WINDOW),
        double_door_pairs=double_pairs,
        openings=len(openings),
        gaps_detected=len(gaps),
    )

    return CVTakeoffResult(
        walls=walls,
        openings=openings,
        tags=tags,
        metadata=metadata,
        debug=debug,
    )
