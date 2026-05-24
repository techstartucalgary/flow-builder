from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
import unittest

import fitz


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.vision.cv.scale_inference import (  # noqa: E402
    DimensionCandidate,
    extract_pdf_dimension_candidates,
    infer_scale_px_per_ft_from_dimensions,
    parse_dimension_text_to_feet,
)


def _wall(start: tuple[int, int], end: tuple[int, int]):
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length_px = float((dx ** 2 + dy ** 2) ** 0.5)
    return SimpleNamespace(start=start, end=end, length_px=length_px)


class ScaleInferenceTests(unittest.TestCase):
    def test_parse_dimension_text_with_fractional_inches(self):
        value = parse_dimension_text_to_feet("42' - 1 1/2\"")
        self.assertIsNotNone(value)
        self.assertAlmostEqual(value, 42.125, places=3)

    def test_parse_dimension_text_rejects_invalid(self):
        self.assertIsNone(parse_dimension_text_to_feet("no dimension here"))
        self.assertIsNone(parse_dimension_text_to_feet("1' - 2\""))

    def test_extract_pdf_dimension_candidates(self):
        doc = fitz.open()
        page = doc.new_page(width=800, height=600)
        page.insert_text((50, 80), "42' - 1 1/2\"")
        pdf_bytes = doc.tobytes()
        doc.close()

        candidates = extract_pdf_dimension_candidates(pdf_bytes, 0)
        self.assertGreaterEqual(len(candidates), 1)
        self.assertTrue(any(abs(candidate.feet_value - 42.125) < 0.001 for candidate in candidates))

    def test_infer_scale_from_dimension_candidates(self):
        geometry_result = SimpleNamespace(
            walls=[
                _wall((0, 0), (1000, 0)),
                _wall((0, 10), (500, 10)),
                _wall((0, 20), (250, 20)),
            ]
        )
        candidates = [
            DimensionCandidate(text="20' - 0\"", feet_value=20.0, bbox=(0.0, 0.0, 120.0, 20.0), orientation_hint="horizontal"),
            DimensionCandidate(text="10' - 0\"", feet_value=10.0, bbox=(0.0, 30.0, 120.0, 50.0), orientation_hint="horizontal"),
            DimensionCandidate(text="5' - 0\"", feet_value=5.0, bbox=(0.0, 60.0, 120.0, 80.0), orientation_hint="horizontal"),
        ]

        result = infer_scale_px_per_ft_from_dimensions(candidates, geometry_result)
        self.assertIsNotNone(result.scale_px_per_ft)
        self.assertAlmostEqual(result.scale_px_per_ft or 0.0, 50.0, delta=1.0)
        self.assertGreaterEqual(result.confidence, 0.6)
        self.assertGreaterEqual(result.support_count, 3)

    def test_infer_scale_rejects_low_support(self):
        geometry_result = SimpleNamespace(walls=[_wall((0, 0), (1000, 0))])
        candidates = [
            DimensionCandidate(text="20' - 0\"", feet_value=20.0, bbox=(0.0, 0.0, 120.0, 20.0), orientation_hint="horizontal"),
            DimensionCandidate(text="10' - 0\"", feet_value=10.0, bbox=(0.0, 30.0, 120.0, 50.0), orientation_hint="horizontal"),
        ]
        result = infer_scale_px_per_ft_from_dimensions(candidates, geometry_result)
        self.assertIsNone(result.scale_px_per_ft)
        self.assertIn("Insufficient support", result.reason)


if __name__ == "__main__":
    unittest.main()
