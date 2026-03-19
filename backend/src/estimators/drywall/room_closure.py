"""Room closure solver for normalized annotation geometry."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

import cv2
import numpy as np

from src.estimators.drywall.annotation_geometry import TakeoffGeometrySnapshot

UPSCALE_FACTOR = 2
AREA_HEAL_KERNEL_SIZE = 5
MIN_INTERIOR_REGION_SQFT = 100.0
MAX_SEAL_GAP_FT = 25.0


@dataclass
class RoomClosureResult:
    floor_area_sqft: float
    status: Literal["closed", "open", "ambiguous"]
    confidence: Literal["high", "medium", "low"]
    unclosed_gap_count: int
    largest_boundary_gap_px: float
    debug: dict[str, float | int | str] = field(default_factory=dict)


def _mask_dimensions(snapshot: TakeoffGeometrySnapshot) -> tuple[int, int]:
    width_px = int(snapshot.image_width or 0)
    height_px = int(snapshot.image_height or 0)
    if width_px > 0 and height_px > 0:
        return width_px, height_px

    max_x = 0
    max_y = 0
    for wall in snapshot.walls:
        max_x = max(max_x, wall.start[0], wall.end[0])
        max_y = max(max_y, wall.start[1], wall.end[1])
    for opening in snapshot.openings:
        x, y, width, height = opening.bbox
        max_x = max(max_x, x + width)
        max_y = max(max_y, y + height)
    return max_x + 12, max_y + 12


def build_wall_mask_from_snapshot(snapshot: TakeoffGeometrySnapshot) -> np.ndarray:
    width_px, height_px = _mask_dimensions(snapshot)
    mask = np.zeros((max(1, height_px * UPSCALE_FACTOR), max(1, width_px * UPSCALE_FACTOR)), dtype=np.uint8)

    thicknesses = [float(wall.visual_thickness or wall.thickness or 0.0) for wall in snapshot.walls]
    median_thickness = float(np.median(thicknesses)) if thicknesses else 14.0

    for wall in snapshot.walls:
        thickness = wall.visual_thickness or wall.thickness or median_thickness
        line_thickness = max(1, int(round(thickness * UPSCALE_FACTOR)))
        start = (int(round(wall.start[0] * UPSCALE_FACTOR)), int(round(wall.start[1] * UPSCALE_FACTOR)))
        end = (int(round(wall.end[0] * UPSCALE_FACTOR)), int(round(wall.end[1] * UPSCALE_FACTOR)))
        cv2.line(mask, start, end, 255, line_thickness, cv2.LINE_8)

    return mask


def seal_hosted_openings_for_area(snapshot: TakeoffGeometrySnapshot, mask: np.ndarray) -> None:
    max_x = mask.shape[1] - 1
    max_y = mask.shape[0] - 1

    for opening in snapshot.openings:
        x, y, width, height = opening.bbox
        x0 = max(0, min(max_x, int(round(x * UPSCALE_FACTOR))))
        y0 = max(0, min(max_y, int(round(y * UPSCALE_FACTOR))))
        x1 = max(0, min(max_x, int(round((x + width) * UPSCALE_FACTOR))))
        y1 = max(0, min(max_y, int(round((y + height) * UPSCALE_FACTOR))))
        cv2.rectangle(mask, (x0, y0), (x1, y1), 255, -1)


def summarize_boundary_gaps(snapshot: TakeoffGeometrySnapshot) -> dict[str, float | int]:
    gap_lengths = [float(gap) for gap in snapshot.open_boundary_gaps if gap > 0]
    return {
        "unclosed_gap_count": len(gap_lengths),
        "largest_boundary_gap_px": max(gap_lengths, default=0.0),
    }


def _seal_open_endpoint_gaps(
    snapshot: TakeoffGeometrySnapshot,
    mask: np.ndarray,
) -> int:
    """Connect nearby open wall endpoints on the mask to seal boundary leaks."""
    endpoint_degree: dict[tuple[int, int], int] = {}
    for wall in snapshot.walls:
        endpoint_degree[wall.start] = endpoint_degree.get(wall.start, 0) + 1
        endpoint_degree[wall.end] = endpoint_degree.get(wall.end, 0) + 1

    open_points = [pt for pt, deg in endpoint_degree.items() if deg <= 1]
    if len(open_points) < 2:
        return 0

    scale = snapshot.scale_px_per_ft or 0.0
    max_gap_px = scale * MAX_SEAL_GAP_FT if scale > 0 else 300.0
    thicknesses = [wall.visual_thickness or wall.thickness for wall in snapshot.walls]
    median_thickness = float(np.median(thicknesses)) if thicknesses else 14.0
    line_thickness = max(1, int(round(median_thickness * UPSCALE_FACTOR)))

    sealed = 0
    used: set[int] = set()
    for i, pt in enumerate(open_points):
        if i in used:
            continue
        best_j, best_dist = -1, float("inf")
        for j, other in enumerate(open_points):
            if j == i or j in used:
                continue
            d = ((pt[0] - other[0]) ** 2 + (pt[1] - other[1]) ** 2) ** 0.5
            if d < best_dist:
                best_dist, best_j = d, j
        if best_j >= 0 and best_dist <= max_gap_px:
            a = (int(round(pt[0] * UPSCALE_FACTOR)), int(round(pt[1] * UPSCALE_FACTOR)))
            b_pt = open_points[best_j]
            b = (int(round(b_pt[0] * UPSCALE_FACTOR)), int(round(b_pt[1] * UPSCALE_FACTOR)))
            cv2.line(mask, a, b, 255, line_thickness, cv2.LINE_8)
            used.add(i)
            used.add(best_j)
            sealed += 1
    return sealed


def _heal_small_boundary_gaps(mask: np.ndarray) -> np.ndarray:
    kernel = np.ones((AREA_HEAL_KERNEL_SIZE, AREA_HEAL_KERNEL_SIZE), dtype=np.uint8)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)


def _compute_mask_enclosed_area_sqft(mask: np.ndarray, scale_px_per_ft: Optional[float]) -> tuple[float, dict[str, float | int]]:
    effective_scale = (scale_px_per_ft or 0.0) * UPSCALE_FACTOR
    if effective_scale <= 0:
        return 0.0, {
            "interior_region_count": 0,
            "interior_area_px": 0,
            "mask_width_px": int(mask.shape[1]),
            "mask_height_px": int(mask.shape[0]),
            "min_region_area_px": 0,
        }

    padded = np.zeros((mask.shape[0] + 2, mask.shape[1] + 2), dtype=np.uint8)
    padded[1:-1, 1:-1] = mask
    empty = (padded == 0).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(empty, connectivity=4)

    border_labels = set(np.unique(np.concatenate((
        labels[0, :],
        labels[-1, :],
        labels[:, 0],
        labels[:, -1],
    ))).tolist())

    min_region_area_px = int(round(MIN_INTERIOR_REGION_SQFT * (effective_scale ** 2)))
    interior_area_px = 0
    interior_region_count = 0

    for label in range(1, num_labels):
        if label in border_labels:
            continue
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < min_region_area_px:
            continue
        interior_region_count += 1
        interior_area_px += area

    floor_area_sqft = interior_area_px / (effective_scale ** 2)
    return floor_area_sqft, {
        "interior_region_count": interior_region_count,
        "interior_area_px": interior_area_px,
        "mask_width_px": int(mask.shape[1]),
        "mask_height_px": int(mask.shape[0]),
        "min_region_area_px": min_region_area_px,
    }


def compute_enclosed_regions(snapshot: TakeoffGeometrySnapshot) -> RoomClosureResult:
    if not snapshot.walls:
        return RoomClosureResult(
            floor_area_sqft=0.0,
            status="open",
            confidence="low",
            unclosed_gap_count=0,
            largest_boundary_gap_px=0.0,
            debug={"reason": "no_walls"},
        )

    if not snapshot.scale_px_per_ft or snapshot.scale_px_per_ft <= 0:
        gap_debug = summarize_boundary_gaps(snapshot)
        return RoomClosureResult(
            floor_area_sqft=0.0,
            status="open" if gap_debug["unclosed_gap_count"] else "ambiguous",
            confidence="low",
            unclosed_gap_count=int(gap_debug["unclosed_gap_count"]),
            largest_boundary_gap_px=float(gap_debug["largest_boundary_gap_px"]),
            debug={"reason": "missing_scale"},
        )

    base_mask = build_wall_mask_from_snapshot(snapshot)
    seal_hosted_openings_for_area(snapshot, base_mask)
    healed_base_mask = _heal_small_boundary_gaps(base_mask)
    base_area_sqft, base_debug = _compute_mask_enclosed_area_sqft(healed_base_mask, snapshot.scale_px_per_ft)

    gap_debug = summarize_boundary_gaps(snapshot)
    unclosed_gap_count = int(gap_debug["unclosed_gap_count"])
    largest_boundary_gap_px = float(gap_debug["largest_boundary_gap_px"])
    largest_boundary_gap_ft = largest_boundary_gap_px / snapshot.scale_px_per_ft if snapshot.scale_px_per_ft else 0.0

    effective_scale = (snapshot.scale_px_per_ft or 0.0) * UPSCALE_FACTOR
    gap_close_target_px = int(round(1.0 * effective_scale))
    iter_kernel_size = max(7, min(41, int(round(effective_scale * 0.4)) | 1))
    morph_iterations = max(1, gap_close_target_px // iter_kernel_size)
    iter_kernel = np.ones((iter_kernel_size, iter_kernel_size), dtype=np.uint8)
    dilated = cv2.dilate(base_mask, iter_kernel, iterations=morph_iterations)
    alternate_mask = cv2.erode(dilated, iter_kernel, iterations=morph_iterations)
    alternate_area_sqft, alternate_debug = _compute_mask_enclosed_area_sqft(alternate_mask, snapshot.scale_px_per_ft)

    status: Literal["closed", "open", "ambiguous"]
    confidence: Literal["high", "medium", "low"]
    floor_area_sqft = 0.0

    if unclosed_gap_count == 0 and base_area_sqft > 0:
        status = "closed"
        confidence = "high"
        floor_area_sqft = base_area_sqft
    else:
        materially_different_alt = (
            alternate_area_sqft > 0
            and (
                base_area_sqft <= 0
                or abs(alternate_area_sqft - base_area_sqft) / max(alternate_area_sqft, base_area_sqft, 1.0) > 0.15
            )
        )
        if materially_different_alt or base_area_sqft > 0:
            status = "ambiguous"
        else:
            status = "open"
        confidence = "low"
        floor_area_sqft = max(base_area_sqft, alternate_area_sqft)

    debug: dict[str, float | int | str] = {
        **base_debug,
        "base_floor_area_sqft": round(float(base_area_sqft), 4),
        "alternate_floor_area_sqft": round(float(alternate_area_sqft), 4),
        "unclosed_gap_count": unclosed_gap_count,
        "largest_boundary_gap_px": round(float(largest_boundary_gap_px), 4),
        "largest_boundary_gap_ft": round(float(largest_boundary_gap_ft), 4),
        "closure_status": status,
        "morph_close_kernel_px": int(iter_kernel_size),
        "morph_close_iterations": int(morph_iterations),
    }
    debug.update({
        "alternate_region_count": int(alternate_debug.get("interior_region_count", 0)),
    })

    return RoomClosureResult(
        floor_area_sqft=float(floor_area_sqft),
        status=status,
        confidence=confidence,
        unclosed_gap_count=unclosed_gap_count,
        largest_boundary_gap_px=largest_boundary_gap_px,
        debug=debug,
    )
