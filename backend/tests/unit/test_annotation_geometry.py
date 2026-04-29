from __future__ import annotations

import sys
from pathlib import Path
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.estimators.drywall.annotation_geometry import build_takeoff_geometry_snapshot  # noqa: E402


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


class AnnotationGeometryTests(unittest.TestCase):
    def test_geometry_hash_changes_when_wall_moves_but_length_does_not(self):
        base = _document([
            {
                "id": "wall_1",
                "type": "wall",
                "geometry": {"kind": "segment", "x1": 10, "y1": 10, "x2": 110, "y2": 10, "thicknessPx": 6},
            },
        ])
        moved = _document([
            {
                "id": "wall_1",
                "type": "wall",
                "geometry": {"kind": "segment", "x1": 10, "y1": 20, "x2": 110, "y2": 20, "thicknessPx": 6},
            },
        ])

        base_snapshot = build_takeoff_geometry_snapshot(base, revision=1, effective_scale_px_per_ft=10.0)
        moved_snapshot = build_takeoff_geometry_snapshot(moved, revision=2, effective_scale_px_per_ft=10.0)

        self.assertNotEqual(base_snapshot.geometry_hash, moved_snapshot.geometry_hash)
        self.assertAlmostEqual(
            sum(wall.length_px for wall in base_snapshot.walls),
            sum(wall.length_px for wall in moved_snapshot.walls),
            places=3,
        )

    def test_snapshot_is_stable_for_element_ordering(self):
        elements = [
            {"id": "wall_1", "type": "wall", "geometry": {"kind": "segment", "x1": 10, "y1": 10, "x2": 110, "y2": 10, "thicknessPx": 6}},
            {"id": "wall_2", "type": "wall", "geometry": {"kind": "segment", "x1": 110, "y1": 10, "x2": 110, "y2": 110, "thicknessPx": 6}},
            {"id": "door_1", "type": "door", "geometry": {"kind": "rect", "x": 40, "y": 10, "width": 30, "height": 70}, "relations": {"hostWallId": "wall_1"}},
        ]

        forward = build_takeoff_geometry_snapshot(_document(elements), revision=1, effective_scale_px_per_ft=10.0)
        reverse = build_takeoff_geometry_snapshot(_document(list(reversed(elements))), revision=1, effective_scale_px_per_ft=10.0)

        self.assertEqual(forward.geometry_hash, reverse.geometry_hash)

    def test_unmatched_openings_are_excluded_and_counted(self):
        snapshot = build_takeoff_geometry_snapshot(
            _document([
                {"id": "wall_1", "type": "wall", "geometry": {"kind": "segment", "x1": 10, "y1": 10, "x2": 110, "y2": 10, "thicknessPx": 6}},
                {"id": "door_1", "type": "door", "geometry": {"kind": "rect", "x": 40, "y": 10, "width": 30, "height": 70}, "relations": {"hostWallId": "wall_1"}},
                {"id": "window_1", "type": "window", "geometry": {"kind": "rect", "x": 200, "y": 200, "width": 40, "height": 30}},
            ]),
            revision=1,
            effective_scale_px_per_ft=10.0,
        )

        matched = [opening for opening in snapshot.openings if opening.matched]
        unmatched = [opening for opening in snapshot.openings if not opening.matched]

        self.assertEqual(snapshot.unmatched_opening_count, 1)
        self.assertEqual(len(matched), 1)
        self.assertEqual(len(unmatched), 1)

    def test_parallel_saved_wall_faces_are_merged_for_takeoff(self):
        snapshot = build_takeoff_geometry_snapshot(
            _document([
                {
                    "id": "wall_face_a",
                    "type": "wall",
                    "geometry": {"kind": "segment", "x1": 20, "y1": 40, "x2": 180, "y2": 40, "thicknessPx": 6},
                },
                {
                    "id": "wall_face_b",
                    "type": "wall",
                    "geometry": {"kind": "segment", "x1": 20, "y1": 60, "x2": 180, "y2": 60, "thicknessPx": 6},
                },
            ]),
            revision=1,
            effective_scale_px_per_ft=10.0,
        )

        self.assertEqual(snapshot.wall_count, 1)
        self.assertEqual(snapshot.walls[0].start, (20, 50))
        self.assertEqual(snapshot.walls[0].end, (180, 50))
        self.assertEqual(set(snapshot.walls[0].source_ids), {"wall_face_a", "wall_face_b"})
        self.assertEqual(snapshot.diagnostics["parallel_wall_face_merge_count"], 1)


if __name__ == "__main__":
    unittest.main()
