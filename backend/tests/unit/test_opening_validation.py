from __future__ import annotations

import sys
from pathlib import Path
import unittest

import numpy as np


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.api.annotation_store import _sanitize_document  # noqa: E402
from src.vision.cv.models import Orientation, WallSegment, TagAnchor, TagClass  # noqa: E402
from src.vision.cv.opening_detection import recover_candidates_from_tags  # noqa: E402
from src.vision.cv.opening_validation import (  # noqa: E402
    opening_fits_host_wall,
    opening_has_endpoint_clearance,
)


def _base_document(elements: list[dict]) -> dict:
    return {
        "documentId": "doc_1",
        "projectId": "project_1",
        "page": 1,
        "baseImage": {
            "sourceUrl": "https://example.com/plan.png",
            "widthPx": 300,
            "heightPx": 300,
            "scalePxPerFt": 10,
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


class OpeningValidationTests(unittest.TestCase):
    def test_opening_fits_host_wall_accepts_valid_span(self):
        self.assertTrue(
            opening_fits_host_wall(
                Orientation.HORIZONTAL,
                (10, 20),
                (120, 20),
                (40, 10, 50, 24),
            )
        )

    def test_opening_fits_host_wall_rejects_oversized_span(self):
        self.assertFalse(
            opening_fits_host_wall(
                Orientation.HORIZONTAL,
                (10, 20),
                (87, 20),
                (30, 10, 156, 24),
            )
        )

    def test_opening_has_endpoint_clearance_rejects_center_too_close_to_wall_end(self):
        self.assertFalse(
            opening_has_endpoint_clearance(
                Orientation.HORIZONTAL,
                (100, 20),
                (220, 20),
                (94, 8, 34, 24),
            )
        )

    def test_recovered_candidate_rejects_endpoint_projection(self):
        wall = WallSegment(
            id="H-01",
            orientation=Orientation.HORIZONTAL,
            start=(100, 100),
            end=(260, 100),
            thickness=12,
            visual_thickness=20,
            length_px=160,
        )
        tag = TagAnchor(
            id="D-01",
            tag_class=TagClass.DOOR,
            center=(111, 100),
            radius=8,
            confidence=0.95,
        )

        binary = np.zeros((400, 400), dtype="uint8")
        wall_mask = np.zeros((400, 400), dtype="uint8")

        candidates, debug = recover_candidates_from_tags(
            tags=[tag],
            matched_tag_ids=set(),
            walls=[wall],
            binary=binary,
            wall_mask=wall_mask,
            host_wall_dist_door_px=120,
            host_wall_dist_window_px=180,
        )

        self.assertEqual(candidates, [])
        self.assertEqual(debug["openings_rejected_endpoint_projection"], 1)

    def test_sanitize_document_drops_opening_that_does_not_fit_host_wall(self):
        document = _base_document([
            {
                "id": "wall_1",
                "type": "wall",
                "geometry": {
                    "kind": "segment",
                    "x1": 10,
                    "y1": 20,
                    "x2": 87,
                    "y2": 20,
                    "thicknessPx": 6,
                    "rotationDeg": 0,
                },
                "attrs": {"status": "auto", "locked": False, "visible": True},
                "relations": {},
            },
            {
                "id": "door_1",
                "type": "door",
                "geometry": {
                    "kind": "rect",
                    "x": 30,
                    "y": 8,
                    "width": 156,
                    "height": 24,
                    "rotationDeg": 0,
                },
                "attrs": {"status": "auto", "locked": False, "visible": True},
                "relations": {"hostWallId": "wall_1", "source": "gap_verified"},
            },
        ])

        sanitized, changed = _sanitize_document(document)

        self.assertTrue(changed)
        self.assertEqual([element["id"] for element in sanitized["elements"]], ["wall_1"])

    def test_sanitize_document_keeps_manual_opening_without_host_wall(self):
        document = _base_document([
            {
                "id": "wall_1",
                "type": "wall",
                "geometry": {
                    "kind": "segment",
                    "x1": 10,
                    "y1": 20,
                    "x2": 120,
                    "y2": 20,
                    "thicknessPx": 6,
                    "rotationDeg": 0,
                },
                "attrs": {"status": "auto", "locked": False, "visible": True},
                "relations": {},
            },
            {
                "id": "door_manual",
                "type": "door",
                "geometry": {
                    "kind": "rect",
                    "x": 30,
                    "y": 8,
                    "width": 72,
                    "height": 24,
                    "rotationDeg": 0,
                },
                "attrs": {"status": "new", "locked": False, "visible": True},
                "relations": {},
            },
        ])

        sanitized, changed = _sanitize_document(document)

        self.assertFalse(changed)
        self.assertEqual([element["id"] for element in sanitized["elements"]], ["wall_1", "door_manual"])


if __name__ == "__main__":
    unittest.main()
