"""
Tag detection — Hough circles (door tags) & flat-top hexagon detection (window tags).

Door tags  = circles  (○)  → detected via Hough Circle Transform on the
             residual (wall-subtracted) image.
Window tags = flat-top hexagons (⬡) → detected on the ORIGINAL binary image
             using contour approximation.  The legend calibration shows they
             are ~50 px wide, aspect ~1.3, area ~1400-1800, with 6-7 vertices.

Public API
----------
detect_tags(gray, binary, wall_mask, walls) → list[TagAnchor]
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from src.vision.cv.models import TagAnchor, TagClass, WallSegment

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# ---- circle (door tag) detection ----
HOUGH_DP = 1.2
HOUGH_MIN_DIST = 30
HOUGH_PARAM1 = 60
HOUGH_PARAM2 = 42
MIN_CIRCLE_RADIUS = 12
MAX_CIRCLE_RADIUS = 30

# ---- flat-top hexagon (window tag) detection ----
# Calibrated from the drawing's own legend hexagon symbols.
MIN_HEX_AREA = 1200          # px²  (legend examples are ~1950; on-plan ~1400-1800)
MAX_HEX_AREA = 2500          # px²
HEX_ASPECT_LO = 1.05         # must be wider than tall (flat-top hexagon)
HEX_ASPECT_HI = 1.60
HEX_DEDUP_DIST = 20          # merge inner/outer contour pairs within this distance

# ---- proximity filters ----
MAX_DIST_TO_WALL_DOOR_PX = 150
MAX_DIST_TO_WALL_WINDOW_PX = 500


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _subtract_walls(binary: np.ndarray, wall_mask: np.ndarray) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(wall_mask, kernel, iterations=2)
    return cv2.subtract(binary, dilated)


def _point_to_segment_dist(px: int, py: int, seg: WallSegment) -> float:
    x1, y1 = seg.start
    x2, y2 = seg.end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def _near_any_wall(cx: int, cy: int, walls: list[WallSegment], threshold: int) -> bool:
    return any(_point_to_segment_dist(cx, cy, w) <= threshold for w in walls)


# ---------------------------------------------------------------------------
# Circle (door) detector
# ---------------------------------------------------------------------------

def _detect_circles(
    residual: np.ndarray,
    walls: list[WallSegment],
) -> list[TagAnchor]:
    """Hough Circle Transform → door tags, filtered by wall proximity."""
    circles = cv2.HoughCircles(
        residual,
        cv2.HOUGH_GRADIENT,
        dp=HOUGH_DP,
        minDist=HOUGH_MIN_DIST,
        param1=HOUGH_PARAM1,
        param2=HOUGH_PARAM2,
        minRadius=MIN_CIRCLE_RADIUS,
        maxRadius=MAX_CIRCLE_RADIUS,
    )

    tags: list[TagAnchor] = []
    if circles is None:
        return tags

    idx = 1
    for cx, cy, r in np.round(circles[0]).astype(int):
        if not _near_any_wall(int(cx), int(cy), walls, MAX_DIST_TO_WALL_DOOR_PX):
            continue
        tags.append(
            TagAnchor(
                id=f"D-{idx:02d}",
                tag_class=TagClass.DOOR,
                center=(int(cx), int(cy)),
                radius=int(r),
            )
        )
        idx += 1
    return tags


# ---------------------------------------------------------------------------
# Flat-top hexagon (window) detector
# ---------------------------------------------------------------------------

def _detect_hexagons(
    binary: np.ndarray,
    walls: list[WallSegment],
) -> list[TagAnchor]:
    """
    Detect flat-top hexagonal window tags on the ORIGINAL binary image.

    Uses RETR_LIST to find both inner and outer contours of each hexagon,
    then deduplicates.  The search criteria are calibrated from the
    drawing's own legend symbols.
    """
    contours, _ = cv2.findContours(
        binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE,
    )

    raw_centres: list[tuple[int, int, int]] = []  # (cx, cy, radius)

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < MIN_HEX_AREA or area > MAX_HEX_AREA:
            continue

        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        if h == 0 or w < 15:
            continue

        aspect = w / h
        if not (HEX_ASPECT_LO <= aspect <= HEX_ASPECT_HI):
            continue

        # Try a tight epsilon to get exactly 6-7 vertices
        found = False
        for eps_frac in (0.01, 0.015, 0.02, 0.025, 0.03):
            approx = cv2.approxPolyDP(cnt, eps_frac * perimeter, True)
            if len(approx) in (6, 7):
                found = True
                break

        if not found:
            continue

        # Wall proximity
        cx = x + w // 2
        cy = y + h // 2
        if not _near_any_wall(cx, cy, walls, MAX_DIST_TO_WALL_WINDOW_PX):
            continue

        (_, _), r = cv2.minEnclosingCircle(cnt)
        raw_centres.append((cx, cy, int(r)))

    # ---- Deduplicate inner / outer contour pairs ----
    # RETR_LIST finds both inner and outer contour of the same hexagon.
    # Keep only one per unique location.
    deduped: list[tuple[int, int, int]] = []
    for cx, cy, r in raw_centres:
        if all(
            math.hypot(cx - dx, cy - dy) > HEX_DEDUP_DIST
            for dx, dy, _ in deduped
        ):
            deduped.append((cx, cy, r))

    tags: list[TagAnchor] = []
    for idx, (cx, cy, r) in enumerate(deduped, 1):
        tags.append(
            TagAnchor(
                id=f"W-{idx:02d}",
                tag_class=TagClass.WINDOW,
                center=(cx, cy),
                radius=r,
            )
        )

    return tags


# ---------------------------------------------------------------------------
# Dedup circles vs hexagons
# ---------------------------------------------------------------------------

def _deduplicate_tags(
    door_tags: list[TagAnchor],
    window_tags: list[TagAnchor],
    overlap_px: int = 30,
) -> tuple[list[TagAnchor], list[TagAnchor]]:
    """If a circle and hexagon overlap, keep only the window tag."""
    window_centres = {(t.center[0], t.center[1]) for t in window_tags}
    deduped_doors: list[TagAnchor] = []
    for dt in door_tags:
        too_close = any(
            math.hypot(dt.center[0] - wx, dt.center[1] - wy) <= overlap_px
            for wx, wy in window_centres
        )
        if not too_close:
            deduped_doors.append(dt)

    for i, dt in enumerate(deduped_doors, 1):
        dt.id = f"D-{i:02d}"

    return deduped_doors, window_tags


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def detect_tags(
    gray: np.ndarray,
    binary: np.ndarray,
    wall_mask: np.ndarray,
    walls: list[WallSegment],
) -> list[TagAnchor]:
    """
    Detect all tag symbols.

    Circles (Hough on residual)        → doors.
    Flat-top hexagons (contour on binary) → windows.
    """
    # Door tags — detected on the residual (wall-subtracted) image
    residual = _subtract_walls(binary, wall_mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    residual = cv2.morphologyEx(residual, cv2.MORPH_OPEN, kernel)
    door_tags = _detect_circles(residual, walls)

    # Window tags — detected on the ORIGINAL binary (hexagons are large
    # enough to search directly; wall subtraction can damage them)
    window_tags = _detect_hexagons(binary, walls)

    # If a Hough circle overlaps a hexagon, drop the circle (it's a window)
    door_tags, window_tags = _deduplicate_tags(door_tags, window_tags)

    return door_tags + window_tags
