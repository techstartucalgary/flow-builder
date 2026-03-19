"""Room closure solver and room polygon extractor for normalized geometry."""

from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot
from typing import Any, Literal, Optional

import cv2
import numpy as np

from src.estimators.drywall.annotation_geometry import TakeoffGeometrySnapshot

UPSCALE_FACTOR = 2
AREA_HEAL_KERNEL_SIZE = 5
MIN_INTERIOR_REGION_SQFT = 100.0
MIN_ROOM_REGION_SQFT = 9.0
MAX_SEAL_GAP_FT = 25.0
ROOM_SUPPORT_DISTANCE_PX = 18.0
ROOM_SUPPORT_MIN_RATIO = 0.58
POLYGON_SIMPLIFY_RATIO = 0.01
POLYGON_SIMPLIFY_MIN_PX = 3.0
ORTHOGONAL_SNAP_DEG = 12.0
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
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0 = max(ax0, bx0)
    iy0 = max(ay0, by0)
    ix1 = min(ax1, bx1)
    iy1 = min(ay1, by1)
    iw = max(0, ix1 - ix0)
    ih = max(0, iy1 - iy0)
    intersection = iw * ih
    if intersection <= 0:
        return 0.0
    a_area = max(1, (ax1 - ax0) * (ay1 - ay0))
    b_area = max(1, (bx1 - bx0) * (by1 - by0))
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

        existing_centroid = existing.get("centroid")
        contains_score = 0.0
        if isinstance(existing_centroid, tuple) and _point_in_polygon(existing_centroid, polygon):
            contains_score += 1.0
        if _point_in_polygon(centroid, existing_polygon):
            contains_score += 1.0

        iou_score = _bbox_iou(bbox, existing.get("bbox", bbox))
        score = contains_score + iou_score
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


