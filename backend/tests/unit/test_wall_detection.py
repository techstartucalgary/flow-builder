from __future__ import annotations

import sys
from pathlib import Path
import unittest

import numpy as np


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.vision.cv.models import Orientation, WallSegment  # noqa: E402
from src.vision.cv.wall_detection import (  # noqa: E402
    extract_wall_segments_with_debug,
    suppress_measurement_artifacts,
)


class WallDetectionTests(unittest.TestCase):
    def test_short_interior_fragment_with_orthogonal_support_is_preserved(self):
        shape = (160, 160)
        h_mask = np.zeros(shape, dtype=np.uint8)
        v_mask = np.zeros(shape, dtype=np.uint8)
        thin_h_mask = np.zeros(shape, dtype=np.uint8)
        thin_v_mask = np.zeros(shape, dtype=np.uint8)
        roi = np.full(shape, 255, dtype=np.uint8)

        v_mask[20:141, 78:84] = 255
        thin_h_mask[78:82, 48:78] = 255

        walls, debug = extract_wall_segments_with_debug(
            h_mask,
            v_mask,
            thin_h_mask=thin_h_mask,
            thin_v_mask=thin_v_mask,
            structural_roi=roi,
        )

        horizontal_segments = [wall for wall in walls if wall.orientation == Orientation.HORIZONTAL]
        self.assertTrue(any(28 <= wall.length_px <= 40 for wall in horizontal_segments))
        self.assertGreaterEqual(int(debug["walls_from_thin_branch"]), 1)
        self.assertGreaterEqual(int(debug["short_segments_promoted"]), 1)

    def test_text_adjacent_structural_segment_survives_suppression_when_supported(self):
        binary = np.zeros((220, 380), dtype=np.uint8)
        for x in range(30, 320, 28):
            binary[62:70, x:x + 8] = 255
            binary[76:84, x:x + 8] = 255

        walls = [
            WallSegment(
                id="H-01",
                orientation=Orientation.HORIZONTAL,
                start=(20, 72),
                end=(340, 72),
                thickness=6,
                length_px=320,
            ),
            WallSegment(
                id="V-01",
                orientation=Orientation.VERTICAL,
                start=(180, 40),
                end=(180, 120),
                thickness=6,
                length_px=80,
            ),
        ]

        filtered, debug = suppress_measurement_artifacts(walls, binary)

        self.assertEqual(len(filtered), 2)
        self.assertEqual(int(debug["walls_after_suppression"]), 2)
        self.assertEqual(int(debug["walls_suppressed_as_text"]), 0)

    def test_thin_branch_candidates_outside_structural_roi_are_rejected(self):
        shape = (160, 160)
        h_mask = np.zeros(shape, dtype=np.uint8)
        v_mask = np.zeros(shape, dtype=np.uint8)
        thin_h_mask = np.zeros(shape, dtype=np.uint8)
        thin_v_mask = np.zeros(shape, dtype=np.uint8)
        roi = np.zeros(shape, dtype=np.uint8)
        roi[:, 90:] = 255

        v_mask[20:141, 38:44] = 255
        thin_h_mask[78:82, 8:38] = 255

        walls, debug = extract_wall_segments_with_debug(
            h_mask,
            v_mask,
            thin_h_mask=thin_h_mask,
            thin_v_mask=thin_v_mask,
            structural_roi=roi,
        )

        self.assertFalse(any(wall.orientation == Orientation.HORIZONTAL for wall in walls))
        self.assertEqual(int(debug["walls_from_thin_branch"]), 0)
        self.assertEqual(int(debug["short_segments_promoted"]), 0)


if __name__ == "__main__":
    unittest.main()
