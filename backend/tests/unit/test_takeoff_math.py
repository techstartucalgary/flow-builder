from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import HTTPException


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.api.routes.takeoff import (  # noqa: E402
    SavedAnnotationPayload,
    ScaleResolution,
    TakeoffRequest,
    _annotation_document_to_geometry_result,
    _compute_enclosed_floor_area_sqft,
    _compute_floor_area_sqft,
    _compute_materials,
    _compute_opening_deduction_sqft,
    _compute_total_linear_ft,
    _compute_reference_area_delta,
    _load_saved_annotation_geometry,
    _resolve_effective_scale,
    analyze_takeoff,
)
from src.api.annotation_operations import apply_revision_events_to_document  # noqa: E402
from src.api.annotation_store import StoreState  # noqa: E402
from src.vision.cv.scale_inference import ScaleInferenceResult  # noqa: E402
from src.vision.cv.models import TagClass  # noqa: E402


def _wall(start: tuple[int, int], end: tuple[int, int], thickness: int = 1):
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length_px = float((dx ** 2 + dy ** 2) ** 0.5)
    return SimpleNamespace(
        start=start,
        end=end,
        thickness=thickness,
        visual_thickness=thickness,
        length_px=length_px,
    )


def _opening(
    tag_class: TagClass,
    bbox: tuple[int, int, int, int],
    width_ft: float | None = None,
    height_ft: float | None = None,
):
    return SimpleNamespace(
        tag_class=tag_class,
        bbox=bbox,
        width_ft=width_ft,
        height_ft=height_ft,
    )


def _cv_result(
    walls,
    openings=None,
    image_width: int = 200,
    image_height: int = 200,
):
    return SimpleNamespace(
        walls=walls,
        openings=openings or [],
        metadata=SimpleNamespace(image_width=image_width, image_height=image_height),
    )


