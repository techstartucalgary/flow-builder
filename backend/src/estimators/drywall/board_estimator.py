"""Shared drywall board estimator for takeoff and partition routes."""

from __future__ import annotations

from dataclasses import dataclass, field
from math import ceil, isfinite
from typing import Literal

from src.estimators.drywall.annotation_geometry import NormalizedOpening
from src.estimators.drywall.surface_classification import ClassifiedWall, ClassificationConfidence

DOOR_OPENING_SQFT = 21.0
WINDOW_OPENING_SQFT = 12.0

OpeningDeductionMode = Literal["measured", "mixed", "fallback_constants"]


@dataclass
class BoardEstimateResult:
    estimate_ready: bool
    blocked_reasons: list[str]
    perimeter_linear_ft: float
    partition_linear_ft: float
    unknown_linear_ft: float
    perimeter_board_sqft: float
    partition_board_sqft: float
    unknown_board_sqft: float
    gross_wall_board_sqft: float
    opening_deduction_sqft: float
    net_wall_board_sqft: float
    ceiling_board_sqft: float
    net_board_area_sqft: float
    waste_sqft: float
    area_with_waste_sqft: float
    sheets_required: int
    matched_opening_count: int
    measured_opening_count: int
    fallback_opening_count: int
    opening_deduction_mode: OpeningDeductionMode
    sheet_count_method: Literal["area_based"] = "area_based"
    diagnostics: dict[str, float | int | str] = field(default_factory=dict)


def _valid_measurement(value: float | None) -> bool:
    return value is not None and isfinite(value) and value > 0


def _opening_bounds(tag_class: str) -> tuple[tuple[float, float], tuple[float, float]]:
    if tag_class == "door":
        return (2.0, 5.0), (6.0, 8.5)
    return (1.0, 12.0), (1.0, 8.0)


def _opening_constant(tag_class: str) -> float:
    return DOOR_OPENING_SQFT if tag_class == "door" else WINDOW_OPENING_SQFT


def _measured_opening_area_sqft(opening: NormalizedOpening, scale_px_per_ft: float | None) -> tuple[float | None, bool]:
    width_ft = opening.width_ft if _valid_measurement(opening.width_ft) else None
    height_ft = opening.height_ft if _valid_measurement(opening.height_ft) else None
    if width_ft is None or height_ft is None:
        if scale_px_per_ft and scale_px_per_ft > 0:
            _, _, width_px, height_px = opening.bbox
            width_ft = width_px / scale_px_per_ft
            height_ft = height_px / scale_px_per_ft

    if width_ft is None or height_ft is None:
        return None, False

    (min_width, max_width), (min_height, max_height) = _opening_bounds(opening.tag_class)
    if not (min_width <= width_ft <= max_width and min_height <= height_ft <= max_height):
        return None, False

    return float(width_ft * height_ft), True


def _board_sides_for_wall(wall: ClassifiedWall) -> int | None:
    if wall.board_sides in {1, 2}:
        return wall.board_sides
    if wall.surface_class == "perimeter":
        return 1
    if wall.surface_class == "partition":
        return 2
    if wall.surface_class == "unknown":
        return 1
    return None


def _round(value: float) -> float:
    return round(float(value), 4)


