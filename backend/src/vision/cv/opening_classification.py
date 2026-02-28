"""
Opening verification/classification helpers.

These heuristics are intentionally verification-first:
  - A gap must already be verified as a real wall opening candidate.
  - Tags and local symbol evidence only classify that candidate.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import cv2
import numpy as np

from src.vision.cv.models import Orientation, TagAnchor, TagClass, WallSegment

if TYPE_CHECKING:
    from src.vision.cv.wall_detection import Gap


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _fill_ratio(roi: np.ndarray) -> float:
    if roi.size == 0:
        return 0.0
    return float(np.count_nonzero(roi)) / float(roi.size)


def _roi(binary: np.ndarray, bbox: tuple[int, int, int, int], pad_x: int, pad_y: int) -> tuple[np.ndarray, int, int]:
    x, y, w, h = bbox
    x0 = max(0, x - pad_x)
    y0 = max(0, y - pad_y)
    x1 = min(binary.shape[1], x + w + pad_x)
    y1 = min(binary.shape[0], y + h + pad_y)
    return binary[y0:y1, x0:x1], x0, y0


def score_opening_pixels(binary: np.ndarray, wall: WallSegment, gap: "Gap") -> float:
    """Class-agnostic score for whether the candidate looks like an actual opening."""
    bbox = gap.bbox
    wall_pad = max(8, int(max(wall.visual_thickness or wall.thickness, wall.thickness)))
    roi, _, _ = _roi(binary, bbox, pad_x=wall_pad, pad_y=wall_pad)
    opening_fill = _fill_ratio(roi)
    openness = 1.0 - min(1.0, opening_fill / 0.35)
    return _clamp01((0.55 * gap.wall_break_score) + (0.45 * openness))


def _score_tag_alignment(
    center: tuple[int, int],
    width_px: int,
    wall: WallSegment,
    tag: TagAnchor,
) -> float:
    if wall.orientation == Orientation.HORIZONTAL:
        axial_dist = abs(tag.center[0] - center[0])
        perp_dist = abs(tag.center[1] - center[1])
    else:
        axial_dist = abs(tag.center[1] - center[1])
        perp_dist = abs(tag.center[0] - center[0])

    axial_score = 1.0 - min(1.0, axial_dist / max(30.0, width_px * 0.85))
    perp_score = 1.0 - min(1.0, perp_dist / max(28.0, float((wall.visual_thickness or wall.thickness) * 2)))
    return _clamp01((0.6 * axial_score) + (0.4 * perp_score))


def _score_size_prior(tag_class: TagClass, width_px: int) -> float:
    if tag_class == TagClass.DOOR:
      # tighter prior around typical door widths
        if width_px < 26 or width_px > 120:
            return 0.0
        return _clamp01(1.0 - abs(width_px - 46) / 55.0)
    if width_px < 20 or width_px > 220:
        return 0.0
    return _clamp01(1.0 - abs(width_px - 72) / 105.0)


def _central_stroke_ratio(binary: np.ndarray, bbox: tuple[int, int, int, int], orientation: Orientation) -> float:
    x, y, w, h = bbox
    if orientation == Orientation.HORIZONTAL:
        strip_w = max(2, min(w, w // 5))
        sx = x + max(0, (w - strip_w) // 2)
        roi = binary[max(0, y): max(0, y) + max(1, h), max(0, sx): max(0, sx) + strip_w]
    else:
        strip_h = max(2, min(h, h // 5))
        sy = y + max(0, (h - strip_h) // 2)
        roi = binary[max(0, sy): max(0, sy) + strip_h, max(0, x): max(0, x) + max(1, w)]
    return _fill_ratio(roi)


def _door_feature_score(binary: np.ndarray, wall: WallSegment, bbox: tuple[int, int, int, int]) -> float:
    stroke_ratio = _central_stroke_ratio(binary, bbox, wall.orientation)
    return _clamp01((0.22 - stroke_ratio) / 0.22)


def _window_feature_score(binary: np.ndarray, wall: WallSegment, bbox: tuple[int, int, int, int]) -> float:
    stroke_ratio = _central_stroke_ratio(binary, bbox, wall.orientation)
    return _clamp01((stroke_ratio - 0.06) / 0.18)


def classify_opening_candidate(
    *,
    binary: np.ndarray,
    wall: WallSegment,
    center: tuple[int, int],
    bbox: tuple[int, int, int, int],
    width_px: int,
    wall_break_score: float,
    opening_pixels_score: float,
    tags: list[TagAnchor],
) -> dict[str, object]:
    door_tag_score = 0.0
    window_tag_score = 0.0
    winning_tag_alignment = 0.0
    door_matches: list[tuple[TagAnchor, float, float]] = []
    window_matches: list[tuple[TagAnchor, float, float]] = []
    for tag in tags:
        align = _score_tag_alignment(center, width_px, wall, tag)
        if align < 0.32:
            continue
        weighted = align * max(0.15, tag.confidence)
        if tag.tag_class == TagClass.DOOR:
            door_matches.append((tag, align, weighted))
            door_tag_score = max(door_tag_score, weighted)
        else:
            window_matches.append((tag, align, weighted))
            window_tag_score = max(window_tag_score, weighted)

    door_feature = _door_feature_score(binary, wall, bbox)
    window_feature = _window_feature_score(binary, wall, bbox)
    door_score = (
        (0.32 * door_tag_score)
        + (0.24 * door_feature)
        + (0.18 * _score_size_prior(TagClass.DOOR, width_px))
        + (0.13 * wall_break_score)
        + (0.13 * opening_pixels_score)
    )
    window_score = (
        (0.32 * window_tag_score)
        + (0.24 * window_feature)
        + (0.18 * _score_size_prior(TagClass.WINDOW, width_px))
        + (0.13 * wall_break_score)
        + (0.13 * opening_pixels_score)
    )

    classification_score = max(door_score, window_score)
    winner: TagClass | None = None
    if classification_score >= 0.50 and abs(door_score - window_score) >= 0.06:
        winner = TagClass.DOOR if door_score > window_score else TagClass.WINDOW

    selected_matches: list[tuple[TagAnchor, float, float]] = []
    if winner == TagClass.DOOR and door_matches:
        door_matches.sort(key=lambda item: item[2], reverse=True)
        best = door_matches[0][2]
        selected_matches = [item for item in door_matches if item[2] >= best * 0.78][:2]
        winning_tag_alignment = selected_matches[0][1]
    elif winner == TagClass.WINDOW and window_matches:
        window_matches.sort(key=lambda item: item[2], reverse=True)
        best = window_matches[0][2]
        selected_matches = [item for item in window_matches if item[2] >= best * 0.82][:2]
        winning_tag_alignment = selected_matches[0][1]

    return {
        "tag_ids": [tag.id for tag, _, _ in selected_matches],
        "opening_pixels_score": round(opening_pixels_score, 2),
        "wall_break_score": round(wall_break_score, 2),
        "door_feature_score": round(door_feature, 2),
        "window_feature_score": round(window_feature, 2),
        "tag_alignment_score": round(winning_tag_alignment, 2),
        "door_score": round(door_score, 2),
        "window_score": round(window_score, 2),
        "classification_score": round(classification_score, 2),
        "tag_class": winner.value if winner else None,
        "used_tag_count": len(selected_matches),
    }


def classify_verified_opening(
    *,
    binary: np.ndarray,
    wall: WallSegment,
    gap: "Gap",
    tags: list[TagAnchor],
) -> dict[str, object]:
    opening_pixels_score = score_opening_pixels(binary, wall, gap)
    return classify_opening_candidate(
        binary=binary,
        wall=wall,
        center=gap.center,
        bbox=gap.bbox,
        width_px=gap.width_px,
        wall_break_score=gap.wall_break_score,
        opening_pixels_score=opening_pixels_score,
        tags=tags,
    )