class TakeoffMathTests(unittest.TestCase):
    def test_enclosed_floor_area_for_rectangle_mask(self):
        mask = np.zeros((180, 180), dtype=np.uint8)
        cv2.rectangle(mask, (20, 20), (150, 150), 255, 1)

        floor_area_sqft, area_debug = _compute_enclosed_floor_area_sqft(mask, 10.0)

        self.assertAlmostEqual(floor_area_sqft, 166.41, delta=3.5)
        self.assertEqual(area_debug["interior_region_count"], 1)

    def test_enclosed_floor_area_for_l_shape_is_smaller_than_convex_hull(self):
        walls = [
            _wall((10, 10), (140, 10)),
            _wall((140, 10), (140, 60)),
            _wall((140, 60), (90, 60)),
            _wall((90, 60), (90, 140)),
            _wall((90, 140), (10, 140)),
            _wall((10, 140), (10, 10)),
        ]

        floor_area_sqft, method, _ = _compute_floor_area_sqft(_cv_result(walls, image_width=160, image_height=160), 10.0)

        self.assertEqual(method, "enclosed_regions")
        self.assertGreater(floor_area_sqft, 120.0)
        self.assertLess(floor_area_sqft, 150.0)

    def test_opening_deduction_prefers_measured_geometry(self):
        cv_result = _cv_result([], [
            _opening(TagClass.DOOR, (0, 0, 30, 80), width_ft=3.0, height_ft=7.0),
            _opening(TagClass.WINDOW, (0, 0, 40, 30), width_ft=4.0, height_ft=2.5),
        ])

        deduction = _compute_opening_deduction_sqft(cv_result, 50.0)

        self.assertAlmostEqual(deduction, 31.0, places=2)

    def test_opening_deduction_uses_bbox_scaling_when_measured_geometry_missing(self):
        cv_result = _cv_result([], [
            _opening(TagClass.DOOR, (0, 0, 150, 350)),
        ])

        deduction = _compute_opening_deduction_sqft(cv_result, 50.0)

        self.assertAlmostEqual(deduction, 21.0, places=2)

    def test_opening_deduction_falls_back_to_constants_without_scale(self):
        cv_result = _cv_result([], [
            _opening(TagClass.DOOR, (0, 0, 150, 350)),
            _opening(TagClass.WINDOW, (0, 0, 120, 100)),
        ])

        deduction = _compute_opening_deduction_sqft(cv_result, None)

        self.assertEqual(deduction, 33.0)

    def test_materials_with_ceiling_and_waste(self):
        net_board_area_sqft, waste_sqft, area_with_waste_sqft, sheets_required = _compute_materials(
            3870.09,
            1556.0,
            0.15,
            48.0,
        )

        self.assertAlmostEqual(net_board_area_sqft, 5426.09, places=2)
        self.assertAlmostEqual(area_with_waste_sqft, 6240.0035, places=4)
        self.assertAlmostEqual(waste_sqft, 813.9135, places=4)
        self.assertEqual(sheets_required, 130)

    def test_reference_area_delta(self):
        delta_sqft, delta_pct = _compute_reference_area_delta(1400.0, 1556.0)

        self.assertEqual(delta_sqft, -156.0)
        self.assertAlmostEqual(delta_pct, 10.0257, places=3)

    def test_floor_area_falls_back_to_legacy_convex_hull_when_region_is_open(self):
        walls = [
            _wall((20, 20), (140, 20)),
            _wall((20, 20), (20, 140)),
            _wall((20, 140), (140, 140)),
        ]

        floor_area_sqft, method, area_debug = _compute_floor_area_sqft(_cv_result(walls, image_width=160, image_height=160), 10.0)

        self.assertEqual(method, "legacy_convex_hull_fallback")
        self.assertGreater(floor_area_sqft, 0.0)
        self.assertIn("fallback_floor_area_sqft", area_debug)

    def test_floor_area_guardrail_rejects_disproportionate_growth(self):
        cv_result = _cv_result(
            walls=[
                _wall((10, 10), (150, 10)),
                _wall((10, 10), (10, 150)),
                _wall((10, 150), (150, 150)),
            ],
            image_width=200,
            image_height=200,
        )

        with patch("src.api.routes.takeoff._compute_enclosed_floor_area_sqft", side_effect=[
            (2080.0, {"interior_region_count": 1, "interior_area_px": 0, "exterior_area_px": 0}),
            (5600.0, {"interior_region_count": 1, "interior_area_px": 0, "exterior_area_px": 0}),
        ]), patch("src.api.routes.takeoff._seal_perimeter_leaks", return_value={"closure_gap_count": 1, "closure_length_px_added": 100.0}):
            floor_area_sqft, method, area_debug = _compute_floor_area_sqft(cv_result, 50.0)

        self.assertEqual(method, "enclosed_regions")
        self.assertAlmostEqual(floor_area_sqft, 2080.0, places=2)
        self.assertEqual(area_debug.get("floor_area_guardrail_applied"), 1)
        self.assertEqual(
            area_debug.get("guardrail_reason"),
            "rejected_disproportionate_growth_from_small_perimeter_closure",
        )

    def test_floor_area_guardrail_allows_modest_growth(self):
        cv_result = _cv_result(
            walls=[
                _wall((10, 10), (150, 10)),
                _wall((10, 10), (10, 150)),
                _wall((10, 150), (150, 150)),
            ],
            image_width=200,
            image_height=200,
        )

        with patch("src.api.routes.takeoff._compute_enclosed_floor_area_sqft", side_effect=[
            (2000.0, {"interior_region_count": 1, "interior_area_px": 0, "exterior_area_px": 0}),
            (2300.0, {"interior_region_count": 1, "interior_area_px": 0, "exterior_area_px": 0}),
        ]), patch("src.api.routes.takeoff._seal_perimeter_leaks", return_value={"closure_gap_count": 1, "closure_length_px_added": 100.0}):
            floor_area_sqft, method, area_debug = _compute_floor_area_sqft(cv_result, 50.0)

        self.assertEqual(method, "enclosed_regions")
        self.assertAlmostEqual(floor_area_sqft, 2300.0, places=2)
        self.assertEqual(area_debug.get("floor_area_guardrail_applied"), 0)

    def test_annotation_geometry_changes_linear_feet_and_opening_deduction(self):
        annotation_document = {
            "baseImage": {
                "widthPx": 200,
                "heightPx": 200,
                "scalePxPerFt": 10,
            },
            "elements": [
                {
                    "id": "wall_a",
                    "type": "wall",
                    "geometry": {
                        "kind": "segment",
                        "x1": 10,
                        "y1": 10,
                        "x2": 110,
                        "y2": 10,
                        "thicknessPx": 6,
                    },
                },
                {
                    "id": "door_a",
                    "type": "door",
                    "geometry": {
                        "kind": "rect",
                        "x": 20,
                        "y": 10,
                        "width": 30,
                        "height": 70,
                    },
                },
            ],
        }

        geometry_result = _annotation_document_to_geometry_result(annotation_document, None)

        self.assertAlmostEqual(_compute_total_linear_ft(geometry_result, 10.0), 10.0, places=2)
        self.assertAlmostEqual(_compute_opening_deduction_sqft(geometry_result, 10.0), 21.0, places=2)

    def test_annotation_geometry_drives_floor_area(self):
        annotation_document = {
            "baseImage": {
                "widthPx": 200,
                "heightPx": 200,
                "scalePxPerFt": 10,
            },
            "elements": [
                {"id": "w1", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 140, "y2": 20, "thicknessPx": 6}},
                {"id": "w2", "type": "wall", "geometry": {"kind": "segment", "x1": 140, "y1": 20, "x2": 140, "y2": 140, "thicknessPx": 6}},
                {"id": "w3", "type": "wall", "geometry": {"kind": "segment", "x1": 140, "y1": 140, "x2": 20, "y2": 140, "thicknessPx": 6}},
                {"id": "w4", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 140, "x2": 20, "y2": 20, "thicknessPx": 6}},
            ],
        }

        geometry_result = _annotation_document_to_geometry_result(annotation_document, None)
        floor_area_sqft, method, _ = _compute_floor_area_sqft(geometry_result, 10.0)

        self.assertEqual(method, "enclosed_regions")
        self.assertGreater(floor_area_sqft, 100.0)

    def test_load_saved_annotation_geometry_uses_revision_mutated_document(self):
        base_document = {
            "baseImage": {
                "widthPx": 200,
                "heightPx": 200,
                "scalePxPerFt": 10,
            },
            "meta": {
                "revision": 1,
                "updatedAt": "2026-03-05T00:00:00Z",
            },
            "elements": [
                {
                    "id": "wall_a",
                    "type": "wall",
                    "geometry": {
                        "kind": "segment",
                        "x1": 10,
                        "y1": 10,
                        "x2": 110,
                        "y2": 10,
                        "thicknessPx": 6,
                    },
                }
            ],
            "issues": [],
            "layers": {
                "wall": True,
                "door": True,
                "window": True,
                "room": True,
            },
        }
        updated_document = apply_revision_events_to_document(
            base_document,
            [
                {
                    "operations": [
                        {
                            "kind": "update",
                            "elementId": "wall_a",
                            "after": {
                                **base_document["elements"][0],
                                "geometry": {
                                    **base_document["elements"][0]["geometry"],
                                    "x2": 160,
                                },
                            },
                        }
                    ],
                }
            ],
        )
        state = StoreState(latest_revision=2, document=updated_document, events=[])
        req = TakeoffRequest(
            file_url="https://example.com/plan.pdf",
            project_id="test-project",
            use_saved_annotations=True,
            annotation_revision=2,
            page_number=1,
        )

        with patch("src.api.routes.takeoff._load_state", return_value=state), \
             patch("src.api.routes.takeoff._apply_sanitization_if_needed", side_effect=lambda loaded_state, *_args: loaded_state):
            geometry_result, revision = _load_saved_annotation_geometry(req)

        self.assertEqual(revision, 2)
        self.assertAlmostEqual(_compute_total_linear_ft(geometry_result, 10.0), 15.0, places=2)

    def test_resolve_effective_scale_prefers_request(self):
        req = TakeoffRequest(
            file_url="https://example.com/plan.pdf",
            file_mime="application/pdf",
            scale_px_per_ft=61.0,
            page_number=1,
        )
        geometry_result = _cv_result(walls=[_wall((0, 0), (100, 0))])
        geometry_result.metadata.scale_px_per_ft = 45.0

        scale = _resolve_effective_scale(req, geometry_result, b"%PDF-1.7", 0)

        self.assertEqual(scale.source, "request")
        self.assertAlmostEqual(scale.scale_px_per_ft or 0.0, 61.0, places=3)

    def test_resolve_effective_scale_uses_pdf_dimension_inference(self):
        req = TakeoffRequest(
            file_url="https://example.com/plan.pdf",
            file_mime="application/pdf",
            page_number=1,
        )
        geometry_result = _cv_result(walls=[_wall((0, 0), (1000, 0))])

        with patch("src.api.routes.takeoff.extract_pdf_dimension_candidates", return_value=[object()]), \
             patch(
                 "src.api.routes.takeoff.infer_scale_px_per_ft_from_dimensions",
                 return_value=ScaleInferenceResult(
                     scale_px_per_ft=50.0,
                     confidence=0.84,
                     support_count=4,
                     reason="inferred",
                 ),
             ):
            scale = _resolve_effective_scale(req, geometry_result, b"%PDF-1.7", 0)

        self.assertEqual(scale.source, "pdf_dimension_inference")
        self.assertAlmostEqual(scale.scale_px_per_ft or 0.0, 50.0, places=3)
        self.assertGreater(scale.confidence, 0.6)

    def test_resolve_effective_scale_non_pdf_remains_missing(self):
        req = TakeoffRequest(
            file_url="https://example.com/plan.png",
            file_mime="image/png",
            page_number=1,
        )
        geometry_result = _cv_result(walls=[_wall((0, 0), (1000, 0))])

        scale = _resolve_effective_scale(req, geometry_result, b"image-bytes", 0)

        self.assertEqual(scale.source, "missing")
        self.assertIsNone(scale.scale_px_per_ft)


