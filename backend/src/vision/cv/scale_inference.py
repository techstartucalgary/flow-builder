"""PDF dimension extraction and scale inference helpers."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
import re
from statistics import median
from typing import Any, Literal, Optional

import fitz

MIN_DIMENSION_FT = 2.0
MAX_DIMENSION_FT = 200.0
MIN_SCALE_PX_PER_FT = 10.0
MAX_SCALE_PX_PER_FT = 200.0
SCALE_BIN_SIZE = 2.0
MIN_SUPPORT_COUNT = 3
MIN_CONFIDENCE = 0.6


@dataclass
class DimensionCandidate:
    text: str
    feet_value: float
    bbox: tuple[float, float, float, float]
    orientation_hint: Literal["horizontal", "vertical"]


@dataclass
class ScaleInferenceResult:
    scale_px_per_ft: Optional[float] = None
    confidence: float = 0.0
    support_count: int = 0
    method: Literal["pdf_dimensions"] = "pdf_dimensions"
    reason: str = ""


_DIMENSION_RE = re.compile(
    r"(\d+)\s*'\s*(?:-\s*)?(\d+)(?:\s+(\d+)\s*/\s*(\d+))?\s*\""
)


def _normalize_quotes(text: str) -> str:
    return (
        text.replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u2032", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2033", '"')
    )


def parse_dimension_text_to_feet(text: str) -> Optional[float]:
    normalized = _normalize_quotes(text)
    match = _DIMENSION_RE.search(normalized)
    if not match:
        return None

    feet = float(match.group(1))
    inches = float(match.group(2))
    if match.group(3) and match.group(4):
        numerator = float(match.group(3))
        denominator = float(match.group(4))
        if denominator > 0:
            inches += numerator / denominator

    value = feet + (inches / 12.0)
    if not isfinite(value) or value <= 0:
        return None
    if value < MIN_DIMENSION_FT or value > MAX_DIMENSION_FT:
        return None
    return value


def _line_bbox(words: list[tuple[float, float, float, float, str, int, int, int]]) -> tuple[float, float, float, float]:
    return (
        min(word[0] for word in words),
        min(word[1] for word in words),
        max(word[2] for word in words),
        max(word[3] for word in words),
    )


def _orientation_from_bbox(bbox: tuple[float, float, float, float]) -> Literal["horizontal", "vertical"]:
    width = max(0.0, bbox[2] - bbox[0])
    height = max(0.0, bbox[3] - bbox[1])
    return "horizontal" if width >= height else "vertical"


def extract_pdf_dimension_candidates(file_bytes: bytes, page_number: int) -> list[DimensionCandidate]:
    if not file_bytes:
        return []

    try:
        document = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception:
        return []

    try:
        if page_number < 0 or page_number >= document.page_count:
            return []
        page = document.load_page(page_number)
        words = page.get_text("words", sort=True)
    except Exception:
        return []
    finally:
        document.close()

    grouped: dict[tuple[int, int], list[tuple[float, float, float, float, str, int, int, int]]] = {}
    for entry in words:
        if len(entry) < 8:
            continue
        x0, y0, x1, y1, token, block_no, line_no, word_no = entry[:8]
        key = (int(block_no), int(line_no))
        grouped.setdefault(key, []).append((
            float(x0),
            float(y0),
            float(x1),
            float(y1),
            str(token),
            int(block_no),
            int(line_no),
            int(word_no),
        ))

    candidates: list[DimensionCandidate] = []
    for line_words in grouped.values():
        line_words.sort(key=lambda word: word[7])
        line_text = " ".join(word[4] for word in line_words)
        normalized_line = _normalize_quotes(line_text)
        matches = list(_DIMENSION_RE.finditer(normalized_line))
        if not matches:
            continue

        bbox = _line_bbox(line_words)
        orientation = _orientation_from_bbox(bbox)
        for match in matches:
            feet_value = parse_dimension_text_to_feet(match.group(0))
            if feet_value is None:
                continue
            candidates.append(
                DimensionCandidate(
                    text=match.group(0),
                    feet_value=feet_value,
                    bbox=bbox,
                    orientation_hint=orientation,
                )
            )
    return candidates


def _wall_orientation(wall: Any) -> Literal["horizontal", "vertical"]:
    dx = abs(wall.end[0] - wall.start[0])
    dy = abs(wall.end[1] - wall.start[1])
    return "horizontal" if dx >= dy else "vertical"


def infer_scale_px_per_ft_from_dimensions(
    candidates: list[DimensionCandidate],
    geometry_result: Any,
) -> ScaleInferenceResult:
    if not candidates:
        return ScaleInferenceResult(reason="No PDF dimension candidates detected")

    walls = list(getattr(geometry_result, "walls", []) or [])
    if not walls:
        return ScaleInferenceResult(reason="No wall geometry available for scale pairing")

    ratios_by_candidate: list[list[float]] = []
    all_ratios: list[float] = []
    for candidate in candidates:
        candidate_ratios: list[float] = []
        for wall in walls:
            if _wall_orientation(wall) != candidate.orientation_hint:
                continue
            ratio = wall.length_px / candidate.feet_value
            if MIN_SCALE_PX_PER_FT <= ratio <= MAX_SCALE_PX_PER_FT:
                candidate_ratios.append(float(ratio))
                all_ratios.append(float(ratio))
        if candidate_ratios:
            ratios_by_candidate.append(candidate_ratios)

    if not all_ratios:
        return ScaleInferenceResult(reason="No plausible wall-to-dimension ratio pairs")

    bins: dict[int, int] = {}
    for ratio in all_ratios:
        bin_id = int(round(ratio / SCALE_BIN_SIZE))
        bins[bin_id] = bins.get(bin_id, 0) + 1
    dominant_bin = max(bins, key=bins.get)
    dominant_center = dominant_bin * SCALE_BIN_SIZE

    selected: list[float] = []
    for candidate_ratios in ratios_by_candidate:
        closest = min(candidate_ratios, key=lambda ratio: abs(ratio - dominant_center))
        if abs(closest - dominant_center) <= SCALE_BIN_SIZE:
            selected.append(closest)

    if len(selected) < MIN_SUPPORT_COUNT:
        return ScaleInferenceResult(
            reason=f"Insufficient support for inferred scale ({len(selected)} < {MIN_SUPPORT_COUNT})",
            support_count=len(selected),
        )

    inferred_scale = float(median(selected))
    if not (MIN_SCALE_PX_PER_FT <= inferred_scale <= MAX_SCALE_PX_PER_FT):
        return ScaleInferenceResult(reason="Inferred scale is outside plausible range")

    median_abs_deviation = median(abs(ratio - inferred_scale) for ratio in selected)
    relative_dispersion = (median_abs_deviation / inferred_scale) if inferred_scale > 0 else 1.0
    support_ratio = len(selected) / max(len(candidates), 1)
    confidence = max(0.0, min(1.0, (0.65 * support_ratio) + (0.35 * (1.0 - min(1.0, relative_dispersion * 6.0)))))

    if confidence < MIN_CONFIDENCE:
        return ScaleInferenceResult(
            scale_px_per_ft=None,
            confidence=round(confidence, 3),
            support_count=len(selected),
            reason=f"Inferred scale confidence below threshold ({confidence:.2f} < {MIN_CONFIDENCE:.2f})",
        )

    return ScaleInferenceResult(
        scale_px_per_ft=round(inferred_scale, 3),
        confidence=round(confidence, 3),
        support_count=len(selected),
        reason=f"Scale inferred from {len(selected)} dimension-supported pairings",
    )
