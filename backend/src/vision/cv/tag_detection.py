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
from typing import Optional

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
HOUGH_PARAM2_RELAXED = 34
MIN_CIRCLE_RADIUS = 10
MAX_CIRCLE_RADIUS = 35

# ---- flat-top hexagon (window tag) detection ----
# Calibrated from the drawing's own legend hexagon symbols.
MIN_HEX_AREA = 900           # slightly conservative to prioritize precision
MAX_HEX_AREA = 2800          # px²
HEX_ASPECT_LO = 1.02         # must be wider than tall (flat-top hexagon)
HEX_ASPECT_HI = 1.55
HEX_DEDUP_DIST = 20          # merge inner/outer contour pairs within this distance

# ---- proximity filters ----
MAX_DIST_TO_WALL_DOOR_PX = 220
MAX_DIST_TO_WALL_WINDOW_PX = 280
TEXT_BUBBLE_MAX_DIST_PX = 145
CIRCLE_NMS_DIST_PX = 18
WINDOW_MIN_SCORE = 0.62
DOOR_MIN_SCORE = 0.48
LEGEND_SCAN_X_FRAC = 0.64
LEGEND_SCAN_Y_FRAC = 0.05
LEGEND_SCAN_H_FRAC = 0.9
LEGEND_MIN_CIRCLE_SAMPLES = 2
LEGEND_MIN_HEX_SAMPLES = 2


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _subtract_walls(binary: np.ndarray, wall_mask: np.ndarray) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(wall_mask, kernel, iterations=1)
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


def _min_wall_distance(cx: int, cy: int, walls: list[WallSegment]) -> float:
    if not walls:
        return float("inf")
    return min(_point_to_segment_dist(cx, cy, w) for w in walls)


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _point_in_roi(cx: int, cy: int, structural_roi: np.ndarray | None) -> bool:
    if structural_roi is None or structural_roi.size == 0:
        return True
    h, w = structural_roi.shape[:2]
    if cx < 0 or cy < 0 or cx >= w or cy >= h:
        return False
    return bool(structural_roi[cy, cx])


