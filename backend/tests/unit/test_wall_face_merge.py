from __future__ import annotations

import sys
from pathlib import Path
import unittest

import numpy as np


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.vision.cv.models import Orientation, WallSegment  # noqa: E402
from src.vision.cv.wall_face_merge import merge_wall_faces_to_centerlines  # noqa: E402


def _wall(
    wall_id: str,
    orientation: Orientation,
    start: tuple[int, int],
    end: tuple[int, int],
    thickness: int = 6,
) -> WallSegment:
    return WallSegment(
        id=wall_id,
        orientation=orientation,
        start=start,
        end=end,
        thickness=thickness,
        visual_thickness=thickness,
        length_px=abs(end[0] - start[0]) + abs(end[1] - start[1]),
    )


class WallFaceMergeTests(unittest.TestCase):
    def test_horizontal_faces_merge_to_centerline(self):
        h_mask = np.zeros((140, 220), dtype=np.uint8)
        v_mask = np.zeros_like(h_mask)
        h_mask[49:52, 20:201] = 255
        h_mask[69:72, 20:201] = 255

        merged, debug = merge_wall_faces_to_centerlines(
            [
                _wall("H-01", Orientation.HORIZONTAL, (20, 50), (200, 50)),
                _wall("H-02", Orientation.HORIZONTAL, (20, 70), (200, 70)),
            ],
            h_mask,
            v_mask,
        )

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].start, (20, 60))
        self.assertEqual(merged[0].end, (200, 60))
        self.assertEqual(merged[0].merge_kind, "paired_faces")
        self.assertEqual(merged[0].source_ids, ["H-01", "H-02"])
        self.assertEqual(debug.merged_pairs, 1)

    def test_vertical_faces_merge_to_centerline(self):
        h_mask = np.zeros((220, 140), dtype=np.uint8)
        v_mask = np.zeros_like(h_mask)
        v_mask[20:201, 39:42] = 255
        v_mask[20:201, 59:62] = 255

        merged, _debug = merge_wall_faces_to_centerlines(
            [
                _wall("V-01", Orientation.VERTICAL, (40, 20), (40, 200)),
                _wall("V-02", Orientation.VERTICAL, (60, 20), (60, 200)),
            ],
            h_mask,
            v_mask,
        )

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].start, (50, 20))
        self.assertEqual(merged[0].end, (50, 200))

    def test_nearby_parallel_walls_do_not_merge_without_two_face_support(self):
        h_mask = np.zeros((140, 220), dtype=np.uint8)
        v_mask = np.zeros_like(h_mask)
        h_mask[49:52, 20:201] = 255

        merged, debug = merge_wall_faces_to_centerlines(
            [
                _wall("H-01", Orientation.HORIZONTAL, (20, 50), (200, 50)),
                _wall("H-02", Orientation.HORIZONTAL, (20, 70), (200, 70)),
            ],
            h_mask,
            v_mask,
        )

        self.assertEqual(len(merged), 2)
        self.assertTrue(all(wall.merge_kind == "single_face" for wall in merged))
        self.assertEqual(debug.merged_pairs, 0)

    def test_low_overlap_pair_is_rejected(self):
        h_mask = np.zeros((140, 220), dtype=np.uint8)
        v_mask = np.zeros_like(h_mask)
        h_mask[49:52, 20:201] = 255
        h_mask[69:72, 150:201] = 255

        merged, debug = merge_wall_faces_to_centerlines(
            [
                _wall("H-01", Orientation.HORIZONTAL, (20, 50), (200, 50)),
                _wall("H-02", Orientation.HORIZONTAL, (150, 70), (200, 70)),
            ],
            h_mask,
            v_mask,
        )

        self.assertEqual(len(merged), 2)
        self.assertEqual(debug.candidates, 0)


if __name__ == "__main__":
    unittest.main()
