"""
Wall detection — contour → line-segment vectorisation, merging & gap detection.

Key improvements:
  • **Midline scanning** splits each contour at pixel gaps so openings
    (doors/windows) naturally break a wall into separate segments.
  • **Fill-ratio filter** drops dimension and construction lines that pass
    length/thickness checks but have sparse pixels.
  • **Group-then-merge** clusters segments by cross-axis proximity, then
    merges only sequential segments within each cluster — preventing the
    accidental bridging of parallel wall faces across door openings.

Public API
----------
extract_wall_segments(h_mask, v_mask) → list[WallSegment]
detect_gaps(segments, binary)         → list[Gap]
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from src.vision.cv.models import Orientation, WallSegment

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# At 200 DPI with 1/4"=1' scale → 1 foot ≈ 50 px.
MIN_WALL_THICKNESS_PX = 5       # drops dim lines / hatch lines
MIN_WALL_LENGTH_PX = 45         # preserve short partitions and nib walls
SHORT_WALL_STRICT_LEN_PX = 70   # apply extra guardrail for short segments
SHORT_WALL_MIN_THICKNESS_PX = 8
THIN_BRANCH_MIN_WALL_THICKNESS_PX = 3
THIN_BRANCH_MIN_WALL_LENGTH_PX = 30
THIN_BRANCH_MAX_WALL_LENGTH_PX = 120
MIN_FILL_RATIO = 0.45           # slightly relaxed for annotation-heavy plans

# Midline scanning
MIN_OPENING_GAP_PX = 25         # pixel gaps smaller than this are bridged (handles T-junctions)

# Merge tunables
MERGE_CROSS_AXIS_TOL = 24       # max cross-axis offset to cluster wall faces
MERGE_ALONG_AXIS_GAP = 35       # avoid bridging large door/window openings
MERGE_MIN_FILL_IN_GAP = 0.55    # gap must be meaningfully wall-filled to merge

# Gap detection (for opening candidates)
MIN_GAP_SIZE_PX = 25
MAX_GAP_SIZE_PX = 220
GAP_SCAN_HALF_BAND_PX = 5
GAP_SIDE_SAMPLE_PX = 12
GAP_MIN_SIDE_FILL = 0.18

# Measurement/text artifact suppression
TEXT_CC_MIN_AREA = 12
TEXT_CC_MAX_AREA = 650
TEXT_CC_MAX_W = 42
TEXT_CC_MAX_H = 42
TEXT_NEAR_DENSITY = 0.02
CONNECTIVITY_ENDPOINT_DIST_PX = 22
THIN_LONG_MIN_LEN_PX = 260
THIN_LONG_MAX_THICKNESS_PX = 7
THIN_LONG_MIN_ASPECT = 35.0
EXTREME_THIN_LONG_MIN_LEN_PX = 420
EXTREME_THIN_MAX_THICKNESS_PX = 6
COLLINEAR_SUPPORT_CROSS_TOL = 12
COLLINEAR_SUPPORT_GAP_PX = 90
STRUCTURAL_SUPPORT_DIST_PX = 20


# ---------------------------------------------------------------------------
# Internal: midline scan to split contours at openings
# ---------------------------------------------------------------------------

def _find_pixel_runs(
    strip: np.ndarray,
    min_gap: int = MIN_OPENING_GAP_PX,
) -> list[tuple[int, int]]:
    """
    Find continuous runs of non-zero pixels in a 1-D array.
    Small gaps (< ``min_gap``) are bridged as noise.
    """
    if strip.size == 0:
        return []

    is_wall = (strip > 0).astype(np.uint8)

    # Bridge small gaps
    if min_gap > 1:
        padded = np.concatenate([[0], is_wall, [0]])
        diffs = np.diff(padded)
        gap_starts = np.where(diffs == -1)[0]
        gap_ends = np.where(diffs == 1)[0]
        for gs, ge in zip(gap_starts, gap_ends):
            if (ge - gs) < min_gap:
                is_wall[gs:ge] = 1

    # Find runs
    padded = np.concatenate([[0], is_wall, [0]])
    diffs = np.diff(padded)
    starts = np.where(diffs == 1)[0]
    ends = np.where(diffs == -1)[0]

    return [(int(s), int(e)) for s, e in zip(starts, ends)]


def _contours_to_segments(
    mask: np.ndarray,
    orientation: Orientation,
    prefix: str,
    *,
    min_thickness_px: int = MIN_WALL_THICKNESS_PX,
    min_length_px: int = MIN_WALL_LENGTH_PX,
    short_wall_strict_len_px: int = SHORT_WALL_STRICT_LEN_PX,
    short_wall_min_thickness_px: int = SHORT_WALL_MIN_THICKNESS_PX,
) -> list[WallSegment]:
    """
    Find external contours on a wall mask and split each into one or more
    ``WallSegment`` objects by scanning pixels along the midline.
    """
    contours, _ = cv2.findContours(
        mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE,
    )

    segments: list[WallSegment] = []
    idx = 1
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)

        if orientation == Orientation.HORIZONTAL:
            thickness = h
        else:
            thickness = w

        if thickness < min_thickness_px:
            continue

        # Fill ratio filter
        area = cv2.contourArea(cnt)
        bbox_area = w * h
        if bbox_area > 0 and (area / bbox_area) < MIN_FILL_RATIO:
            continue

        # Midline scan — sample several rows/cols for robustness at
        # wall intersections where a perpendicular wall may break the midline.
        if orientation == Orientation.HORIZONTAL:
            mid_y = y + h // 2
            y_lo = max(0, mid_y - 2)
            y_hi = min(mask.shape[0], mid_y + 3)
            strip = np.max(mask[y_lo:y_hi, x:x + w], axis=0)

            for run_start, run_end in _find_pixel_runs(strip):
                seg_len = run_end - run_start
                if seg_len < min_length_px:
                    continue
                # Short segments are kept only when thick enough to be walls.
                if (
                    short_wall_strict_len_px > 0
                    and seg_len < short_wall_strict_len_px
                    and thickness < short_wall_min_thickness_px
                ):
                    continue
                segments.append(WallSegment(
                    id=f"{prefix}-{idx:02d}",
                    orientation=orientation,
                    start=(x + run_start, mid_y),
                    end=(x + run_end, mid_y),
                    thickness=thickness,
                    length_px=seg_len,
                ))
                idx += 1
        else:
            mid_x = x + w // 2
            x_lo = max(0, mid_x - 2)
            x_hi = min(mask.shape[1], mid_x + 3)
            strip = np.max(mask[y:y + h, x_lo:x_hi], axis=1)

            for run_start, run_end in _find_pixel_runs(strip):
                seg_len = run_end - run_start
                if seg_len < min_length_px:
                    continue
                if (
                    short_wall_strict_len_px > 0
                    and seg_len < short_wall_strict_len_px
                    and thickness < short_wall_min_thickness_px
                ):
                    continue
                segments.append(WallSegment(
                    id=f"{prefix}-{idx:02d}",
                    orientation=orientation,
                    start=(mid_x, y + run_start),
                    end=(mid_x, y + run_end),
                    thickness=thickness,
                    length_px=seg_len,
                ))
                idx += 1

    return segments


# ---------------------------------------------------------------------------
# Internal: group-then-merge
# ---------------------------------------------------------------------------

def _cross(seg: WallSegment) -> int:
    """Cross-axis position of a segment."""
    if seg.orientation == Orientation.HORIZONTAL:
        return seg.start[1]
    return seg.start[0]


def _along_range(seg: WallSegment) -> tuple[int, int]:
    """Along-axis (start, end) of a segment."""
    if seg.orientation == Orientation.HORIZONTAL:
        return (seg.start[0], seg.end[0])
    return (seg.start[1], seg.end[1])


def _point_to_segment_dist(point: tuple[int, int], seg: WallSegment) -> float:
    x1, y1 = seg.start
    x2, y2 = seg.end
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return float(np.hypot(point[0] - x1, point[1] - y1))
    t = max(0.0, min(1.0, ((point[0] - x1) * dx + (point[1] - y1) * dy) / float(dx * dx + dy * dy)))
    proj_x = x1 + (t * dx)
    proj_y = y1 + (t * dy)
    return float(np.hypot(point[0] - proj_x, point[1] - proj_y))


def _ranges_gap(a: tuple[int, int], b: tuple[int, int]) -> int:
    a0, a1 = min(a), max(a)
    b0, b1 = min(b), max(b)
    if a1 < b0:
        return b0 - a1
    if b1 < a0:
        return a0 - b1
    return 0


def _segment_inside_roi(seg: WallSegment, roi_mask: np.ndarray | None) -> bool:
    if roi_mask is None or roi_mask.size == 0:
        return True
    if seg.orientation == Orientation.HORIZONTAL:
        points = [
            seg.start,
            seg.end,
            ((seg.start[0] + seg.end[0]) // 2, seg.start[1]),
        ]
    else:
        points = [
            seg.start,
            seg.end,
            (seg.start[0], (seg.start[1] + seg.end[1]) // 2),
        ]
    inside = 0
    for px, py in points:
        if 0 <= py < roi_mask.shape[0] and 0 <= px < roi_mask.shape[1] and roi_mask[py, px] > 0:
            inside += 1
    return inside >= 2


def _collinear_support_gap(seg: WallSegment, other: WallSegment) -> int:
    if seg.orientation != other.orientation:
        return COLLINEAR_SUPPORT_GAP_PX + 1
    if abs(_cross(seg) - _cross(other)) > COLLINEAR_SUPPORT_CROSS_TOL:
        return COLLINEAR_SUPPORT_GAP_PX + 1
    return _ranges_gap(_along_range(seg), _along_range(other))


def _segments_overlap(seg: WallSegment, other: WallSegment, cross_tol: int = COLLINEAR_SUPPORT_CROSS_TOL) -> bool:
    if seg.orientation != other.orientation:
        return False
    if abs(_cross(seg) - _cross(other)) > cross_tol:
        return False
    return _ranges_gap(_along_range(seg), _along_range(other)) == 0


def _has_orthogonal_support(seg: WallSegment, reference_segments: list[WallSegment]) -> bool:
    for ref in reference_segments:
        if ref.orientation == seg.orientation:
            continue
        for endpoint in (seg.start, seg.end):
            if _point_to_segment_dist(endpoint, ref) <= STRUCTURAL_SUPPORT_DIST_PX:
                return True
    return False


def _walls_form_junction(seg: WallSegment, other: WallSegment, threshold_px: int) -> bool:
    if seg.orientation == other.orientation:
        return False
    horizontal = seg if seg.orientation == Orientation.HORIZONTAL else other
    vertical = other if horizontal is seg else seg
    hx0, hx1 = sorted((horizontal.start[0], horizontal.end[0]))
    vy0, vy1 = sorted((vertical.start[1], vertical.end[1]))
    return (
        hx0 - threshold_px <= vertical.start[0] <= hx1 + threshold_px
        and vy0 - threshold_px <= horizontal.start[1] <= vy1 + threshold_px
    )


def _has_collinear_support(seg: WallSegment, reference_segments: list[WallSegment]) -> bool:
    min_reference_length = max(MIN_WALL_LENGTH_PX, seg.length_px)
    for ref in reference_segments:
        if ref.id == seg.id:
            continue
        if ref.length_px < min_reference_length:
            continue
        gap = _collinear_support_gap(seg, ref)
        if gap <= COLLINEAR_SUPPORT_GAP_PX:
            return True
    return False


def _has_structural_support(seg: WallSegment, reference_segments: list[WallSegment]) -> bool:
    return _has_orthogonal_support(seg, reference_segments) or _has_collinear_support(seg, reference_segments)


def _merge_segments(
    segments: list[WallSegment],
    prefix: str,
    mask: np.ndarray,
) -> list[WallSegment]:
    """
    Group segments by cross-axis proximity (same wall line), then merge
    sequential segments within each group.

    This prevents merging wall faces at different cross-axis positions
    that happen to overlap along the main axis but are separated by
    a door opening.
    """
    if not segments:
        return segments

    orientation = segments[0].orientation

    # ── Step 1: cluster by cross-axis position ─────────────────────────
    # Sort by cross-axis so we can greedily group nearby segments.
    segments.sort(key=lambda s: _cross(s))

    clusters: list[list[WallSegment]] = []
    for seg in segments:
        placed = False
        for cluster in clusters:
            # Compare against the cluster's average cross-axis
            avg_cross = sum(_cross(s) for s in cluster) / len(cluster)
            if abs(_cross(seg) - avg_cross) <= MERGE_CROSS_AXIS_TOL:
                cluster.append(seg)
                placed = True
                break
        if not placed:
            clusters.append([seg])

    # ── Step 2: within each cluster, merge sequential segments ─────────
    merged: list[WallSegment] = []

    for cluster in clusters:
        # Sort by along-axis start
        cluster.sort(key=lambda s: _along_range(s)[0])

        current = cluster[0]
        for nxt in cluster[1:]:
            curr_start, curr_end = _along_range(current)
            nxt_start, nxt_end = _along_range(nxt)

            gap = nxt_start - curr_end

            # Check: are these two segments sequential (small gap)?
            if gap <= MERGE_ALONG_AXIS_GAP:
                # Verify gap has wall pixels (skip for overlapping segments)
                gap_ok = True
                if gap > 0:
                    gap_ok = _gap_has_wall_pixels(
                        mask, orientation, current, nxt, gap,
                    )

                if gap_ok:
                    # Merge into current
                    avg_cross = (_cross(current) + _cross(nxt)) // 2
                    if orientation == Orientation.HORIZONTAL:
                        new_start = (min(curr_start, nxt_start), avg_cross)
                        new_end = (max(curr_end, nxt_end), avg_cross)
                        new_length = new_end[0] - new_start[0]
                    else:
                        new_start = (avg_cross, min(curr_start, nxt_start))
                        new_end = (avg_cross, max(curr_end, nxt_end))
                        new_length = new_end[1] - new_start[1]

                    current = WallSegment(
                        id=current.id,
                        orientation=orientation,
                        start=new_start,
                        end=new_end,
                        thickness=max(current.thickness, nxt.thickness),
                        length_px=new_length,
                    )
                    continue

            # Don't merge — emit current, advance
            merged.append(current)
            current = nxt

        merged.append(current)

    # Re-sort and re-number
    if orientation == Orientation.HORIZONTAL:
        merged.sort(key=lambda s: (s.start[1], s.start[0]))
    else:
        merged.sort(key=lambda s: (s.start[0], s.start[1]))

    for i, seg in enumerate(merged, 1):
        seg.id = f"{prefix}-{i:02d}"

    return merged


def _gap_has_wall_pixels(
    mask: np.ndarray,
    orientation: Orientation,
    seg_a: WallSegment,
    seg_b: WallSegment,
    gap_size: int,
) -> bool:
    """
    Check whether the gap between two segments contains wall pixels.
    """
    if gap_size <= 0:
        return True

    if orientation == Orientation.HORIZONTAL:
        y = (seg_a.start[1] + seg_b.start[1]) // 2
        x_start = seg_a.end[0]
        x_end = seg_b.start[0]
        y_lo = max(0, y - 2)
        y_hi = min(mask.shape[0], y + 3)
        strip = np.max(mask[y_lo:y_hi, x_start:x_end], axis=0)
    else:
        x = (seg_a.start[0] + seg_b.start[0]) // 2
        y_start = seg_a.end[1]
        y_end = seg_b.start[1]
        x_lo = max(0, x - 2)
        x_hi = min(mask.shape[1], x + 3)
        strip = np.max(mask[y_start:y_end, x_lo:x_hi], axis=1)

    if strip.size == 0:
        return False

    fill = np.count_nonzero(strip) / strip.size
    return fill >= MERGE_MIN_FILL_IN_GAP


# ---------------------------------------------------------------------------
# Gap data structure
# ---------------------------------------------------------------------------

@dataclass
class Gap:
    """A detected gap (opening candidate) in a wall segment."""

    id: str
    wall_id: str
    orientation: Orientation
    center: tuple[int, int]
    width_px: int
    bbox: tuple[int, int, int, int]
    wall_break_score: float
    opening_fill_ratio: float


def _fill_ratio(roi: np.ndarray) -> float:
    if roi.size == 0:
        return 0.0
    return float(np.count_nonzero(roi)) / float(roi.size)


def _gap_has_wall_continuity(
    mask: np.ndarray,
    seg: WallSegment,
    gap_start: int,
    gap_end: int,
    band_half: int = GAP_SCAN_HALF_BAND_PX,
    sample_px: int = GAP_SIDE_SAMPLE_PX,
) -> bool:
    """Require wall pixels immediately before and after a candidate gap."""
    if seg.orientation == Orientation.HORIZONTAL:
        row = max(0, min(seg.start[1], mask.shape[0] - 1))
        lo_x, hi_x = min(seg.start[0], seg.end[0]), max(seg.start[0], seg.end[0])
        y0 = max(0, row - band_half)
        y1 = min(mask.shape[0], row + band_half + 1)
        left0 = max(lo_x, lo_x + gap_start - sample_px)
        left1 = max(lo_x, lo_x + gap_start)
        right0 = min(hi_x, lo_x + gap_end)
        right1 = min(hi_x, lo_x + gap_end + sample_px)
        left_fill = _fill_ratio(mask[y0:y1, left0:left1])
        right_fill = _fill_ratio(mask[y0:y1, right0:right1])
    else:
        col = max(0, min(seg.start[0], mask.shape[1] - 1))
        lo_y, hi_y = min(seg.start[1], seg.end[1]), max(seg.start[1], seg.end[1])
        x0 = max(0, col - band_half)
        x1 = min(mask.shape[1], col + band_half + 1)
        top0 = max(lo_y, lo_y + gap_start - sample_px)
        top1 = max(lo_y, lo_y + gap_start)
        bottom0 = min(hi_y, lo_y + gap_end)
        bottom1 = min(hi_y, lo_y + gap_end + sample_px)
        left_fill = _fill_ratio(mask[top0:top1, x0:x1])
        right_fill = _fill_ratio(mask[bottom0:bottom1, x0:x1])

    return left_fill >= GAP_MIN_SIDE_FILL and right_fill >= GAP_MIN_SIDE_FILL


def _cluster_segments_by_cross_axis(segments: list[WallSegment]) -> list[list[WallSegment]]:
    if not segments:
        return []

    ordered = sorted(segments, key=lambda s: _cross(s))
    clusters: list[list[WallSegment]] = []
    for seg in ordered:
        placed = False
        for cluster in clusters:
            avg_cross = sum(_cross(item) for item in cluster) / len(cluster)
            if abs(_cross(seg) - avg_cross) <= MERGE_CROSS_AXIS_TOL:
                cluster.append(seg)
                placed = True
                break
        if not placed:
            clusters.append([seg])
    return clusters


def _gap_band_fill(
    mask: np.ndarray,
    orientation: Orientation,
    center_cross: int,
    gap_start: int,
    gap_end: int,
    offset: int,
    band_half: int = GAP_SCAN_HALF_BAND_PX,
) -> float:
    if gap_end <= gap_start:
        return 1.0

    if orientation == Orientation.HORIZONTAL:
        row = max(0, min(mask.shape[0] - 1, center_cross + offset))
        y0 = max(0, row - band_half)
        y1 = min(mask.shape[0], row + band_half + 1)
        roi = mask[y0:y1, max(0, gap_start):min(mask.shape[1], gap_end)]
    else:
        col = max(0, min(mask.shape[1] - 1, center_cross + offset))
        x0 = max(0, col - band_half)
        x1 = min(mask.shape[1], col + band_half + 1)
        roi = mask[max(0, gap_start):min(mask.shape[0], gap_end), x0:x1]
    return _fill_ratio(roi)


def _gap_bbox(
    orientation: Orientation,
    center_cross: int,
    gap_start: int,
    gap_end: int,
    thickness: int,
) -> tuple[int, int, int, int]:
    gap_len = max(1, gap_end - gap_start)
    half = max(6, thickness // 2 + 4)
    if orientation == Orientation.HORIZONTAL:
        return (gap_start, center_cross - half, gap_len, half * 2)
    return (center_cross - half, gap_start, half * 2, gap_len)


def _verify_gap_candidate(
    mask: np.ndarray,
    orientation: Orientation,
    center_cross: int,
    gap_start: int,
    gap_end: int,
    thickness: int,
    left_fill: float,
    right_fill: float,
) -> tuple[bool, float, float]:
    offset = max(2, min(12, thickness // 3))
    fills = [
        _gap_band_fill(mask, orientation, center_cross, gap_start, gap_end, 0),
        _gap_band_fill(mask, orientation, center_cross, gap_start, gap_end, offset),
        _gap_band_fill(mask, orientation, center_cross, gap_start, gap_end, -offset),
    ]
    opening_fill = float(sum(fills) / len(fills))
    consistency = 1.0 - min(1.0, max(fills) - min(fills))
    continuity = min(left_fill, right_fill)
    openness = 1.0 - min(1.0, opening_fill / 0.28)
    score = (0.45 * openness) + (0.25 * consistency) + (0.30 * continuity)
    verified = opening_fill <= 0.28 and continuity >= GAP_MIN_SIDE_FILL and score >= 0.58
    return verified, round(score, 2), round(opening_fill, 2)


def _segment_side_fill(
    mask: np.ndarray,
    orientation: Orientation,
    center_cross: int,
    along_start: int,
    along_end: int,
    thickness: int,
) -> float:
    sample_px = max(GAP_SIDE_SAMPLE_PX, thickness)
    return 1.0 - _gap_band_fill(mask, orientation, center_cross, along_start, min(along_end, along_start + sample_px), 0)


def _detect_cluster_gaps(
    segments: list[WallSegment],
    combined_wall_mask: np.ndarray,
    next_gap_id: int,
) -> tuple[list[Gap], int, int, int, int]:
    gaps: list[Gap] = []
    raw_candidates = 0
    verified_candidates = 0
    rejected_candidates = 0

    by_orientation = {
        Orientation.HORIZONTAL: [seg for seg in segments if seg.orientation == Orientation.HORIZONTAL],
        Orientation.VERTICAL: [seg for seg in segments if seg.orientation == Orientation.VERTICAL],
    }

    for orientation, oriented_segments in by_orientation.items():
        for cluster in _cluster_segments_by_cross_axis(oriented_segments):
            cluster.sort(key=lambda seg: _along_range(seg)[0])
            for left_seg, right_seg in zip(cluster, cluster[1:]):
                left_start, left_end = _along_range(left_seg)
                right_start, right_end = _along_range(right_seg)
                gap_len = right_start - left_end
                if gap_len < MIN_GAP_SIZE_PX or gap_len > MAX_GAP_SIZE_PX:
                    continue

                raw_candidates += 1
                center_cross = int(round((_cross(left_seg) + _cross(right_seg)) / 2))
                left_fill = _segment_side_fill(
                    combined_wall_mask,
                    orientation,
                    center_cross,
                    max(left_start, left_end - GAP_SIDE_SAMPLE_PX),
                    left_end,
                    max(left_seg.thickness, right_seg.thickness),
                )
                right_fill = _segment_side_fill(
                    combined_wall_mask,
                    orientation,
                    center_cross,
                    right_start,
                    min(right_end, right_start + GAP_SIDE_SAMPLE_PX),
                    max(left_seg.thickness, right_seg.thickness),
                )
                verified, wall_break_score, opening_fill = _verify_gap_candidate(
                    combined_wall_mask,
                    orientation,
                    center_cross,
                    left_end,
                    right_start,
                    max(left_seg.thickness, right_seg.thickness),
                    left_fill,
                    right_fill,
                )
                if not verified:
                    rejected_candidates += 1
                    continue

                verified_candidates += 1
                gap_id = f"G-{next_gap_id:03d}"
                next_gap_id += 1
                if orientation == Orientation.HORIZONTAL:
                    center = (left_end + gap_len // 2, center_cross)
                else:
                    center = (center_cross, left_end + gap_len // 2)
                gaps.append(
                    Gap(
                        id=gap_id,
                        wall_id=left_seg.parent_wall_id or left_seg.id,
                        orientation=orientation,
                        center=(int(center[0]), int(center[1])),
                        width_px=int(gap_len),
                        bbox=_gap_bbox(
                            orientation,
                            center_cross,
                            left_end,
                            right_start,
                            max(left_seg.thickness, right_seg.thickness),
                        ),
                        wall_break_score=wall_break_score,
                        opening_fill_ratio=opening_fill,
                    )
                )

    return gaps, next_gap_id, raw_candidates, verified_candidates, rejected_candidates


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

def extract_wall_segments_with_debug(
    h_mask: np.ndarray,
    v_mask: np.ndarray,
    *,
    thin_h_mask: np.ndarray | None = None,
    thin_v_mask: np.ndarray | None = None,
    structural_roi: np.ndarray | None = None,
) -> tuple[list[WallSegment], dict[str, int]]:
    """
    Convert wall masks into ``WallSegment`` objects and report recovery stats.

    The primary branch preserves the existing behaviour. An optional thin-wall
    branch recovers short and narrow interior partitions, but only when they
    remain inside the structural ROI and have clear support from existing wall
    geometry.
    """
    h_raw = _contours_to_segments(h_mask, Orientation.HORIZONTAL, "H")
    v_raw = _contours_to_segments(v_mask, Orientation.VERTICAL, "V")

    h_merged = _merge_segments(h_raw, "H", h_mask)
    v_merged = _merge_segments(v_raw, "V", v_mask)
    primary_segments = h_merged + v_merged

    admitted_thin_segments: list[WallSegment] = []
    short_segments_promoted = 0

    if thin_h_mask is not None and thin_v_mask is not None:
        thin_h_raw = _contours_to_segments(
            thin_h_mask,
            Orientation.HORIZONTAL,
            "TH",
            min_thickness_px=THIN_BRANCH_MIN_WALL_THICKNESS_PX,
            min_length_px=THIN_BRANCH_MIN_WALL_LENGTH_PX,
            short_wall_strict_len_px=0,
            short_wall_min_thickness_px=THIN_BRANCH_MIN_WALL_THICKNESS_PX,
        )
        thin_v_raw = _contours_to_segments(
            thin_v_mask,
            Orientation.VERTICAL,
            "TV",
            min_thickness_px=THIN_BRANCH_MIN_WALL_THICKNESS_PX,
            min_length_px=THIN_BRANCH_MIN_WALL_LENGTH_PX,
            short_wall_strict_len_px=0,
            short_wall_min_thickness_px=THIN_BRANCH_MIN_WALL_THICKNESS_PX,
        )
        thin_h_merged = _merge_segments(thin_h_raw, "TH", thin_h_mask)
        thin_v_merged = _merge_segments(thin_v_raw, "TV", thin_v_mask)

        reference_segments = list(primary_segments)
        for candidate in sorted(thin_h_merged + thin_v_merged, key=lambda seg: (seg.length_px, seg.thickness), reverse=True):
            if candidate.length_px > THIN_BRANCH_MAX_WALL_LENGTH_PX:
                continue
            if not _segment_inside_roi(candidate, structural_roi):
                continue
            if any(_segments_overlap(candidate, existing) for existing in reference_segments):
                continue
            orthogonal_support = _has_orthogonal_support(candidate, reference_segments)
            collinear_support = _has_collinear_support(candidate, reference_segments)
            if not orthogonal_support and not (
                collinear_support and candidate.length_px < SHORT_WALL_STRICT_LEN_PX
            ):
                continue
            admitted_thin_segments.append(candidate)
            reference_segments.append(candidate)
            if candidate.length_px < MIN_WALL_LENGTH_PX or (
                candidate.length_px < SHORT_WALL_STRICT_LEN_PX
                and candidate.thickness < SHORT_WALL_MIN_THICKNESS_PX
            ):
                short_segments_promoted += 1

    combined_h_mask = h_mask if thin_h_mask is None else cv2.bitwise_or(h_mask, thin_h_mask)
    combined_v_mask = v_mask if thin_v_mask is None else cv2.bitwise_or(v_mask, thin_v_mask)

    h_all = [segment for segment in primary_segments + admitted_thin_segments if segment.orientation == Orientation.HORIZONTAL]
    v_all = [segment for segment in primary_segments + admitted_thin_segments if segment.orientation == Orientation.VERTICAL]

    final_h = _merge_segments(h_all, "H", combined_h_mask)
    final_v = _merge_segments(v_all, "V", combined_v_mask)
    return final_h + final_v, {
        "walls_from_thin_branch": len(admitted_thin_segments),
        "short_segments_promoted": short_segments_promoted,
    }


def extract_wall_segments(
    h_mask: np.ndarray,
    v_mask: np.ndarray,
    *,
    thin_h_mask: np.ndarray | None = None,
    thin_v_mask: np.ndarray | None = None,
    structural_roi: np.ndarray | None = None,
) -> list[WallSegment]:
    walls, _ = extract_wall_segments_with_debug(
        h_mask,
        v_mask,
        thin_h_mask=thin_h_mask,
        thin_v_mask=thin_v_mask,
        structural_roi=structural_roi,
    )
    return walls


def detect_gaps(
    segments: list[WallSegment],
    combined_wall_mask: np.ndarray,
) -> list[Gap]:
    gaps, _ = detect_gaps_with_debug(segments, combined_wall_mask)
    return gaps


def detect_gaps_with_debug(
    segments: list[WallSegment],
    combined_wall_mask: np.ndarray,
) -> tuple[list[Gap], dict[str, int]]:
    """
    Walk along each wall segment and identify pixel-runs of *background*
    that represent door/window openings.
    """
    gaps: list[Gap] = []
    next_gap_id = 1
    raw_candidates = 0
    verified_candidates = 0
    rejected_candidates = 0

    cluster_gaps, next_gap_id, cluster_raw, cluster_verified, cluster_rejected = _detect_cluster_gaps(
        segments,
        combined_wall_mask,
        next_gap_id,
    )
    gaps.extend(cluster_gaps)
    raw_candidates += cluster_raw
    verified_candidates += cluster_verified
    rejected_candidates += cluster_rejected

    for seg in segments:
        x1, y1 = seg.start
        x2, y2 = seg.end

        if seg.orientation == Orientation.HORIZONTAL:
            row = max(0, min(y1, combined_wall_mask.shape[0] - 1))
            lo_x, hi_x = min(x1, x2), max(x1, x2)
            y0 = max(0, row - GAP_SCAN_HALF_BAND_PX)
            y1_band = min(combined_wall_mask.shape[0], row + GAP_SCAN_HALF_BAND_PX + 1)
            strip = np.max(combined_wall_mask[y0:y1_band, lo_x:hi_x], axis=0)
        else:
            col = max(0, min(x1, combined_wall_mask.shape[1] - 1))
            lo_y, hi_y = min(y1, y2), max(y1, y2)
            x0 = max(0, col - GAP_SCAN_HALF_BAND_PX)
            x1_band = min(combined_wall_mask.shape[1], col + GAP_SCAN_HALF_BAND_PX + 1)
            strip = np.max(combined_wall_mask[lo_y:hi_y, x0:x1_band], axis=1)

        if strip.size == 0:
            continue

        is_gap = (strip == 0).astype(np.uint8)
        padded = np.concatenate([[0], is_gap, [0]])
        diffs = np.diff(padded)
        starts = np.where(diffs == 1)[0]
        ends = np.where(diffs == -1)[0]

        for gs, ge in zip(starts, ends):
            gap_len = int(ge - gs)
            if gap_len < MIN_GAP_SIZE_PX or gap_len > MAX_GAP_SIZE_PX:
                continue
            raw_candidates += 1
            if not _gap_has_wall_continuity(combined_wall_mask, seg, int(gs), int(ge)):
                rejected_candidates += 1
                continue

            mid = (gs + ge) // 2
            half = seg.thickness // 2 + 4

            if seg.orientation == Orientation.HORIZONTAL:
                left_fill = _fill_ratio(combined_wall_mask[y0:y1_band, max(lo_x, lo_x + gs - GAP_SIDE_SAMPLE_PX):lo_x + gs])
                right_fill = _fill_ratio(combined_wall_mask[y0:y1_band, lo_x + ge:min(hi_x, lo_x + ge + GAP_SIDE_SAMPLE_PX)])
                verified, wall_break_score, opening_fill = _verify_gap_candidate(
                    combined_wall_mask,
                    seg.orientation,
                    row,
                    lo_x + gs,
                    lo_x + ge,
                    seg.thickness,
                    left_fill,
                    right_fill,
                )
            else:
                left_fill = _fill_ratio(combined_wall_mask[max(lo_y, lo_y + gs - GAP_SIDE_SAMPLE_PX):lo_y + gs, x0:x1_band])
                right_fill = _fill_ratio(combined_wall_mask[lo_y + ge:min(hi_y, lo_y + ge + GAP_SIDE_SAMPLE_PX), x0:x1_band])
                verified, wall_break_score, opening_fill = _verify_gap_candidate(
                    combined_wall_mask,
                    seg.orientation,
                    col,
                    lo_y + gs,
                    lo_y + ge,
                    seg.thickness,
                    left_fill,
                    right_fill,
                )
            if not verified:
                rejected_candidates += 1
                continue
            verified_candidates += 1

            if seg.orientation == Orientation.HORIZONTAL:
                cx = lo_x + mid
                cy = row
                bbox = (lo_x + gs, cy - half, gap_len, half * 2)
            else:
                cx = col
                cy = lo_y + mid
                bbox = (cx - half, lo_y + gs, half * 2, gap_len)

            gaps.append(
                Gap(
                    id=f"G-{next_gap_id:03d}",
                    wall_id=seg.parent_wall_id or seg.id,
                    orientation=seg.orientation,
                    center=(int(cx), int(cy)),
                    width_px=gap_len,
                    bbox=(int(bbox[0]), int(bbox[1]),
                          int(bbox[2]), int(bbox[3])),
                    wall_break_score=wall_break_score,
                    opening_fill_ratio=opening_fill,
                )
            )
            next_gap_id += 1

    deduped: list[Gap] = []
    seen: set[tuple[str, int, int]] = set()
    for gap in gaps:
        key = (gap.wall_id, gap.center[0], gap.center[1])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(gap)

    return deduped, {
        "opening_candidates_raw": raw_candidates,
        "opening_candidates_verified": len(deduped),
        "opening_candidates_rejected": rejected_candidates,
    }


def _component_mask(binary: np.ndarray) -> np.ndarray:
    """Build a mask of text-like connected components for artifact scoring."""
    text_like = np.zeros_like(binary, dtype=np.uint8)
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)

    for label_idx in range(1, n_labels):
        x = int(stats[label_idx, cv2.CC_STAT_LEFT])
        y = int(stats[label_idx, cv2.CC_STAT_TOP])
        w = int(stats[label_idx, cv2.CC_STAT_WIDTH])
        h = int(stats[label_idx, cv2.CC_STAT_HEIGHT])
        area = int(stats[label_idx, cv2.CC_STAT_AREA])

        if area < TEXT_CC_MIN_AREA or area > TEXT_CC_MAX_AREA:
            continue
        if w < 2 or h < 2 or w > TEXT_CC_MAX_W or h > TEXT_CC_MAX_H:
            continue

        aspect = max(w, h) / max(1, min(w, h))
        if aspect > 8.0:
            continue

        text_like[y:y + h, x:x + w][labels[y:y + h, x:x + w] == label_idx] = 255

    if np.count_nonzero(text_like) == 0:
        return text_like

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    return cv2.dilate(text_like, kernel, iterations=1)


def _support_metrics(walls: list[WallSegment], threshold_px: int) -> list[dict[str, int]]:
    """Measure endpoint and collinear support for each wall."""
    metrics: list[dict[str, int]] = []
    for index, wall in enumerate(walls):
        endpoint_support = 0
        junction_support = 0
        collinear_support = 0

        for other_index, other in enumerate(walls):
            if index == other_index:
                continue
            if _collinear_support_gap(wall, other) <= COLLINEAR_SUPPORT_GAP_PX:
                collinear_support += 1
            for endpoint in (wall.start, wall.end):
                if _point_to_segment_dist(endpoint, other) <= float(threshold_px):
                    endpoint_support += 1
                    break
            if other.orientation != wall.orientation:
                if _walls_form_junction(wall, other, threshold_px) or (
                    _point_to_segment_dist(other.start, wall) <= float(threshold_px)
                    or _point_to_segment_dist(other.end, wall) <= float(threshold_px)
                ):
                    junction_support += 1

        metrics.append({
            "endpoint_support": endpoint_support,
            "junction_support": junction_support,
            "collinear_support": collinear_support,
        })
    return metrics


def _text_density_near_segment(mask: np.ndarray, wall: WallSegment, pad: int = 12) -> float:
    """Estimate how much text-like signal exists around a wall segment."""
    x1, y1 = wall.start
    x2, y2 = wall.end
    min_x = max(0, min(x1, x2) - pad)
    max_x = min(mask.shape[1], max(x1, x2) + pad + 1)
    min_y = max(0, min(y1, y2) - pad)
    max_y = min(mask.shape[0], max(y1, y2) + pad + 1)
    roi = mask[min_y:max_y, min_x:max_x]
    if roi.size == 0:
        return 0.0
    return float(np.count_nonzero(roi)) / float(roi.size)


def suppress_measurement_artifacts(
    walls: list[WallSegment],
    binary: np.ndarray,
) -> tuple[list[WallSegment], dict[str, int]]:
    """
    Remove likely measurement/text artifacts with a balanced scoring model.

    A wall is removed only if multiple signals agree:
      1) thin + very high aspect ratio
      2) weak structural connectivity to other walls
      3) near dense text-like connected components
    """
    walls_raw = len(walls)
    if walls_raw == 0:
        return walls, {
            "walls_raw": 0,
            "walls_after_suppression": 0,
            "walls_suppressed_as_text": 0,
        }

    text_mask = _component_mask(binary)
    connectivity = _support_metrics(walls, CONNECTIVITY_ENDPOINT_DIST_PX)

    filtered: list[WallSegment] = []
    walls_suppressed_as_text = 0
    for idx, wall in enumerate(walls):
        length = max(1, int(wall.length_px))
        thickness = max(1, int(wall.thickness))
        aspect = float(length) / float(thickness)

        thin_and_long = (
            thickness <= THIN_LONG_MAX_THICKNESS_PX
            and length >= THIN_LONG_MIN_LEN_PX
            and aspect >= THIN_LONG_MIN_ASPECT
        )
        endpoint_support = int(connectivity[idx]["endpoint_support"])
        junction_support = int(connectivity[idx]["junction_support"])
        collinear_support = int(connectivity[idx]["collinear_support"])
        structurally_supported = endpoint_support > 0 or junction_support > 0 or collinear_support > 0
        weakly_connected = not structurally_supported

        text_density = _text_density_near_segment(text_mask, wall)
        near_text = text_density >= TEXT_NEAR_DENSITY and length >= 120

        score = 0
        if thin_and_long:
            score += 1
        if weakly_connected:
            score += 1
        if near_text and not structurally_supported:
            score += 1

        extreme_ruler = (
            thickness <= EXTREME_THIN_MAX_THICKNESS_PX
            and length >= EXTREME_THIN_LONG_MIN_LEN_PX
            and not structurally_supported
            and (weakly_connected or near_text)
        )

        if score >= 2 or extreme_ruler:
            if near_text:
                walls_suppressed_as_text += 1
            continue

        filtered.append(wall)

    return filtered, {
        "walls_raw": walls_raw,
        "walls_after_suppression": len(filtered),
        "walls_suppressed_as_text": walls_suppressed_as_text,
    }
