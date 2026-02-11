"""
Wall detection — contour → line-segment vectorisation, merging & gap detection.

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
# Wall lines render at ~5-7 px stroke weight; dimension lines at ~1-3 px.
MIN_WALL_THICKNESS_PX = 5       # ← KEY filter — drops dim lines / hatch lines
MIN_WALL_LENGTH_PX = 200        # ~4 ft — filters short stubs & dimension runs
MERGE_CROSS_AXIS_TOL = 35       # max cross-axis offset to merge two segments
MERGE_ALONG_AXIS_GAP = 80       # max gap between endpoints to merge collinearly
MIN_GAP_SIZE_PX = 25            # minimum gap to qualify as an opening
MAX_GAP_SIZE_PX = 400           # ignore absurdly large gaps (room-wide)


# ---------------------------------------------------------------------------
# Internal: contour → raw segments
# ---------------------------------------------------------------------------

def _contours_to_segments(
    mask: np.ndarray,
    orientation: Orientation,
    prefix: str,
) -> list[WallSegment]:
    """
    Find external contours on a wall mask and convert each bounding
    rectangle into a ``WallSegment``, filtering by both length AND thickness.
    """
    contours, _ = cv2.findContours(
        mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE,
    )

    segments: list[WallSegment] = []
    idx = 1
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)

        if orientation == Orientation.HORIZONTAL:
            length = w
            thickness = h
            start = (x, y + h // 2)
            end = (x + w, y + h // 2)
        else:
            length = h
            thickness = w
            start = (x + w // 2, y)
            end = (x + w // 2, y + h)

        # ---- FILTER: length AND thickness ----
        if length < MIN_WALL_LENGTH_PX:
            continue
        if thickness < MIN_WALL_THICKNESS_PX:
            continue

        seg_id = f"{prefix}-{idx:02d}"
        segments.append(
            WallSegment(
                id=seg_id,
                orientation=orientation,
                start=start,
                end=end,
                thickness=thickness,
                length_px=length,
                length_ft=None,
            )
        )
        idx += 1

    return segments


# ---------------------------------------------------------------------------
# Internal: merge nearby collinear segments into single walls
# ---------------------------------------------------------------------------

def _merge_segments(
    segments: list[WallSegment],
    prefix: str,
) -> list[WallSegment]:
    """
    Merge wall segments that are:
      • same orientation
      • within ``MERGE_CROSS_AXIS_TOL`` on the cross-axis (parallel / overlapping)
      • overlapping or within ``MERGE_ALONG_AXIS_GAP`` along the main axis

    This collapses inner/outer wall edges and broken fragments into
    single wall primitives.
    """
    if not segments:
        return segments

    orientation = segments[0].orientation

    # Sort by cross-axis, then along-axis
    if orientation == Orientation.HORIZONTAL:
        # cross = y, along = x
        segments.sort(key=lambda s: (s.start[1], s.start[0]))
    else:
        # cross = x, along = y
        segments.sort(key=lambda s: (s.start[0], s.start[1]))

    merged: list[WallSegment] = []
    current = segments[0]

    for nxt in segments[1:]:
        if orientation == Orientation.HORIZONTAL:
            cross_curr = current.start[1]
            cross_next = nxt.start[1]
            along_curr_end = current.end[0]
            along_next_start = nxt.start[0]
        else:
            cross_curr = current.start[0]
            cross_next = nxt.start[0]
            along_curr_end = current.end[1]
            along_next_start = nxt.start[1]

        same_line = abs(cross_curr - cross_next) <= MERGE_CROSS_AXIS_TOL
        close_enough = (along_next_start - along_curr_end) <= MERGE_ALONG_AXIS_GAP

        if same_line and close_enough:
            # Merge: extend current to cover both
            if orientation == Orientation.HORIZONTAL:
                new_y = (current.start[1] + nxt.start[1]) // 2
                new_start = (min(current.start[0], nxt.start[0]), new_y)
                new_end = (max(current.end[0], nxt.end[0]), new_y)
                new_length = new_end[0] - new_start[0]
            else:
                new_x = (current.start[0] + nxt.start[0]) // 2
                new_start = (new_x, min(current.start[1], nxt.start[1]))
                new_end = (new_x, max(current.end[1], nxt.end[1]))
                new_length = new_end[1] - new_start[1]

            current = WallSegment(
                id=current.id,
                orientation=orientation,
                start=new_start,
                end=new_end,
                thickness=max(current.thickness, nxt.thickness),
                length_px=new_length,
                length_ft=None,
            )
        else:
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


# ---------------------------------------------------------------------------
# Gap data structure
# ---------------------------------------------------------------------------

@dataclass
class Gap:
    """A detected gap (opening candidate) in a wall segment."""

    wall_id: str
    orientation: Orientation
    center: tuple[int, int]
    width_px: int                   # gap span along the wall
    bbox: tuple[int, int, int, int]  # x, y, w, h


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

def extract_wall_segments(
    h_mask: np.ndarray,
    v_mask: np.ndarray,
) -> list[WallSegment]:
    """
    Convert horizontal and vertical wall masks into ``WallSegment`` objects.

    Pipeline: contour extraction → thickness + length filter → merge nearby.
    """
    h_raw = _contours_to_segments(h_mask, Orientation.HORIZONTAL, "H")
    v_raw = _contours_to_segments(v_mask, Orientation.VERTICAL, "V")

    h_merged = _merge_segments(h_raw, "H")
    v_merged = _merge_segments(v_raw, "V")

    return h_merged + v_merged


def detect_gaps(
    segments: list[WallSegment],
    combined_wall_mask: np.ndarray,
) -> list[Gap]:
    """
    Walk along each wall segment and identify pixel-runs of *background*
    that represent door/window openings.

    We scan a thin strip along the segment's centreline; contiguous
    stretches of zeros (no wall) that exceed ``MIN_GAP_SIZE_PX`` are
    recorded as Gap objects.
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

        # Find runs of zeros (gap pixels)
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
