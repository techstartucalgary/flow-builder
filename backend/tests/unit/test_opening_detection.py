from __future__ import annotations

import sys
from pathlib import Path
import unittest

import numpy as np


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.vision.cv.models import Orientation, TagAnchor, TagClass, WallSegment  # noqa: E402
from src.vision.cv.opening_detection import recover_candidates_from_tags  # noqa: E402


class OpeningDetectionTests(unittest.TestCase):
    def test_recovery_prefers_short_junction_wall_for_door_tag(self):
        binary = np.zeros((220, 240), dtype=np.uint8)
        wall_mask = np.zeros((220, 240), dtype=np.uint8)
        walls = [
            WallSegment(
                id="long_hall",
                orientation=Orientation.HORIZONTAL,
                start=(20, 100),
                end=(220, 100),
                thickness=6,
                visual_thickness=12,
                length_px=200,
            ),
            WallSegment(
                id="short_partition",
                orientation=Orientation.VERTICAL,
                start=(120, 80),
                end=(120, 160),
                thickness=6,
                visual_thickness=12,
                length_px=80,
            ),
        ]
        tags = [
            TagAnchor(
                id="D-01",
                tag_class=TagClass.DOOR,
                center=(133, 91),
                radius=10,
                confidence=0.95,
            ),
        ]

        candidates, debug = recover_candidates_from_tags(
            tags=tags,
            matched_tag_ids=set(),
            walls=walls,
            binary=binary,
            wall_mask=wall_mask,
            host_wall_dist_door_px=120,
            host_wall_dist_window_px=180,
        )

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].wall_id, "short_partition")
        self.assertTrue(candidates[0].verified)
        self.assertEqual(int(debug["openings_rejected_endpoint_projection"]), 0)


if __name__ == "__main__":
    unittest.main()
