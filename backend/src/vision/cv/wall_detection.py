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
from typing import Optional

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
MIN_FILL_RATIO = 0.45           # slightly relaxed for annotation-heavy plans

# Midline scanning
MIN_OPENING_GAP_PX = 25         # pixel gaps smaller than this are bridged (handles T-junctions)

# Merge tunables
MERGE_CROSS_AXIS_TOL = 24       # max cross-axis offset to cluster wall faces
MERGE_ALONG_AXIS_GAP = 35       # avoid bridging large door/window openings
MERGE_MIN_FILL_IN_GAP = 0.55    # gap must be meaningfully wall-filled to merge

# Gap detection (for opening candidates)
MIN_GAP_SIZE_PX = 25
MAX_GAP_SIZE_PX = 400


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

        if thickness < MIN_WALL_THICKNESS_PX:
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
                if seg_len < MIN_WALL_LENGTH_PX:
                    continue
                # Short segments are kept only when thick enough to be walls.
                if seg_len < SHORT_WALL_STRICT_LEN_PX and thickness < SHORT_WALL_MIN_THICKNESS_PX:
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
                if seg_len < MIN_WALL_LENGTH_PX:
                    continue
                if seg_len < SHORT_WALL_STRICT_LEN_PX and thickness < SHORT_WALL_MIN_THICKNESS_PX:
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

    wall_id: str
    orientation: Orientation
    center: tuple[int, int]
    width_px: int
    bbox: tuple[int, int, int, int]


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

def extract_wall_segments(
    h_mask: np.ndarray,
    v_mask: np.ndarray,
) -> list[WallSegment]:
    """
    Convert horizontal and vertical wall masks into ``WallSegment`` objects.

    Pipeline: contour extraction → thickness + fill filter → midline scan
    (split at openings) → group-then-merge (verify gap pixels).
    """
    h_raw = _contours_to_segments(h_mask, Orientation.HORIZONTAL, "H")
    v_raw = _contours_to_segments(v_mask, Orientation.VERTICAL, "V")

    h_merged = _merge_segments(h_raw, "H", h_mask)
    v_merged = _merge_segments(v_raw, "V", v_mask)

    return h_merged + v_merged


def detect_gaps(
    segments: list[WallSegment],
    combined_wall_mask: np.ndarray,
) -> list[Gap]:
    """
    Walk along each wall segment and identify pixel-runs of *background*
    that represent door/window openings.
    """
    gaps: list[Gap] = []

    for seg in segments:
        x1, y1 = seg.start
        x2, y2 = seg.end

        if seg.orientation == Orientation.HORIZONTAL:
            row = max(0, min(y1, combined_wall_mask.shape[0] - 1))
            lo_x, hi_x = min(x1, x2), max(x1, x2)
            strip = combined_wall_mask[row, lo_x:hi_x]
        else:
            col = max(0, min(x1, combined_wall_mask.shape[1] - 1))
            lo_y, hi_y = min(y1, y2), max(y1, y2)
            strip = combined_wall_mask[lo_y:hi_y, col]

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

            mid = (gs + ge) // 2
            half = seg.thickness // 2 + 4

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
                    wall_id=seg.id,
                    orientation=seg.orientation,
                    center=(int(cx), int(cy)),
                    width_px=gap_len,
                    bbox=(int(bbox[0]), int(bbox[1]),
                          int(bbox[2]), int(bbox[3])),
                )
            )

    return gaps