def calibrate_symbols_from_legend(
    gray: np.ndarray,
    binary: np.ndarray,
) -> dict[str, float | str] | None:
    """
    Scan the likely legend / schedule strip on the right side of the full sheet
    and recover coarse symbol sizing priors when available.
    """
    h, w = gray.shape[:2]
    x0 = max(0, int(w * LEGEND_SCAN_X_FRAC))
    y0 = max(0, int(h * LEGEND_SCAN_Y_FRAC))
    y1 = min(h, int(h * LEGEND_SCAN_H_FRAC))
    if x0 >= w or y0 >= y1:
        return None

    legend_gray = gray[y0:y1, x0:w]
    legend_binary = binary[y0:y1, x0:w]
    if legend_gray.size == 0 or legend_binary.size == 0:
        return None

    calibration: dict[str, float | str] = {"source": "legend"}

    circles = cv2.HoughCircles(
        legend_gray,
        cv2.HOUGH_GRADIENT,
        dp=HOUGH_DP,
        minDist=max(18, HOUGH_MIN_DIST // 2),
        param1=HOUGH_PARAM1,
        param2=max(18, HOUGH_PARAM2_RELAXED - 8),
        minRadius=max(6, MIN_CIRCLE_RADIUS - 4),
        maxRadius=MAX_CIRCLE_RADIUS + 10,
    )
    if circles is not None:
        radii = sorted(int(round(r)) for _, _, r in circles[0])
        if len(radii) >= LEGEND_MIN_CIRCLE_SAMPLES:
            calibration["door_radius_px"] = float(radii[len(radii) // 2])

    contours, _ = cv2.findContours(legend_binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    hex_areas: list[float] = []
    hex_aspects: list[float] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 500 or area > 6000:
            continue
        perimeter = cv2.arcLength(cnt, True)
        if perimeter <= 0:
            continue
        approx = cv2.approxPolyDP(cnt, 0.025 * perimeter, True)
        if len(approx) not in (6, 7):
            continue
        _, _, box_w, box_h = cv2.boundingRect(cnt)
        if box_h <= 0 or box_w <= 0:
            continue
        aspect = box_w / box_h
        if 0.9 <= aspect <= 1.75:
            hex_areas.append(float(area))
            hex_aspects.append(float(aspect))

    if len(hex_areas) >= LEGEND_MIN_HEX_SAMPLES:
        hex_areas.sort()
        hex_aspects.sort()
        calibration["window_hex_area_px"] = float(hex_areas[len(hex_areas) // 2])
        calibration["window_hex_aspect"] = float(hex_aspects[len(hex_aspects) // 2])

    return calibration if len(calibration) > 1 else None


def _merge_circle_candidates(candidates: list[tuple[int, int, int, float]]) -> list[tuple[int, int, int, float]]:
    merged: list[tuple[int, int, int, float]] = []
    for cx, cy, r, score in sorted(candidates, key=lambda item: item[3], reverse=True):
        replaced = False
        for idx, (mx, my, mr, ms) in enumerate(merged):
            if math.hypot(cx - mx, cy - my) <= CIRCLE_NMS_DIST_PX:
                if score > ms:
                    merged[idx] = (cx, cy, r, score)
                replaced = True
                break
        if not replaced:
            merged.append((cx, cy, r, score))
    return merged


def _door_confidence(
    cx: int,
    cy: int,
    r: int,
    walls: list[WallSegment],
    *,
    target_radius: Optional[float] = None,
) -> float:
    wall_dist = _min_wall_distance(cx, cy, walls)
    radius_target = float(target_radius) if target_radius and target_radius > 0 else 18.0
    radius_tolerance = max(10.0, radius_target)
    radius_score = 1.0 - min(1.0, abs(r - radius_target) / radius_tolerance)
    proximity_score = 1.0 - min(1.0, wall_dist / MAX_DIST_TO_WALL_DOOR_PX)
    text_penalty = 0.18 if wall_dist > TEXT_BUBBLE_MAX_DIST_PX else 0.0
    return _clamp01((0.45 * radius_score) + (0.55 * proximity_score) - text_penalty)


def _window_confidence(
    area: float,
    perimeter: float,
    approx_vertices: int,
    w: int,
    h: int,
    cx: int,
    cy: int,
    walls: list[WallSegment],
    *,
    target_area: Optional[float] = None,
    target_aspect: Optional[float] = None,
) -> float:
    aspect = w / max(1, h)
    circularity = 0.0 if perimeter <= 0 else (4.0 * math.pi * area) / (perimeter * perimeter)
    wall_dist = _min_wall_distance(cx, cy, walls)

    aspect_target = float(target_aspect) if target_aspect and target_aspect > 0 else 1.28
    area_target = float(target_area) if target_area and target_area > 0 else 1600.0
    aspect_score = 1.0 - min(1.0, abs(aspect - aspect_target) / 0.35)
    area_score = 1.0 - min(1.0, abs(area - area_target) / max(450.0, area_target * 0.55))
    vertex_score = 1.0 - min(1.0, abs(approx_vertices - 6) / 2.0)
    circularity_score = 1.0 - min(1.0, max(0.0, circularity - 0.78) / 0.16)
    proximity_score = 1.0 - min(1.0, wall_dist / MAX_DIST_TO_WALL_WINDOW_PX)
    flat_top_score = 1.0 if w > h else 0.0

    return _clamp01(
        (0.18 * aspect_score)
        + (0.14 * area_score)
        + (0.20 * vertex_score)
        + (0.24 * circularity_score)
        + (0.16 * proximity_score)
        + (0.10 * flat_top_score)
    )


# ---------------------------------------------------------------------------
# Circle (door) detector
# ---------------------------------------------------------------------------

def _detect_circles(
    residual: np.ndarray,
    walls: list[WallSegment],
    calibration: dict[str, float | str] | None = None,
    structural_roi: np.ndarray | None = None,
) -> tuple[list[TagAnchor], int]:
    """Hough Circle Transform → door tags, filtered by wall proximity."""
    raw_count = 0
    candidates: list[tuple[int, int, int, float]] = []
    target_radius = float(calibration["door_radius_px"]) if calibration and "door_radius_px" in calibration else None
    for param2 in (HOUGH_PARAM2, HOUGH_PARAM2_RELAXED):
        circles = cv2.HoughCircles(
            residual,
            cv2.HOUGH_GRADIENT,
            dp=HOUGH_DP,
            minDist=HOUGH_MIN_DIST,
            param1=HOUGH_PARAM1,
            param2=param2,
            minRadius=MIN_CIRCLE_RADIUS,
            maxRadius=MAX_CIRCLE_RADIUS,
        )
        if circles is None:
            continue
        raw_count += int(len(circles[0]))
        for cx, cy, r in np.round(circles[0]).astype(int):
            score = _door_confidence(int(cx), int(cy), int(r), walls, target_radius=target_radius)
            if score < DOOR_MIN_SCORE:
                continue
            candidates.append((int(cx), int(cy), int(r), score))

    tags: list[TagAnchor] = []
    for idx, (cx, cy, r, score) in enumerate(_merge_circle_candidates(candidates), 1):
        if not _point_in_roi(cx, cy, structural_roi):
            continue
        if not _near_any_wall(cx, cy, walls, MAX_DIST_TO_WALL_DOOR_PX):
            continue
        tags.append(
            TagAnchor(
                id=f"D-{idx:02d}",
                tag_class=TagClass.DOOR,
                center=(cx, cy),
                radius=r,
                confidence=round(score, 2),
                symbol_source="legend_calibrated" if target_radius else "generic",
                legend_symbol_id="legend_door_circle" if target_radius else None,
            )
        )
    return tags, raw_count


# ---------------------------------------------------------------------------
# Flat-top hexagon (window) detector
# ---------------------------------------------------------------------------

def _detect_hexagons(
    binary: np.ndarray,
    walls: list[WallSegment],
    calibration: dict[str, float | str] | None = None,
    structural_roi: np.ndarray | None = None,
) -> tuple[list[TagAnchor], int]:
    """
    Detect flat-top hexagonal window tags on the ORIGINAL binary image.

    Uses RETR_LIST to find both inner and outer contours of each hexagon,
    then deduplicates.  The search criteria are calibrated from the
    drawing's own legend symbols.
    """
    contours, _ = cv2.findContours(
        binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE,
    )

    raw_count = 0
    raw_centres: list[tuple[int, int, int, float]] = []  # (cx, cy, radius, score)

    target_area = float(calibration["window_hex_area_px"]) if calibration and "window_hex_area_px" in calibration else None
    target_aspect = float(calibration["window_hex_aspect"]) if calibration and "window_hex_aspect" in calibration else None
    for cnt in contours:
        area = cv2.contourArea(cnt)
        min_area = int(max(500, (target_area or MIN_HEX_AREA) * 0.45))
        max_area = int(min(5000, (target_area or MAX_HEX_AREA) * 1.75))
        if area < min_area or area > max_area:
            continue
        raw_count += 1

        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        if h == 0 or w < 15:
            continue

        aspect = w / h
        aspect_lo = max(0.9, (target_aspect or HEX_ASPECT_LO) - 0.28)
        aspect_hi = min(1.8, (target_aspect or HEX_ASPECT_HI) + 0.28)
        if not (aspect_lo <= aspect <= aspect_hi):
            continue

        # Try a tight epsilon to get exactly 6-7 vertices
        approx_vertices = 0
        found = False
        for eps_frac in (0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04):
            approx = cv2.approxPolyDP(cnt, eps_frac * perimeter, True)
            approx_vertices = len(approx)
            if len(approx) in (6, 7):
                found = True
                break

        if not found:
            continue

        # Wall proximity
        cx = x + w // 2
        cy = y + h // 2
        if not _point_in_roi(cx, cy, structural_roi):
            continue
        if not _near_any_wall(cx, cy, walls, MAX_DIST_TO_WALL_WINDOW_PX):
            continue

        score = _window_confidence(
            area,
            perimeter,
            approx_vertices,
            w,
            h,
            cx,
            cy,
            walls,
            target_area=target_area,
            target_aspect=target_aspect,
        )
        if score < WINDOW_MIN_SCORE:
            continue

        (_, _), r = cv2.minEnclosingCircle(cnt)
        raw_centres.append((cx, cy, int(r), score))

    # ---- Deduplicate inner / outer contour pairs ----
    # RETR_LIST finds both inner and outer contour of the same hexagon.
    # Keep only one per unique location.
    deduped: list[tuple[int, int, int, float]] = []
    for cx, cy, r, score in sorted(raw_centres, key=lambda item: item[3], reverse=True):
        if all(
            math.hypot(cx - dx, cy - dy) > HEX_DEDUP_DIST
            for dx, dy, _, _ in deduped
        ):
            deduped.append((cx, cy, r, score))

    tags: list[TagAnchor] = []
    for idx, (cx, cy, r, score) in enumerate(deduped, 1):
        tags.append(
            TagAnchor(
                id=f"W-{idx:02d}",
                tag_class=TagClass.WINDOW,
                center=(cx, cy),
                radius=r,
                confidence=round(score, 2),
                symbol_source="legend_calibrated" if target_area else "generic",
                legend_symbol_id="legend_window_hex" if target_area else None,
            )
        )

    return tags, raw_count


# ---------------------------------------------------------------------------
# Dedup circles vs hexagons
# ---------------------------------------------------------------------------

def _deduplicate_tags(
    door_tags: list[TagAnchor],
    window_tags: list[TagAnchor],
    overlap_px: int = 18,
) -> tuple[list[TagAnchor], list[TagAnchor]]:
    """Resolve door/window overlaps by confidence, not by class priority."""
    used_windows: set[str] = set()
    deduped_doors: list[TagAnchor] = []

    for dt in door_tags:
        best_window: TagAnchor | None = None
        best_dist = float("inf")
        for wt in window_tags:
            if wt.id in used_windows:
                continue
            dist = math.hypot(dt.center[0] - wt.center[0], dt.center[1] - wt.center[1])
            if dist <= overlap_px and dist < best_dist:
                best_window = wt
                best_dist = dist

        if best_window is None:
            deduped_doors.append(dt)
            continue

        if dt.confidence >= best_window.confidence:
            deduped_doors.append(dt)
            used_windows.add(best_window.id)

    deduped_windows = [wt for wt in window_tags if wt.id not in used_windows]

    for i, dt in enumerate(deduped_doors, 1):
        dt.id = f"D-{i:02d}"
    for i, wt in enumerate(deduped_windows, 1):
        wt.id = f"W-{i:02d}"

    return deduped_doors, deduped_windows


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def detect_tags(
    gray: np.ndarray,
    binary: np.ndarray,
    wall_mask: np.ndarray,
    walls: list[WallSegment],
    symbol_calibration: dict[str, float | str] | None = None,
    structural_roi: np.ndarray | None = None,
) -> tuple[list[TagAnchor], dict[str, int]]:
    """
    Detect all tag symbols.

    Circles (Hough on residual)        → doors.
    Flat-top hexagons (contour on binary) → windows.
    """
    # Door tags — detected on the residual (wall-subtracted) image
    residual = _subtract_walls(binary, wall_mask)
    if structural_roi is not None and structural_roi.shape == residual.shape:
        residual = cv2.bitwise_and(residual, structural_roi)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    residual = cv2.morphologyEx(residual, cv2.MORPH_OPEN, kernel)
    door_tags, door_tags_raw = _detect_circles(
        residual,
        walls,
        calibration=symbol_calibration,
        structural_roi=structural_roi,
    )

    # Window tags — detected on the ORIGINAL binary (hexagons are large
    # enough to search directly; wall subtraction can damage them)
    window_binary = binary
    if structural_roi is not None and structural_roi.shape == binary.shape:
        window_binary = cv2.bitwise_and(binary, structural_roi)
    window_tags, window_tags_raw = _detect_hexagons(
        window_binary,
        walls,
        calibration=symbol_calibration,
        structural_roi=structural_roi,
    )

    # Resolve overlaps by confidence.
    door_tags, window_tags = _deduplicate_tags(door_tags, window_tags)
    if structural_roi is not None:
        door_tags = [tag for tag in door_tags if _point_in_roi(tag.center[0], tag.center[1], structural_roi)]
        window_tags = [tag for tag in window_tags if _point_in_roi(tag.center[0], tag.center[1], structural_roi)]

    diagnostics = {
        "door_tags_raw": door_tags_raw,
        "door_tags_after_dedupe": len(door_tags),
        "window_tags_raw": window_tags_raw,
        "window_tags_after_dedupe": len(window_tags),
        "legend_calibrated": 1 if symbol_calibration else 0,
    }

    return door_tags + window_tags, diagnostics
