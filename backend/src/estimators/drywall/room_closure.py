"""Room closure solver and robust room polygon extractor for normalized geometry."""

from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot
from typing import Any, Literal, Optional

import cv2
import numpy as np

from src.estimators.drywall.annotation_geometry import NormalizedOpening, NormalizedWall, TakeoffGeometrySnapshot

UPSCALE_FACTOR = 2
AREA_HEAL_KERNEL_SIZE = 5
MIN_INTERIOR_REGION_SQFT = 100.0
MIN_ROOM_REGION_SQFT = 16.0
MAX_SEAL_GAP_FT = 25.0
MAX_TOPOLOGY_REPAIR_FT = 2.5
MAX_DOOR_CLOSURE_TANGENT_FT = 5.0
ROOM_SUPPORT_DISTANCE_PX = 14.0
ROOM_SUPPORT_MIN_RATIO = 0.8
POLYGON_SIMPLIFY_RATIO = 0.006
POLYGON_SIMPLIFY_MIN_PX = 2.0
ORTHOGONAL_MIN_RATIO = 0.72
OVERSIZED_ROOM_AREA_SQFT = 700.0
OVERSIZED_ROOM_TOTAL_AREA_RATIO = 0.58
INTERIOR_SPLIT_WALL_MIN_FT = 3.0
MIN_INTERNAL_BARRIER_COUNT = 2
MAX_INFERRED_DOOR_HOST_DIST_FT = 3.5
WATERSHED_MAX_SEGMENTS = 6
FlooringMaterial = Literal["hardwood", "carpet", "tile", "vinyl", "laminate"]


@dataclass
class RoomClosureResult:
    floor_area_sqft: float
    status: Literal["closed", "open", "ambiguous"]
    confidence: Literal["high", "medium", "low"]
    unclosed_gap_count: int
    largest_boundary_gap_px: float
    debug: dict[str, float | int | str] = field(default_factory=dict)


@dataclass
class ExtractedRoom:
    id: str
    polygon: list[tuple[int, int]]
    bbox: tuple[int, int, int, int]
    centroid: tuple[float, float]
    area_sqft: float
    area_px: float
    quantity_required: float
    quantity_unit: Literal["sqft"]
    extraction_status: Literal["auto", "edited", "ambiguous"]
    extraction_confidence: float
    touches_border: bool
    material: FlooringMaterial | None = None
    name: str | None = None
    attrs: dict[str, Any] = field(default_factory=dict)
    diagnostics: dict[str, float | int | str | bool] = field(default_factory=dict)


@dataclass
class RoomExtractionResult:
    rooms: list[ExtractedRoom]
    status: Literal["closed", "open", "ambiguous"]
    confidence: Literal["high", "medium", "low"]
    total_area_sqft: float
    debug: dict[str, float | int | str] = field(default_factory=dict)


@dataclass(frozen=True)
class _EndpointRecord:
    point: tuple[int, int]
    wall: NormalizedWall
    orientation: Literal["horizontal", "vertical", "angled"]
    inward: tuple[float, float]


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


def _positive_scale(snapshot: TakeoffGeometrySnapshot) -> float:
    return float(snapshot.scale_px_per_ft or 0.0)


def _median_wall_thickness(snapshot: TakeoffGeometrySnapshot) -> float:
    thicknesses = [float(wall.visual_thickness or wall.thickness or 0.0) for wall in snapshot.walls]
    return float(np.median(thicknesses)) if thicknesses else 14.0


def _wall_bbox(wall: NormalizedWall, pad_px: float = 0.0, *, upscale: bool = False) -> tuple[int, int, int, int]:
    scale = UPSCALE_FACTOR if upscale else 1
    x0 = min(wall.start[0], wall.end[0]) * scale
    y0 = min(wall.start[1], wall.end[1]) * scale
    x1 = max(wall.start[0], wall.end[0]) * scale
    y1 = max(wall.start[1], wall.end[1]) * scale
    pad = int(round(pad_px))
    return x0 - pad, y0 - pad, x1 + pad, y1 + pad


