"""Normalize saved annotation geometry for deterministic takeoff math."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from hashlib import sha1
import json
from math import atan2, degrees, hypot, isfinite
from typing import Any, Literal, Optional


WallSurfaceClass = Literal["perimeter", "partition", "unknown"]
WallSurfaceClassSource = Literal["auto", "manual"]


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _positive_float(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not isfinite(number) or number <= 0:
        return None
    return number


def _int_coord(value: Any) -> int:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0
    if not isfinite(number):
        return 0
    return int(round(number))


def _point_distance(a: tuple[int, int], b: tuple[int, int]) -> float:
    return hypot(a[0] - b[0], a[1] - b[1])


def _segment_length(start: tuple[int, int], end: tuple[int, int]) -> float:
    return hypot(end[0] - start[0], end[1] - start[1])


def _canonical_segment(start: tuple[int, int], end: tuple[int, int]) -> tuple[tuple[int, int], tuple[int, int]]:
    if start <= end:
        return start, end
    return end, start


def _wall_angle_deg(start: tuple[int, int], end: tuple[int, int]) -> float:
    return degrees(atan2(end[1] - start[1], end[0] - start[0]))


def _wall_orientation(start: tuple[int, int], end: tuple[int, int]) -> Literal["horizontal", "vertical", "angled"]:
    dx = abs(end[0] - start[0])
    dy = abs(end[1] - start[1])
    if dx == 0 and dy == 0:
        return "angled"
    if dx >= dy * 2:
        return "horizontal"
    if dy >= dx * 2:
        return "vertical"
    return "angled"


def _point_on_segment(point: tuple[int, int], start: tuple[int, int], end: tuple[int, int], tol: float) -> bool:
    px, py = point
    x1, y1 = start
    x2, y2 = end
    seg_len = _segment_length(start, end)
    if seg_len <= 0:
        return _point_distance(point, start) <= tol
    d = abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1) / seg_len
    if d > tol:
        return False
    return (
        min(x1, x2) - tol <= px <= max(x1, x2) + tol
        and min(y1, y2) - tol <= py <= max(y1, y2) + tol
    )


def _project_point_to_segment(point: tuple[int, int], start: tuple[int, int], end: tuple[int, int]) -> tuple[float, float, float]:
    x1, y1 = start
    x2, y2 = end
    dx = x2 - x1
    dy = y2 - y1
    denom = dx * dx + dy * dy
    if denom == 0:
        return float(x1), float(y1), 0.0
    t = max(0.0, min(1.0, ((point[0] - x1) * dx + (point[1] - y1) * dy) / denom))
    return x1 + t * dx, y1 + t * dy, t


@dataclass
class RawWall:
    id: str
    start: tuple[int, int]
    end: tuple[int, int]
    thickness: float
    visual_thickness: float
    source_ids: tuple[str, ...] = field(default_factory=tuple)
    surface_class: WallSurfaceClass = "unknown"
    surface_class_source: WallSurfaceClassSource = "auto"
    board_sides: Optional[int] = None
    exclude_from_takeoff: bool = False


@dataclass
class RawOpening:
    id: str
    tag_class: Literal["door", "window"]
    bbox: tuple[int, int, int, int]
    source_wall_id: Optional[str] = None


@dataclass
class NormalizedWall:
    id: str
    start: tuple[int, int]
    end: tuple[int, int]
    thickness: float
    visual_thickness: float
    length_px: float
    orientation: Literal["horizontal", "vertical", "angled"]
    source_ids: tuple[str, ...] = field(default_factory=tuple)
    surface_class: WallSurfaceClass = "unknown"
    surface_class_source: WallSurfaceClassSource = "auto"
    board_sides: Optional[int] = None
    exclude_from_takeoff: bool = False


@dataclass
class NormalizedOpening:
    id: str
    tag_class: Literal["door", "window"]
    bbox: tuple[int, int, int, int]
    center: tuple[int, int]
    wall_id: Optional[str] = None
    matched: bool = False
    width_ft: Optional[float] = None
    height_ft: Optional[float] = None
    source_wall_id: Optional[str] = None


@dataclass
class TakeoffGeometrySnapshot:
    revision: int
    geometry_hash: str
    scale_px_per_ft: Optional[float]
    image_width: int
    image_height: int
    walls: list[NormalizedWall] = field(default_factory=list)
    openings: list[NormalizedOpening] = field(default_factory=list)
    wall_count: int = 0
    opening_count: int = 0
    unmatched_opening_count: int = 0
    open_boundary_gaps: list[float] = field(default_factory=list)
    diagnostics: dict[str, Any] = field(default_factory=dict)


def _orthogonalize_wall(
    wall: RawWall,
    max_angle_drift_deg: float,
) -> tuple[RawWall, bool]:
    start = wall.start
    end = wall.end
    angle = abs(_wall_angle_deg(start, end)) % 180.0
    if angle <= max_angle_drift_deg or angle >= 180.0 - max_angle_drift_deg:
        y = int(round((start[1] + end[1]) / 2))
        x0, x1 = sorted((start[0], end[0]))
        return RawWall(
            id=wall.id,
            start=(x0, y),
            end=(x1, y),
            thickness=wall.thickness,
            visual_thickness=wall.visual_thickness,
            source_ids=wall.source_ids,
            surface_class=wall.surface_class,
            surface_class_source=wall.surface_class_source,
            board_sides=wall.board_sides,
            exclude_from_takeoff=wall.exclude_from_takeoff,
        ), True
    if abs(angle - 90.0) <= max_angle_drift_deg:
        x = int(round((start[0] + end[0]) / 2))
        y0, y1 = sorted((start[1], end[1]))
        return RawWall(
            id=wall.id,
            start=(x, y0),
            end=(x, y1),
            thickness=wall.thickness,
            visual_thickness=wall.visual_thickness,
            source_ids=wall.source_ids,
            surface_class=wall.surface_class,
            surface_class_source=wall.surface_class_source,
            board_sides=wall.board_sides,
            exclude_from_takeoff=wall.exclude_from_takeoff,
        ), True
    return wall, False


def _extract_raw_geometry(document: dict[str, Any]) -> tuple[list[RawWall], list[RawOpening], int, int]:
    base_image = document.get("baseImage") if isinstance(document, dict) else {}
    image_width = max(0, _int_coord(base_image.get("widthPx")))
    image_height = max(0, _int_coord(base_image.get("heightPx")))
    raw_elements = document.get("elements") if isinstance(document, dict) else []
    if not isinstance(raw_elements, list):
        raw_elements = []

    walls: list[RawWall] = []
    openings: list[RawOpening] = []

    for index, element in enumerate(raw_elements):
        if not isinstance(element, dict):
            continue
        element_type = element.get("type")
        geometry = element.get("geometry")
        if not isinstance(geometry, dict):
            continue
        element_id = str(element.get("id") or f"{element_type}_{index}")
        relations = element.get("relations") if isinstance(element.get("relations"), dict) else {}

        if element_type == "wall" and geometry.get("kind") == "segment":
            start = (_int_coord(geometry.get("x1")), _int_coord(geometry.get("y1")))
            end = (_int_coord(geometry.get("x2")), _int_coord(geometry.get("y2")))
            if start == end:
                continue
            thickness = _positive_float(geometry.get("thicknessPx")) or 14.0
            raw_source_ids = relations.get("sourceWallIds")
            source_ids = tuple(str(item) for item in raw_source_ids if item) if isinstance(raw_source_ids, list) else (element_id,)
            surface_class = str(relations.get("surfaceClass") or "").lower()
            if surface_class not in {"perimeter", "partition", "unknown"}:
                surface_class = "unknown"
            surface_class_source: WallSurfaceClassSource = (
                "manual" if relations.get("surfaceClassSource") == "manual" else "auto"
            )
            board_sides_raw = relations.get("boardSides")
            board_sides = int(board_sides_raw) if board_sides_raw in {1, 2, "1", "2"} else None
            walls.append(
                RawWall(
                    id=element_id,
                    start=start,
                    end=end,
                    thickness=thickness,
                    visual_thickness=thickness,
                    source_ids=source_ids or (element_id,),
                    surface_class=surface_class,
                    surface_class_source=surface_class_source,
                    board_sides=board_sides,
                    exclude_from_takeoff=bool(relations.get("excludeFromTakeoff")),
                )
            )
            continue

        if element_type in {"door", "window"} and geometry.get("kind") == "rect":
            width = max(0, _int_coord(geometry.get("width")))
            height = max(0, _int_coord(geometry.get("height")))
            if width <= 0 or height <= 0:
                continue
            openings.append(
                RawOpening(
                    id=element_id,
                    tag_class=element_type,
                    bbox=(
                        _int_coord(geometry.get("x")),
                        _int_coord(geometry.get("y")),
                        width,
                        height,
                    ),
                    source_wall_id=str(relations.get("hostWallId")) if relations.get("hostWallId") else None,
                )
            )

    return walls, openings, image_width, image_height


def _snap_wall_endpoints(walls: list[RawWall], tolerance_px: float) -> tuple[list[RawWall], int]:
    if not walls:
        return [], 0

    points: list[tuple[int, int]] = []
    owners: list[tuple[int, int]] = []
    for wall_index, wall in enumerate(walls):
        points.extend([wall.start, wall.end])
        owners.extend([(wall_index, 0), (wall_index, 1)])

    parent = list(range(len(points)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(a: int, b: int) -> None:
        ra = find(a)
        rb = find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            if _point_distance(points[i], points[j]) <= tolerance_px:
                union(i, j)

    clusters: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for index, point in enumerate(points):
        clusters[find(index)].append(point)

    snapped_points: dict[int, tuple[int, int]] = {}
    for root, cluster_points in clusters.items():
        avg_x = int(round(sum(point[0] for point in cluster_points) / len(cluster_points)))
        avg_y = int(round(sum(point[1] for point in cluster_points) / len(cluster_points)))
        snapped_points[root] = (avg_x, avg_y)

    snapped: list[RawWall] = []
    for wall_index, wall in enumerate(walls):
        start = snapped_points[find(wall_index * 2)]
        end = snapped_points[find(wall_index * 2 + 1)]
        if start == end:
            continue
        snapped.append(
            RawWall(
                id=wall.id,
                start=start,
                end=end,
                thickness=wall.thickness,
                visual_thickness=wall.visual_thickness,
                source_ids=wall.source_ids,
                surface_class=wall.surface_class,
                surface_class_source=wall.surface_class_source,
                board_sides=wall.board_sides,
                exclude_from_takeoff=wall.exclude_from_takeoff,
            )
        )
    return snapped, len(clusters)


def _split_walls_at_intersections(walls: list[RawWall], tolerance_px: float) -> tuple[list[RawWall], int]:
    if not walls:
        return [], 0

    split_points: dict[str, list[tuple[int, int]]] = {wall.id: [wall.start, wall.end] for wall in walls}
    by_id = {wall.id: wall for wall in walls}

    for i, wall_a in enumerate(walls):
        orientation_a = _wall_orientation(wall_a.start, wall_a.end)
        if orientation_a == "angled":
            continue
        for wall_b in walls[i + 1:]:
            orientation_b = _wall_orientation(wall_b.start, wall_b.end)
            if orientation_b == "angled" or orientation_a == orientation_b:
                continue

            if orientation_a == "horizontal":
                h_wall, v_wall = wall_a, wall_b
            else:
                h_wall, v_wall = wall_b, wall_a

            y = h_wall.start[1]
            x = v_wall.start[0]
            hx0, hx1 = sorted((h_wall.start[0], h_wall.end[0]))
            vy0, vy1 = sorted((v_wall.start[1], v_wall.end[1]))
            point = (x, y)
            if (
                hx0 - tolerance_px <= x <= hx1 + tolerance_px
                and vy0 - tolerance_px <= y <= vy1 + tolerance_px
                and _point_on_segment(point, h_wall.start, h_wall.end, tolerance_px)
                and _point_on_segment(point, v_wall.start, v_wall.end, tolerance_px)
            ):
                split_points[h_wall.id].append(point)
                split_points[v_wall.id].append(point)

    generated = 0
    result: list[RawWall] = []

    for wall in walls:
        orientation = _wall_orientation(wall.start, wall.end)
        points = split_points[wall.id]
        unique_points: list[tuple[int, int]] = []
        seen: set[tuple[int, int]] = set()
        for point in points:
            if point in seen:
                continue
            seen.add(point)
            unique_points.append(point)

        if orientation == "horizontal":
            unique_points.sort(key=lambda point: point[0])
        elif orientation == "vertical":
            unique_points.sort(key=lambda point: point[1])
        else:
            unique_points.sort(key=lambda point: _point_distance(wall.start, point))

        if len(unique_points) <= 2:
            result.append(wall)
            continue

        for index in range(len(unique_points) - 1):
            start = unique_points[index]
            end = unique_points[index + 1]
            if _segment_length(start, end) <= 1.0:
                continue
            generated += 1
            result.append(
                RawWall(
                    id=f"{wall.id}__split_{index}",
                    start=start,
                    end=end,
                    thickness=wall.thickness,
                    visual_thickness=wall.visual_thickness,
                    source_ids=wall.source_ids or (wall.id,),
                    surface_class=wall.surface_class,
                    surface_class_source=wall.surface_class_source,
                    board_sides=wall.board_sides,
                    exclude_from_takeoff=wall.exclude_from_takeoff,
                )
            )

    return result, generated


def _opening_blocks_merge(opening: RawOpening, orientation: str, cross_axis: float, gap_start: int, gap_end: int, tolerance_px: float) -> bool:
    ox, oy, width, height = opening.bbox
    center = (ox + width / 2.0, oy + height / 2.0)
    if orientation == "horizontal":
        return abs(center[1] - cross_axis) <= tolerance_px and gap_start <= center[0] <= gap_end
    if orientation == "vertical":
        return abs(center[0] - cross_axis) <= tolerance_px and gap_start <= center[1] <= gap_end
    return False


def _wall_semantics_match(left: RawWall, right: RawWall) -> bool:
    return (
        left.surface_class == right.surface_class
        and left.surface_class_source == right.surface_class_source
        and left.board_sides == right.board_sides
        and left.exclude_from_takeoff == right.exclude_from_takeoff
    )


def _merge_parallel_wall_faces(
    walls: list[RawWall],
    min_separation_px: float = 6.0,
    max_separation_px: float = 80.0,
    min_overlap_ratio: float = 0.82,
    min_length_similarity: float = 0.72,
) -> tuple[list[RawWall], int]:
    """Conservative raster-less fallback for saved docs with duplicate faces."""
    candidates: list[tuple[float, int, int, tuple[int, int], tuple[int, int], float]] = []

    for i, left in enumerate(walls):
        left_orientation = _wall_orientation(left.start, left.end)
        if left_orientation == "angled":
            continue
        for j in range(i + 1, len(walls)):
            right = walls[j]
            if left_orientation != _wall_orientation(right.start, right.end):
                continue
            if not _wall_semantics_match(left, right):
                continue

            if left_orientation == "horizontal":
                left_cross = (left.start[1] + left.end[1]) / 2.0
                right_cross = (right.start[1] + right.end[1]) / 2.0
                left_range = sorted((left.start[0], left.end[0]))
                right_range = sorted((right.start[0], right.end[0]))
            else:
                left_cross = (left.start[0] + left.end[0]) / 2.0
                right_cross = (right.start[0] + right.end[0]) / 2.0
                left_range = sorted((left.start[1], left.end[1]))
                right_range = sorted((right.start[1], right.end[1]))

            separation = abs(left_cross - right_cross)
            if separation < min_separation_px or separation > max_separation_px:
                continue

            overlap_start = max(left_range[0], right_range[0])
            overlap_end = min(left_range[1], right_range[1])
            overlap = overlap_end - overlap_start
            left_len = max(1, left_range[1] - left_range[0])
            right_len = max(1, right_range[1] - right_range[0])
            overlap_ratio = overlap / max(1, min(left_len, right_len))
            length_similarity = min(left_len, right_len) / max(left_len, right_len)
            if overlap_ratio < min_overlap_ratio or length_similarity < min_length_similarity:
                continue

            score = overlap_ratio * 0.65 + length_similarity * 0.35
            if left_orientation == "horizontal":
                center = int(round((left_cross + right_cross) / 2.0))
                start = (int(round(overlap_start)), center)
                end = (int(round(overlap_end)), center)
            else:
                center = int(round((left_cross + right_cross) / 2.0))
                start = (center, int(round(overlap_start)))
                end = (center, int(round(overlap_end)))
            candidates.append((score, i, j, start, end, separation))

    used: set[int] = set()
    chosen: dict[int, tuple[int, tuple[int, int], tuple[int, int], float]] = {}
    for _score, i, j, start, end, separation in sorted(candidates, reverse=True):
        if i in used or j in used:
            continue
        used.add(i)
        used.add(j)
        chosen[i] = (j, start, end, separation)

    merged: list[RawWall] = []
    merge_count = 0
    for index, wall in enumerate(walls):
        if index in chosen:
            other_index, start, end, separation = chosen[index]
            other = walls[other_index]
            source_ids = tuple(sorted({*(wall.source_ids or (wall.id,)), *(other.source_ids or (other.id,))}))
            merged.append(
                RawWall(
                    id=f"{wall.id}__face_merge__{other.id}",
                    start=start,
                    end=end,
                    thickness=max(wall.thickness, other.thickness),
                    visual_thickness=max(
                        wall.visual_thickness,
                        other.visual_thickness,
                        separation + max(wall.thickness, other.thickness),
                    ),
                    source_ids=source_ids,
                    surface_class=wall.surface_class,
                    surface_class_source=wall.surface_class_source,
                    board_sides=wall.board_sides,
                    exclude_from_takeoff=wall.exclude_from_takeoff,
                )
            )
            merge_count += 1
            continue
        if index in used:
            continue
        merged.append(wall)

    return merged, merge_count


def _merge_collinear_walls(
    walls: list[RawWall],
    openings: list[RawOpening],
    cross_axis_tolerance_px: float,
    gap_tolerance_px: float,
    host_tolerance_px: float,
) -> tuple[list[NormalizedWall], int]:
    merged: list[NormalizedWall] = []
    merge_count = 0

    def emit_group(group: list[RawWall], orientation: Literal["horizontal", "vertical"]) -> None:
        nonlocal merge_count
        if not group:
            return
        if orientation == "horizontal":
            group.sort(key=lambda wall: min(wall.start[0], wall.end[0]))
        else:
            group.sort(key=lambda wall: min(wall.start[1], wall.end[1]))

        current = group[0]
        current_sources = list(current.source_ids or (current.id,))
        for next_wall in group[1:]:
            if orientation == "horizontal":
                current_start = min(current.start[0], current.end[0])
                current_end = max(current.start[0], current.end[0])
                next_start = min(next_wall.start[0], next_wall.end[0])
                next_end = max(next_wall.start[0], next_wall.end[0])
                gap = next_start - current_end
                cross_axis = (current.start[1] + current.end[1] + next_wall.start[1] + next_wall.end[1]) / 4.0
                blocked = any(
                    _opening_blocks_merge(opening, orientation, cross_axis, current_end, next_start, host_tolerance_px)
                    for opening in openings
                )
                if gap <= gap_tolerance_px and not blocked and _wall_semantics_match(current, next_wall):
                    y = int(round(cross_axis))
                    current = RawWall(
                        id=current.id,
                        start=(min(current_start, next_start), y),
                        end=(max(current_end, next_end), y),
                        thickness=max(current.thickness, next_wall.thickness),
                        visual_thickness=max(current.visual_thickness, next_wall.visual_thickness),
                        source_ids=tuple(sorted({*current_sources, *(next_wall.source_ids or (next_wall.id,))})),
                        surface_class=current.surface_class,
                        surface_class_source=current.surface_class_source,
                        board_sides=current.board_sides,
                        exclude_from_takeoff=current.exclude_from_takeoff,
                    )
                    current_sources.extend(next_wall.source_ids or (next_wall.id,))
                    merge_count += 1
                    continue
            else:
                current_start = min(current.start[1], current.end[1])
                current_end = max(current.start[1], current.end[1])
                next_start = min(next_wall.start[1], next_wall.end[1])
                next_end = max(next_wall.start[1], next_wall.end[1])
                gap = next_start - current_end
                cross_axis = (current.start[0] + current.end[0] + next_wall.start[0] + next_wall.end[0]) / 4.0
                blocked = any(
                    _opening_blocks_merge(opening, orientation, cross_axis, current_end, next_start, host_tolerance_px)
                    for opening in openings
                )
                if gap <= gap_tolerance_px and not blocked and _wall_semantics_match(current, next_wall):
                    x = int(round(cross_axis))
                    current = RawWall(
                        id=current.id,
                        start=(x, min(current_start, next_start)),
                        end=(x, max(current_end, next_end)),
                        thickness=max(current.thickness, next_wall.thickness),
                        visual_thickness=max(current.visual_thickness, next_wall.visual_thickness),
                        source_ids=tuple(sorted({*current_sources, *(next_wall.source_ids or (next_wall.id,))})),
                        surface_class=current.surface_class,
                        surface_class_source=current.surface_class_source,
                        board_sides=current.board_sides,
                        exclude_from_takeoff=current.exclude_from_takeoff,
                    )
                    current_sources.extend(next_wall.source_ids or (next_wall.id,))
                    merge_count += 1
                    continue

            start, end = _canonical_segment(current.start, current.end)
            merged.append(
                NormalizedWall(
                    id=f"wall_norm_{len(merged) + 1}",
                    start=start,
                    end=end,
                    thickness=current.thickness,
                    visual_thickness=current.visual_thickness,
                    length_px=_segment_length(start, end),
                    orientation=orientation,
                    source_ids=tuple(sorted(current_sources)),
                    surface_class=current.surface_class,
                    surface_class_source=current.surface_class_source,
                    board_sides=current.board_sides,
                    exclude_from_takeoff=current.exclude_from_takeoff,
                )
            )
            current = next_wall
            current_sources = list(current.source_ids or (current.id,))

        start, end = _canonical_segment(current.start, current.end)
        merged.append(
            NormalizedWall(
                id=f"wall_norm_{len(merged) + 1}",
                start=start,
                end=end,
                thickness=current.thickness,
                visual_thickness=current.visual_thickness,
                length_px=_segment_length(start, end),
                orientation=orientation,
                source_ids=tuple(sorted(current_sources)),
                surface_class=current.surface_class,
                surface_class_source=current.surface_class_source,
                board_sides=current.board_sides,
                exclude_from_takeoff=current.exclude_from_takeoff,
            )
        )

    horizontal_groups: list[list[RawWall]] = []
    vertical_groups: list[list[RawWall]] = []
    angled: list[RawWall] = []

    for wall in walls:
        orientation = _wall_orientation(wall.start, wall.end)
        if orientation == "angled":
            angled.append(wall)
            continue
        target_groups = horizontal_groups if orientation == "horizontal" else vertical_groups
        cross_axis = wall.start[1] if orientation == "horizontal" else wall.start[0]
        for group in target_groups:
            group_axis = group[0].start[1] if orientation == "horizontal" else group[0].start[0]
            if abs(group_axis - cross_axis) <= cross_axis_tolerance_px:
                group.append(wall)
                break
        else:
            target_groups.append([wall])

    for group in horizontal_groups:
        emit_group(group, "horizontal")
    for group in vertical_groups:
        emit_group(group, "vertical")
    for wall in angled:
        start, end = _canonical_segment(wall.start, wall.end)
        merged.append(
            NormalizedWall(
                id=f"wall_norm_{len(merged) + 1}",
                start=start,
                end=end,
                thickness=wall.thickness,
                visual_thickness=wall.visual_thickness,
                length_px=_segment_length(start, end),
                orientation="angled",
                source_ids=(wall.id,),
                surface_class=wall.surface_class,
                surface_class_source=wall.surface_class_source,
                board_sides=wall.board_sides,
                exclude_from_takeoff=wall.exclude_from_takeoff,
            )
        )

    return merged, merge_count


def _host_openings(
    openings: list[RawOpening],
    walls: list[NormalizedWall],
    scale_px_per_ft: Optional[float],
    host_tolerance_px: float,
) -> tuple[list[NormalizedOpening], int]:
    normalized: list[NormalizedOpening] = []
    unmatched = 0
    source_wall_lookup = {
        key: wall.id
        for wall in walls
        for source_id in wall.source_ids
        for key in {source_id, source_id.split("__split_", 1)[0]}
    }

    for opening in openings:
        x, y, width, height = opening.bbox
        center = (int(round(x + width / 2)), int(round(y + height / 2)))
        matched_wall_id = None
        best_score = float("inf")

        if opening.source_wall_id and opening.source_wall_id in source_wall_lookup:
            matched_wall_id = source_wall_lookup[opening.source_wall_id]
        else:
            for wall in walls:
                proj_x, proj_y, t = _project_point_to_segment(center, wall.start, wall.end)
                if t <= 0.0 or t >= 1.0:
                    continue
                dist = hypot(center[0] - proj_x, center[1] - proj_y)
                if dist > host_tolerance_px or dist >= best_score:
                    continue
                best_score = dist
                matched_wall_id = wall.id

        width_ft = (width / scale_px_per_ft) if scale_px_per_ft and scale_px_per_ft > 0 else None
        height_ft = (height / scale_px_per_ft) if scale_px_per_ft and scale_px_per_ft > 0 else None
        is_matched = matched_wall_id is not None
        if not is_matched:
            unmatched += 1

        normalized.append(
            NormalizedOpening(
                id=opening.id,
                tag_class=opening.tag_class,
                bbox=opening.bbox,
                center=center,
                wall_id=matched_wall_id,
                matched=is_matched,
                width_ft=width_ft,
                height_ft=height_ft,
                source_wall_id=opening.source_wall_id,
            )
        )

    return normalized, unmatched


def summarize_open_boundary_gaps(walls: list[NormalizedWall]) -> list[float]:
    endpoint_degree: dict[tuple[int, int], int] = defaultdict(int)
    for wall in walls:
        endpoint_degree[wall.start] += 1
        endpoint_degree[wall.end] += 1

    open_points = [point for point, degree in endpoint_degree.items() if degree <= 1]
    if len(open_points) < 2:
        return []

    gap_lengths: list[float] = []
    for index, point in enumerate(open_points):
        nearest = min(
            (_point_distance(point, other) for other_index, other in enumerate(open_points) if other_index != index),
            default=0.0,
        )
        if nearest > 0:
            gap_lengths.append(round(nearest, 3))

    gap_lengths.sort()
    return gap_lengths


def _geometry_hash_payload(snapshot: TakeoffGeometrySnapshot) -> dict[str, Any]:
    return {
        "scale_px_per_ft": round(float(snapshot.scale_px_per_ft), 4) if snapshot.scale_px_per_ft else 0.0,
        "walls": [
            {
                "start": [wall.start[0], wall.start[1]],
                "end": [wall.end[0], wall.end[1]],
                "thickness": round(float(wall.thickness), 3),
                "visual_thickness": round(float(wall.visual_thickness), 3),
                "surface_class": wall.surface_class,
                "surface_class_source": wall.surface_class_source,
                "board_sides": int(wall.board_sides) if wall.board_sides in {1, 2} else 0,
                "exclude_from_takeoff": wall.exclude_from_takeoff,
            }
            for wall in sorted(
                snapshot.walls,
                key=lambda wall: (wall.start[0], wall.start[1], wall.end[0], wall.end[1], wall.id),
            )
        ],
        "openings": [
            {
                "tag_class": opening.tag_class,
                "bbox": [opening.bbox[0], opening.bbox[1], opening.bbox[2], opening.bbox[3]],
                "wall_id": opening.wall_id or "",
                "matched": opening.matched,
            }
            for opening in sorted(
                snapshot.openings,
                key=lambda opening: (opening.tag_class, opening.bbox, opening.id),
            )
        ],
    }


def _document_scale_px_per_ft(document: dict[str, Any]) -> Optional[float]:
    if not isinstance(document, dict):
        return None
    base_image = document.get("baseImage")
    if not isinstance(base_image, dict):
        return None
    raw = base_image.get("scalePxPerFt")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def build_takeoff_geometry_snapshot(
    document: dict[str, Any],
    revision: int,
    effective_scale_px_per_ft: Optional[float],
) -> TakeoffGeometrySnapshot:
    raw_walls, raw_openings, image_width, image_height = _extract_raw_geometry(document)

    if not effective_scale_px_per_ft or effective_scale_px_per_ft <= 0:
        effective_scale_px_per_ft = _document_scale_px_per_ft(document)

    snap_tol_px = _clamp((effective_scale_px_per_ft or 0.0) * 0.20, 6.0, 18.0)
    intersection_tol_px = _clamp((effective_scale_px_per_ft or 0.0) * 0.15, 4.0, 12.0)
    merge_gap_tol_px = _clamp((effective_scale_px_per_ft or 0.0) * 0.30, 8.0, 24.0)
    host_tol_px = _clamp((effective_scale_px_per_ft or 0.0) * 0.35, 10.0, 26.0)

    orthogonalized_count = 0
    orthogonalized_walls: list[RawWall] = []
    for wall in raw_walls:
        orthogonalized_wall, changed = _orthogonalize_wall(wall, 7.0)
        if changed:
            orthogonalized_count += 1
        orthogonalized_walls.append(orthogonalized_wall)

    snapped_walls, snapped_cluster_count = _snap_wall_endpoints(orthogonalized_walls, snap_tol_px)
    split_walls, split_segment_count = _split_walls_at_intersections(snapped_walls, intersection_tol_px)
    face_merged_walls, face_merge_count = _merge_parallel_wall_faces(split_walls)
    normalized_walls, merged_wall_count = _merge_collinear_walls(
        face_merged_walls,
        raw_openings,
        cross_axis_tolerance_px=intersection_tol_px,
        gap_tolerance_px=merge_gap_tol_px,
        host_tolerance_px=host_tol_px,
    )
    normalized_openings, unmatched_opening_count = _host_openings(
        raw_openings,
        normalized_walls,
        effective_scale_px_per_ft,
        host_tolerance_px=host_tol_px,
    )
    open_boundary_gaps = summarize_open_boundary_gaps(normalized_walls)

    snapshot = TakeoffGeometrySnapshot(
        revision=revision,
        geometry_hash="",
        scale_px_per_ft=effective_scale_px_per_ft,
        image_width=image_width,
        image_height=image_height,
        walls=normalized_walls,
        openings=normalized_openings,
        wall_count=len(normalized_walls),
        opening_count=len(normalized_openings),
        unmatched_opening_count=unmatched_opening_count,
        open_boundary_gaps=open_boundary_gaps,
        diagnostics={
            "raw_wall_count": len(raw_walls),
            "raw_opening_count": len(raw_openings),
            "orthogonalized_wall_count": orthogonalized_count,
            "snapped_endpoint_cluster_count": snapped_cluster_count,
            "split_segment_count": split_segment_count,
            "parallel_wall_face_merge_count": face_merge_count,
            "merged_wall_count": merged_wall_count,
            "snap_tolerance_px": round(float(snap_tol_px), 3),
            "intersection_tolerance_px": round(float(intersection_tol_px), 3),
            "merge_gap_tolerance_px": round(float(merge_gap_tol_px), 3),
            "host_tolerance_px": round(float(host_tol_px), 3),
        },
    )

    snapshot.geometry_hash = sha1(
        json.dumps(_geometry_hash_payload(snapshot), sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:16]
    return snapshot
