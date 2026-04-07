from __future__ import annotations

import cv2
import json
import numpy as np
import sys
from pathlib import Path
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.estimators.drywall.annotation_geometry import build_takeoff_geometry_snapshot  # noqa: E402
from src.estimators.drywall.room_closure import (  # noqa: E402
    ExtractedRoom,
    RoomExtractionResult,
    _all_walls_orthogonal,
    _classify_room_space,
    _merge_orthogonal_fragments,
    _pass_selection_key,
    compute_enclosed_regions,
    extract_room_regions,
)


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
    def test_merge_orthogonal_fragments_merges_soft_vertical_seam(self):
        document = _document([
            {"id": "top", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 260, "y2": 20, "thicknessPx": 6}},
            {"id": "right", "type": "wall", "geometry": {"kind": "segment", "x1": 260, "y1": 20, "x2": 260, "y2": 180, "thicknessPx": 6}},
            {"id": "bottom", "type": "wall", "geometry": {"kind": "segment", "x1": 260, "y1": 180, "x2": 20, "y2": 180, "thicknessPx": 6}},
            {"id": "left", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 180, "x2": 20, "y2": 20, "thicknessPx": 6}},
        ])
        snapshot = build_takeoff_geometry_snapshot(document, revision=1, effective_scale_px_per_ft=10.0)

        shape = (document["baseImage"]["heightPx"] * 2, document["baseImage"]["widthPx"] * 2)
        left_mask = np.zeros(shape, dtype=np.uint8)
        right_mask = np.zeros(shape, dtype=np.uint8)
        cv2.rectangle(left_mask, (60, 60), (200, 280), 255, -1)
        cv2.rectangle(right_mask, (214, 60), (346, 280), 255, -1)

        merged_masks, debug = _merge_orthogonal_fragments(snapshot, [left_mask, right_mask])

        self.assertEqual(len(merged_masks), 1)
        self.assertGreaterEqual(int(debug.get("soft_seam_count", 0)), 1)
        self.assertEqual(int(debug.get("hard_separator_count", 0)), 0)

    def test_merge_orthogonal_fragments_keeps_real_wall_separator(self):
        document = _document([
            {"id": "top", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 260, "y2": 20, "thicknessPx": 6}},
            {"id": "right", "type": "wall", "geometry": {"kind": "segment", "x1": 260, "y1": 20, "x2": 260, "y2": 180, "thicknessPx": 6}},
            {"id": "bottom", "type": "wall", "geometry": {"kind": "segment", "x1": 260, "y1": 180, "x2": 20, "y2": 180, "thicknessPx": 6}},
            {"id": "left", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 180, "x2": 20, "y2": 20, "thicknessPx": 6}},
            {"id": "partition", "type": "wall", "geometry": {"kind": "segment", "x1": 100, "y1": 20, "x2": 100, "y2": 180, "thicknessPx": 6}},
        ])
        snapshot = build_takeoff_geometry_snapshot(document, revision=1, effective_scale_px_per_ft=10.0)

        shape = (document["baseImage"]["heightPx"] * 2, document["baseImage"]["widthPx"] * 2)
        left_mask = np.zeros(shape, dtype=np.uint8)
        right_mask = np.zeros(shape, dtype=np.uint8)
        cv2.rectangle(left_mask, (60, 60), (196, 280), 255, -1)
        cv2.rectangle(right_mask, (204, 60), (340, 280), 255, -1)

        merged_masks, debug = _merge_orthogonal_fragments(snapshot, [left_mask, right_mask])

        self.assertEqual(len(merged_masks), 2)
        self.assertGreaterEqual(int(debug.get("hard_separator_count", 0)), 1)

    def test_merge_orthogonal_fragments_suppresses_soft_seams_when_topology_is_fragmented_and_doors_missing(self):
        document = _document([
            {"id": "s1", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 70, "y2": 20, "thicknessPx": 6}},
            {"id": "s2", "type": "wall", "geometry": {"kind": "segment", "x1": 95, "y1": 20, "x2": 145, "y2": 20, "thicknessPx": 6}},
            {"id": "s3", "type": "wall", "geometry": {"kind": "segment", "x1": 170, "y1": 20, "x2": 220, "y2": 20, "thicknessPx": 6}},
            {"id": "s4", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 80, "x2": 20, "y2": 130, "thicknessPx": 6}},
            {"id": "s5", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 160, "x2": 20, "y2": 210, "thicknessPx": 6}},
            {"id": "s6", "type": "wall", "geometry": {"kind": "segment", "x1": 220, "y1": 80, "x2": 220, "y2": 130, "thicknessPx": 6}},
            {"id": "s7", "type": "wall", "geometry": {"kind": "segment", "x1": 220, "y1": 160, "x2": 220, "y2": 210, "thicknessPx": 6}},
        ])
        snapshot = build_takeoff_geometry_snapshot(document, revision=1, effective_scale_px_per_ft=10.0)

        shape = (document["baseImage"]["heightPx"] * 2, document["baseImage"]["widthPx"] * 2)
        left_mask = np.zeros(shape, dtype=np.uint8)
        right_mask = np.zeros(shape, dtype=np.uint8)
        cv2.rectangle(left_mask, (60, 60), (200, 280), 255, -1)
        cv2.rectangle(right_mask, (228, 60), (360, 280), 255, -1)
        cv2.rectangle(right_mask, (228, 150), (256, 215), 0, -1)

        merged_masks, debug = _merge_orthogonal_fragments(snapshot, [left_mask, right_mask])

        self.assertEqual(len(merged_masks), 2)
        self.assertEqual(int(debug.get("soft_seam_count", 0)), 0)
        self.assertGreaterEqual(int(debug.get("topology_gap_count", 0)), 12)
        self.assertGreaterEqual(float(debug.get("soft_seam_contact_min_ratio", 0.0)), 0.72)
        self.assertEqual(int(debug.get("door_opening_count", -1)), 0)

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

    def test_extract_room_regions_returns_adjacent_rooms_with_material_area(self):
        document = _document([
            {"id": "top", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 220, "y2": 20, "thicknessPx": 6}},
            {"id": "right", "type": "wall", "geometry": {"kind": "segment", "x1": 220, "y1": 20, "x2": 220, "y2": 140, "thicknessPx": 6}},
            {"id": "bottom", "type": "wall", "geometry": {"kind": "segment", "x1": 220, "y1": 140, "x2": 20, "y2": 140, "thicknessPx": 6}},
            {"id": "left", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 140, "x2": 20, "y2": 20, "thicknessPx": 6}},
            {"id": "partition_top", "type": "wall", "geometry": {"kind": "segment", "x1": 120, "y1": 20, "x2": 120, "y2": 66, "thicknessPx": 6}},
            {"id": "partition_bottom", "type": "wall", "geometry": {"kind": "segment", "x1": 120, "y1": 98, "x2": 120, "y2": 140, "thicknessPx": 6}},
            {"id": "door_1", "type": "door", "geometry": {"kind": "rect", "x": 108, "y": 66, "width": 24, "height": 32}},
            {
                "id": "room_auto_1",
                "type": "room",
                "geometry": {"kind": "polygon", "points": [[28, 28], [112, 28], [112, 132], [28, 132]]},
                "attrs": {"status": "edited", "locked": False, "visible": True, "confidence": 1, "name": "Living Room"},
                "relations": {"material": "hardwood", "areaSqFt": 100.0, "quantityRequired": 100.0, "quantityUnit": "sqft"},
            },
        ])

        snapshot = build_takeoff_geometry_snapshot(document, revision=1, effective_scale_px_per_ft=10.0)
        result = extract_room_regions(snapshot, existing_document=document)

        self.assertEqual(len(result.rooms), 2)
        self.assertAlmostEqual(result.total_area_sqft, sum(room.area_sqft for room in result.rooms), places=3)
        self.assertTrue(any(room.material == "hardwood" for room in result.rooms))
        self.assertTrue(all(room.quantity_required > 0 for room in result.rooms))
        self.assertGreaterEqual(int(result.debug.get("door_inferred_closure_count", 0)), 1)
        self.assertGreaterEqual(int(result.debug.get("split_wall_regions", 0)), 1)
        self.assertEqual(int(result.debug.get("split_watershed_regions", 0)), 0)

    def test_extract_room_regions_uses_fallback_for_zero_candidate_saved_page(self):
        path = BACKEND_ROOT / "data" / "annotations" / "0cf961ef-2a6c-47ff-a368-402e3060beaa_page_1.json"
        payload = json.loads(path.read_text())
        document = payload["document"]

        snapshot = build_takeoff_geometry_snapshot(
            document,
            revision=int(payload["latest_revision"]),
            effective_scale_px_per_ft=document["baseImage"].get("scalePxPerFt"),
        )
        result = extract_room_regions(snapshot, existing_document=document)

        self.assertGreaterEqual(len(result.rooms), 1)
        self.assertTrue(bool(result.debug.get("fallback_attempted")))
        self.assertEqual(int(result.debug.get("strict_candidate_label_count", -1)), 0)
        self.assertIn(str(result.debug.get("selected_pass")), {"fallback", "orthogonal"})

    def test_extract_room_regions_saved_page_recovers_multiple_rooms(self):
        path = BACKEND_ROOT / "data" / "annotations" / "0cf961ef-2a6c-47ff-a368-402e3060beaa_page_1.json"
        payload = json.loads(path.read_text())
        document = payload["document"]

        snapshot = build_takeoff_geometry_snapshot(
            document,
            revision=int(payload["latest_revision"]),
            effective_scale_px_per_ft=document["baseImage"].get("scalePxPerFt"),
        )
        result = extract_room_regions(snapshot, existing_document=document)

        self.assertGreaterEqual(len(result.rooms), 5)
        self.assertLessEqual(len(result.rooms), 7)
        self.assertGreaterEqual(float(result.debug.get("coverage_ratio", 0.0)), 0.72)
        self.assertEqual(str(result.debug.get("selected_pass")), "orthogonal")
        self.assertGreater(int(result.debug.get("fragment_count_before_merge", 0)), len(result.rooms))
        self.assertGreaterEqual(int(result.debug.get("merge_count", 0)), 1)
        dominant_ratio = max((room.area_sqft for room in result.rooms), default=0.0) / max(result.total_area_sqft, 1.0)
        self.assertLessEqual(dominant_ratio, 0.58)

    def test_pass_selection_prefers_multi_room_result_when_topology_is_open(self):
        def room(room_id: str, area_sqft: float, bbox_x: int) -> ExtractedRoom:
            return ExtractedRoom(
                id=room_id,
                polygon=[(bbox_x, 0), (bbox_x + 10, 0), (bbox_x + 10, 10), (bbox_x, 10)],
                bbox=(bbox_x, 0, bbox_x + 10, 10),
                centroid=(bbox_x + 5.0, 5.0),
                area_sqft=area_sqft,
                area_px=area_sqft * 100.0,
                quantity_required=area_sqft,
                quantity_unit="sqft",
                extraction_status="ambiguous",
                extraction_confidence=0.7,
                touches_border=False,
            )

        repaired_single_room = RoomExtractionResult(
            rooms=[room("strict_room", 320.0, 0)],
            status="ambiguous",
            confidence="low",
            total_area_sqft=320.0,
            debug={
                "coverage_ratio": 1.0,
                "closure_status": "open",
                "endpoint_repair_count": 18,
            },
        )
        orthogonal_multi_room = RoomExtractionResult(
            rooms=[
                room("orth_1", 95.0, 0),
                room("orth_2", 90.0, 20),
                room("orth_3", 82.0, 40),
                room("orth_4", 78.0, 60),
            ],
            status="ambiguous",
            confidence="medium",
            total_area_sqft=345.0,
            debug={
                "coverage_ratio": 0.67,
                "closure_status": "open",
                "fragment_count_before_merge": 6,
                "merged_room_count": 4,
            },
        )

        self.assertGreater(_pass_selection_key(orthogonal_multi_room), _pass_selection_key(repaired_single_room))

    def test_extract_room_regions_preserves_l_shaped_room_polygon(self):
        document = _document([
            {"id": "w1", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 220, "y2": 20, "thicknessPx": 6}},
            {"id": "w2", "type": "wall", "geometry": {"kind": "segment", "x1": 220, "y1": 20, "x2": 220, "y2": 80, "thicknessPx": 6}},
            {"id": "w3", "type": "wall", "geometry": {"kind": "segment", "x1": 220, "y1": 80, "x2": 140, "y2": 80, "thicknessPx": 6}},
            {"id": "w4", "type": "wall", "geometry": {"kind": "segment", "x1": 140, "y1": 80, "x2": 140, "y2": 180, "thicknessPx": 6}},
            {"id": "w5", "type": "wall", "geometry": {"kind": "segment", "x1": 140, "y1": 180, "x2": 20, "y2": 180, "thicknessPx": 6}},
            {"id": "w6", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 180, "x2": 20, "y2": 20, "thicknessPx": 6}},
        ])

        snapshot = build_takeoff_geometry_snapshot(document, revision=1, effective_scale_px_per_ft=10.0)
        result = extract_room_regions(snapshot, existing_document=document)

        self.assertEqual(len(result.rooms), 1)
        self.assertGreater(len(result.rooms[0].polygon), 4)
        self.assertGreater(result.rooms[0].area_sqft, 200.0)

    def test_tiny_angled_fragments_do_not_disable_orthogonal_pass(self):
        document = _document([
            {"id": "top", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 220, "y2": 20, "thicknessPx": 6}},
            {"id": "right", "type": "wall", "geometry": {"kind": "segment", "x1": 220, "y1": 20, "x2": 220, "y2": 180, "thicknessPx": 6}},
            {"id": "bottom", "type": "wall", "geometry": {"kind": "segment", "x1": 220, "y1": 180, "x2": 20, "y2": 180, "thicknessPx": 6}},
            {"id": "left", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 180, "x2": 20, "y2": 20, "thicknessPx": 6}},
            {"id": "noise", "type": "wall", "geometry": {"kind": "segment", "x1": 140, "y1": 140, "x2": 145, "y2": 145, "thicknessPx": 6}},
        ])

        snapshot = build_takeoff_geometry_snapshot(
            document,
            revision=1,
            effective_scale_px_per_ft=document["baseImage"].get("scalePxPerFt"),
        )

        angled_lengths = [wall.length_px for wall in snapshot.walls if wall.orientation == "angled"]
        self.assertTrue(angled_lengths)
        self.assertLessEqual(max(angled_lengths), 7.5)
        self.assertTrue(_all_walls_orthogonal(snapshot))

    def test_open_dominant_space_is_non_countable(self):
        space_kind, countable, reason = _classify_room_space(
            name=None,
            area_sqft=420.0,
            total_interior_area_sqft=700.0,
            accepted_reason="auto",
            closure_status="open",
            internal_barrier_count=2,
            repair_count=1,
        )

        self.assertEqual(space_kind, "open_common")
        self.assertFalse(countable)
        self.assertEqual(reason, "open_topology_large_component")


if __name__ == "__main__":
    unittest.main()
