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

    for tag in tags:
        if tag.id in matched_tag_ids:
            continue

        best_wall: WallSegment | None = None
        best_projection: tuple[int, int] | None = None
        best_dist = float("inf")
        for wall in walls:
            proj_x, proj_y, _ = _project_point_to_segment(tag.center[0], tag.center[1], wall)
            dist = math.hypot(tag.center[0] - proj_x, tag.center[1] - proj_y)
            threshold = host_wall_dist_door_px if tag.tag_class == TagClass.DOOR else host_wall_dist_window_px
            if dist <= threshold and dist < best_dist:
                best_dist = dist
                best_wall = wall
                best_projection = (int(round(proj_x)), int(round(proj_y)))

        if best_wall is None or best_projection is None:
            if tag.tag_class == TagClass.DOOR:
                door_rejected += 1
            else:
                window_rejected += 1
            continue

        width_px = _estimate_opening_width(tag, best_wall)
        alignment_score = _tag_alignment_score(tag, best_wall, best_projection, width_px)
        bbox = _bbox_on_wall(best_wall, best_projection, width_px)
        center_fill = _center_strip_fill(wall_mask, bbox, best_wall.orientation)
        interior_fill = _fill_ratio(_roi(wall_mask, bbox))
        support = _side_support(wall_mask, bbox, best_wall.orientation)
        opening_pixels = _opening_pixels(wall_mask, bbox, best_wall.orientation)
        wall_break_score = _clamp01((0.55 * (1.0 - center_fill)) + (0.45 * support))

        door_feature = 0.0
        window_feature = 0.0
        verified = False
        confidence = 0.0
        verification_mode = "gap_only"
        if tag.tag_class == TagClass.DOOR:
            door_feature = _door_feature_score(binary, wall_mask, best_wall, bbox, tag, alignment_score)
            classification_score = _clamp01(
                (0.40 * door_feature)
                + (0.22 * alignment_score)
                + (0.20 * wall_break_score)
                + (0.18 * opening_pixels)
            )
            door_exception_verified = (
                door_feature >= 0.85
                and alignment_score >= 0.50
                and wall_break_score >= 0.50
                and opening_pixels >= 0.80
                and center_fill <= 0.25
                and interior_fill <= 0.20
            )
            verified = (
                (
                    door_feature >= DOOR_RECOVERY_MIN_FEATURE_SCORE
                    and alignment_score >= DOOR_RECOVERY_MIN_ALIGNMENT
                    and opening_pixels >= DOOR_OPENING_PIXELS_MIN
                    and classification_score >= DOOR_RECOVERY_MIN_CLASSIFICATION
                    and support >= 0.05
                )
                or door_exception_verified
            ) and (
                center_fill < SOLID_WALL_CENTER_FILL_REJECT
                and interior_fill < SOLID_WALL_INNER_FILL_REJECT
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
                (0.42 * window_feature)
                + (0.20 * alignment_score)
                + (0.18 * wall_break_score)
                + (0.20 * opening_pixels)
            )
            window_exception_verified = (
                window_feature >= 0.72
                and alignment_score >= 0.15
                and opening_pixels >= 0.40
                and support >= 0.20
                and center_fill <= 0.65
                and interior_fill <= 0.35
            )
            verified = (
                (
                    window_feature >= WINDOW_RECOVERY_MIN_FEATURE_SCORE
                    and alignment_score >= WINDOW_RECOVERY_MIN_ALIGNMENT
                    and opening_pixels >= WINDOW_OPENING_PIXELS_MIN
                    and classification_score >= WINDOW_RECOVERY_MIN_CLASSIFICATION
                    and support >= 0.08
                )
                or window_exception_verified
            ) and (
                center_fill < SOLID_WALL_CENTER_FILL_REJECT
                and interior_fill < SOLID_WALL_INNER_FILL_REJECT
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
            )
        )

    return candidates, {
        "door_candidates_symbol_recovered": door_recovered,
        "window_candidates_frame_recovered": window_recovered,
        "door_candidates_rejected_after_symbol_check": door_rejected,
        "window_candidates_rejected_after_frame_check": window_rejected,
        "solid_wall_projection_rejections": solid_wall_rejections,
    }
