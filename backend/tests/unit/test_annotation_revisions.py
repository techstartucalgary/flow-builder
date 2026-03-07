from __future__ import annotations

from copy import deepcopy
import sys
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi import HTTPException


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.api.annotation_operations import (  # noqa: E402
    apply_operation_to_document,
    apply_revision_events_to_document,
)
from src.api.annotation_store import StoreState  # noqa: E402
from src.api.routes.annotations import (  # noqa: E402
    RevisionBatchPayload,
    RevisionEventModel,
    post_annotation_revisions,
)


def _base_document() -> dict:
    return {
        "documentId": "doc_1",
        "projectId": "project_1",
        "page": 1,
        "baseImage": {
            "sourceUrl": "https://example.com/plan.png",
            "widthPx": 200,
            "heightPx": 200,
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
        "elements": [
            {
                "id": "wall_1",
                "type": "wall",
                "geometry": {
                    "kind": "segment",
                    "x1": 10,
                    "y1": 10,
                    "x2": 110,
                    "y2": 10,
                    "thicknessPx": 6,
                    "rotationDeg": 0,
                },
                "attrs": {
                    "status": "edited",
                    "locked": False,
                    "visible": True,
                },
                "relations": {},
            },
            {
                "id": "door_1",
                "type": "door",
                "geometry": {
                    "kind": "rect",
                    "x": 30,
                    "y": 10,
                    "width": 30,
                    "height": 70,
                    "rotationDeg": 0,
                },
                "attrs": {
                    "status": "edited",
                    "locked": False,
                    "visible": True,
                },
                "relations": {},
            },
        ],
        "issues": [],
    }


class AnnotationOperationTests(unittest.TestCase):
    def test_apply_operation_update_replaces_existing_element(self):
        document = _base_document()

        updated = apply_operation_to_document(
            document,
            {
                "kind": "update",
                "elementId": "wall_1",
                "after": {
                    **document["elements"][0],
                    "geometry": {
                        **document["elements"][0]["geometry"],
                        "x2": 160,
                    },
                },
            },
        )

        self.assertEqual(updated["elements"][0]["geometry"]["x2"], 160)
        self.assertEqual(document["elements"][0]["geometry"]["x2"], 110)

    def test_apply_operation_delete_missing_element_is_noop(self):
        document = _base_document()

        updated = apply_operation_to_document(
            document,
            {
                "kind": "delete",
                "elementId": "missing_wall",
            },
        )

        self.assertEqual(len(updated["elements"]), len(document["elements"]))

    def test_apply_revision_events_to_document_applies_operations_in_order(self):
        document = _base_document()

        updated = apply_revision_events_to_document(
            document,
            [
                {
                    "operations": [
                        {
                            "kind": "delete",
                            "elementId": "door_1",
                        },
                        {
                            "kind": "create",
                            "elementId": "window_1",
                            "element": {
                                "id": "window_1",
                                "type": "window",
                                "geometry": {
                                    "kind": "rect",
                                    "x": 80,
                                    "y": 10,
                                    "width": 40,
                                    "height": 30,
                                    "rotationDeg": 0,
                                },
                                "attrs": {
                                    "status": "new",
                                    "locked": False,
                                    "visible": True,
                                },
                                "relations": {},
                            },
                        },
                    ],
                }
            ],
        )

        ids = {element["id"] for element in updated["elements"]}
        self.assertNotIn("door_1", ids)
        self.assertIn("window_1", ids)


class AnnotationRevisionRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_revision_batch_updates_stored_document(self):
        initial_state = StoreState(latest_revision=1, document=_base_document(), events=[])
        saved_states: list[StoreState] = []

        def capture_save(_project_id: str, _page: int, state: StoreState) -> None:
            saved_states.append(deepcopy(state))

        payload = RevisionBatchPayload(
            parent_revision_id=1,
            actor_id="tester",
            events=[
                RevisionEventModel(
                    id="evt_1",
                    timestamp="2026-03-05T12:00:00Z",
                    operations=[
                        {
                            "kind": "update",
                            "elementId": "wall_1",
                            "after": {
                                **_base_document()["elements"][0],
                                "geometry": {
                                    **_base_document()["elements"][0]["geometry"],
                                    "x2": 160,
                                },
                            },
                        }
                    ],
                )
            ],
        )

        with patch("src.api.routes.annotations._load_state", return_value=deepcopy(initial_state)), \
             patch("src.api.routes.annotations._save_state", side_effect=capture_save):
            result = await post_annotation_revisions("project_1", payload, 1)

        self.assertEqual(result["latest_revision"], 2)
        self.assertEqual(result["events"][0]["revisionId"], 2)
        self.assertEqual(result["events"][0]["parentRevisionId"], 1)
        self.assertEqual(len(saved_states), 1)
        self.assertEqual(saved_states[0].document["elements"][0]["geometry"]["x2"], 160)
        self.assertEqual(saved_states[0].document["meta"]["revision"], 2)
        self.assertEqual(saved_states[0].document["meta"]["updatedAt"], "2026-03-05T12:00:00Z")

    async def test_revision_batch_create_persists_element(self):
        initial_state = StoreState(latest_revision=1, document=_base_document(), events=[])
        saved_states: list[StoreState] = []

        def capture_save(_project_id: str, _page: int, state: StoreState) -> None:
            saved_states.append(deepcopy(state))

        payload = RevisionBatchPayload(
            parent_revision_id=1,
            actor_id="tester",
            events=[
                RevisionEventModel(
                    id="evt_create",
                    timestamp="2026-03-05T12:00:01Z",
                    operations=[
                        {
                            "kind": "create",
                            "elementId": "window_1",
                            "element": {
                                "id": "window_1",
                                "type": "window",
                                "geometry": {
                                    "kind": "rect",
                                    "x": 80,
                                    "y": 10,
                                    "width": 40,
                                    "height": 30,
                                    "rotationDeg": 0,
                                },
                                "attrs": {
                                    "status": "new",
                                    "locked": False,
                                    "visible": True,
                                },
                                "relations": {},
                            },
                        }
                    ],
                )
            ],
        )

        with patch("src.api.routes.annotations._load_state", return_value=deepcopy(initial_state)), \
             patch("src.api.routes.annotations._save_state", side_effect=capture_save):
            await post_annotation_revisions("project_1", payload, 1)

        ids = {element["id"] for element in saved_states[0].document["elements"]}
        self.assertIn("window_1", ids)

    async def test_revision_batch_delete_removes_element(self):
        initial_state = StoreState(latest_revision=1, document=_base_document(), events=[])
        saved_states: list[StoreState] = []

        def capture_save(_project_id: str, _page: int, state: StoreState) -> None:
            saved_states.append(deepcopy(state))

        payload = RevisionBatchPayload(
            parent_revision_id=1,
            actor_id="tester",
            events=[
                RevisionEventModel(
                    id="evt_delete",
                    timestamp="2026-03-05T12:00:02Z",
                    operations=[
                        {
                            "kind": "delete",
                            "elementId": "door_1",
                        }
                    ],
                )
            ],
        )

        with patch("src.api.routes.annotations._load_state", return_value=deepcopy(initial_state)), \
             patch("src.api.routes.annotations._save_state", side_effect=capture_save):
            await post_annotation_revisions("project_1", payload, 1)

        ids = {element["id"] for element in saved_states[0].document["elements"]}
        self.assertNotIn("door_1", ids)

    async def test_revision_batch_without_base_document_is_rejected(self):
        initial_state = StoreState(latest_revision=0, document=None, events=[])

        payload = RevisionBatchPayload(
            parent_revision_id=0,
            actor_id="tester",
            events=[
                RevisionEventModel(
                    id="evt_1",
                    timestamp="2026-03-05T12:00:03Z",
                    operations=[],
                )
            ],
        )

        with patch("src.api.routes.annotations._load_state", return_value=deepcopy(initial_state)), \
             patch("src.api.routes.annotations._save_state") as save_mock:
            with self.assertRaises(HTTPException) as ctx:
                await post_annotation_revisions("project_1", payload, 1)

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail, "Cannot apply revisions without an existing annotation document")
        save_mock.assert_not_called()

    async def test_invalid_update_is_rejected_without_partial_save(self):
        initial_state = StoreState(latest_revision=1, document=_base_document(), events=[])

        payload = RevisionBatchPayload(
            parent_revision_id=1,
            actor_id="tester",
            events=[
                RevisionEventModel(
                    id="evt_invalid",
                    timestamp="2026-03-05T12:00:04Z",
                    operations=[
                        {
                            "kind": "update",
                            "elementId": "missing_wall",
                            "after": {
                                **_base_document()["elements"][0],
                                "id": "missing_wall",
                            },
                        }
                    ],
                )
            ],
        )

        with patch("src.api.routes.annotations._load_state", return_value=deepcopy(initial_state)), \
             patch("src.api.routes.annotations._save_state") as save_mock:
            with self.assertRaises(HTTPException) as ctx:
                await post_annotation_revisions("project_1", payload, 1)

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail, "Cannot update missing element: missing_wall")
        save_mock.assert_not_called()

    async def test_conflict_handling_is_preserved(self):
        initial_state = StoreState(latest_revision=2, document=_base_document(), events=[])

        payload = RevisionBatchPayload(
            parent_revision_id=1,
            actor_id="tester",
            events=[],
        )

        with patch("src.api.routes.annotations._load_state", return_value=deepcopy(initial_state)), \
             patch("src.api.routes.annotations._save_state") as save_mock:
            with self.assertRaises(HTTPException) as ctx:
                await post_annotation_revisions("project_1", payload, 1)

        self.assertEqual(ctx.exception.status_code, 409)
        save_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
