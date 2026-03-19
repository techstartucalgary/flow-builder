"""
Pipeline orchestrator — wires preprocessing → wall detection → tag detection
into a single ``run()`` call that returns a ``CVTakeoffResult``.

Public API
----------
run(file_bytes, mime_type, **opts) → CVTakeoffResult
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Optional

import cv2
import numpy as np

from src.vision.cv.opening_classification import classify_verified_opening
from src.vision.cv.opening_detection import recover_candidates_from_tags
from src.vision.cv.opening_validation import opening_fits_host_wall
from src.vision.cv.models import (
    CVTakeoffResult,
    CropMetadata,
    DebugInfo,
    Opening,
    Orientation,
    PlanMetadata,
    TagAnchor,
    TagClass,
    WallSegment,
)
from src.vision.cv.preprocessing import (
    binarise,
    build_structural_roi,
    crop_drawing_area,
    isolate_walls,
    load_image,
)
from src.vision.cv.tag_detection import calibrate_symbols_from_legend, detect_tags
from src.vision.cv.wall_detection import (
    Gap,
    detect_gaps_with_debug,
    extract_wall_segments_with_debug,
    suppress_measurement_artifacts,
)

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------
DOUBLE_DOOR_RADIUS_PX = 50      # max distance between paired door tags
TAG_WALL_SPLIT_DIST_PX = 80     # max perpendicular distance from tag to wall to split
TAG_FORCE_SPLIT_DIST_PX = 18    # allow split without a gap only when tag is very near centerline
TAG_TO_GAP_MAX_DIST_PX = 140    # tag must align with a detected wall gap to be split
TAG_SPLIT_HALF_WIDTH_PX = 45    # half-width of the gap inserted at each tag
VISUAL_THICKNESS_SEARCH_PX = 30 # perpendicular search radius for visual thickness
MAX_VISUAL_THICKNESS_PX = 45    # absolute cap — ~13" at 200 DPI
ENDPOINT_MARGIN_MIN_PX = 40     # min along-axis margin from endpoints when sampling
ENDPOINT_MARGIN_FRAC = 0.15     # fraction of wall length to skip at each end
HOST_WALL_DIST_DOOR_PX = 120
HOST_WALL_DIST_WINDOW_PX = 180
GAP_ONLY_WALL_BREAK_MIN_SCORE = 0.60
GAP_ONLY_OPENING_PIXELS_MIN_SCORE = 0.58
GAP_ONLY_CLASSIFICATION_MIN_SCORE = 0.50


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


def _project_point_to_segment(px: int, py: int, seg: WallSegment) -> tuple[float, float, float]:
    """Return projected point and clamped segment parameter t."""
    x1, y1 = seg.start
    x2, y2 = seg.end
    dx, dy = x2 - x1, y2 - y1
    denom = dx * dx + dy * dy
    if denom == 0:
        return float(x1), float(y1), 0.0
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / denom))
    return (x1 + t * dx, y1 + t * dy, t)


def _wall_threshold(tag_class: TagClass) -> int:
    return HOST_WALL_DIST_DOOR_PX if tag_class == TagClass.DOOR else HOST_WALL_DIST_WINDOW_PX


def _axis_value(point: tuple[int, int] | tuple[float, float], orientation: Orientation) -> float:
    return point[0] if orientation == Orientation.HORIZONTAL else point[1]


def _assign_host_wall_for_point(
    tag_class: TagClass,
    center: tuple[int, int],
    walls: list[WallSegment],
) -> tuple[Optional[WallSegment], Optional[tuple[int, int]], float]:
    """Assign the nearest plausible host wall and projected point."""
    best_wall: Optional[WallSegment] = None
    best_projection: Optional[tuple[int, int]] = None
    best_score = float("inf")
    best_dist = float("inf")

    for wall in walls:
        proj_x, proj_y, t = _project_point_to_segment(center[0], center[1], wall)
        dist = math.hypot(center[0] - proj_x, center[1] - proj_y)
        endpoint_penalty = 14.0 if t <= 0.04 or t >= 0.96 else 0.0
        score = dist + endpoint_penalty
        if score < best_score:
            best_score = score
            best_dist = dist
            best_wall = wall
            best_projection = (int(round(proj_x)), int(round(proj_y)))

    if best_wall is None or best_projection is None:
        return None, None, float("inf")
    if best_dist > _wall_threshold(tag_class):
        return None, None, best_dist
    return best_wall, best_projection, best_dist


def _find_host_wall_for_gap(gap: Gap, walls: list[WallSegment]) -> Optional[WallSegment]:
    by_id = {wall.id: wall for wall in walls}
    if gap.wall_id in by_id:
        return by_id[gap.wall_id]

    best_wall: Optional[WallSegment] = None
    best_dist = float("inf")
    for wall in walls:
        if wall.orientation != gap.orientation:
            continue
        dist = _point_to_segment_dist(gap.center[0], gap.center[1], wall)
        if dist < best_dist:
            best_dist = dist
            best_wall = wall
    return best_wall


def _rects_overlap(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw and ax + aw > bx and ay < by + bh and ay + ah > by and ay + ah > by


def _has_opening_overlap(openings: list[Opening], wall_id: str, bbox: tuple[int, int, int, int]) -> bool:
    for opening in openings:
        if opening.wall_id != wall_id:
            continue
        if _rects_overlap(opening.bbox, bbox):
            return True
    return False


def _opening_geometry_for_wall(
    wall: WallSegment,
    *,
    center: tuple[int, int],
    bbox: tuple[int, int, int, int],
    axis_span_px: Optional[float] = None,
) -> dict[str, float | tuple[float, float]]:
    span = float(axis_span_px if axis_span_px is not None else (bbox[2] if wall.orientation == Orientation.HORIZONTAL else bbox[3]))
    normal = float(bbox[3] if wall.orientation == Orientation.HORIZONTAL else bbox[2])
    rotation = 0.0 if wall.orientation == Orientation.HORIZONTAL else 90.0
    return {
        "projected_center": (float(center[0]), float(center[1])),
        "axis_span_px": span,
        "normal_span_px": normal,
        "rotation_deg": rotation,
    }


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


def _correlate_verified_openings(
    gaps: list[Gap],
    tags: list[TagAnchor],
    walls: list[WallSegment],
    binary: np.ndarray,
    wall_mask: np.ndarray,
) -> tuple[list[Opening], dict[str, int]]:
    """
    Emit openings only from verified wall gaps.

    Tags are used for classification only after a real opening candidate
    already exists.
    """
    openings: list[Opening] = []
    matched_tag_ids: set[str] = set()
    door_openings_emitted = 0
    window_openings_emitted = 0
    candidate_rejected = 0
    opening_candidates_verified = 0
    door_candidates_symbol_recovered = 0
    window_candidates_frame_recovered = 0
    door_candidates_rejected_after_symbol_check = 0
    window_candidates_rejected_after_frame_check = 0
    solid_wall_projection_rejections = 0
    openings_rejected_host_fit = 0
    openings_rejected_endpoint_projection = 0
    walls_by_id = {wall.id: wall for wall in walls}

    next_opening_index = 1

    for gap in gaps:
        host_wall = _find_host_wall_for_gap(gap, walls)
        if host_wall is None:
            candidate_rejected += 1
            continue

        opening_candidates_verified += 1
        classification = classify_verified_opening(
            binary=binary,
            wall=host_wall,
            gap=gap,
            tags=tags,
        )
        opening_pixels_score = float(classification["opening_pixels_score"])
        classification_score = float(classification["classification_score"])
        tag_class_value = classification["tag_class"]
        if (
            gap.wall_break_score < GAP_ONLY_WALL_BREAK_MIN_SCORE
            or opening_pixels_score < GAP_ONLY_OPENING_PIXELS_MIN_SCORE
            or classification_score < GAP_ONLY_CLASSIFICATION_MIN_SCORE
            or tag_class_value is None
        ):
            candidate_rejected += 1
            continue
        if not opening_fits_host_wall(host_wall.orientation, host_wall.start, host_wall.end, gap.bbox):
            candidate_rejected += 1
            openings_rejected_host_fit += 1
            continue

        tag_class = TagClass(tag_class_value)
        tag_ids = list(classification["tag_ids"])
        matched_tag_ids.update(tag_ids)
        is_double = tag_class == TagClass.DOOR and len(tag_ids) >= 2
        supporting_tags = [tag for tag in tags if tag.id in tag_ids]
        source = (
            "gap_verified_tag_classified"
            if tag_ids
            else ("opening_feature_verified" if classification_score >= 0.68 else "gap_verified")
        )
        confidence = round(
            min(
                0.95,
                max(
                    0.55,
                    (0.36 * gap.wall_break_score)
                    + (0.34 * opening_pixels_score)
                    + (0.30 * classification_score),
                ),
            ),
            2,
        )
        openings.append(
            Opening(
                id=f"OP-{next_opening_index:02d}",
                tag_class=tag_class,
                bbox=(int(gap.bbox[0]), int(gap.bbox[1]), int(gap.bbox[2]), int(gap.bbox[3])),
                center=(int(gap.center[0]), int(gap.center[1])),
                wall_id=host_wall.id,
                tag_ids=tag_ids,
                is_double_door=is_double,
                source=source,
                confidence=confidence,
                verification={
                    "opening_pixels_score": round(opening_pixels_score, 2),
                    "wall_break_score": round(gap.wall_break_score, 2),
                    "classification_score": round(classification_score, 2),
                    "door_feature_score": classification["door_feature_score"],
                    "window_feature_score": classification["window_feature_score"],
                    "tag_alignment_score": classification["tag_alignment_score"],
                    "verification_mode": "gap_only",
                    "host_gap_id": gap.id,
                },
                host_score=round(min(1.0, max(0.0, 1.0 - (_point_to_segment_dist(gap.center[0], gap.center[1], host_wall) / max(1.0, float(_wall_threshold(tag_class)))))), 2),
                symbol_source=(
                    "legend_calibrated"
                    if any(tag.symbol_source == "legend_calibrated" for tag in supporting_tags)
                    else ("generic" if tag_ids else "none")
                ),
                legend_symbol_id=next((tag.legend_symbol_id for tag in supporting_tags if tag.legend_symbol_id), None),
                **_opening_geometry_for_wall(
                    host_wall,
                    center=(int(gap.center[0]), int(gap.center[1])),
                    bbox=(int(gap.bbox[0]), int(gap.bbox[1]), int(gap.bbox[2]), int(gap.bbox[3])),
                    axis_span_px=float(gap.width_px),
                ),
            )
        )
        next_opening_index += 1
        if tag_class == TagClass.DOOR:
            door_openings_emitted += 1
        else:
            window_openings_emitted += 1

    recovered_candidates, recovery_debug = recover_candidates_from_tags(
        tags=tags,
        matched_tag_ids=matched_tag_ids,
        walls=walls,
        binary=binary,
        wall_mask=wall_mask,
        host_wall_dist_door_px=HOST_WALL_DIST_DOOR_PX,
        host_wall_dist_window_px=HOST_WALL_DIST_WINDOW_PX,
    )
    recovery_candidates_raw = len(recovered_candidates)
    solid_wall_projection_rejections += recovery_debug["solid_wall_projection_rejections"]
    door_candidates_rejected_after_symbol_check += recovery_debug["door_candidates_rejected_after_symbol_check"]
    window_candidates_rejected_after_frame_check += recovery_debug["window_candidates_rejected_after_frame_check"]
    openings_rejected_host_fit += recovery_debug["openings_rejected_host_fit"]
    openings_rejected_endpoint_projection += recovery_debug["openings_rejected_endpoint_projection"]

    for candidate in recovered_candidates:
        if not candidate.verified or candidate.tag_class is None:
            candidate_rejected += 1
            continue
        candidate_wall = walls_by_id.get(candidate.wall_id)
        if candidate_wall is None:
            candidate_rejected += 1
            continue
        if _has_opening_overlap(openings, candidate.wall_id, candidate.bbox):
            if candidate.tag_class == TagClass.DOOR:
                door_candidates_rejected_after_symbol_check += 1
            else:
                window_candidates_rejected_after_frame_check += 1
            continue
        opening_candidates_verified += 1
        matched_tag_ids.update(candidate.tag_ids)
        openings.append(
            Opening(
                id=f"OP-{next_opening_index:02d}",
                tag_class=candidate.tag_class,
                bbox=(
                    int(candidate.bbox[0]),
                    int(candidate.bbox[1]),
                    int(candidate.bbox[2]),
                    int(candidate.bbox[3]),
                ),
                center=(int(candidate.center[0]), int(candidate.center[1])),
                wall_id=candidate.wall_id,
                tag_ids=list(candidate.tag_ids),
                is_double_door=candidate.tag_class == TagClass.DOOR and len(candidate.tag_ids) >= 2,
                source=(
                    "fused"
                    if candidate.opening_pixels_score >= 0.36 and candidate.wall_break_score >= 0.22
                    else "symbol_projected"
                ),
                confidence=round(candidate.confidence, 2),
                verification={
                    "opening_pixels_score": candidate.opening_pixels_score,
                    "wall_break_score": candidate.wall_break_score,
                    "classification_score": round(candidate.confidence, 2),
                    "door_feature_score": candidate.door_feature_score,
                    "window_feature_score": candidate.window_feature_score,
                    "tag_alignment_score": candidate.tag_alignment_score,
                    "verification_mode": candidate.verification_mode,
                    "host_gap_id": candidate.host_gap_id,
                },
                host_score=candidate.host_score,
                symbol_source=candidate.symbol_source if candidate.symbol_source in {"generic", "legend_calibrated"} else "generic",
                legend_symbol_id=candidate.legend_symbol_id,
                **_opening_geometry_for_wall(
                    candidate_wall,
                    center=(int(candidate.center[0]), int(candidate.center[1])),
                    bbox=(
                        int(candidate.bbox[0]),
                        int(candidate.bbox[1]),
                        int(candidate.bbox[2]),
                        int(candidate.bbox[3]),
                    ),
                    axis_span_px=float(candidate.width_px),
                ),
            )
        )
        next_opening_index += 1
        if candidate.tag_class == TagClass.DOOR:
            door_openings_emitted += 1
            door_candidates_symbol_recovered += 1
        else:
            window_openings_emitted += 1
            window_candidates_frame_recovered += 1

    unmatched_tags = [tag for tag in tags if tag.id not in matched_tag_ids]
    solid_wall_projection_rejections += sum(
        1 for tag in unmatched_tags
        if any(_point_to_segment_dist(tag.center[0], tag.center[1], wall) <= _wall_threshold(tag.tag_class) for wall in walls)
    )

    return openings, {
        "tags_total": len(tags),
        "tags_hosted": len(matched_tag_ids),
        "tags_unhosted": len(unmatched_tags),
        "openings_gap_matched": len(openings),
        "openings_tag_projected": 0,
        "gaps_considered": len(gaps),
        "gaps_matched": len(openings),
        "openings_hidden_recommended": 0,
        "opening_candidates_verified": opening_candidates_verified,
        "opening_candidates_rejected": candidate_rejected,
        "recovery_candidates_raw": recovery_candidates_raw,
        "door_openings_emitted": door_openings_emitted,
        "window_openings_emitted": window_openings_emitted,
        "door_candidates_symbol_recovered": door_candidates_symbol_recovered,
        "window_candidates_frame_recovered": window_candidates_frame_recovered,
        "door_candidates_rejected_after_symbol_check": door_candidates_rejected_after_symbol_check,
        "window_candidates_rejected_after_frame_check": window_candidates_rejected_after_frame_check,
        "tags_unmatched_to_verified_openings": len(unmatched_tags),
        "solid_wall_projection_rejections": solid_wall_projection_rejections,
        "openings_rejected_host_fit": openings_rejected_host_fit,
        "openings_rejected_endpoint_projection": openings_rejected_endpoint_projection,
    }


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
    crop_left: float = 0.0,
    crop_top: float = 0.0,
    crop_right: float = 1.0,
    crop_bottom: float = 1.0,
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
    full_bgr = load_image(file_bytes, mime_type, dpi=dpi, page_number=page_number)
    full_gray = cv2.cvtColor(full_bgr, cv2.COLOR_BGR2GRAY)
    full_binary = binarise(full_gray)
    symbol_calibration = calibrate_symbols_from_legend(full_gray, full_binary)

    bgr = crop_drawing_area(full_bgr, crop_left, crop_top, crop_right, crop_bottom)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    binary = binarise(gray)
    structural_roi = build_structural_roi(binary)
    plan_region_area_px = int(np.count_nonzero(structural_roi))

    h_mask, v_mask = isolate_walls(binary, h_kernel_len=h_kernel, v_kernel_len=v_kernel)
    thin_h_mask, thin_v_mask = isolate_walls(
        binary,
        h_kernel_len=max(16, h_kernel // 2),
        v_kernel_len=max(16, v_kernel // 2),
    )
    h_mask = cv2.bitwise_and(h_mask, structural_roi)
    v_mask = cv2.bitwise_and(v_mask, structural_roi)
    thin_h_mask = cv2.bitwise_and(thin_h_mask, structural_roi)
    thin_v_mask = cv2.bitwise_and(thin_v_mask, structural_roi)

    # ── 2. Vectorise walls ─────────────────────────────────────────────
    walls, extraction_debug = extract_wall_segments_with_debug(
        h_mask,
        v_mask,
        thin_h_mask=thin_h_mask,
        thin_v_mask=thin_v_mask,
        structural_roi=structural_roi,
    )
    suppression_input = cv2.bitwise_and(binary, structural_roi)
    walls, suppression_debug = suppress_measurement_artifacts(walls, suppression_input)
    combined_h_mask = cv2.bitwise_or(h_mask, thin_h_mask)
    combined_v_mask = cv2.bitwise_or(v_mask, thin_v_mask)
    combined_wall_mask = cv2.bitwise_or(combined_h_mask, combined_v_mask)

    # ── 3. Detect gaps (opening candidates) ────────────────────────────
    gaps, gap_debug = detect_gaps_with_debug(walls, combined_wall_mask)

    # ── 4. Detect tags (circles → doors, hexagons → windows) ──────────
    #       Tags are filtered to only those near a detected wall segment.
    tags, tag_debug = detect_tags(
        gray,
        binary,
        combined_wall_mask,
        walls,
        symbol_calibration=symbol_calibration,
        structural_roi=structural_roi,
    )

    # ── 4b. Measure visual thickness (both faces) ────────────────────
    #        Uses orientation-matched masks (h_mask for H walls,
    #        v_mask for V walls) to prevent perpendicular contamination.
    _measure_visual_thickness(walls, combined_h_mask, combined_v_mask)

    # ── 5. Double-door pair grouping ───────────────────────────────────
    double_pairs = _mark_double_doors(tags)

    # ── 6. Correlate gaps with tags → openings ─────────────────────────
    openings, opening_debug = _correlate_verified_openings(gaps, tags, walls, binary, combined_wall_mask)

    # ── 7. Apply scale conversion (if provided) ───────────────────────
    if scale_px_per_ft is not None:
        _apply_scale(walls, openings, scale_px_per_ft)

    # ── 8. Build metadata ──────────────────────────────────────────────
    img_h, img_w = gray.shape[:2]
    coordinate_space_id = _coordinate_space_id(
        page_number=page_number,
        dpi=dpi,
        crop_left=crop_left,
        crop_top=crop_top,
        crop_right=crop_right,
        crop_bottom=crop_bottom,
        image_width=img_w,
        image_height=img_h,
    )
    metadata = PlanMetadata(
        sheet=sheet,
        floor_level=floor_level,
        address=address,
        image_width=img_w,
        image_height=img_h,
        scale_px_per_ft=scale_px_per_ft,
        coordinate_space_id=coordinate_space_id,
        crop=CropMetadata(
            left=crop_left,
            top=crop_top,
            right=crop_right,
            bottom=crop_bottom,
            dpi=dpi,
            page_number=page_number,
        ),
    )

    h_count = sum(1 for w in walls if w.orientation == Orientation.HORIZONTAL)
    v_count = sum(1 for w in walls if w.orientation == Orientation.VERTICAL)

    debug = DebugInfo(
        horizontal_walls=h_count,
        vertical_walls=v_count,
        total_wall_segments=len(walls),
        walls_raw=suppression_debug["walls_raw"],
        walls_after_suppression=suppression_debug["walls_after_suppression"],
        plan_region_area_px=plan_region_area_px,
        walls_from_thin_branch=extraction_debug["walls_from_thin_branch"],
        short_segments_promoted=extraction_debug["short_segments_promoted"],
        walls_suppressed_as_text=suppression_debug["walls_suppressed_as_text"],
        door_tags_raw=tag_debug["door_tags_raw"],
        door_tags_after_dedupe=tag_debug["door_tags_after_dedupe"],
        door_tags=sum(1 for t in tags if t.tag_class == TagClass.DOOR),
        window_tags_raw=tag_debug["window_tags_raw"],
        window_tags_after_dedupe=tag_debug["window_tags_after_dedupe"],
        window_tags=sum(1 for t in tags if t.tag_class == TagClass.WINDOW),
        double_door_pairs=double_pairs,
        openings=len(openings),
        gaps_detected=len(gaps),
        tags_total=opening_debug["tags_total"],
        tags_hosted=opening_debug["tags_hosted"],
        tags_unhosted=opening_debug["tags_unhosted"],
        openings_gap_matched=opening_debug["openings_gap_matched"],
        openings_tag_projected=opening_debug["openings_tag_projected"],
        gaps_considered=opening_debug["gaps_considered"],
        gaps_matched=opening_debug["gaps_matched"],
        openings_hidden_recommended=opening_debug["openings_hidden_recommended"],
        opening_candidates_raw=gap_debug["opening_candidates_raw"] + opening_debug["recovery_candidates_raw"],
        opening_candidates_verified=opening_debug["opening_candidates_verified"],
        opening_candidates_rejected=gap_debug["opening_candidates_rejected"] + opening_debug["opening_candidates_rejected"],
        door_openings_emitted=opening_debug["door_openings_emitted"],
        window_openings_emitted=opening_debug["window_openings_emitted"],
        door_candidates_symbol_recovered=opening_debug["door_candidates_symbol_recovered"],
        window_candidates_frame_recovered=opening_debug["window_candidates_frame_recovered"],
        door_candidates_rejected_after_symbol_check=opening_debug["door_candidates_rejected_after_symbol_check"],
        window_candidates_rejected_after_frame_check=opening_debug["window_candidates_rejected_after_frame_check"],
        tags_unmatched_to_verified_openings=opening_debug["tags_unmatched_to_verified_openings"],
        solid_wall_projection_rejections=opening_debug["solid_wall_projection_rejections"],
        openings_rejected_host_fit=opening_debug["openings_rejected_host_fit"],
        openings_rejected_endpoint_projection=opening_debug["openings_rejected_endpoint_projection"],
    )

    return CVTakeoffResult(
        walls=walls,
        openings=openings,
        tags=tags,
        metadata=metadata,
        debug=debug,
    )
