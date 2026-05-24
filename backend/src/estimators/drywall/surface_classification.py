"""Auto-classify normalized walls as perimeter, partition, or unknown."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from math import hypot
from typing import Literal

import cv2
import numpy as np

from src.estimators.drywall.annotation_geometry import (
    NormalizedWall,
    TakeoffGeometrySnapshot,
    WallSurfaceClass,
)
from src.estimators.drywall.room_closure import (
    AREA_HEAL_KERNEL_SIZE,
    MIN_INTERIOR_REGION_SQFT,
    UPSCALE_FACTOR,
    build_wall_mask_from_snapshot,
    seal_hosted_openings_for_area,
)


ClassificationConfidence = Literal["high", "medium", "low"]
SideLabel = str


@dataclass
class ClassifiedWall:
    id: str
    surface_class: WallSurfaceClass
    surface_class_source: Literal["auto", "manual"]
    board_sides: int | None
    confidence: ClassificationConfidence
    exclude_from_takeoff: bool
    length_px: float
    diagnostics: dict[str, float | int | str] = field(default_factory=dict)


@dataclass
class SurfaceClassificationResult:
    walls: list[ClassifiedWall]
    confidence: ClassificationConfidence
    perimeter_wall_count: int
    partition_wall_count: int
    unknown_wall_count: int
    diagnostics: dict[str, float | int | str] = field(default_factory=dict)


def _default_board_sides(surface_class: WallSurfaceClass) -> int | None:
    if surface_class == "perimeter":
        return 1
    if surface_class == "partition":
        return 2
    return None


def _aggregate_confidence(values: list[ClassificationConfidence]) -> ClassificationConfidence:
    if not values:
        return "low"
    if any(value == "low" for value in values):
        return "low"
    if any(value == "medium" for value in values):
        return "medium"
    return "high"


def _build_room_labels(snapshot: TakeoffGeometrySnapshot) -> tuple[np.ndarray, set[int], set[int]]:
    mask = build_wall_mask_from_snapshot(snapshot)
    seal_hosted_openings_for_area(snapshot, mask)
    healed_mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        np.ones((AREA_HEAL_KERNEL_SIZE, AREA_HEAL_KERNEL_SIZE), dtype=np.uint8),
    )

    padded = np.zeros((healed_mask.shape[0] + 2, healed_mask.shape[1] + 2), dtype=np.uint8)
    padded[1:-1, 1:-1] = healed_mask
    empty = (padded == 0).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(empty, connectivity=4)

    border_labels = set(np.unique(np.concatenate((
        labels[0, :],
        labels[-1, :],
        labels[:, 0],
        labels[:, -1],
    ))).tolist())

    min_region_area_px = int(round(max(1.0, MIN_INTERIOR_REGION_SQFT) * ((snapshot.scale_px_per_ft or 1.0) * UPSCALE_FACTOR) ** 2))
    room_labels: set[int] = set()
    for label in range(1, num_labels):
        if label in border_labels:
            continue
        if int(stats[label, cv2.CC_STAT_AREA]) < min_region_area_px:
            continue
        room_labels.add(label)
    return labels, border_labels, room_labels


def _sample_parameters(wall: NormalizedWall) -> list[float]:
    if wall.length_px <= 24:
        return [0.5]
    return [0.18, 0.34, 0.5, 0.66, 0.82]


def _side_label(
    labels: np.ndarray,
    border_labels: set[int],
    room_labels: set[int],
    x: float,
    y: float,
    nx: float,
    ny: float,
    base_offset_px: float,
) -> SideLabel:
    max_x = labels.shape[1] - 1
    max_y = labels.shape[0] - 1
    for multiplier in (1.0, 1.6, 2.2):
        sample_x = int(round(x + (nx * base_offset_px * multiplier)))
        sample_y = int(round(y + (ny * base_offset_px * multiplier)))
        if not (0 <= sample_x <= max_x and 0 <= sample_y <= max_y):
            return "outside"
        label = int(labels[sample_y, sample_x])
        if label == 0:
            continue
        if label in border_labels:
            return "outside"
        if label in room_labels:
            return f"room:{label}"
        return "unknown"
    return "unknown"


def _pair_surface_class(left_label: SideLabel, right_label: SideLabel) -> WallSurfaceClass:
    side_labels = {left_label, right_label}
    if "outside" in side_labels and any(label.startswith("room:") for label in side_labels):
        return "perimeter"
    if left_label.startswith("room:") and right_label.startswith("room:") and left_label != right_label:
        return "partition"
    return "unknown"


def _classify_auto_wall(
    wall: NormalizedWall,
    labels: np.ndarray,
    border_labels: set[int],
    room_labels: set[int],
) -> ClassifiedWall:
    dx = float(wall.end[0] - wall.start[0])
    dy = float(wall.end[1] - wall.start[1])
    length = hypot(dx, dy)
    if length <= 0:
        return ClassifiedWall(
            id=wall.id,
            surface_class="unknown",
            surface_class_source="auto",
            board_sides=None,
            confidence="low",
            exclude_from_takeoff=wall.exclude_from_takeoff,
            length_px=wall.length_px,
            diagnostics={"reason": "zero_length_wall"},
        )

    unit_normal = (-dy / length, dx / length)
    offset_px = max((wall.visual_thickness or wall.thickness or 14.0) * UPSCALE_FACTOR * 0.9, 8.0)
    votes: Counter[str] = Counter()

    for t in _sample_parameters(wall):
        sample_x = ((wall.start[0] + (dx * t)) * UPSCALE_FACTOR) + 1
        sample_y = ((wall.start[1] + (dy * t)) * UPSCALE_FACTOR) + 1
        left_label = _side_label(labels, border_labels, room_labels, sample_x, sample_y, unit_normal[0], unit_normal[1], offset_px)
        right_label = _side_label(labels, border_labels, room_labels, sample_x, sample_y, -unit_normal[0], -unit_normal[1], offset_px)
        votes[_pair_surface_class(left_label, right_label)] += 1

    dominant_class, dominant_votes = votes.most_common(1)[0] if votes else ("unknown", 0)
    sample_count = max(1, sum(votes.values()))
    ratio = dominant_votes / sample_count
    confidence: ClassificationConfidence
    if dominant_class == "unknown":
        confidence = "low"
    elif ratio >= 0.8:
        confidence = "high"
    elif ratio >= 0.55:
        confidence = "medium"
    else:
        confidence = "low"

    return ClassifiedWall(
        id=wall.id,
        surface_class=dominant_class if dominant_class in {"perimeter", "partition", "unknown"} else "unknown",
        surface_class_source="auto",
        board_sides=_default_board_sides(dominant_class if dominant_class in {"perimeter", "partition"} else "unknown"),
        confidence=confidence,
        exclude_from_takeoff=wall.exclude_from_takeoff,
        length_px=wall.length_px,
        diagnostics={
            "sample_count": sample_count,
            "dominant_vote_ratio": round(ratio, 4),
            "perimeter_votes": int(votes.get("perimeter", 0)),
            "partition_votes": int(votes.get("partition", 0)),
            "unknown_votes": int(votes.get("unknown", 0)),
        },
    )


def _classify_wall(
    wall: NormalizedWall,
    labels: np.ndarray,
    border_labels: set[int],
    room_labels: set[int],
) -> ClassifiedWall:
    if wall.surface_class_source == "manual":
        board_sides = wall.board_sides if wall.board_sides in {1, 2} else _default_board_sides(wall.surface_class)
        return ClassifiedWall(
            id=wall.id,
            surface_class=wall.surface_class,
            surface_class_source="manual",
            board_sides=board_sides,
            confidence="high",
            exclude_from_takeoff=wall.exclude_from_takeoff,
            length_px=wall.length_px,
            diagnostics={"reason": "manual_override"},
        )
    auto = _classify_auto_wall(wall, labels, border_labels, room_labels)
    if wall.board_sides in {1, 2}:
        auto.board_sides = wall.board_sides
    return auto


def classify_wall_surfaces(snapshot: TakeoffGeometrySnapshot) -> SurfaceClassificationResult:
    if not snapshot.walls:
        return SurfaceClassificationResult(
            walls=[],
            confidence="low",
            perimeter_wall_count=0,
            partition_wall_count=0,
            unknown_wall_count=0,
            diagnostics={"reason": "no_walls"},
        )

    labels, border_labels, room_labels = _build_room_labels(snapshot)
    walls = [_classify_wall(wall, labels, border_labels, room_labels) for wall in snapshot.walls]

    perimeter_wall_count = sum(1 for wall in walls if wall.surface_class == "perimeter")
    partition_wall_count = sum(1 for wall in walls if wall.surface_class == "partition")
    unknown_wall_count = sum(1 for wall in walls if wall.surface_class == "unknown")

    return SurfaceClassificationResult(
        walls=walls,
        confidence=_aggregate_confidence([wall.confidence for wall in walls if not wall.exclude_from_takeoff]),
        perimeter_wall_count=perimeter_wall_count,
        partition_wall_count=partition_wall_count,
        unknown_wall_count=unknown_wall_count,
        diagnostics={
            "room_label_count": len(room_labels),
            "outside_label_count": len(border_labels),
            "wall_count": len(walls),
        },
    )
