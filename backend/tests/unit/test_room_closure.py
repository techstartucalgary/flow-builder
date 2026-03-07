from __future__ import annotations

import sys
from pathlib import Path
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.estimators.drywall.annotation_geometry import build_takeoff_geometry_snapshot  # noqa: E402
from src.estimators.drywall.room_closure import compute_enclosed_regions  # noqa: E402


def _document(elements: list[dict], scale_px_per_ft: float = 10.0) -> dict:
    return {
        "documentId": "doc_1",
        "projectId": "project_1",
        "page": 1,
        "baseImage": {
            "sourceUrl": "https://example.com/plan.png",
            "widthPx": 300,
            "heightPx": 300,
            "scalePxPerFt": scale_px_per_ft,
        },
        "meta": {
            "schemaVersion": 1,
            "source": "manual",
            "createdAt": "2026-03-05T00:00:00Z",
            "updatedAt": "2026-03-05T00:00:00Z",
            "revision": 1,
        },
        "layers": {
            "wall": True,
            "door": True,
            "window": True,
            "room": True,
        },
        "elements": elements,
        "issues": [],
    }


class RoomClosureTests(unittest.TestCase):
    def test_hosted_window_does_not_break_closed_shell(self):
        snapshot = build_takeoff_geometry_snapshot(
            _document([
                {"id": "w1", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 140, "y2": 20, "thicknessPx": 6}},
                {"id": "w2", "type": "wall", "geometry": {"kind": "segment", "x1": 140, "y1": 20, "x2": 140, "y2": 140, "thicknessPx": 6}},
                {"id": "w3", "type": "wall", "geometry": {"kind": "segment", "x1": 140, "y1": 140, "x2": 20, "y2": 140, "thicknessPx": 6}},
                {"id": "w4", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 140, "x2": 20, "y2": 20, "thicknessPx": 6}},
                {"id": "window_1", "type": "window", "geometry": {"kind": "rect", "x": 60, "y": 10, "width": 40, "height": 20}, "relations": {"hostWallId": "w1"}},
            ]),
            revision=1,
            effective_scale_px_per_ft=10.0,
        )

        result = compute_enclosed_regions(snapshot)

        self.assertEqual(result.status, "closed")
        self.assertEqual(result.confidence, "high")
        self.assertGreater(result.floor_area_sqft, 100.0)

    def test_open_shell_returns_zero_area(self):
        snapshot = build_takeoff_geometry_snapshot(
            _document([
                {"id": "w1", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 140, "y2": 20, "thicknessPx": 6}},
                {"id": "w2", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 20, "y2": 140, "thicknessPx": 6}},
                {"id": "w3", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 140, "x2": 140, "y2": 140, "thicknessPx": 6}},
            ]),
            revision=1,
            effective_scale_px_per_ft=10.0,
        )

        result = compute_enclosed_regions(snapshot)

        self.assertEqual(result.status, "open")
        self.assertEqual(result.confidence, "low")
        self.assertEqual(result.floor_area_sqft, 0.0)

    def test_small_gap_in_shell_returns_ambiguous(self):
        snapshot = build_takeoff_geometry_snapshot(
            _document([
                {"id": "top_left", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 76, "y2": 20, "thicknessPx": 6}},
                {"id": "top_right", "type": "wall", "geometry": {"kind": "segment", "x1": 85, "y1": 20, "x2": 140, "y2": 20, "thicknessPx": 6}},
                {"id": "w2", "type": "wall", "geometry": {"kind": "segment", "x1": 140, "y1": 20, "x2": 140, "y2": 140, "thicknessPx": 6}},
                {"id": "w3", "type": "wall", "geometry": {"kind": "segment", "x1": 140, "y1": 140, "x2": 20, "y2": 140, "thicknessPx": 6}},
                {"id": "w4", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 140, "x2": 20, "y2": 20, "thicknessPx": 6}},
            ]),
            revision=1,
            effective_scale_px_per_ft=10.0,
        )

        result = compute_enclosed_regions(snapshot)

        self.assertEqual(result.status, "ambiguous")
        self.assertEqual(result.confidence, "low")
        self.assertEqual(result.floor_area_sqft, 0.0)


if __name__ == "__main__":
    unittest.main()