def estimate_board_requirements(
    *,
    walls: list[ClassifiedWall],
    openings: list[NormalizedOpening],
    scale_px_per_ft: float | None,
    ceiling_height_ft: float,
    include_ceiling: bool,
    room_closure_status: Literal["closed", "open", "ambiguous"],
    floor_area_sqft: float,
    unmatched_opening_count: int,
    waste_factor: float,
    sheet_size_sqft: float,
    classification_confidence: ClassificationConfidence,
) -> BoardEstimateResult:
    wall_lookup = {wall.id: wall for wall in walls}

    perimeter_linear_ft = 0.0
    partition_linear_ft = 0.0
    unknown_linear_ft = 0.0
    perimeter_board_sqft = 0.0
    partition_board_sqft = 0.0
    unknown_board_sqft = 0.0

    for wall in walls:
        if wall.exclude_from_takeoff:
            continue
        length_ft = (wall.length_px / scale_px_per_ft) if scale_px_per_ft and scale_px_per_ft > 0 else 0.0
        sides = _board_sides_for_wall(wall)
        board_area = length_ft * ceiling_height_ft * sides if sides else 0.0

        if wall.surface_class == "perimeter":
            perimeter_linear_ft += length_ft
            perimeter_board_sqft += board_area
        elif wall.surface_class == "partition":
            partition_linear_ft += length_ft
            partition_board_sqft += board_area
        else:
            unknown_linear_ft += length_ft
            unknown_board_sqft += board_area

    matched_opening_count = 0
    measured_opening_count = 0
    fallback_opening_count = 0
    opening_deduction_sqft = 0.0

    for opening in openings:
        if not opening.matched or not opening.wall_id:
            continue
        host_wall = wall_lookup.get(opening.wall_id)
        if host_wall is None or host_wall.exclude_from_takeoff:
            continue

        matched_opening_count += 1
        area_sqft, measured = _measured_opening_area_sqft(opening, scale_px_per_ft)
        if area_sqft is None:
            area_sqft = _opening_constant(opening.tag_class)
            fallback_opening_count += 1
        elif measured:
            measured_opening_count += 1
        opening_deduction_sqft += area_sqft

    if fallback_opening_count > 0 and measured_opening_count > 0:
        deduction_mode: OpeningDeductionMode = "mixed"
    elif fallback_opening_count > 0:
        deduction_mode = "fallback_constants"
    else:
        deduction_mode = "measured"

    gross_wall_board_sqft = perimeter_board_sqft + partition_board_sqft + unknown_board_sqft
    net_wall_board_sqft = max(0.0, gross_wall_board_sqft - opening_deduction_sqft)

    included_wall_count = sum(1 for wall in walls if not wall.exclude_from_takeoff)
    unknown_wall_count = sum(1 for wall in walls if wall.surface_class == "unknown" and not wall.exclude_from_takeoff)
    unknown_wall_pct = unknown_wall_count / included_wall_count if included_wall_count > 0 else 0.0

    blocked_reasons: list[str] = []
    if not scale_px_per_ft or scale_px_per_ft <= 0:
        blocked_reasons.append("Scale is missing.")
    if unknown_wall_count > 0:
        blocked_reasons.append(f"{unknown_wall_count} wall(s) still require perimeter/partition classification.")
    if unknown_wall_pct > 0.30:
        blocked_reasons.append(f"{unknown_wall_pct:.0%} of walls unclassified — board count uncertain.")
    if fallback_opening_count > 0:
        blocked_reasons.append("Opening deductions still rely on fallback constants.")
    if room_closure_status != "closed":
        blocked_reasons.append(f"Room closure is {room_closure_status}.")
    if unmatched_opening_count > 0:
        blocked_reasons.append(f"{unmatched_opening_count} opening(s) could not be hosted to a wall.")
    if classification_confidence == "low":
        blocked_reasons.append("Wall surface classification confidence is low.")

    estimate_ready = not blocked_reasons
    ceiling_board_sqft = floor_area_sqft if include_ceiling and floor_area_sqft > 0 else 0.0
    net_board_area_sqft = net_wall_board_sqft + ceiling_board_sqft
    waste_sqft = net_board_area_sqft * waste_factor
    area_with_waste_sqft = net_board_area_sqft + waste_sqft
    sheets_required = int(ceil(area_with_waste_sqft / sheet_size_sqft)) if sheet_size_sqft > 0 and area_with_waste_sqft > 0 else 0

    return BoardEstimateResult(
        estimate_ready=estimate_ready,
        blocked_reasons=blocked_reasons,
        perimeter_linear_ft=_round(perimeter_linear_ft),
        partition_linear_ft=_round(partition_linear_ft),
        unknown_linear_ft=_round(unknown_linear_ft),
        perimeter_board_sqft=_round(perimeter_board_sqft),
        partition_board_sqft=_round(partition_board_sqft),
        unknown_board_sqft=_round(unknown_board_sqft),
        gross_wall_board_sqft=_round(gross_wall_board_sqft),
        opening_deduction_sqft=_round(opening_deduction_sqft),
        net_wall_board_sqft=_round(net_wall_board_sqft),
        ceiling_board_sqft=_round(ceiling_board_sqft),
        net_board_area_sqft=_round(net_board_area_sqft),
        waste_sqft=_round(waste_sqft),
        area_with_waste_sqft=_round(area_with_waste_sqft),
        sheets_required=sheets_required,
        matched_opening_count=matched_opening_count,
        measured_opening_count=measured_opening_count,
        fallback_opening_count=fallback_opening_count,
        opening_deduction_mode=deduction_mode,
        diagnostics={
            "unknown_wall_count": unknown_wall_count,
            "unknown_wall_pct": round(unknown_wall_pct, 4),
            "included_wall_count": included_wall_count,
            "excluded_wall_count": sum(1 for wall in walls if wall.exclude_from_takeoff),
            "unknown_wall_treatment": "provisional_1_side_draft" if unknown_wall_count > 0 else "not_applicable",
        },
    )
