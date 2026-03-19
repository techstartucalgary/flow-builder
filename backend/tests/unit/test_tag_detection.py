from __future__ import annotations

import sys
from pathlib import Path
import unittest
from unittest.mock import patch

import numpy as np


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.vision.cv.models import Orientation, TagAnchor, TagClass, WallSegment  # noqa: E402
from src.vision.cv.tag_detection import detect_tags  # noqa: E402


class TagDetectionTests(unittest.TestCase):
    def test_detect_tags_ignores_candidates_outside_structural_roi(self):
        gray = np.zeros((180, 180), dtype=np.uint8)
        binary = np.zeros((180, 180), dtype=np.uint8)
        wall_mask = np.zeros((180, 180), dtype=np.uint8)
        roi = np.zeros((180, 180), dtype=np.uint8)
        roi[40:140, 40:140] = 255
        walls = [
            WallSegment(
                id="H-01",
                orientation=Orientation.HORIZONTAL,
                start=(40, 90),
                end=(140, 90),
                thickness=6,
                visual_thickness=12,
                length_px=100,
            ),
        ]

        with patch("src.vision.cv.tag_detection._detect_circles") as mock_circles, patch(
            "src.vision.cv.tag_detection._detect_hexagons"
        ) as mock_hexagons:
            mock_circles.return_value = (
                [
                    TagAnchor(id="D-01", tag_class=TagClass.DOOR, center=(70, 70), radius=12, confidence=0.8),
                    TagAnchor(id="D-02", tag_class=TagClass.DOOR, center=(12, 12), radius=12, confidence=0.8),
                ],
                2,
            )
            mock_hexagons.return_value = (
                [
                    TagAnchor(id="W-01", tag_class=TagClass.WINDOW, center=(110, 110), radius=12, confidence=0.8),
                    TagAnchor(id="W-02", tag_class=TagClass.WINDOW, center=(164, 164), radius=12, confidence=0.8),
                ],
                2,
            )

            tags, debug = detect_tags(
                gray,
                binary,
                wall_mask,
                walls,
                structural_roi=roi,
            )

        self.assertEqual({tag.id for tag in tags}, {"D-01", "W-01"})
        self.assertEqual(int(debug["door_tags_raw"]), 2)
        self.assertEqual(int(debug["window_tags_raw"]), 2)
        self.assertEqual(int(debug["door_tags_after_dedupe"]), 1)
        self.assertEqual(int(debug["window_tags_after_dedupe"]), 1)


if __name__ == "__main__":
    unittest.main()
