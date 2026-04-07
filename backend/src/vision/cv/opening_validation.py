"""Shared structural validation for hosted wall openings."""

from __future__ import annotations

from src.vision.cv.models import Orientation

HOST_FIT_TOLERANCE_PX = 6
MIN_OPENING_SPAN_PX = 20
MIN_ENDPOINT_CLEARANCE_PX = 12
ENDPOINT_CLEARANCE_FRAC = 0.2


def wall_axis_span(
    orientation: Orientation,
    start: tuple[int, int],
    end: tuple[int, int],
) -> tuple[float, float]:
    if orientation == Orientation.HORIZONTAL:
        return tuple(sorted((float(start[0]), float(end[0]))))
    return tuple(sorted((float(start[1]), float(end[1]))))


def opening_axis_span(
    orientation: Orientation,
    bbox: tuple[int, int, int, int],
) -> tuple[float, float]:
    x, y, width, height = bbox
    if orientation == Orientation.HORIZONTAL:
        return float(x), float(x + width)
    return float(y), float(y + height)


def opening_axis_length(
    orientation: Orientation,
    bbox: tuple[int, int, int, int],
) -> float:
    start, end = opening_axis_span(orientation, bbox)
    return max(0.0, end - start)


def opening_fits_host_wall(
    orientation: Orientation,
    wall_start: tuple[int, int],
    wall_end: tuple[int, int],
    bbox: tuple[int, int, int, int],
    *,
    tolerance_px: int = HOST_FIT_TOLERANCE_PX,
    min_opening_span_px: int = MIN_OPENING_SPAN_PX,
) -> bool:
    opening_start, opening_end = opening_axis_span(orientation, bbox)
    opening_length = opening_end - opening_start
    if opening_length < min_opening_span_px:
        return False

    wall_min, wall_max = wall_axis_span(orientation, wall_start, wall_end)
    return (
        opening_start >= wall_min - tolerance_px
        and opening_end <= wall_max + tolerance_px
    )


def opening_has_endpoint_clearance(
    orientation: Orientation,
    wall_start: tuple[int, int],
    wall_end: tuple[int, int],
    bbox: tuple[int, int, int, int],
    *,
    min_clearance_px: int = MIN_ENDPOINT_CLEARANCE_PX,
    clearance_frac: float = ENDPOINT_CLEARANCE_FRAC,
) -> bool:
    if not opening_fits_host_wall(orientation, wall_start, wall_end, bbox):
        return False

    opening_start, opening_end = opening_axis_span(orientation, bbox)
    wall_min, wall_max = wall_axis_span(orientation, wall_start, wall_end)
    opening_length = max(0.0, opening_end - opening_start)
    opening_center = opening_start + (opening_length / 2.0)
    required_clearance = max(float(min_clearance_px), opening_length * clearance_frac)

    return (
        (opening_center - wall_min) >= required_clearance
        and (wall_max - opening_center) >= required_clearance
    )
