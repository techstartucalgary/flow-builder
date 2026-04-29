"""Merge paired wall faces into annotation-ready centerline walls."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from src.vision.cv.models import Orientation, WallSegment


MIN_FACE_SEPARATION_PX = 6
MAX_FACE_SEPARATION_PX = 80
MIN_OVERLAP_RATIO = 0.60
MIN_LONGER_OVERLAP_RATIO = 0.45
MIN_OVERLAP_PX = 36
SAMPLE_STEP_PX = 10
FACE_WINDOW_PAD_PX = 4
MIN_SUPPORTED_RUN_PX = 30


@dataclass(frozen=True)
class WallFaceMergeDiagnostics:
    raw_faces: int
    candidates: int
    merged_pairs: int
    rejected: int


@dataclass(frozen=True)
class _Candidate:
    left_id: str
    right_id: str
    orientation: Orientation
    center_cross: int
    start_along: int
    end_along: int
    separation: int
    support_ratio: float
    score: float


def _along_range(wall: WallSegment) -> tuple[int, int]:
    if wall.orientation == Orientation.HORIZONTAL:
        return min(wall.start[0], wall.end[0]), max(wall.start[0], wall.end[0])
    return min(wall.start[1], wall.end[1]), max(wall.start[1], wall.end[1])


def _cross_axis(wall: WallSegment) -> int:
    if wall.orientation == Orientation.HORIZONTAL:
        return int(round((wall.start[1] + wall.end[1]) / 2))
    return int(round((wall.start[0] + wall.end[0]) / 2))


def _wall_length(wall: WallSegment) -> int:
    lo, hi = _along_range(wall)
    return max(0, hi - lo)


def _face_has_pixels(mask: np.ndarray, orientation: Orientation, along: int, cross: int, pad: int) -> bool:
    img_h, img_w = mask.shape[:2]
    if orientation == Orientation.HORIZONTAL:
        x = int(round(along))
        y0 = max(0, int(round(cross - pad)))
        y1 = min(img_h, int(round(cross + pad + 1)))
        if x < 0 or x >= img_w or y0 >= y1:
            return False
        return bool(np.any(mask[y0:y1, x] > 0))

    y = int(round(along))
    x0 = max(0, int(round(cross - pad)))
    x1 = min(img_w, int(round(cross + pad + 1)))
    if y < 0 or y >= img_h or x0 >= x1:
        return False
    return bool(np.any(mask[y, x0:x1] > 0))


def _supported_runs(
    mask: np.ndarray,
    orientation: Orientation,
    cross_a: int,
    cross_b: int,
    along_start: int,
    along_end: int,
    step_px: int,
) -> tuple[list[tuple[int, int]], float]:
    samples = list(range(along_start, along_end + 1, step_px))
    if not samples or samples[-1] != along_end:
        samples.append(along_end)

    supported: list[int] = []
    face_pad = max(FACE_WINDOW_PAD_PX, min(10, abs(cross_b - cross_a) // 4))
    for along in samples:
        has_a = _face_has_pixels(mask, orientation, along, cross_a, face_pad)
        has_b = _face_has_pixels(mask, orientation, along, cross_b, face_pad)
        if has_a and has_b:
            supported.append(along)

    support_ratio = len(supported) / max(1, len(samples))
    if not supported:
        return [], support_ratio

    runs: list[tuple[int, int]] = []
    run_start = supported[0]
    previous = supported[0]
    max_gap = step_px * 2
    for along in supported[1:]:
        if along - previous <= max_gap:
            previous = along
            continue
        if previous - run_start >= MIN_SUPPORTED_RUN_PX:
            runs.append((run_start, previous))
        run_start = previous = along
    if previous - run_start >= MIN_SUPPORTED_RUN_PX:
        runs.append((run_start, previous))
    return runs, support_ratio


def _candidate_for_pair(
    wall_a: WallSegment,
    wall_b: WallSegment,
    mask: np.ndarray,
    min_support_ratio: float,
) -> _Candidate | None:
    if wall_a.orientation != wall_b.orientation:
        return None

    cross_a = _cross_axis(wall_a)
    cross_b = _cross_axis(wall_b)
    separation = abs(cross_a - cross_b)
    if separation < MIN_FACE_SEPARATION_PX or separation > MAX_FACE_SEPARATION_PX:
        return None

    a0, a1 = _along_range(wall_a)
    b0, b1 = _along_range(wall_b)
    overlap_start = max(a0, b0)
    overlap_end = min(a1, b1)
    overlap_len = overlap_end - overlap_start
    shorter_len = max(1, min(_wall_length(wall_a), _wall_length(wall_b)))
    longer_len = max(1, max(_wall_length(wall_a), _wall_length(wall_b)))
    if (
        overlap_len < MIN_OVERLAP_PX
        or overlap_len / shorter_len < MIN_OVERLAP_RATIO
        or overlap_len / longer_len < MIN_LONGER_OVERLAP_RATIO
    ):
        return None

    runs, support_ratio = _supported_runs(
        mask,
        wall_a.orientation,
        cross_a,
        cross_b,
        overlap_start,
        overlap_end,
        SAMPLE_STEP_PX,
    )
    if support_ratio < min_support_ratio or not runs:
        return None

    run_start, run_end = max(runs, key=lambda item: item[1] - item[0])
    if run_end - run_start < MIN_SUPPORTED_RUN_PX:
        return None

    length_similarity = min(_wall_length(wall_a), _wall_length(wall_b)) / max(
        1,
        max(_wall_length(wall_a), _wall_length(wall_b)),
    )
    score = support_ratio * 0.75 + length_similarity * 0.25
    return _Candidate(
        left_id=wall_a.id,
        right_id=wall_b.id,
        orientation=wall_a.orientation,
        center_cross=int(round((cross_a + cross_b) / 2)),
        start_along=run_start,
        end_along=run_end,
        separation=separation,
        support_ratio=support_ratio,
        score=score,
    )


def _copy_single_face(wall: WallSegment) -> WallSegment:
    copied = wall.model_copy(deep=True)
    if not copied.source_ids:
        copied.source_ids = [wall.id]
    if not copied.merge_kind:
        copied.merge_kind = "single_face"
    return copied


def _merged_wall(candidate: _Candidate, wall_a: WallSegment, wall_b: WallSegment, index: int) -> WallSegment:
    if candidate.orientation == Orientation.HORIZONTAL:
        start = (candidate.start_along, candidate.center_cross)
        end = (candidate.end_along, candidate.center_cross)
    else:
        start = (candidate.center_cross, candidate.start_along)
        end = (candidate.center_cross, candidate.end_along)

    visual_thickness = max(
        candidate.separation + max(wall_a.thickness, wall_b.thickness),
        wall_a.visual_thickness or 0,
        wall_b.visual_thickness or 0,
        wall_a.thickness,
        wall_b.thickness,
    )
    source_ids = sorted({*(wall_a.source_ids or [wall_a.id]), *(wall_b.source_ids or [wall_b.id])})
    return WallSegment(
        id=f"M-{index:03d}",
        orientation=candidate.orientation,
        start=start,
        end=end,
        thickness=max(wall_a.thickness, wall_b.thickness),
        visual_thickness=int(round(visual_thickness)),
        length_px=max(0, candidate.end_along - candidate.start_along),
        length_ft=None,
        source_ids=source_ids,
        merge_kind="paired_faces",
        fit_support_ratio=round(candidate.support_ratio, 4),
        merge_confidence=round(min(1.0, candidate.score), 4),
    )


def merge_wall_faces_to_centerlines(
    walls: list[WallSegment],
    h_mask: np.ndarray,
    v_mask: np.ndarray,
    min_support_ratio: float = 0.92,
) -> tuple[list[WallSegment], WallFaceMergeDiagnostics]:
    """Consolidate opposite wall faces into a single validated centerline.

    The merge is intentionally conservative: a candidate must have two
    parallel faces with strong support in the orientation-matched wall mask.
    Unproven candidates are left as their original face segments.
    """
    candidates: list[_Candidate] = []
    by_id = {wall.id: wall for wall in walls}

    for idx, wall_a in enumerate(walls):
        mask = h_mask if wall_a.orientation == Orientation.HORIZONTAL else v_mask
        for wall_b in walls[idx + 1:]:
            candidate = _candidate_for_pair(wall_a, wall_b, mask, min_support_ratio)
            if candidate is not None:
                candidates.append(candidate)

    used: set[str] = set()
    chosen: list[_Candidate] = []
    for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
        if candidate.left_id in used or candidate.right_id in used:
            continue
        chosen.append(candidate)
        used.add(candidate.left_id)
        used.add(candidate.right_id)

    merged: list[WallSegment] = []
    merge_index = 1
    for wall in walls:
        pair = next((item for item in chosen if item.left_id == wall.id or item.right_id == wall.id), None)
        if pair is None:
            merged.append(_copy_single_face(wall))
            continue
        if pair.left_id != wall.id:
            continue
        merged.append(_merged_wall(pair, by_id[pair.left_id], by_id[pair.right_id], merge_index))
        merge_index += 1

    diagnostics = WallFaceMergeDiagnostics(
        raw_faces=len(walls),
        candidates=len(candidates),
        merged_pairs=len(chosen),
        rejected=max(0, len(candidates) - len(chosen)),
    )
    return merged, diagnostics