def _orthogonalize_polygon(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if len(points) < 3:
        return points

    adjusted = list(points)
    for index, point in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        dx = next_point[0] - point[0]
        dy = next_point[1] - point[1]
        if dx == 0 and dy == 0:
            continue

        if abs(dx) >= abs(dy) * 2:
            avg_y = int(round((point[1] + next_point[1]) / 2))
            adjusted[index] = (adjusted[index][0], avg_y)
            adjusted[(index + 1) % len(points)] = (adjusted[(index + 1) % len(points)][0], avg_y)
        elif abs(dy) >= abs(dx) * 2:
            avg_x = int(round((point[0] + next_point[0]) / 2))
            adjusted[index] = (avg_x, adjusted[index][1])
            adjusted[(index + 1) % len(points)] = (avg_x, adjusted[(index + 1) % len(points)][1])

    return _dedupe_polygon_points(adjusted)


def _boundary_support_ratio(points: list[tuple[int, int]], snapshot: TakeoffGeometrySnapshot) -> float:
    if len(points) < 3 or not snapshot.walls:
        return 0.0

    median_thickness = float(np.median([
        float(wall.visual_thickness or wall.thickness or 0.0)
        for wall in snapshot.walls
    ])) if snapshot.walls else 12.0
    tolerance = max(6.0, min(ROOM_SUPPORT_DISTANCE_PX, median_thickness * 1.25))
    supported = 0
    sampled = 0

    for index, start in enumerate(points):
        end = points[(index + 1) % len(points)]
        edge_length = hypot(end[0] - start[0], end[1] - start[1])
        sample_count = max(2, int(round(edge_length / 28.0)))
        for sample_index in range(sample_count):
            t = (sample_index + 0.5) / sample_count
            px = start[0] + ((end[0] - start[0]) * t)
            py = start[1] + ((end[1] - start[1]) * t)
            sampled += 1
            nearest = min(
                _distance_point_to_segment(px, py, wall.start, wall.end)
                for wall in snapshot.walls
            )
            if nearest <= tolerance:
                supported += 1

    return float(supported / sampled) if sampled else 0.0


def _component_polygon(
    component_mask: np.ndarray,
    width_px: int,
    height_px: int,
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

    return _orthogonalize_polygon(_dedupe_polygon_points(points))


def extract_room_regions(
    snapshot: TakeoffGeometrySnapshot,
    *,
    existing_document: dict[str, Any] | None = None,
) -> RoomExtractionResult:
    if not snapshot.walls:
        return RoomExtractionResult(
            rooms=[],
            status="open",
            confidence="low",
            total_area_sqft=0.0,
            debug={"reason": "no_walls"},
        )

    width_px, height_px = _mask_dimensions(snapshot)
    base_mask = build_wall_mask_from_snapshot(snapshot)
    seal_hosted_openings_for_area(snapshot, base_mask)
    sealed_gap_pairs = _seal_open_endpoint_gaps(snapshot, base_mask)
    healed_mask = _heal_small_boundary_gaps(base_mask)

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

    effective_scale = snapshot.scale_px_per_ft or 0.0
    min_region_area_px = int(round(max(1.0, MIN_ROOM_REGION_SQFT) * ((effective_scale or 1.0) * UPSCALE_FACTOR) ** 2))
    existing_rooms = _extract_existing_room_metadata(existing_document or {})
    used_existing_ids: set[str] = set()
    closure = compute_enclosed_regions(snapshot)
    rooms: list[ExtractedRoom] = []

    for label in range(1, num_labels):
        if label in border_labels:
            continue

        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < min_region_area_px:
            continue

        component_mask = np.zeros_like(labels, dtype=np.uint8)
        component_mask[labels == label] = 255
        polygon = _component_polygon(component_mask, width_px, height_px)
        if len(polygon) < 3:
            continue

        area_px = _shoelace_area(polygon)
        if area_px <= 1.0:
            continue

        support_ratio = _boundary_support_ratio(polygon, snapshot)
        if support_ratio < ROOM_SUPPORT_MIN_RATIO:
            continue

        bbox = _polygon_bounds(polygon)
        centroid = _polygon_centroid(polygon)
        area_sqft = float(area_px / (effective_scale ** 2)) if effective_scale > 0 else 0.0
        matched = _match_existing_room(polygon, existing_rooms, used_existing_ids)
        matched_id = str(matched.get("id")) if matched else ""
        if matched_id:
            used_existing_ids.add(matched_id)
        matched_attrs = matched.get("attrs", {}) if matched else {}
        matched_relations = matched.get("relations", {}) if matched else {}

        extraction_status: Literal["auto", "edited", "ambiguous"] = "auto"
        if closure.status != "closed" or sealed_gap_pairs > 0:
            extraction_status = "ambiguous"
        elif matched_attrs.get("status") == "edited":
            extraction_status = "edited"

        confidence_penalty = 0.0
        if closure.status != "closed":
            confidence_penalty += 0.2
        if sealed_gap_pairs > 0:
            confidence_penalty += min(0.2, sealed_gap_pairs * 0.05)
        extraction_confidence = max(0.0, min(1.0, support_ratio - confidence_penalty))

        quantity_required = area_sqft if area_sqft > 0 else 0.0
        material = matched_relations.get("material")
        if material not in {"hardwood", "carpet", "tile", "vinyl", "laminate"}:
            material = None

        attrs = {
            "status": matched_attrs.get("status", "auto") if extraction_status == "edited" else "auto",
            "locked": bool(matched_attrs.get("locked", False)),
            "visible": bool(matched_attrs.get("visible", True)),
        }
        if matched_attrs.get("confidence") is not None:
            attrs["confidence"] = matched_attrs.get("confidence")
        else:
            attrs["confidence"] = round(extraction_confidence, 4)
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
                quantity_required=round(quantity_required, 4),
                quantity_unit="sqft",
                extraction_status=extraction_status,
                extraction_confidence=round(extraction_confidence, 4),
                touches_border=False,
                material=material,
                name=str(attrs.get("name")) if attrs.get("name") else None,
                attrs=attrs,
                diagnostics={
                    "component_label": label,
                    "component_area_px": area,
                    "boundary_support_ratio": round(support_ratio, 4),
                    "sealed_gap_pairs": sealed_gap_pairs,
                    "closure_status": closure.status,
                },
            )
        )

    total_area_sqft = sum(room.area_sqft for room in rooms)
    debug: dict[str, float | int | str] = {
        "room_count": len(rooms),
        "sealed_gap_pairs": sealed_gap_pairs,
        "component_labels": num_labels - 1,
        "min_room_region_area_px": min_region_area_px,
        "closure_status": closure.status,
    }
    debug.update({key: value for key, value in closure.debug.items()})

    return RoomExtractionResult(
        rooms=rooms,
        status=closure.status,
        confidence=closure.confidence,
        total_area_sqft=round(float(total_area_sqft), 4),
        debug=debug,
    )


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