def _bbox_intersects(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def build_wall_mask_from_snapshot(snapshot: TakeoffGeometrySnapshot) -> np.ndarray:
    width_px, height_px = _mask_dimensions(snapshot)
    mask = np.zeros((max(1, height_px * UPSCALE_FACTOR), max(1, width_px * UPSCALE_FACTOR)), dtype=np.uint8)

    median_thickness = _median_wall_thickness(snapshot)
    for wall in snapshot.walls:
        thickness = wall.visual_thickness or wall.thickness or median_thickness
        line_thickness = max(1, int(round(thickness * UPSCALE_FACTOR)))
        start = (int(round(wall.start[0] * UPSCALE_FACTOR)), int(round(wall.start[1] * UPSCALE_FACTOR)))
        end = (int(round(wall.end[0] * UPSCALE_FACTOR)), int(round(wall.end[1] * UPSCALE_FACTOR)))
        cv2.line(mask, start, end, 255, line_thickness, cv2.LINE_8)

    return mask


def _project_point_to_segment(
    point: tuple[float, float],
    start: tuple[int, int],
    end: tuple[int, int],
) -> tuple[float, float]:
    x1, y1 = float(start[0]), float(start[1])
    x2, y2 = float(end[0]), float(end[1])
    dx = x2 - x1
    dy = y2 - y1
    denom = dx * dx + dy * dy
    if denom <= 0:
        return x1, y1
    t = max(0.0, min(1.0, ((point[0] - x1) * dx + (point[1] - y1) * dy) / denom))
    return x1 + (dx * t), y1 + (dy * t)


def _draw_oriented_rect(
    mask: np.ndarray,
    center: tuple[float, float],
    tangent: tuple[float, float],
    normal: tuple[float, float],
    half_length: float,
    half_thickness: float,
) -> None:
    corners = np.array([
        (
            center[0] - tangent[0] * half_length - normal[0] * half_thickness,
            center[1] - tangent[1] * half_length - normal[1] * half_thickness,
        ),
        (
            center[0] + tangent[0] * half_length - normal[0] * half_thickness,
            center[1] + tangent[1] * half_length - normal[1] * half_thickness,
        ),
        (
            center[0] + tangent[0] * half_length + normal[0] * half_thickness,
            center[1] + tangent[1] * half_length + normal[1] * half_thickness,
        ),
        (
            center[0] - tangent[0] * half_length + normal[0] * half_thickness,
            center[1] - tangent[1] * half_length + normal[1] * half_thickness,
        ),
    ], dtype=np.int32)
    cv2.fillConvexPoly(mask, corners, 255)


def _opening_bbox_upscaled(opening: NormalizedOpening) -> tuple[int, int, int, int]:
    x, y, width, height = opening.bbox
    x0 = int(round(x * UPSCALE_FACTOR))
    y0 = int(round(y * UPSCALE_FACTOR))
    x1 = int(round((x + width) * UPSCALE_FACTOR))
    y1 = int(round((y + height) * UPSCALE_FACTOR))
    return x0, y0, x1, y1


def _sample_mask(mask: np.ndarray, point: tuple[float, float]) -> int:
    x = max(0, min(mask.shape[1] - 1, int(round(point[0]))))
    y = max(0, min(mask.shape[0] - 1, int(round(point[1]))))
    return int(mask[y, x])


def _infer_host_wall_for_opening(
    opening: NormalizedOpening,
    walls: list[NormalizedWall],
    snapshot: TakeoffGeometrySnapshot,
) -> NormalizedWall | None:
    if not walls:
        return None

    center = opening.center
    scale = _positive_scale(snapshot)
    max_distance_px = scale * MAX_INFERRED_DOOR_HOST_DIST_FT if scale > 0 else 36.0
    max_distance_px = max(max_distance_px, float(max(opening.bbox[2], opening.bbox[3]) * 1.5))

    best_wall: NormalizedWall | None = None
    best_score = float("inf")
    for wall in walls:
        if wall.orientation == "angled":
            continue
        distance = _distance_point_to_segment(center[0], center[1], wall.start, wall.end)
        if distance > max_distance_px:
            continue

        wall_bbox = _wall_bbox(wall, pad_px=max_distance_px)
        if not _bbox_intersects(wall_bbox, opening.bbox[0:2] + (opening.bbox[0] + opening.bbox[2], opening.bbox[1] + opening.bbox[3])):
            continue

        opening_span = opening.bbox[2] if wall.orientation == "horizontal" else opening.bbox[3]
        wall_span = abs(wall.end[0] - wall.start[0]) if wall.orientation == "horizontal" else abs(wall.end[1] - wall.start[1])
        span_penalty = abs(float(opening_span) - min(float(opening_span), float(wall_span))) * 0.05
        score = distance + span_penalty
        if score < best_score:
            best_score = score
            best_wall = wall

    return best_wall


def _draw_hosted_door_closure(mask: np.ndarray, opening: NormalizedOpening, wall: NormalizedWall, snapshot: TakeoffGeometrySnapshot) -> None:
    start = (wall.start[0] * UPSCALE_FACTOR, wall.start[1] * UPSCALE_FACTOR)
    end = (wall.end[0] * UPSCALE_FACTOR, wall.end[1] * UPSCALE_FACTOR)
    dx = float(end[0] - start[0])
    dy = float(end[1] - start[1])
    length = hypot(dx, dy)
    if length <= 0:
        return

    tangent = (dx / length, dy / length)
    normal = (-tangent[1], tangent[0])
    center_px = (float(opening.center[0] * UPSCALE_FACTOR), float(opening.center[1] * UPSCALE_FACTOR))
    center = _project_point_to_segment(center_px, start, end)

    opening_span_px = (
        opening.bbox[2] * UPSCALE_FACTOR
        if wall.orientation == "horizontal"
        else opening.bbox[3] * UPSCALE_FACTOR
        if wall.orientation == "vertical"
        else max(opening.bbox[2], opening.bbox[3]) * UPSCALE_FACTOR
    )
    wall_thickness_px = max(4.0, float((wall.visual_thickness or wall.thickness or _median_wall_thickness(snapshot)) * UPSCALE_FACTOR))
    scale = _positive_scale(snapshot)
    tangent_cap = scale * MAX_DOOR_CLOSURE_TANGENT_FT * UPSCALE_FACTOR if scale > 0 else 80.0
    half_length = min(max(opening_span_px / 2.0, wall_thickness_px * 0.7), tangent_cap / 2.0) + max(2.0, wall_thickness_px * 0.15)
    half_thickness = (wall_thickness_px / 2.0) + 1.5
    _draw_oriented_rect(mask, center, tangent, normal, half_length, half_thickness)


def _seal_unhosted_door_locally(mask: np.ndarray, opening: NormalizedOpening) -> bool:
    x, y, width, height = opening.bbox
    x0 = max(0, int(round(x * UPSCALE_FACTOR)) - 4)
    y0 = max(0, int(round(y * UPSCALE_FACTOR)) - 4)
    x1 = min(mask.shape[1], int(round((x + width) * UPSCALE_FACTOR)) + 5)
    y1 = min(mask.shape[0], int(round((y + height) * UPSCALE_FACTOR)) + 5)
    if x1 - x0 < 3 or y1 - y0 < 3:
        return False

    kernel_size = max(3, min(7, ((min(width, height) * UPSCALE_FACTOR) // 2) | 1))
    kernel = np.ones((kernel_size, kernel_size), dtype=np.uint8)
    roi = mask[y0:y1, x0:x1]
    healed = cv2.morphologyEx(roi, cv2.MORPH_CLOSE, kernel)
    changed = bool(np.any(healed > roi))
    mask[y0:y1, x0:x1] = healed
    return changed


def seal_hosted_openings_for_area(
    snapshot: TakeoffGeometrySnapshot,
    mask: np.ndarray,
    *,
    door_only: bool = False,
    wall_aware: bool = False,
) -> dict[str, int]:
    wall_lookup = {wall.id: wall for wall in snapshot.walls}
    max_x = mask.shape[1] - 1
    max_y = mask.shape[0] - 1
    stats = {
        "hosted_door_closures": 0,
        "inferred_door_closures": 0,
        "local_door_closures": 0,
        "bbox_opening_fills": 0,
    }

    for opening in snapshot.openings:
        if door_only and opening.tag_class != "door":
            continue

        if wall_aware and opening.tag_class == "door":
            host_wall = wall_lookup.get(opening.wall_id or "")
            inferred = False
            if host_wall is None:
                host_wall = _infer_host_wall_for_opening(opening, snapshot.walls, snapshot)
                inferred = host_wall is not None
            if host_wall is not None:
                _draw_hosted_door_closure(mask, opening, host_wall, snapshot)
                if inferred or not opening.matched:
                    stats["inferred_door_closures"] += 1
                else:
                    stats["hosted_door_closures"] += 1
                continue
            if _seal_unhosted_door_locally(mask, opening):
                stats["local_door_closures"] += 1
                continue
            if door_only:
                continue

        x, y, width, height = opening.bbox
        x0 = max(0, min(max_x, int(round(x * UPSCALE_FACTOR))))
        y0 = max(0, min(max_y, int(round(y * UPSCALE_FACTOR))))
        x1 = max(0, min(max_x, int(round((x + width) * UPSCALE_FACTOR))))
        y1 = max(0, min(max_y, int(round((y + height) * UPSCALE_FACTOR))))
        cv2.rectangle(mask, (x0, y0), (x1, y1), 255, -1)
        stats["bbox_opening_fills"] += 1

    return stats


def summarize_boundary_gaps(snapshot: TakeoffGeometrySnapshot) -> dict[str, float | int]:
    gap_lengths = [float(gap) for gap in snapshot.open_boundary_gaps if gap > 0]
    return {
        "unclosed_gap_count": len(gap_lengths),
        "largest_boundary_gap_px": max(gap_lengths, default=0.0),
    }


def _wall_inward_vector(wall: NormalizedWall, point: tuple[int, int]) -> tuple[float, float]:
    if point == wall.start:
        dx = float(wall.end[0] - wall.start[0])
        dy = float(wall.end[1] - wall.start[1])
    else:
        dx = float(wall.start[0] - wall.end[0])
        dy = float(wall.start[1] - wall.end[1])
    length = hypot(dx, dy)
    if length <= 0:
        return 0.0, 0.0
    return dx / length, dy / length


def _endpoint_records(snapshot: TakeoffGeometrySnapshot) -> list[_EndpointRecord]:
    endpoint_degree: dict[tuple[int, int], int] = {}
    endpoint_walls: dict[tuple[int, int], NormalizedWall] = {}
    for wall in snapshot.walls:
        endpoint_degree[wall.start] = endpoint_degree.get(wall.start, 0) + 1
        endpoint_degree[wall.end] = endpoint_degree.get(wall.end, 0) + 1
        endpoint_walls[wall.start] = wall
        endpoint_walls[wall.end] = wall

    records: list[_EndpointRecord] = []
    for point, degree in endpoint_degree.items():
        if degree > 1:
            continue
        wall = endpoint_walls.get(point)
        if wall is None or wall.orientation == "angled":
            continue
        records.append(_EndpointRecord(
            point=point,
            wall=wall,
            orientation=wall.orientation,
            inward=_wall_inward_vector(wall, point),
        ))
    return records


def _endpoint_pair_allowed(
    left: _EndpointRecord,
    right: _EndpointRecord,
    *,
    max_gap_px: float,
    axis_tol_px: float,
) -> bool:
    if left.orientation != right.orientation:
        return False

    dx = float(right.point[0] - left.point[0])
    dy = float(right.point[1] - left.point[1])
    distance = hypot(dx, dy)
    if distance <= 0 or distance > max_gap_px:
        return False

    if left.orientation == "horizontal":
        if abs(dy) > axis_tol_px or abs(dx) < abs(dy) * 2:
            return False
    else:
        if abs(dx) > axis_tol_px or abs(dy) < abs(dx) * 2:
            return False

    direction = (dx / distance, dy / distance)
    if (left.inward[0] * direction[0] + left.inward[1] * direction[1]) < 0.55:
        return False
    if (right.inward[0] * -direction[0] + right.inward[1] * -direction[1]) < 0.55:
        return False
    return True


def _seal_open_endpoint_gaps(
    snapshot: TakeoffGeometrySnapshot,
    mask: np.ndarray,
    *,
    max_topology_repair_ft: float = MAX_TOPOLOGY_REPAIR_FT,
) -> dict[str, float | int]:
    records = _endpoint_records(snapshot)
    if len(records) < 2:
        return {
            "count": 0,
            "max_gap_px": 0.0,
            "total_gap_px": 0.0,
        }

    scale = _positive_scale(snapshot)
    max_gap_px_cap = 60.0 if max_topology_repair_ft > MAX_TOPOLOGY_REPAIR_FT else 28.0
    max_gap_px = min(scale * max_topology_repair_ft if scale > 0 else 24.0, max_gap_px_cap)
    axis_tol_px = max(2.0, min(6.0, scale * 0.2 if scale > 0 else 4.0))
    median_thickness = _median_wall_thickness(snapshot)
    line_thickness = max(1, int(round(median_thickness * UPSCALE_FACTOR)))

    best_for_index: dict[int, tuple[int, float]] = {}
    for i, left in enumerate(records):
        candidate_index = -1
        candidate_distance = float("inf")
        for j, right in enumerate(records):
            if i == j:
                continue
            if not _endpoint_pair_allowed(left, right, max_gap_px=max_gap_px, axis_tol_px=axis_tol_px):
                continue
            distance = hypot(right.point[0] - left.point[0], right.point[1] - left.point[1])
            if distance < candidate_distance:
                candidate_distance = distance
                candidate_index = j
        if candidate_index >= 0:
            best_for_index[i] = (candidate_index, candidate_distance)

    count = 0
    total_gap_px = 0.0
    max_repaired_gap_px = 0.0
    used: set[int] = set()
    for i, (j, distance) in sorted(best_for_index.items(), key=lambda item: item[1][1]):
        if i in used or j in used:
            continue
        reverse = best_for_index.get(j)
        if not reverse or reverse[0] != i:
            continue
        a = (int(round(records[i].point[0] * UPSCALE_FACTOR)), int(round(records[i].point[1] * UPSCALE_FACTOR)))
        b = (int(round(records[j].point[0] * UPSCALE_FACTOR)), int(round(records[j].point[1] * UPSCALE_FACTOR)))
        cv2.line(mask, a, b, 255, line_thickness, cv2.LINE_8)
        used.add(i)
        used.add(j)
        count += 1
        total_gap_px += distance
        max_repaired_gap_px = max(max_repaired_gap_px, distance)

    return {
        "count": count,
        "max_gap_px": round(max_repaired_gap_px, 4),
        "total_gap_px": round(total_gap_px, 4),
    }


def _healing_kernel_size(snapshot: TakeoffGeometrySnapshot, *, multiplier: float = 1.0) -> int:
    scale = _positive_scale(snapshot)
    median_thickness = _median_wall_thickness(snapshot)
    raw = max(3.0, min(9.0, (median_thickness * UPSCALE_FACTOR * 0.4) + (scale * 0.06 if scale > 0 else 0.0)))
    size = int(round(raw * max(1.0, multiplier)))
    if size % 2 == 0:
        size += 1
    return max(3, min(17, size))


def _heal_small_boundary_gaps(mask: np.ndarray, kernel_size: int = AREA_HEAL_KERNEL_SIZE, *, iterations: int = 1) -> np.ndarray:
    kernel = np.ones((kernel_size, kernel_size), dtype=np.uint8)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=max(1, iterations))


def _distance_point_to_segment(
    px: float,
    py: float,
    start: tuple[int, int],
    end: tuple[int, int],
) -> float:
    x1, y1 = start
    x2, y2 = end
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / float(dx * dx + dy * dy)))
    cx = x1 + t * dx
    cy = y1 + t * dy
    return hypot(px - cx, py - cy)


def _shoelace_area(points: list[tuple[int, int]]) -> float:
    if len(points) < 3:
        return 0.0
    area = 0.0
    for index, (x1, y1) in enumerate(points):
        x2, y2 = points[(index + 1) % len(points)]
        area += (x1 * y2) - (x2 * y1)
    return abs(area) / 2.0


def _polygon_centroid(points: list[tuple[int, int]]) -> tuple[float, float]:
    if len(points) < 3:
        if not points:
            return 0.0, 0.0
        mean_x = sum(point[0] for point in points) / len(points)
        mean_y = sum(point[1] for point in points) / len(points)
        return float(mean_x), float(mean_y)

    signed_area = 0.0
    cx = 0.0
    cy = 0.0
    for index, (x1, y1) in enumerate(points):
        x2, y2 = points[(index + 1) % len(points)]
        cross = (x1 * y2) - (x2 * y1)
        signed_area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross

    if abs(signed_area) < 1e-6:
        mean_x = sum(point[0] for point in points) / len(points)
        mean_y = sum(point[1] for point in points) / len(points)
        return float(mean_x), float(mean_y)

    signed_area *= 0.5
    return float(cx / (6.0 * signed_area)), float(cy / (6.0 * signed_area))


def _polygon_bounds(points: list[tuple[int, int]]) -> tuple[int, int, int, int]:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def _point_in_polygon(point: tuple[float, float], polygon: list[tuple[int, int]]) -> bool:
    if len(polygon) < 3:
        return False
    x, y = point
    inside = False
    for index, (x1, y1) in enumerate(polygon):
        x2, y2 = polygon[(index + 1) % len(polygon)]
        intersects = ((y1 > y) != (y2 > y)) and (
            x < ((x2 - x1) * (y - y1) / ((y2 - y1) or 1e-9)) + x1
        )
        if intersects:
            inside = not inside
    return inside


def _rect_to_polygon(geometry: dict[str, Any]) -> list[tuple[int, int]]:
    x = int(round(float(geometry.get("x", 0))))
    y = int(round(float(geometry.get("y", 0))))
    width = max(1, int(round(float(geometry.get("width", 0)))))
    height = max(1, int(round(float(geometry.get("height", 0)))))
    return [
        (x, y),
        (x + width, y),
        (x + width, y + height),
        (x, y + height),
    ]


def _room_geometry_points(element: dict[str, Any]) -> list[tuple[int, int]]:
    geometry = element.get("geometry")
    if not isinstance(geometry, dict):
        return []
    if geometry.get("kind") == "polygon":
        points = geometry.get("points")
        if not isinstance(points, list):
            return []
        result: list[tuple[int, int]] = []
        for point in points:
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                continue
            try:
                result.append((int(round(float(point[0]))), int(round(float(point[1])))))
            except (TypeError, ValueError):
                continue
        return result
    if geometry.get("kind") == "rect":
        return _rect_to_polygon(geometry)
    return []


def _extract_existing_room_metadata(document: dict[str, Any]) -> list[dict[str, Any]]:
    raw_elements = document.get("elements") if isinstance(document, dict) else []
    if not isinstance(raw_elements, list):
        return []

    existing: list[dict[str, Any]] = []
    for element in raw_elements:
        if not isinstance(element, dict) or element.get("type") != "room":
            continue
        polygon = _room_geometry_points(element)
        if len(polygon) < 3:
            continue
        attrs = element.get("attrs") if isinstance(element.get("attrs"), dict) else {}
        relations = element.get("relations") if isinstance(element.get("relations"), dict) else {}
        existing.append({
            "id": str(element.get("id") or ""),
            "polygon": polygon,
            "centroid": _polygon_centroid(polygon),
            "bbox": _polygon_bounds(polygon),
            "attrs": dict(attrs),
            "relations": dict(relations),
        })
    return existing


def _bbox_iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ix0 = max(a[0], b[0])
    iy0 = max(a[1], b[1])
    ix1 = min(a[2], b[2])
    iy1 = min(a[3], b[3])
    intersection = max(0, ix1 - ix0) * max(0, iy1 - iy0)
    if intersection <= 0:
        return 0.0
    a_area = max(1, (a[2] - a[0]) * (a[3] - a[1]))
    b_area = max(1, (b[2] - b[0]) * (b[3] - b[1]))
    return float(intersection / max(1, a_area + b_area - intersection))


def _match_existing_room(
    polygon: list[tuple[int, int]],
    existing_rooms: list[dict[str, Any]],
    used_ids: set[str],
) -> dict[str, Any] | None:
    centroid = _polygon_centroid(polygon)
    bbox = _polygon_bounds(polygon)
    best: dict[str, Any] | None = None
    best_score = 0.0

    for existing in existing_rooms:
        existing_id = str(existing.get("id") or "")
        if not existing_id or existing_id in used_ids:
            continue

        existing_polygon = existing.get("polygon")
        if not isinstance(existing_polygon, list):
            continue

        contains_score = 0.0
        if _point_in_polygon(centroid, existing_polygon):
            contains_score += 1.0
        existing_centroid = existing.get("centroid")
        if isinstance(existing_centroid, tuple) and _point_in_polygon(existing_centroid, polygon):
            contains_score += 1.0

        score = contains_score + _bbox_iou(bbox, existing.get("bbox", bbox))
        if score > best_score:
            best_score = score
            best = existing

    return best if best_score > 0.2 else None


def _dedupe_polygon_points(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not points:
        return []
    deduped: list[tuple[int, int]] = []
    for point in points:
        if deduped and deduped[-1] == point:
            continue
        deduped.append(point)
    if len(deduped) > 1 and deduped[0] == deduped[-1]:
        deduped.pop()
    return deduped


def _remove_short_edges(points: list[tuple[int, int]], min_edge_px: float = 4.0) -> list[tuple[int, int]]:
    if len(points) < 4:
        return points
    cleaned = list(points)
    changed = True
    while changed and len(cleaned) > 4:
        changed = False
        next_points: list[tuple[int, int]] = []
        for index, point in enumerate(cleaned):
            prev_point = cleaned[index - 1]
            next_point = cleaned[(index + 1) % len(cleaned)]
            if hypot(point[0] - prev_point[0], point[1] - prev_point[1]) < min_edge_px:
                changed = True
                continue
            if hypot(next_point[0] - point[0], next_point[1] - point[1]) < min_edge_px:
                changed = True
                continue
            next_points.append(point)
        if next_points:
            cleaned = next_points
    return cleaned


def _remove_nearly_collinear(points: list[tuple[int, int]], cross_tol_px: float = 6.0) -> list[tuple[int, int]]:
    if len(points) < 4:
        return points
    cleaned: list[tuple[int, int]] = []
    for index, point in enumerate(points):
        prev_point = points[index - 1]
        next_point = points[(index + 1) % len(points)]
        cross = abs((point[0] - prev_point[0]) * (next_point[1] - point[1]) - (point[1] - prev_point[1]) * (next_point[0] - point[0]))
        if cross <= cross_tol_px:
            continue
        cleaned.append(point)
    return cleaned if len(cleaned) >= 4 else points


def _orthogonalize_polygon(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if len(points) < 3:
        return points

    adjusted = list(points)
    for index, point in enumerate(list(adjusted)):
        next_point = adjusted[(index + 1) % len(adjusted)]
        dx = next_point[0] - point[0]
        dy = next_point[1] - point[1]
        if dx == 0 and dy == 0:
            continue
        if abs(dx) >= abs(dy) * 2:
            avg_y = int(round((point[1] + next_point[1]) / 2))
            adjusted[index] = (adjusted[index][0], avg_y)
            adjusted[(index + 1) % len(adjusted)] = (adjusted[(index + 1) % len(adjusted)][0], avg_y)
        elif abs(dy) >= abs(dx) * 2:
            avg_x = int(round((point[0] + next_point[0]) / 2))
            adjusted[index] = (avg_x, adjusted[index][1])
            adjusted[(index + 1) % len(adjusted)] = (avg_x, adjusted[(index + 1) % len(adjusted)][1])

    return _dedupe_polygon_points(adjusted)


def _snap_polygon_to_wall_guides(
    points: list[tuple[int, int]],
    snapshot: TakeoffGeometrySnapshot,
    bbox: tuple[int, int, int, int],
) -> list[tuple[int, int]]:
    if len(points) < 3:
        return points

    median_thickness = _median_wall_thickness(snapshot)
    tolerance = max(4.0, min(14.0, median_thickness))
    expanded_bbox = (
        bbox[0] - int(round(tolerance)),
        bbox[1] - int(round(tolerance)),
        bbox[2] + int(round(tolerance)),
        bbox[3] + int(round(tolerance)),
    )
    x_guides: list[float] = []
    y_guides: list[float] = []
    for wall in snapshot.walls:
        if not _bbox_intersects(_wall_bbox(wall, tolerance), expanded_bbox):
            continue
        if wall.orientation == "vertical":
            x_guides.extend([wall.start[0], wall.end[0]])
        elif wall.orientation == "horizontal":
            y_guides.extend([wall.start[1], wall.end[1]])

    snapped: list[tuple[int, int]] = []
    for x, y in points:
        next_x = x
        next_y = y
        if x_guides:
            guide_x = min(x_guides, key=lambda value: abs(value - x))
            if abs(guide_x - x) <= tolerance:
                next_x = int(round(guide_x))
        if y_guides:
            guide_y = min(y_guides, key=lambda value: abs(value - y))
            if abs(guide_y - y) <= tolerance:
                next_y = int(round(guide_y))
        snapped.append((next_x, next_y))
    return snapped


def _nearby_wall_distance(
    point: tuple[int, int],
    snapshot: TakeoffGeometrySnapshot,
    bbox: tuple[int, int, int, int],
) -> float:
    tolerance = max(8.0, min(18.0, _median_wall_thickness(snapshot) * 1.25))
    expanded_bbox = (
        bbox[0] - int(round(tolerance)),
        bbox[1] - int(round(tolerance)),
        bbox[2] + int(round(tolerance)),
        bbox[3] + int(round(tolerance)),
    )
    distances = [
        _distance_point_to_segment(point[0], point[1], wall.start, wall.end)
        for wall in snapshot.walls
        if _bbox_intersects(_wall_bbox(wall, tolerance), expanded_bbox)
    ]
    return min(distances) if distances else float("inf")


def _rectify_diagonal_edges(
    points: list[tuple[int, int]],
    snapshot: TakeoffGeometrySnapshot,
    bbox: tuple[int, int, int, int],
) -> list[tuple[int, int]]:
    if len(points) < 3:
        return points

    rectified: list[tuple[int, int]] = []
    for index, point in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        rectified.append(point)
        if point[0] == next_point[0] or point[1] == next_point[1]:
            continue

        elbows = [
            (next_point[0], point[1]),
            (point[0], next_point[1]),
        ]
        scored = sorted(
            (
                (_nearby_wall_distance(candidate, snapshot, bbox), candidate)
                for candidate in elbows
                if candidate != point and candidate != next_point
            ),
            key=lambda item: item[0],
        )
        if scored:
            rectified.append(scored[0][1])
    return _dedupe_polygon_points(rectified)


def _segments_intersect(
    a1: tuple[int, int],
    a2: tuple[int, int],
    b1: tuple[int, int],
    b2: tuple[int, int],
) -> bool:
    def orient(p: tuple[int, int], q: tuple[int, int], r: tuple[int, int]) -> int:
        value = ((q[1] - p[1]) * (r[0] - q[0])) - ((q[0] - p[0]) * (r[1] - q[1]))
        if value == 0:
            return 0
        return 1 if value > 0 else 2

    def on_segment(p: tuple[int, int], q: tuple[int, int], r: tuple[int, int]) -> bool:
        return min(p[0], r[0]) <= q[0] <= max(p[0], r[0]) and min(p[1], r[1]) <= q[1] <= max(p[1], r[1])

    o1 = orient(a1, a2, b1)
    o2 = orient(a1, a2, b2)
    o3 = orient(b1, b2, a1)
    o4 = orient(b1, b2, a2)
    if o1 != o2 and o3 != o4:
        return True
    if o1 == 0 and on_segment(a1, b1, a2):
        return True
    if o2 == 0 and on_segment(a1, b2, a2):
        return True
    if o3 == 0 and on_segment(b1, a1, b2):
        return True
    if o4 == 0 and on_segment(b1, a2, b2):
        return True
    return False


def _polygon_self_intersects(points: list[tuple[int, int]]) -> bool:
    if len(points) < 4:
        return False
    for i in range(len(points)):
        a1 = points[i]
        a2 = points[(i + 1) % len(points)]
        for j in range(i + 1, len(points)):
            if abs(i - j) <= 1 or (i == 0 and j == len(points) - 1):
                continue
            b1 = points[j]
            b2 = points[(j + 1) % len(points)]
            if _segments_intersect(a1, a2, b1, b2):
                return True
    return False


def _polygon_orthogonality_ratio(points: list[tuple[int, int]]) -> float:
    if len(points) < 3:
        return 0.0
    orthogonal = 0
    total = 0
    for index, point in enumerate(points):
        prev_point = points[index - 1]
        next_point = points[(index + 1) % len(points)]
        ax = prev_point[0] - point[0]
        ay = prev_point[1] - point[1]
        bx = next_point[0] - point[0]
        by = next_point[1] - point[1]
        len_a = hypot(ax, ay)
        len_b = hypot(bx, by)
        if len_a <= 0 or len_b <= 0:
            continue
        cosine = max(-1.0, min(1.0, ((ax * bx) + (ay * by)) / (len_a * len_b)))
        angle = float(np.degrees(np.arccos(cosine)))
        total += 1
        if abs(angle - 90.0) <= 18.0 or abs(angle - 180.0) <= 18.0:
            orthogonal += 1
    return float(orthogonal / total) if total else 0.0


def _polygon_aspect_ratio(points: list[tuple[int, int]]) -> float:
    bbox = _polygon_bounds(points)
    width = max(1.0, float(bbox[2] - bbox[0]))
    height = max(1.0, float(bbox[3] - bbox[1]))
    return min(width, height) / max(width, height)


def _boundary_support_ratio(points: list[tuple[int, int]], snapshot: TakeoffGeometrySnapshot) -> float:
    if len(points) < 3 or not snapshot.walls:
        return 0.0

    median_thickness = _median_wall_thickness(snapshot)
    tolerance = max(5.0, min(ROOM_SUPPORT_DISTANCE_PX, median_thickness))
    supported = 0
    sampled = 0

    for index, start in enumerate(points):
        end = points[(index + 1) % len(points)]
        edge_length = hypot(end[0] - start[0], end[1] - start[1])
        sample_count = max(2, int(round(edge_length / 24.0)))
        for sample_index in range(sample_count):
            t = (sample_index + 0.5) / sample_count
            px = start[0] + ((end[0] - start[0]) * t)
            py = start[1] + ((end[1] - start[1]) * t)
            sampled += 1
            nearest = min(_distance_point_to_segment(px, py, wall.start, wall.end) for wall in snapshot.walls)
            if nearest <= tolerance:
                supported += 1
    return float(supported / sampled) if sampled else 0.0


def _clean_polygon(points: list[tuple[int, int]], snapshot: TakeoffGeometrySnapshot, bbox: tuple[int, int, int, int]) -> list[tuple[int, int]]:
    current = _dedupe_polygon_points(points)
    current = _remove_short_edges(current)
    current = _remove_nearly_collinear(current)
    current = _snap_polygon_to_wall_guides(current, snapshot, bbox)
    current = _rectify_diagonal_edges(current, snapshot, bbox)
    current = _orthogonalize_polygon(current)
    current = _snap_polygon_to_wall_guides(current, snapshot, bbox)
    current = _remove_short_edges(current)
    current = _remove_nearly_collinear(current)
    return _dedupe_polygon_points(current)


def _mask_bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask > 0)
    if len(xs) == 0 or len(ys) == 0:
        return 0, 0, 0, 0
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def _component_polygon(
    component_mask: np.ndarray,
    width_px: int,
    height_px: int,
    snapshot: TakeoffGeometrySnapshot,
) -> list[tuple[int, int]]:
    contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    contour = max(contours, key=cv2.contourArea)
    perimeter = cv2.arcLength(contour, True)
    epsilon = max(POLYGON_SIMPLIFY_MIN_PX, perimeter * POLYGON_SIMPLIFY_RATIO)
    approx = cv2.approxPolyDP(contour, epsilon, True)

    points: list[tuple[int, int]] = []
    for raw_point in approx.reshape(-1, 2):
        x = int(round((raw_point[0] - 1) / UPSCALE_FACTOR))
        y = int(round((raw_point[1] - 1) / UPSCALE_FACTOR))
        x = max(0, min(width_px, x))
        y = max(0, min(height_px, y))
        points.append((x, y))

    if len(points) < 3:
        return []
    raw_bbox = _polygon_bounds(points)
    return _clean_polygon(points, snapshot, raw_bbox)


def _region_area_sqft(area_px: float, scale_px_per_ft: float) -> float:
    return float(area_px / (scale_px_per_ft ** 2)) if scale_px_per_ft > 0 else 0.0


def _wall_is_interior_barrier(
    wall: NormalizedWall,
    region_mask: np.ndarray,
    snapshot: TakeoffGeometrySnapshot,
) -> bool:
    if wall.orientation == "angled":
        return False

    thickness = max(1.0, float((wall.visual_thickness or wall.thickness or _median_wall_thickness(snapshot)) * UPSCALE_FACTOR))
    start = np.array([float(wall.start[0] * UPSCALE_FACTOR + 1), float(wall.start[1] * UPSCALE_FACTOR + 1)])
    end = np.array([float(wall.end[0] * UPSCALE_FACTOR + 1), float(wall.end[1] * UPSCALE_FACTOR + 1)])
    direction = end - start
    length = float(np.linalg.norm(direction))
    if length <= 0:
        return False
    tangent = direction / length
    normal = np.array([-tangent[1], tangent[0]])
    midpoint = (start + end) / 2.0
    offset = max(4.0, thickness * 0.9)
    left_probe = midpoint + (normal * offset)
    right_probe = midpoint - (normal * offset)
    return _sample_mask(region_mask, (left_probe[0], left_probe[1])) > 0 and _sample_mask(region_mask, (right_probe[0], right_probe[1])) > 0


def _draw_wall_barriers_for_region(
    barrier_mask: np.ndarray,
    snapshot: TakeoffGeometrySnapshot,
    region_mask: np.ndarray,
    region_bbox: tuple[int, int, int, int],
) -> tuple[int, set[str]]:
    scale = _positive_scale(snapshot)
    min_wall_length_px = scale * INTERIOR_SPLIT_WALL_MIN_FT if scale > 0 else 30.0
    count = 0
    wall_ids: set[str] = set()

    for wall in snapshot.walls:
        if wall.length_px < min_wall_length_px:
            continue
        if not _bbox_intersects(_wall_bbox(wall, 12.0, upscale=True), region_bbox):
            continue
        if not _wall_is_interior_barrier(wall, region_mask, snapshot):
            continue
        thickness = max(1, int(round((wall.visual_thickness or wall.thickness or _median_wall_thickness(snapshot)) * UPSCALE_FACTOR * 1.15)))
        extension = max(12, int(round(thickness * 2.0)))
        start = np.array([float(wall.start[0] * UPSCALE_FACTOR + 1), float(wall.start[1] * UPSCALE_FACTOR + 1)])
        end = np.array([float(wall.end[0] * UPSCALE_FACTOR + 1), float(wall.end[1] * UPSCALE_FACTOR + 1)])
        direction = end - start
        length = float(np.linalg.norm(direction))
        if length <= 0:
            continue
        unit = direction / length
        start = start - (unit * extension)
        end = end + (unit * extension)
        cv2.line(
            barrier_mask,
            (int(round(start[0])), int(round(start[1]))),
            (int(round(end[0])), int(round(end[1]))),
            255,
            thickness,
            cv2.LINE_8,
        )
        count += 1
        wall_ids.add(wall.id)
    return count, wall_ids


def _draw_door_barriers_for_region(
    barrier_mask: np.ndarray,
    snapshot: TakeoffGeometrySnapshot,
    region_bbox: tuple[int, int, int, int],
    wall_ids: set[str],
) -> int:
    if not wall_ids:
        return 0

    wall_lookup = {wall.id: wall for wall in snapshot.walls}
    count = 0
    for opening in snapshot.openings:
        if opening.tag_class != "door":
            continue
        opening_bbox = _opening_bbox_upscaled(opening)
        if not _bbox_intersects(opening_bbox, region_bbox):
            continue
        host_wall = wall_lookup.get(opening.wall_id or "")
        if host_wall is None:
            host_wall = _infer_host_wall_for_opening(opening, snapshot.walls, snapshot)
        if host_wall is None or host_wall.id not in wall_ids:
            continue
        _draw_hosted_door_closure(barrier_mask, opening, host_wall, snapshot)
        count += 1
    return count


def _region_subcomponents(region_mask: np.ndarray, min_area_px: int) -> list[np.ndarray]:
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats((region_mask > 0).astype(np.uint8), connectivity=4)
    components: list[np.ndarray] = []
    for label in range(1, num_labels):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < min_area_px:
            continue
        component = np.zeros_like(region_mask, dtype=np.uint8)
        component[labels == label] = 255
        components.append(component)
    return components


def _split_region_with_internal_walls(
    region_mask: np.ndarray,
    snapshot: TakeoffGeometrySnapshot,
    min_area_px: int,
) -> tuple[list[np.ndarray], int, int]:
    barrier_mask = np.zeros_like(region_mask, dtype=np.uint8)
    wall_count, wall_ids = _draw_wall_barriers_for_region(barrier_mask, snapshot, region_mask, _mask_bbox(region_mask))
    door_count = _draw_door_barriers_for_region(barrier_mask, snapshot, _mask_bbox(region_mask), wall_ids)
    if wall_count == 0:
        return [region_mask], 0, door_count

    dilate_size = max(3, int(round(_median_wall_thickness(snapshot) * UPSCALE_FACTOR * 0.55)))
    if dilate_size % 2 == 0:
        dilate_size += 1
    barrier_kernel = np.ones((dilate_size, dilate_size), dtype=np.uint8)
    barrier_mask = cv2.dilate(barrier_mask, barrier_kernel, iterations=1)

    carved = region_mask.copy()
    carved[barrier_mask > 0] = 0
    components = _region_subcomponents(carved, min_area_px)
    if len(components) <= 1:
        return [region_mask], wall_count, door_count
    return components, wall_count, door_count


def _split_region_with_watershed(region_mask: np.ndarray, min_area_px: int) -> list[np.ndarray]:
    region_binary = (region_mask > 0).astype(np.uint8)
    if int(region_binary.sum()) <= 0:
        return [region_mask]

    distance = cv2.distanceTransform(region_binary, cv2.DIST_L2, 5)
    if float(distance.max()) < 4.0:
        return [region_mask]

    _, sure_fg = cv2.threshold(distance, 0.48 * float(distance.max()), 255, 0)
    sure_fg = sure_fg.astype(np.uint8)
    sure_fg = cv2.morphologyEx(sure_fg, cv2.MORPH_OPEN, np.ones((3, 3), dtype=np.uint8))
    marker_count, markers = cv2.connectedComponents(sure_fg)
    if marker_count <= 2 or marker_count > WATERSHED_MAX_SEGMENTS:
        return [region_mask]

    markers = markers + 1
    markers[region_binary == 0] = 0
    topography = cv2.normalize((distance.max() - distance), None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    water_input = cv2.cvtColor(topography, cv2.COLOR_GRAY2BGR)
    markers = cv2.watershed(water_input, markers)

    components: list[np.ndarray] = []
    for label in np.unique(markers):
        if label <= 1:
            continue
        component = np.zeros_like(region_mask, dtype=np.uint8)
        component[(markers == label) & (region_binary > 0)] = 255
        if int(np.count_nonzero(component)) < min_area_px:
            continue
        components.append(component)
    return components if len(components) > 1 else [region_mask]


def _should_try_split(
    area_sqft: float,
    total_area_sqft: float,
    bbox: tuple[int, int, int, int],
    scale_px_per_ft: float,
) -> bool:
    if area_sqft >= OVERSIZED_ROOM_AREA_SQFT:
        return True
    if total_area_sqft > 0 and area_sqft >= total_area_sqft * OVERSIZED_ROOM_TOTAL_AREA_RATIO:
        return True
    if scale_px_per_ft > 0:
        width_ft = max(0.0, (bbox[2] - bbox[0]) / scale_px_per_ft)
        height_ft = max(0.0, (bbox[3] - bbox[1]) / scale_px_per_ft)
        if max(width_ft, height_ft) >= 26.0 and area_sqft >= 250.0:
            return True
    return False


def _validate_room_polygon(
    polygon: list[tuple[int, int]],
    snapshot: TakeoffGeometrySnapshot,
    *,
    area_px: float,
    scale_px_per_ft: float,
    touches_border: bool,
) -> tuple[bool, str, dict[str, float | int | str | bool]]:
    if len(polygon) < 4:
        return False, "triangle_or_underfit", {"vertex_count": len(polygon)}

    if touches_border:
        return False, "touches_border", {"touches_border": True}

    if _polygon_self_intersects(polygon):
        return False, "self_intersection", {"vertex_count": len(polygon)}

    orthogonality_ratio = _polygon_orthogonality_ratio(polygon)
    if orthogonality_ratio < ORTHOGONAL_MIN_RATIO:
        return False, "non_orthogonal", {"orthogonality_ratio": round(orthogonality_ratio, 4)}

    support_ratio = _boundary_support_ratio(polygon, snapshot)
    if support_ratio < ROOM_SUPPORT_MIN_RATIO:
        return False, "weak_wall_support", {"boundary_support_ratio": round(support_ratio, 4)}

    aspect_ratio = _polygon_aspect_ratio(polygon)
    if aspect_ratio < 0.035:
        return False, "extremely_thin", {"aspect_ratio": round(aspect_ratio, 4)}

    bbox = _polygon_bounds(polygon)
    bbox_area = max(1.0, float((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])))
    fill_ratio = float(area_px / bbox_area)
    if fill_ratio < 0.16:
        return False, "spiky_or_underfilled", {"fill_ratio": round(fill_ratio, 4)}

    area_sqft = _region_area_sqft(area_px, scale_px_per_ft)
    return True, "accepted", {
        "orthogonality_ratio": round(orthogonality_ratio, 4),
        "boundary_support_ratio": round(support_ratio, 4),
        "aspect_ratio": round(aspect_ratio, 4),
        "fill_ratio": round(fill_ratio, 4),
        "area_sqft": round(area_sqft, 4),
    }


def _dedupe_rooms(rooms: list[ExtractedRoom]) -> list[ExtractedRoom]:
    deduped: list[ExtractedRoom] = []
    for room in sorted(rooms, key=lambda candidate: (candidate.extraction_confidence, candidate.area_sqft), reverse=True):
        if any(_bbox_iou(room.bbox, existing.bbox) > 0.9 for existing in deduped):
            continue
        deduped.append(room)
    return list(sorted(deduped, key=lambda room: room.id))


def _extract_room_regions_pass(
    snapshot: TakeoffGeometrySnapshot,
    *,
    existing_document: dict[str, Any] | None = None,
    extraction_pass: Literal["strict", "fallback"] = "strict",
    max_topology_repair_ft: float = MAX_TOPOLOGY_REPAIR_FT,
    heal_kernel_multiplier: float = 1.0,
    heal_iterations: int = 1,
    use_alternate_closure: bool = False,
) -> RoomExtractionResult:
    if not snapshot.walls:
        return RoomExtractionResult(
            rooms=[],
            status="open",
            confidence="low",
            total_area_sqft=0.0,
            debug={"reason": "no_walls", "extraction_pass": extraction_pass},
        )

    width_px, height_px = _mask_dimensions(snapshot)
    scale_px_per_ft = _positive_scale(snapshot)
    base_mask = build_wall_mask_from_snapshot(snapshot)
    door_debug = seal_hosted_openings_for_area(snapshot, base_mask, door_only=True, wall_aware=True)
    repair_debug = _seal_open_endpoint_gaps(snapshot, base_mask, max_topology_repair_ft=max_topology_repair_ft)
    kernel_size = _healing_kernel_size(snapshot, multiplier=heal_kernel_multiplier)
    if use_alternate_closure:
        effective_scale = (scale_px_per_ft or 0.0) * UPSCALE_FACTOR
        target_gap_px = max(kernel_size * 2, int(round(max(1.0, effective_scale * 1.6))))
        dilate_kernel_size = max(kernel_size, min(41, int(round(max(kernel_size, effective_scale * 0.42))) | 1))
        dilate_kernel = np.ones((dilate_kernel_size, dilate_kernel_size), dtype=np.uint8)
        morph_iterations = max(2, int(round(target_gap_px / max(1, dilate_kernel_size))))
        dilated = cv2.dilate(base_mask, dilate_kernel, iterations=morph_iterations)
        healed_mask = cv2.erode(dilated, dilate_kernel, iterations=morph_iterations)
        kernel_size = dilate_kernel_size
        heal_iterations = morph_iterations
    else:
        healed_mask = _heal_small_boundary_gaps(base_mask, kernel_size, iterations=heal_iterations)

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

    min_region_area_px = int(round(max(1.0, MIN_ROOM_REGION_SQFT) * ((scale_px_per_ft or 1.0) * UPSCALE_FACTOR) ** 2))
    total_interior_area_px = sum(
        int(stats[label, cv2.CC_STAT_AREA])
        for label in range(1, num_labels)
        if label not in border_labels
    )
    total_interior_area_sqft = _region_area_sqft(float(total_interior_area_px), scale_px_per_ft * UPSCALE_FACTOR)
    existing_rooms = _extract_existing_room_metadata(existing_document or {})
    used_existing_ids: set[str] = set()
    closure = compute_enclosed_regions(snapshot)

    rooms: list[ExtractedRoom] = []
    rejection_counts = {
        "too_small": 0,
        "oversized_unsplit": 0,
        "triangle_or_underfit": 0,
        "touches_border": 0,
        "self_intersection": 0,
        "non_orthogonal": 0,
        "weak_wall_support": 0,
        "extremely_thin": 0,
        "spiky_or_underfilled": 0,
    }
    candidate_labels = 0
    split_wall_regions = 0
    split_watershed_regions = 0
    split_wall_barriers = 0
    split_door_barriers = 0

    for label in range(1, num_labels):
        if label in border_labels:
            continue

        component_area_px = int(stats[label, cv2.CC_STAT_AREA])
        if component_area_px < min_region_area_px:
            rejection_counts["too_small"] += 1
            continue

        component_mask = np.zeros_like(labels, dtype=np.uint8)
        component_mask[labels == label] = 255
        candidate_labels += 1
        component_bbox = _mask_bbox(component_mask)
        component_area_sqft = _region_area_sqft(float(component_area_px), scale_px_per_ft * UPSCALE_FACTOR)
        candidate_masks = [component_mask]
        attempted_split = False
        internal_barrier_count = 0
        used_watershed_split = False

        if _should_try_split(component_area_sqft, total_interior_area_sqft, component_bbox, scale_px_per_ft * UPSCALE_FACTOR):
            attempted_split = True
            wall_split_masks, barrier_count, door_barrier_count = _split_region_with_internal_walls(component_mask, snapshot, min_region_area_px)
            internal_barrier_count = barrier_count + door_barrier_count
            split_wall_barriers += barrier_count
            split_door_barriers += door_barrier_count
            if len(wall_split_masks) > 1:
                split_wall_regions += len(wall_split_masks) - 1
                candidate_masks = wall_split_masks
            else:
                watershed_masks = _split_region_with_watershed(component_mask, min_region_area_px)
                if len(watershed_masks) > 1:
                    split_watershed_regions += len(watershed_masks) - 1
                    candidate_masks = watershed_masks
                    used_watershed_split = True

        if attempted_split and len(candidate_masks) == 1 and internal_barrier_count >= MIN_INTERNAL_BARRIER_COUNT:
            rejection_counts["oversized_unsplit"] += 1
            continue

        for candidate_mask in candidate_masks:
            candidate_bbox_mask = _mask_bbox(candidate_mask)
            polygon = _component_polygon(candidate_mask, width_px, height_px, snapshot)
            if len(polygon) < 3:
                rejection_counts["triangle_or_underfit"] += 1
                continue

            area_px = _shoelace_area(polygon)
            touches_border = (
                candidate_bbox_mask[0] <= 1
                or candidate_bbox_mask[1] <= 1
                or candidate_bbox_mask[2] >= candidate_mask.shape[1] - 2
                or candidate_bbox_mask[3] >= candidate_mask.shape[0] - 2
            )
            valid, reason, metrics = _validate_room_polygon(
                polygon,
                snapshot,
                area_px=area_px,
                scale_px_per_ft=scale_px_per_ft,
                touches_border=touches_border,
            )
            if not valid:
                rejection_counts[reason] = rejection_counts.get(reason, 0) + 1
                continue

            bbox = _polygon_bounds(polygon)
            centroid = _polygon_centroid(polygon)
            area_sqft = _region_area_sqft(area_px, scale_px_per_ft) if scale_px_per_ft > 0 else 0.0
            matched = _match_existing_room(polygon, existing_rooms, used_existing_ids)
            matched_id = str(matched.get("id")) if matched else ""
            if matched_id:
                used_existing_ids.add(matched_id)
            matched_attrs = matched.get("attrs", {}) if matched else {}
            matched_relations = matched.get("relations", {}) if matched else {}

            support_ratio = float(metrics.get("boundary_support_ratio", ROOM_SUPPORT_MIN_RATIO))
            orthogonality_ratio = float(metrics.get("orthogonality_ratio", ORTHOGONAL_MIN_RATIO))
            extraction_status: Literal["auto", "edited", "ambiguous"] = "auto"
            if int(repair_debug["count"]) > 0 or touches_border or used_watershed_split:
                extraction_status = "ambiguous"
            elif matched_attrs.get("status") == "edited":
                extraction_status = "edited"

            confidence = min(1.0, (support_ratio * 0.6) + (orthogonality_ratio * 0.4))
            if int(repair_debug["count"]) > 0:
                confidence -= min(0.15, int(repair_debug["count"]) * 0.04)
            if used_watershed_split:
                confidence -= 0.05
            extraction_confidence = max(0.0, round(confidence, 4))

            material = matched_relations.get("material")
            if material not in {"hardwood", "carpet", "tile", "vinyl", "laminate"}:
                material = None

            attrs = {
                "status": matched_attrs.get("status", "auto") if extraction_status == "edited" else "auto",
                "locked": bool(matched_attrs.get("locked", False)),
                "visible": bool(matched_attrs.get("visible", True)),
            }
            if matched_attrs.get("confidence") is not None and extraction_status == "edited":
                attrs["confidence"] = matched_attrs.get("confidence")
            else:
                attrs["confidence"] = extraction_confidence
            if matched_attrs.get("notes"):
                attrs["notes"] = matched_attrs.get("notes")
            if matched_attrs.get("name"):
                attrs["name"] = matched_attrs.get("name")

            rooms.append(
                ExtractedRoom(
                    id=matched_id or f"room_auto_{len(rooms) + 1}",
                    polygon=polygon,
                    bbox=bbox,
                    centroid=centroid,
                    area_sqft=round(area_sqft, 4),
                    area_px=round(area_px, 4),
                    quantity_required=round(max(area_sqft, 0.0), 4),
                    quantity_unit="sqft",
                    extraction_status=extraction_status,
                    extraction_confidence=extraction_confidence,
                    touches_border=touches_border,
                    material=material,
                    name=str(attrs.get("name")) if attrs.get("name") else None,
                    attrs=attrs,
                    diagnostics={
                        "component_label": label,
                        "component_area_px": component_area_px,
                        "candidate_component_area_px": int(np.count_nonzero(candidate_mask)),
                        "boundary_support_ratio": round(support_ratio, 4),
                        "orthogonality_ratio": round(orthogonality_ratio, 4),
                        "closure_status": closure.status,
                        "touches_border": touches_border,
                        "internal_barrier_count": internal_barrier_count,
                    },
                )
            )

    rooms = _dedupe_rooms(rooms)
    total_area_sqft = sum(room.area_sqft for room in rooms)
    ambiguous_room_count = sum(1 for room in rooms if room.extraction_status == "ambiguous")
    if rooms:
        extraction_status = "closed" if ambiguous_room_count == 0 and rejection_counts["oversized_unsplit"] == 0 else "ambiguous"
        min_room_confidence = min((room.extraction_confidence for room in rooms), default=0.0)
        if extraction_status == "closed" and min_room_confidence >= 0.78 and split_watershed_regions == 0:
            extraction_confidence = "high"
        elif min_room_confidence >= 0.55:
            extraction_confidence = "medium"
        else:
            extraction_confidence = "low"
    elif closure.status == "open":
        extraction_status = "open"
        extraction_confidence = "low"
    else:
        extraction_status = "ambiguous"
        extraction_confidence = "low"

    return RoomExtractionResult(
        rooms=rooms,
        status=extraction_status,
        confidence=extraction_confidence,
        total_area_sqft=round(float(total_area_sqft), 4),
        debug={
            "extraction_pass": extraction_pass,
            "room_count": len(rooms),
            "candidate_label_count": candidate_labels,
            "closure_status": closure.status,
            "door_hosted_closure_count": int(door_debug["hosted_door_closures"]),
            "door_inferred_closure_count": int(door_debug["inferred_door_closures"]),
            "door_local_closure_count": int(door_debug["local_door_closures"]),
            "bbox_opening_fill_count": int(door_debug["bbox_opening_fills"]),
            "endpoint_repair_count": int(repair_debug["count"]),
            "endpoint_repair_total_gap_px": float(repair_debug["total_gap_px"]),
            "endpoint_repair_max_gap_px": float(repair_debug["max_gap_px"]),
            "morph_kernel_px": kernel_size,
            "morph_iterations": heal_iterations,
            "split_wall_regions": split_wall_regions,
            "split_wall_barriers": split_wall_barriers,
            "split_door_barriers": split_door_barriers,
            "split_watershed_regions": split_watershed_regions,
            "reject_too_small_count": rejection_counts["too_small"],
            "reject_oversized_unsplit_count": rejection_counts["oversized_unsplit"],
            "reject_triangle_count": rejection_counts["triangle_or_underfit"],
            "reject_touches_border_count": rejection_counts["touches_border"],
            "reject_self_intersection_count": rejection_counts["self_intersection"],
            "reject_non_orthogonal_count": rejection_counts["non_orthogonal"],
            "reject_weak_support_count": rejection_counts["weak_wall_support"],
            "reject_thin_count": rejection_counts["extremely_thin"],
            "reject_spiky_count": rejection_counts["spiky_or_underfilled"],
        },
    )


def extract_room_regions(
    snapshot: TakeoffGeometrySnapshot,
    *,
    existing_document: dict[str, Any] | None = None,
) -> RoomExtractionResult:
    strict_result = _extract_room_regions_pass(
        snapshot,
        existing_document=existing_document,
        extraction_pass="strict",
    )
    strict_result.debug["fallback_attempted"] = False
    strict_result.debug["fallback_used"] = False

    if strict_result.rooms:
        return strict_result

    fallback_result = _extract_room_regions_pass(
        snapshot,
        existing_document=existing_document,
        extraction_pass="fallback",
        max_topology_repair_ft=max(MAX_TOPOLOGY_REPAIR_FT * 1.6, 4.0),
        heal_kernel_multiplier=1.25,
        heal_iterations=2,
        use_alternate_closure=True,
    )

    strict_result.debug["fallback_attempted"] = True
    strict_result.debug["fallback_candidate_label_count"] = int(fallback_result.debug.get("candidate_label_count", 0))
    strict_result.debug["fallback_room_count"] = len(fallback_result.rooms)

    if fallback_result.rooms:
        fallback_result.debug["fallback_attempted"] = True
        fallback_result.debug["fallback_used"] = True
        fallback_result.debug["strict_candidate_label_count"] = int(strict_result.debug.get("candidate_label_count", 0))
        fallback_result.debug["strict_room_count"] = len(strict_result.rooms)
        return fallback_result

    return strict_result


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
        floor_area_sqft = 0.0

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
