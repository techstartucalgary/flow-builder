from __future__ import annotations

import sys
from pathlib import Path
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.estimators.drywall.annotation_geometry import build_takeoff_geometry_snapshot  # noqa: E402
from src.estimators.drywall.surface_classification import classify_wall_surfaces  # noqa: E402


def _document(elements: list[dict], scale_px_per_ft: float = 10.0) -> dict:
    return {
        "documentId": "doc_1",
        "projectId": "project_1",
        "page": 1,
        "baseImage": {
            "sourceUrl": "https://example.com/plan.png",
            "widthPx": 260,
            "heightPx": 220,
            "scalePxPerFt": scale_px_per_ft,
        },
        "meta": {
            "schemaVersion": 1,
            "source": "manual",
            "createdAt": "2026-03-05T00:00:00Z",
            "updatedAt": "2026-03-05T00:00:00Z",
            "revision": 1,
        },
        "layers": {"wall": True, "door": True, "window": True, "room": True},
        "elements": elements,
        "issues": [],
    }


class SurfaceClassificationTests(unittest.TestCase):
    def test_closed_shell_and_partition_are_classified(self):
        snapshot = build_takeoff_geometry_snapshot(
            _document([
                {"id": "top", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 220, "y2": 20, "thicknessPx": 6}},
                {"id": "right", "type": "wall", "geometry": {"kind": "segment", "x1": 220, "y1": 20, "x2": 220, "y2": 180, "thicknessPx": 6}},
                {"id": "bottom", "type": "wall", "geometry": {"kind": "segment", "x1": 220, "y1": 180, "x2": 20, "y2": 180, "thicknessPx": 6}},
                {"id": "left", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 180, "x2": 20, "y2": 20, "thicknessPx": 6}},
                {"id": "mid", "type": "wall", "geometry": {"kind": "segment", "x1": 120, "y1": 20, "x2": 120, "y2": 180, "thicknessPx": 6}},
            ]),
            revision=1,
            effective_scale_px_per_ft=10.0,
        )

        result = classify_wall_surfaces(snapshot)

        self.assertGreaterEqual(result.perimeter_wall_count, 4)
        self.assertEqual(result.partition_wall_count, 1)
        self.assertEqual(result.unknown_wall_count, 0)
        self.assertIn(result.confidence, {"high", "medium"})

    def test_manual_wall_override_beats_auto_classification(self):
        snapshot = build_takeoff_geometry_snapshot(
            _document([
                {
                    "id": "wall_1",
                    "type": "wall",
                    "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 20, "y2": 180, "thicknessPx": 6},
                    "relations": {
                        "surfaceClass": "partition",
                        "surfaceClassSource": "manual",
                        "boardSides": 2,
                    },
                },
            ]),
            revision=1,
            effective_scale_px_per_ft=10.0,
        )

        result = classify_wall_surfaces(snapshot)

        self.assertEqual(result.walls[0].surface_class, "partition")
        self.assertEqual(result.walls[0].surface_class_source, "manual")
        self.assertEqual(result.walls[0].board_sides, 2)
        self.assertEqual(result.walls[0].confidence, "high")


if __name__ == "__main__":
    unittest.main()
