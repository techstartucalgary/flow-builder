from __future__ import annotations

import sys
from pathlib import Path
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.estimators.drywall.annotation_geometry import NormalizedOpening  # noqa: E402
from src.estimators.drywall.board_estimator import estimate_board_requirements  # noqa: E402
from src.estimators.drywall.surface_classification import ClassifiedWall  # noqa: E402


class BoardEstimatorTests(unittest.TestCase):
    def test_mixed_wall_classes_produce_surface_specific_board_subtotals(self):
        result = estimate_board_requirements(
            walls=[
                ClassifiedWall("wall_p", "perimeter", "auto", 1, "high", False, 100.0),
                ClassifiedWall("wall_i", "partition", "auto", 2, "high", False, 80.0),
            ],
            openings=[
                NormalizedOpening(
                    id="door_1",
                    tag_class="door",
                    bbox=(0, 0, 30, 70),
                    center=(15, 35),
                    wall_id="wall_p",
                    matched=True,
                    width_ft=3.0,
                    height_ft=7.0,
                ),
            ],
            scale_px_per_ft=10.0,
            ceiling_height_ft=9.0,
            include_ceiling=True,
            room_closure_status="closed",
            floor_area_sqft=120.0,
            unmatched_opening_count=0,
            waste_factor=0.15,
            sheet_size_sqft=48.0,
            classification_confidence="high",
        )

        self.assertTrue(result.estimate_ready)
        self.assertAlmostEqual(result.perimeter_linear_ft, 10.0, places=2)
        self.assertAlmostEqual(result.partition_linear_ft, 8.0, places=2)
        self.assertAlmostEqual(result.perimeter_board_sqft, 90.0, places=2)
        self.assertAlmostEqual(result.partition_board_sqft, 144.0, places=2)
        self.assertAlmostEqual(result.opening_deduction_sqft, 21.0, places=2)
        self.assertEqual(result.opening_deduction_mode, "measured")
        self.assertGreater(result.sheets_required, 0)

    def test_unknown_wall_blocks_ready_state(self):
        result = estimate_board_requirements(
            walls=[
                ClassifiedWall("wall_u", "unknown", "auto", None, "low", False, 100.0),
            ],
            openings=[],
            scale_px_per_ft=10.0,
            ceiling_height_ft=9.0,
            include_ceiling=True,
            room_closure_status="closed",
            floor_area_sqft=120.0,
            unmatched_opening_count=0,
            waste_factor=0.15,
            sheet_size_sqft=48.0,
            classification_confidence="low",
        )

        self.assertFalse(result.estimate_ready)
        self.assertIn("classification", " ".join(result.blocked_reasons).lower())
        self.assertGreater(result.unknown_linear_ft, 0.0)
        self.assertGreater(result.unknown_board_sqft, 0.0)
        self.assertGreater(result.gross_wall_board_sqft, 0.0)
        self.assertGreater(result.net_wall_board_sqft, 0.0)
        self.assertEqual(result.ceiling_board_sqft, 0.0)
        self.assertEqual(result.sheets_required, 0)
        self.assertEqual(result.diagnostics.get("unknown_wall_treatment"), "provisional_1_side_draft")

    def test_fallback_opening_constants_block_ready_state(self):
        result = estimate_board_requirements(
            walls=[
                ClassifiedWall("wall_p", "perimeter", "auto", 1, "high", False, 100.0),
            ],
            openings=[
                NormalizedOpening(
                    id="door_1",
                    tag_class="door",
                    bbox=(0, 0, 30, 70),
                    center=(15, 35),
                    wall_id="wall_p",
                    matched=True,
                ),
            ],
            scale_px_per_ft=None,
            ceiling_height_ft=9.0,
            include_ceiling=True,
            room_closure_status="closed",
            floor_area_sqft=120.0,
            unmatched_opening_count=0,
            waste_factor=0.15,
            sheet_size_sqft=48.0,
            classification_confidence="high",
        )

        self.assertFalse(result.estimate_ready)
        self.assertEqual(result.fallback_opening_count, 1)
        self.assertEqual(result.opening_deduction_mode, "fallback_constants")
        self.assertEqual(result.sheets_required, 0)

    def test_unknown_walls_with_fallback_openings_keep_wall_board_non_zero(self):
        result = estimate_board_requirements(
            walls=[
                ClassifiedWall("wall_u", "unknown", "auto", None, "low", False, 100.0),
            ],
            openings=[
                NormalizedOpening(
                    id="door_1",
                    tag_class="door",
                    bbox=(0, 0, 500, 900),
                    center=(250, 450),
                    wall_id="wall_u",
                    matched=True,
                ),
            ],
            scale_px_per_ft=10.0,
            ceiling_height_ft=9.0,
            include_ceiling=True,
            room_closure_status="open",
            floor_area_sqft=120.0,
            unmatched_opening_count=0,
            waste_factor=0.15,
            sheet_size_sqft=48.0,
            classification_confidence="low",
        )

        self.assertFalse(result.estimate_ready)
        self.assertGreater(result.unknown_board_sqft, 0.0)
        self.assertGreater(result.gross_wall_board_sqft, 0.0)
        self.assertGreater(result.net_wall_board_sqft, 0.0)
        self.assertIn("fallback constants", " ".join(result.blocked_reasons).lower())
        self.assertEqual(result.ceiling_board_sqft, 0.0)
        self.assertEqual(result.sheets_required, 0)


if __name__ == "__main__":
    unittest.main()
