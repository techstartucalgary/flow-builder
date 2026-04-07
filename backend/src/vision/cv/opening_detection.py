"""
Opening candidate recovery helpers.

These heuristics recover real openings when the wall mask does not expose a
clean blank gap, while still rejecting placements inside continuous wall body.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import math

import numpy as np

from src.vision.cv.models import Orientation, TagAnchor, TagClass, WallSegment
from src.vision.cv.opening_validation import (
    opening_fits_host_wall,
    opening_has_endpoint_clearance,
)


DOOR_RECOVERY_MIN_FEATURE_SCORE = 0.58
WINDOW_RECOVERY_MIN_FEATURE_SCORE = 0.62
DOOR_RECOVERY_MIN_ALIGNMENT = 0.42
WINDOW_RECOVERY_MIN_ALIGNMENT = 0.36
DOOR_RECOVERY_MIN_CLASSIFICATION = 0.54
WINDOW_RECOVERY_MIN_CLASSIFICATION = 0.56
SOLID_WALL_CENTER_FILL_REJECT = 0.88
SOLID_WALL_INNER_FILL_REJECT = 0.78
DOOR_OPENING_PIXELS_MIN = 0.40
WINDOW_OPENING_PIXELS_MIN = 0.32
JUNCTION_SUPPORT_DIST_PX = 18
SHORT_WALL_PREFERENCE_PX = 140


@dataclass
class OpeningCandidate:
    id: str
    wall_id: str
    orientation: Orientation
    center: tuple[int, int]
    bbox: tuple[int, int, int, int]
    width_px: int
    wall_break_score: float
    opening_pixels_score: float
    door_feature_score: float
    window_feature_score: float
    tag_alignment_score: float
    candidate_mode: str
    verified: bool
    tag_class: TagClass | None = None
    confidence: float = 0.0
    tag_ids: list[str] = field(default_factory=list)
    verification_mode: str = "gap_only"
    host_gap_id: str | None = None
    host_score: float = 0.0
    symbol_source: str = "generic"
    legend_symbol_id: str | None = None


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _fill_ratio(roi: np.ndarray) -> float:
    if roi.size == 0:
        return 0.0
    return float(np.count_nonzero(roi)) / float(roi.size)


def _project_point_to_segment(px: int, py: int, wall: WallSegment) -> tuple[float, float, float]:
    x1, y1 = wall.start
    x2, y2 = wall.end
    dx = x2 - x1
    dy = y2 - y1
    denom = dx * dx + dy * dy
    if denom == 0:
        return float(x1), float(y1), 0.0
    t = ((px - x1) * dx + (py - y1) * dy) / denom
    t = max(0.0, min(1.0, t))
    return x1 + t * dx, y1 + t * dy, t


def _point_to_segment_dist(px: int, py: int, wall: WallSegment) -> float:
    qx, qy, _ = _project_point_to_segment(px, py, wall)
    return math.hypot(px - qx, py - qy)


def _distance_to_wall_endpoints(point: tuple[int, int], wall: WallSegment) -> float:
    return min(
        math.hypot(point[0] - wall.start[0], point[1] - wall.start[1]),
        math.hypot(point[0] - wall.end[0], point[1] - wall.end[1]),
    )


def _junction_support(
    wall: WallSegment,
    walls: list[WallSegment],
    projected_center: tuple[int, int],
) -> float:
    support = 0.0
    endpoint_dist = _distance_to_wall_endpoints(projected_center, wall)
    for other in walls:
        if other.id == wall.id or other.orientation == wall.orientation:
            continue
        center_dist = _point_to_segment_dist(projected_center[0], projected_center[1], other)
        if center_dist <= JUNCTION_SUPPORT_DIST_PX:
            support = max(support, 1.0)
            continue
        if endpoint_dist <= JUNCTION_SUPPORT_DIST_PX:
            endpoint_connected = min(
                _point_to_segment_dist(wall.start[0], wall.start[1], other),
                _point_to_segment_dist(wall.end[0], wall.end[1], other),
            )
            if endpoint_connected <= JUNCTION_SUPPORT_DIST_PX:
                support = max(support, 0.8)
    return support


def _has_relaxed_endpoint_clearance(
    wall: WallSegment,
    bbox: tuple[int, int, int, int],
    junction_support: float,
) -> bool:
    if junction_support < 0.55:
        return False
    if wall.orientation == Orientation.HORIZONTAL:
        opening_start = float(bbox[0])
        opening_end = float(bbox[0] + bbox[2])
        wall_min, wall_max = sorted((float(wall.start[0]), float(wall.end[0])))
    else:
        opening_start = float(bbox[1])
        opening_end = float(bbox[1] + bbox[3])
        wall_min, wall_max = sorted((float(wall.start[1]), float(wall.end[1])))

    opening_length = max(0.0, opening_end - opening_start)
    opening_center = opening_start + (opening_length / 2.0)
    required_clearance = max(6.0, opening_length * 0.12)
    return (
        (opening_center - wall_min) >= required_clearance
        and (wall_max - opening_center) >= required_clearance
    )


def _host_wall_score(
    tag: TagAnchor,
    wall: WallSegment,
    walls: list[WallSegment],
) -> tuple[float, tuple[int, int], float, float]:
    proj_x, proj_y, t = _project_point_to_segment(tag.center[0], tag.center[1], wall)
    dist = math.hypot(tag.center[0] - proj_x, tag.center[1] - proj_y)
    projected_center = (int(round(proj_x)), int(round(proj_y)))
    junction_support = _junction_support(wall, walls, projected_center)
    endpoint_penalty = 28.0 if t <= 0.04 or t >= 0.96 else (10.0 if t <= 0.1 or t >= 0.9 else 0.0)
    if junction_support >= 0.55 and endpoint_penalty > 0.0:
        endpoint_penalty *= 0.25
    axial_center = (wall.start[0] + wall.end[0]) / 2.0 if wall.orientation == Orientation.HORIZONTAL else (wall.start[1] + wall.end[1]) / 2.0
    tag_axis = tag.center[0] if wall.orientation == Orientation.HORIZONTAL else tag.center[1]
    half_span = abs(((wall.end[0] - wall.start[0]) if wall.orientation == Orientation.HORIZONTAL else (wall.end[1] - wall.start[1])) / 2.0)
    axial_penalty = 0.0 if half_span <= 0 else max(0.0, abs(tag_axis - axial_center) - half_span) * 0.2
    short_wall_bonus = 12.0 * _clamp01((SHORT_WALL_PREFERENCE_PX - float(wall.length_px)) / SHORT_WALL_PREFERENCE_PX)
    junction_bonus = 20.0 * junction_support
    return dist + endpoint_penalty + axial_penalty - short_wall_bonus - junction_bonus, projected_center, dist, junction_support


def _bbox_on_wall(
    wall: WallSegment,
    center: tuple[int, int],
    width_px: int,
) -> tuple[int, int, int, int]:
    thickness = max(8, int(wall.visual_thickness or wall.thickness) + 8)
    if wall.orientation == Orientation.HORIZONTAL:
        x = int(round(center[0] - width_px / 2))
        y = int(round(center[1] - thickness / 2))
        return x, y, int(width_px), thickness
    x = int(round(center[0] - thickness / 2))
    y = int(round(center[1] - width_px / 2))
    return x, y, thickness, int(width_px)


def _roi(arr: np.ndarray, bbox: tuple[int, int, int, int], pad_x: int = 0, pad_y: int = 0) -> np.ndarray:
    x, y, w, h = bbox
    x0 = max(0, x - pad_x)
    y0 = max(0, y - pad_y)
    x1 = min(arr.shape[1], x + w + pad_x)
    y1 = min(arr.shape[0], y + h + pad_y)
    return arr[y0:y1, x0:x1]


def _center_strip_fill(mask: np.ndarray, bbox: tuple[int, int, int, int], orientation: Orientation) -> float:
    x, y, w, h = bbox
    if orientation == Orientation.HORIZONTAL:
        strip_h = max(2, min(h, h // 3 or 2))
        sy = y + max(0, (h - strip_h) // 2)
        roi = _roi(mask, (x, sy, w, strip_h))
    else:
        strip_w = max(2, min(w, w // 3 or 2))
        sx = x + max(0, (w - strip_w) // 2)
        roi = _roi(mask, (sx, y, strip_w, h))
    return _fill_ratio(roi)


def _edge_frame_fill(mask: np.ndarray, bbox: tuple[int, int, int, int], orientation: Orientation) -> float:
    x, y, w, h = bbox
    if orientation == Orientation.HORIZONTAL:
        strip_w = max(2, min(6, w // 6 or 2))
        left = _roi(mask, (x, y, strip_w, h))
        right = _roi(mask, (x + w - strip_w, y, strip_w, h))
    else:
        strip_h = max(2, min(6, h // 6 or 2))
        left = _roi(mask, (x, y, w, strip_h))
        right = _roi(mask, (x, y + h - strip_h, w, strip_h))
    return float((_fill_ratio(left) + _fill_ratio(right)) / 2.0)


def _side_support(mask: np.ndarray, bbox: tuple[int, int, int, int], orientation: Orientation, sample_px: int = 10) -> float:
    x, y, w, h = bbox
    if orientation == Orientation.HORIZONTAL:
        left = _roi(mask, (x - sample_px, y, sample_px, h))
        right = _roi(mask, (x + w, y, sample_px, h))
    else:
        left = _roi(mask, (x, y - sample_px, w, sample_px))
        right = _roi(mask, (x, y + h, w, sample_px))
    return float((_fill_ratio(left) + _fill_ratio(right)) / 2.0)


def _opening_pixels(wall_mask: np.ndarray, bbox: tuple[int, int, int, int], orientation: Orientation) -> float:
    interior_fill = _fill_ratio(_roi(wall_mask, bbox))
    center_fill = _center_strip_fill(wall_mask, bbox, orientation)
    openness = 1.0 - min(1.0, interior_fill / 0.55)
    center_openness = 1.0 - min(1.0, center_fill / 0.75)
    return _clamp01((0.6 * openness) + (0.4 * center_openness))


def _tag_ring_density(binary: np.ndarray, tag: TagAnchor) -> float:
    y_indices, x_indices = np.ogrid[:binary.shape[0], :binary.shape[1]]
    dist = np.sqrt((x_indices - tag.center[0]) ** 2 + (y_indices - tag.center[1]) ** 2)
    inner = max(1.0, tag.radius * 0.85)
    outer = max(inner + 1.0, tag.radius * 1.6)
    ring = (dist >= inner) & (dist <= outer)
    if not np.any(ring):
        return 0.0
    return float(np.count_nonzero(binary[ring])) / float(np.count_nonzero(ring))


def _door_feature_score(
    binary: np.ndarray,
    wall_mask: np.ndarray,
    wall: WallSegment,
    bbox: tuple[int, int, int, int],
    tag: TagAnchor,
    alignment_score: float,
) -> float:
    center_fill = _center_strip_fill(wall_mask, bbox, wall.orientation)
    opening_pixels = _opening_pixels(wall_mask, bbox, wall.orientation)
    tag_ring = _tag_ring_density(binary, tag)
    return _clamp01(
        (0.34 * max(tag.confidence, 0.25))
        + (0.24 * alignment_score)
        + (0.24 * opening_pixels)
        + (0.18 * _clamp01((tag_ring - 0.03) / 0.18))
        + (0.14 * _clamp01((0.78 - center_fill) / 0.78))
    )


def _window_feature_score(
    binary: np.ndarray,
    wall_mask: np.ndarray,
    wall: WallSegment,
    bbox: tuple[int, int, int, int],
    tag: TagAnchor,
    alignment_score: float,
) -> float:
    center_fill = _center_strip_fill(binary, bbox, wall.orientation)
    frame_fill = _edge_frame_fill(binary, bbox, wall.orientation)
    opening_pixels = _opening_pixels(wall_mask, bbox, wall.orientation)
    return _clamp01(
        (0.28 * max(tag.confidence, 0.25))
        + (0.22 * alignment_score)
        + (0.24 * _clamp01((frame_fill - 0.08) / 0.20))
        + (0.18 * _clamp01((center_fill - 0.04) / 0.18))
        + (0.12 * opening_pixels)
    )


def _tag_alignment_score(tag: TagAnchor, wall: WallSegment, projected_center: tuple[int, int], width_px: int) -> float:
    if wall.orientation == Orientation.HORIZONTAL:
        axial_dist = abs(tag.center[0] - projected_center[0])
        perp_dist = abs(tag.center[1] - projected_center[1])
    else:
        axial_dist = abs(tag.center[1] - projected_center[1])
        perp_dist = abs(tag.center[0] - projected_center[0])
    axial = 1.0 - min(1.0, axial_dist / max(28.0, width_px * 0.75))
    perp = 1.0 - min(1.0, perp_dist / max(22.0, float((wall.visual_thickness or wall.thickness) * 2)))
    return _clamp01((0.55 * axial) + (0.45 * perp))


def _estimate_opening_width(tag: TagAnchor, wall: WallSegment) -> int:
    thickness = max(8, int(wall.visual_thickness or wall.thickness))
    if tag.tag_class == TagClass.DOOR:
        base = int(max(34, min(120, tag.radius * 3.2)))
        if tag.is_double:
            base = int(min(180, base * 1.8))
        return max(base, thickness + 14)
    base = int(max(28, min(180, tag.radius * 3.0)))
    return max(base, thickness + 10)


def recover_candidates_from_tags(
    *,
    tags: list[TagAnchor],
    matched_tag_ids: set[str],
    walls: list[WallSegment],
    binary: np.ndarray,
    wall_mask: np.ndarray,
    host_wall_dist_door_px: float,
    host_wall_dist_window_px: float,
) -> tuple[list[OpeningCandidate], dict[str, int]]:
    candidates: list[OpeningCandidate] = []
    door_recovered = 0
    window_recovered = 0
    door_rejected = 0
    window_rejected = 0
    solid_wall_rejections = 0
    host_fit_rejections = 0
    endpoint_projection_rejections = 0

    for tag in tags:
        if tag.id in matched_tag_ids:
            continue

        best_wall: WallSegment | None = None
        best_projection: tuple[int, int] | None = None
        best_dist = float("inf")
        best_score = float("inf")
        best_junction_support = 0.0
        for wall in walls:
            score, projection, dist, junction_support = _host_wall_score(tag, wall, walls)
            threshold = host_wall_dist_door_px if tag.tag_class == TagClass.DOOR else host_wall_dist_window_px
            if dist <= threshold and score < best_score:
                best_dist = dist
                best_score = score
                best_wall = wall
                best_projection = projection
                best_junction_support = junction_support

        if best_wall is None or best_projection is None:
            if tag.tag_class == TagClass.DOOR:
                door_rejected += 1
            else:
                window_rejected += 1
            continue

        width_px = _estimate_opening_width(tag, best_wall)
        alignment_score = _tag_alignment_score(tag, best_wall, best_projection, width_px)
        bbox = _bbox_on_wall(best_wall, best_projection, width_px)
        if not opening_fits_host_wall(best_wall.orientation, best_wall.start, best_wall.end, bbox):
            host_fit_rejections += 1
            if tag.tag_class == TagClass.DOOR:
                door_rejected += 1
            else:
                window_rejected += 1
            continue
        relaxed_endpoint_ok = _has_relaxed_endpoint_clearance(best_wall, bbox, best_junction_support)
        if not opening_has_endpoint_clearance(best_wall.orientation, best_wall.start, best_wall.end, bbox) and not (
            tag.tag_class == TagClass.DOOR and relaxed_endpoint_ok
        ):
            endpoint_projection_rejections += 1
            if tag.tag_class == TagClass.DOOR:
                door_rejected += 1
            else:
                window_rejected += 1
            continue
        center_fill = _center_strip_fill(wall_mask, bbox, best_wall.orientation)
        interior_fill = _fill_ratio(_roi(wall_mask, bbox))
        support = _side_support(wall_mask, bbox, best_wall.orientation)
        structural_support = max(support, best_junction_support * 0.55)
        opening_pixels = _opening_pixels(wall_mask, bbox, best_wall.orientation)
        wall_break_score = _clamp01((0.45 * (1.0 - center_fill)) + (0.35 * support) + (0.20 * best_junction_support))

        door_feature = 0.0
        window_feature = 0.0
        verified = False
        confidence = 0.0
        verification_mode = "gap_only"
        if tag.tag_class == TagClass.DOOR:
            door_feature = _door_feature_score(binary, wall_mask, best_wall, bbox, tag, alignment_score)
            classification_score = _clamp01(
                (0.44 * door_feature)
                + (0.22 * alignment_score)
                + (0.16 * wall_break_score)
                + (0.18 * opening_pixels)
            )
            door_exception_verified = (
                door_feature >= 0.76
                and alignment_score >= 0.38
                and structural_support >= 0.20
                and best_junction_support >= 0.55
                and center_fill <= 0.92
                and interior_fill <= 0.86
            )
            verified = (
                (
                    door_feature >= DOOR_RECOVERY_MIN_FEATURE_SCORE
                    and alignment_score >= DOOR_RECOVERY_MIN_ALIGNMENT
                    and opening_pixels >= (DOOR_OPENING_PIXELS_MIN - (0.08 if best_junction_support >= 0.55 else 0.0))
                    and classification_score >= (DOOR_RECOVERY_MIN_CLASSIFICATION - (0.06 if tag.symbol_source == "legend_calibrated" else 0.0) - (0.04 if best_junction_support >= 0.55 else 0.0))
                    and structural_support >= 0.05
                )
                or door_exception_verified
            ) and (
                (center_fill < SOLID_WALL_CENTER_FILL_REJECT and interior_fill < SOLID_WALL_INNER_FILL_REJECT)
                or (tag.symbol_source == "legend_calibrated" and door_feature >= 0.78 and alignment_score >= 0.48)
                or (best_junction_support >= 0.55 and door_feature >= 0.70 and alignment_score >= 0.36 and relaxed_endpoint_ok)
            )
            confidence = classification_score
            verification_mode = "door_symbol_recovered"
            if verified:
                door_recovered += 1
            else:
                door_rejected += 1
        else:
            window_feature = _window_feature_score(binary, wall_mask, best_wall, bbox, tag, alignment_score)
            classification_score = _clamp01(
                (0.46 * window_feature)
                + (0.20 * alignment_score)
                + (0.14 * wall_break_score)
                + (0.20 * opening_pixels)
            )
            window_exception_verified = (
                window_feature >= 0.72
                and alignment_score >= 0.15
                and opening_pixels >= 0.28
                and support >= 0.20
                and center_fill <= 0.90
                and interior_fill <= 0.82
            )
            verified = (
                (
                    window_feature >= WINDOW_RECOVERY_MIN_FEATURE_SCORE
                    and alignment_score >= WINDOW_RECOVERY_MIN_ALIGNMENT
                    and opening_pixels >= WINDOW_OPENING_PIXELS_MIN
                    and classification_score >= (WINDOW_RECOVERY_MIN_CLASSIFICATION - (0.06 if tag.symbol_source == "legend_calibrated" else 0.0))
                    and structural_support >= 0.08
                )
                or window_exception_verified
            ) and (
                (center_fill < SOLID_WALL_CENTER_FILL_REJECT and interior_fill < SOLID_WALL_INNER_FILL_REJECT)
                or (tag.symbol_source == "legend_calibrated" and window_feature >= 0.74 and alignment_score >= 0.32)
            )
            confidence = classification_score
            verification_mode = "window_frame_recovered"
            if verified:
                window_recovered += 1
            else:
                window_rejected += 1

        if not verified and (center_fill >= SOLID_WALL_CENTER_FILL_REJECT or interior_fill >= SOLID_WALL_INNER_FILL_REJECT):
            solid_wall_rejections += 1

        candidates.append(
            OpeningCandidate(
                id=f"RC-{len(candidates) + 1:03d}",
                wall_id=best_wall.id,
                orientation=best_wall.orientation,
                center=best_projection,
                bbox=bbox,
                width_px=width_px,
                wall_break_score=round(wall_break_score, 2),
                opening_pixels_score=round(opening_pixels, 2),
                door_feature_score=round(door_feature, 2),
                window_feature_score=round(window_feature, 2),
                tag_alignment_score=round(alignment_score, 2),
                candidate_mode=f"{tag.tag_class.value}_recovery",
                verified=verified,
                tag_class=tag.tag_class if verified else None,
                confidence=round(confidence, 2),
                tag_ids=[tag.id],
                verification_mode=verification_mode,
                host_score=round(_clamp01(1.0 - min(1.0, best_score / max(1.0, (host_wall_dist_door_px if tag.tag_class == TagClass.DOOR else host_wall_dist_window_px)))), 2),
                symbol_source=tag.symbol_source,
                legend_symbol_id=tag.legend_symbol_id,
            )
        )

    return candidates, {
        "door_candidates_symbol_recovered": door_recovered,
        "window_candidates_frame_recovered": window_recovered,
        "door_candidates_rejected_after_symbol_check": door_rejected,
        "window_candidates_rejected_after_frame_check": window_rejected,
        "solid_wall_projection_rejections": solid_wall_rejections,
        "openings_rejected_host_fit": host_fit_rejections,
        "openings_rejected_endpoint_projection": endpoint_projection_rejections,
    }