class _FakeDownloadResponse:
    def __init__(self, content: bytes = b"fake-plan-bytes"):
        self.content = content

    def raise_for_status(self):
        return None


class _FakeAsyncClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, _url: str):
        return _FakeDownloadResponse()


class TakeoffRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_analyze_takeoff_uses_saved_annotation_geometry(self):
        annotation_document = {
            "baseImage": {
                "widthPx": 220,
                "heightPx": 220,
                "scalePxPerFt": 10,
            },
            "meta": {
                "revision": 4,
                "updatedAt": "2026-03-05T00:00:00Z",
            },
            "elements": [
                {"id": "w1", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 20, "x2": 160, "y2": 20, "thicknessPx": 6}},
                {"id": "w2", "type": "wall", "geometry": {"kind": "segment", "x1": 160, "y1": 20, "x2": 160, "y2": 160, "thicknessPx": 6}},
                {"id": "w3", "type": "wall", "geometry": {"kind": "segment", "x1": 160, "y1": 160, "x2": 20, "y2": 160, "thicknessPx": 6}},
                {"id": "w4", "type": "wall", "geometry": {"kind": "segment", "x1": 20, "y1": 160, "x2": 20, "y2": 20, "thicknessPx": 6}},
                {"id": "door_1", "type": "door", "geometry": {"kind": "rect", "x": 50, "y": 20, "width": 30, "height": 70}, "relations": {"hostWallId": "w1"}},
            ],
            "issues": [],
            "layers": {
                "wall": True,
                "door": True,
                "window": True,
                "room": True,
            },
        }

        req = TakeoffRequest(
            file_url="https://example.com/plan.pdf",
            project_id="test-project",
            use_saved_annotations=True,
            annotation_revision=4,
            page_number=1,
            ceiling_height_ft=9.0,
        )

        with patch("src.api.routes.takeoff.httpx.AsyncClient", return_value=_FakeAsyncClient()), \
             patch(
                 "src.api.routes.takeoff._load_saved_annotation_document",
                 return_value=SavedAnnotationPayload(document=annotation_document, revision=4),
             ), \
             patch("src.api.routes.takeoff._generate_annotated_image", return_value="annotated"):
            result = await analyze_takeoff(req)

        self.assertEqual(result.geometry_source, "annotation_document")
        self.assertEqual(result.geometry_revision_used, 4)
        self.assertTrue(result.geometry_hash)
        self.assertEqual(result.room_closure_status, "closed")
        self.assertGreater(result.total_linear_ft, 0.0)
        self.assertGreater(result.opening_deduction_sqft, 0.0)

    async def test_analyze_takeoff_falls_back_to_cv_when_saved_document_missing(self):
        cv_result = _cv_result(
            walls=[_wall((10, 10), (110, 10))],
            openings=[],
            image_width=140,
            image_height=140,
        )

        req = TakeoffRequest(
            file_url="https://example.com/plan.pdf",
            project_id="test-project",
            use_saved_annotations=True,
            annotation_revision=4,
            page_number=1,
        )

        with patch("src.api.routes.takeoff.httpx.AsyncClient", return_value=_FakeAsyncClient()), \
             patch("src.api.routes.takeoff._load_saved_annotation_document", return_value=None), \
             patch("src.api.routes.takeoff.cv_pipeline.run", return_value=cv_result), \
             patch("src.api.routes.takeoff._generate_annotated_image", return_value="annotated"):
            result = await analyze_takeoff(req)

        self.assertEqual(result.geometry_source, "cv_pipeline")
        self.assertEqual(result.geometry_revision_used, 0)
        self.assertTrue(result.geometry_hash)

    async def test_analyze_takeoff_reports_effective_scale_source(self):
        cv_result = _cv_result(
            walls=[_wall((10, 10), (110, 10))],
            openings=[],
            image_width=140,
            image_height=140,
        )

        req = TakeoffRequest(
            file_url="https://example.com/plan.pdf",
            file_mime="application/pdf",
            page_number=1,
        )

        with patch("src.api.routes.takeoff.httpx.AsyncClient", return_value=_FakeAsyncClient()), \
             patch("src.api.routes.takeoff.cv_pipeline.run", return_value=cv_result), \
             patch("src.api.routes.takeoff._generate_annotated_image", return_value="annotated"), \
             patch(
                 "src.api.routes.takeoff._resolve_effective_scale",
                 return_value=ScaleResolution(
                     scale_px_per_ft=52.0,
                     source="pdf_dimension_inference",
                     confidence=0.81,
                     reason="inferred from dimensions",
                 ),
             ):
            result = await analyze_takeoff(req)

        self.assertAlmostEqual(result.effective_scale_px_per_ft, 52.0, places=2)
        self.assertEqual(result.scale_source, "pdf_dimension_inference")
        self.assertGreater(result.scale_confidence, 0.6)

    async def test_analyze_takeoff_surfaces_revision_mismatch(self):
        req = TakeoffRequest(
            file_url="https://example.com/plan.pdf",
            project_id="test-project",
            use_saved_annotations=True,
            annotation_revision=10,
            page_number=1,
        )

        with patch("src.api.routes.takeoff.httpx.AsyncClient", return_value=_FakeAsyncClient()), \
             patch("src.api.routes.takeoff._load_saved_annotation_document", side_effect=HTTPException(status_code=409, detail="revision mismatch")):
            with self.assertRaises(HTTPException) as ctx:
                await analyze_takeoff(req)

        self.assertEqual(ctx.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
