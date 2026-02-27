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
from src.vision.cv.wall_detection import (
    Gap,
    detect_gaps,
    extract_wall_segments,
    suppress_measurement_artifacts,
)

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------
DOUBLE_DOOR_RADIUS_PX = 50      # max distance between paired door tags
GAP_TAG_MATCH_RADIUS_PX = 200   # max distance to correlate a gap with a tag
                                 # (tags are often offset from the gap via leader lines)
TAG_WALL_SPLIT_DIST_PX = 80     # max perpendicular distance from tag to wall to split
TAG_FORCE_SPLIT_DIST_PX = 18    # allow split without a gap only when tag is very near centerline
TAG_TO_GAP_MAX_DIST_PX = 140    # tag must align with a detected wall gap to be split
TAG_SPLIT_HALF_WIDTH_PX = 45    # half-width of the gap inserted at each tag
VISUAL_THICKNESS_SEARCH_PX = 30 # perpendicular search radius for visual thickness
MAX_VISUAL_THICKNESS_PX = 45    # absolute cap — ~13" at 200 DPI
ENDPOINT_MARGIN_MIN_PX = 40     # min along-axis margin from endpoints when sampling
ENDPOINT_MARGIN_FRAC = 0.15     # fraction of wall length to skip at each end


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _euclidean(a: tuple[int, int], b: tuple[int, int]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _measure_visual_thickness(
    walls: list[WallSegment],
    h_mask: np.ndarray,
    v_mask: np.ndarray,
    search_radius: int = VISUAL_THICKNESS_SEARCH_PX,
) -> None:
    """
    For each wall, scan the **orientation-matched** morphological mask
    perpendicular to the wall at multiple interior points and set
    ``visual_thickness`` to the median extent (first wall pixel → last
    wall pixel).

    Key improvements over the previous combined-mask approach:
      • Uses ``h_mask`` for H walls and ``v_mask`` for V walls so that
        perpendicular walls at T-/L-junctions do NOT contaminate the scan.
      • Skips samples near endpoints (where perpendicular walls connect)
        to further reduce junction artifacts.
      • Caps the result at ``MAX_VISUAL_THICKNESS_PX`` and at
        ``4 × morphological thickness`` as a sanity bound.
    """
    img_h, img_w = h_mask.shape[:2]

    for wall in walls:
        # Use the mask that matches this wall's orientation.
        # h_mask only contains horizontal features (perpendicular V walls
        # are removed by the H morphological opening), and vice versa.
        mask = h_mask if wall.orientation == Orientation.HORIZONTAL else v_mask

        widths: list[int] = []

        if wall.orientation == Orientation.HORIZONTAL:
            y_mid = wall.start[1]
            x_lo, x_hi = wall.start[0], wall.end[0]
            seg_len = x_hi - x_lo

            # Margin: skip samples near endpoints to avoid junction noise
            margin = max(ENDPOINT_MARGIN_MIN_PX, int(seg_len * ENDPOINT_MARGIN_FRAC))
            samp_lo = x_lo + margin
            samp_hi = x_hi - margin
            if samp_lo >= samp_hi:
                # Wall too short — single sample at centre
                samp_lo = (x_lo + x_hi) // 2
                samp_hi = samp_lo + 1

            num = min(15, max(3, (samp_hi - samp_lo) // 40))
            step = max(1, (samp_hi - samp_lo) // (num + 1))

            for i in range(1, num + 1):
                x = samp_lo + i * step
                if x >= samp_hi:
                    break
                y0 = max(0, y_mid - search_radius)
                y1 = min(img_h, y_mid + search_radius + 1)
                col = mask[y0:y1, x]
                nz = np.nonzero(col)[0]
                if len(nz) >= 2:
                    widths.append(int(nz[-1] - nz[0]) + 1)
        else:
            x_mid = wall.start[0]
            y_lo, y_hi = wall.start[1], wall.end[1]
            seg_len = y_hi - y_lo

            margin = max(ENDPOINT_MARGIN_MIN_PX, int(seg_len * ENDPOINT_MARGIN_FRAC))
            samp_lo = y_lo + margin
            samp_hi = y_hi - margin
            if samp_lo >= samp_hi:
                samp_lo = (y_lo + y_hi) // 2
                samp_hi = samp_lo + 1

            num = min(15, max(3, (samp_hi - samp_lo) // 40))
            step = max(1, (samp_hi - samp_lo) // (num + 1))

            for i in range(1, num + 1):
                y = samp_lo + i * step
                if y >= samp_hi:
                    break
                x0 = max(0, x_mid - search_radius)
                x1 = min(img_w, x_mid + search_radius + 1)
                row = mask[y, x0:x1]
                nz = np.nonzero(row)[0]
                if len(nz) >= 2:
                    widths.append(int(nz[-1] - nz[0]) + 1)

        if widths:
            widths.sort()
            median_w = widths[len(widths) // 2]
            # Double cap: absolute max + relative to morphological thickness
            cap = min(MAX_VISUAL_THICKNESS_PX, wall.thickness * 4)
            wall.visual_thickness = min(median_w, cap)
        else:
            wall.visual_thickness = wall.thickness


def _point_to_segment_dist(px: int, py: int, seg: WallSegment) -> float:
    """Perpendicular distance from a point to a wall segment."""
    x1, y1 = seg.start
    x2, y2 = seg.end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def _split_walls_at_tags(
    walls: list[WallSegment],
    tags: list[TagAnchor],
    gaps: list[Gap],
) -> list[WallSegment]:
    """
    Post-processing: for each door/window tag near a wall, split that
    wall segment at the tag position, inserting a gap.

    This guarantees that walls don't visually cross door/window openings,
    even if the morphological mask didn't produce clean breaks.
    """
    result: list[WallSegment] = []

    for wall in walls:
        # Collect tags that are close to this wall
        nearby_tags: list[TagAnchor] = []
        for tag in tags:
            dist = _point_to_segment_dist(tag.center[0], tag.center[1], wall)
            has_near_gap = any(
                g.wall_id == wall.id and _euclidean(g.center, tag.center) <= TAG_TO_GAP_MAX_DIST_PX
                for g in gaps
            )
            should_split = dist <= TAG_WALL_SPLIT_DIST_PX and (
                has_near_gap or dist <= TAG_FORCE_SPLIT_DIST_PX
            )
            if should_split:
                # Also check the tag is within the wall's along-axis range
                if wall.orientation == Orientation.HORIZONTAL:
                    lo = min(wall.start[0], wall.end[0])
                    hi = max(wall.start[0], wall.end[0])
                    if lo + TAG_SPLIT_HALF_WIDTH_PX < tag.center[0] < hi - TAG_SPLIT_HALF_WIDTH_PX:
                        nearby_tags.append(tag)
                else:
                    lo = min(wall.start[1], wall.end[1])
                    hi = max(wall.start[1], wall.end[1])
                    if lo + TAG_SPLIT_HALF_WIDTH_PX < tag.center[1] < hi - TAG_SPLIT_HALF_WIDTH_PX:
                        nearby_tags.append(tag)

        if not nearby_tags:
            result.append(wall)
            continue

        # Sort tags by along-axis position
        if wall.orientation == Orientation.HORIZONTAL:
            nearby_tags.sort(key=lambda t: t.center[0])
        else:
            nearby_tags.sort(key=lambda t: t.center[1])

        # Split the wall at each tag position
        segments_to_split = [wall]
        for tag in nearby_tags:
            new_segments: list[WallSegment] = []
            for seg in segments_to_split:
                split = _split_one_wall(seg, tag)
                new_segments.extend(split)
            segments_to_split = new_segments

        result.extend(segments_to_split)

    # Re-number
    h_idx = v_idx = 1
    for seg in result:
        if seg.orientation == Orientation.HORIZONTAL:
            seg.id = f"H-{h_idx:02d}"
            h_idx += 1
        else:
            seg.id = f"V-{v_idx:02d}"
            v_idx += 1

    return result


def _split_one_wall(
    wall: WallSegment,
    tag: TagAnchor,
) -> list[WallSegment]:
    """Split a single wall segment at a tag position, returning 1 or 2 pieces."""
    half = TAG_SPLIT_HALF_WIDTH_PX

    if wall.orientation == Orientation.HORIZONTAL:
        tag_pos = tag.center[0]
        lo = wall.start[0]
        hi = wall.end[0]
        y = wall.start[1]

        left_end = tag_pos - half
        right_start = tag_pos + half

        pieces: list[WallSegment] = []
        if left_end - lo >= MIN_PIECE_LENGTH:
            pieces.append(WallSegment(
                id=wall.id,
                orientation=wall.orientation,
                start=(lo, y),
                end=(left_end, y),
                thickness=wall.thickness,
                length_px=left_end - lo,
            ))
        if hi - right_start >= MIN_PIECE_LENGTH:
            pieces.append(WallSegment(
                id=wall.id,
                orientation=wall.orientation,
                start=(right_start, y),
                end=(hi, y),
                thickness=wall.thickness,
                length_px=hi - right_start,
            ))
        return pieces if pieces else [wall]
    else:
        tag_pos = tag.center[1]
        lo = wall.start[1]
        hi = wall.end[1]
        x = wall.start[0]

        top_end = tag_pos - half
        bottom_start = tag_pos + half

        pieces = []
        if top_end - lo >= MIN_PIECE_LENGTH:
            pieces.append(WallSegment(
                id=wall.id,
                orientation=wall.orientation,
                start=(x, lo),
                end=(x, top_end),
                thickness=wall.thickness,
                length_px=top_end - lo,
            ))
        if hi - bottom_start >= MIN_PIECE_LENGTH:
            pieces.append(WallSegment(
                id=wall.id,
                orientation=wall.orientation,
                start=(x, bottom_start),
                end=(x, hi),
                thickness=wall.thickness,
                length_px=hi - bottom_start,
            ))
        return pieces if pieces else [wall]


# Minimum length for a wall piece after splitting (avoid tiny stubs)
# Reduced from 50 → 30 to preserve short wall segments at corners
# and between closely-spaced openings.
MIN_PIECE_LENGTH = 30


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
    page_number: int = 0,
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
    bgr = load_image(file_bytes, mime_type, dpi=dpi, page_number=page_number)
    bgr = crop_drawing_area(bgr, crop_left, crop_top, crop_right, crop_bottom)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    binary = binarise(gray)
    h_mask, v_mask = isolate_walls(binary, h_kernel_len=h_kernel, v_kernel_len=v_kernel)

    # ── 2. Vectorise walls ─────────────────────────────────────────────
    walls = extract_wall_segments(h_mask, v_mask)
    walls, suppression_debug = suppress_measurement_artifacts(walls, binary)
    combined_wall_mask = cv2.bitwise_or(h_mask, v_mask)

    # ── 3. Detect gaps (opening candidates) ────────────────────────────
    gaps = detect_gaps(walls, combined_wall_mask)

    # ── 4. Detect tags (circles → doors, hexagons → windows) ──────────
    #       Tags are filtered to only those near a detected wall segment.
    tags = detect_tags(gray, binary, combined_wall_mask, walls)

    # ── 4b. Split walls at tag positions ───────────────────────────────
    #        Guarantees walls don't visually cross door/window openings.
    walls = _split_walls_at_tags(walls, tags, gaps)

    # ── 4c. Measure visual thickness (both faces) ────────────────────
    #        Uses orientation-matched masks (h_mask for H walls,
    #        v_mask for V walls) to prevent perpendicular contamination.
    _measure_visual_thickness(walls, h_mask, v_mask)

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
        walls_raw=suppression_debug["walls_raw"],
        walls_after_suppression=suppression_debug["walls_after_suppression"],
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
