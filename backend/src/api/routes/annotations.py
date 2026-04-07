"""Annotation document + revision persistence endpoints."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from src.api.annotation_operations import apply_revision_events_to_document
from src.api.annotation_store import (
    StoreState,
    _apply_sanitization_if_needed,
    _load_state,
    _now_iso,
    _sanitize_document,
    _save_state,
)
from src.estimators.drywall.annotation_geometry import build_takeoff_geometry_snapshot
from src.estimators.drywall.room_closure import extract_room_regions

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


class SnapshotPayload(BaseModel):
    document: dict[str, Any]
    base_revision: int = Field(default=0)


class RevisionEventModel(BaseModel):
    id: str
    revisionId: Optional[int] = None
    parentRevisionId: Optional[int] = None
    actorId: Optional[str] = None
    timestamp: str
    operations: list[dict[str, Any]] = Field(default_factory=list)


class RevisionBatchPayload(BaseModel):
    parent_revision_id: int = Field(default=0)
    actor_id: Optional[str] = None
    events: list[RevisionEventModel] = Field(default_factory=list)


class RoomExtractionPayload(BaseModel):
    document: dict[str, Any]
    revision: int = Field(default=0)
    effective_scale_px_per_ft: Optional[float] = Field(default=None)


def _room_element_payload(room) -> dict[str, Any]:
    attrs = dict(room.attrs)
    if room.name:
        attrs["name"] = room.name
    attrs.setdefault("status", "auto")
    attrs.setdefault("locked", False)
    attrs.setdefault("visible", True)
    attrs.setdefault("confidence", room.extraction_confidence)

    relations: dict[str, Any] = {
        "areaSqFt": round(float(room.area_sqft), 4),
        "quantityRequired": round(float(room.quantity_required), 4),
        "quantityUnit": room.quantity_unit,
        "spaceType": room.space_kind,
        "countInRoomSchedule": bool(room.countable),
        "extractionStatus": room.extraction_status,
        "extractionConfidence": round(float(room.extraction_confidence), 4),
        "touchesBorder": bool(room.touches_border),
        "bbox": {
            "minX": int(room.bbox[0]),
            "minY": int(room.bbox[1]),
            "maxX": int(room.bbox[2]),
            "maxY": int(room.bbox[3]),
        },
        "centroid": [round(float(room.centroid[0]), 3), round(float(room.centroid[1]), 3)],
        "diagnostics": room.diagnostics,
    }
    if room.material:
        relations["material"] = room.material

    return {
        "id": room.id,
        "type": "room",
        "geometry": {
            "kind": "polygon",
            "points": [[int(point[0]), int(point[1])] for point in room.polygon],
        },
        "attrs": attrs,
        "relations": relations,
    }


@router.get("/{project_id}")
async def get_annotation_document(project_id: str, page: int = Query(default=1, ge=1)):
    state = _load_state(project_id, page)
    state = _apply_sanitization_if_needed(state, project_id, page)
    return {
        "status": "ok",
        "document": state.document,
        "latest_revision": state.latest_revision,
    }


@router.put("/{project_id}")
async def put_annotation_document(
    project_id: str,
    payload: SnapshotPayload,
    page: int = Query(default=1, ge=1),
):
    state = _load_state(project_id, page)

    if payload.base_revision != state.latest_revision:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Revision conflict: base_revision={payload.base_revision}, "
                f"latest_revision={state.latest_revision}"
            ),
        )

    sanitized_document, _ = _sanitize_document(payload.document)
    state.document = sanitized_document
    state.latest_revision += 1

    if isinstance(state.document, dict):
        meta = state.document.setdefault("meta", {})
        if isinstance(meta, dict):
            meta["revision"] = state.latest_revision

    _save_state(project_id, page, state)

    return {
        "status": "ok",
        "document": state.document,
        "latest_revision": state.latest_revision,
    }


@router.post("/{project_id}/revisions")
async def post_annotation_revisions(
    project_id: str,
    payload: RevisionBatchPayload,
    page: int = Query(default=1, ge=1),
):
    state = _load_state(project_id, page)

    if payload.parent_revision_id != state.latest_revision:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Revision conflict: parent_revision_id={payload.parent_revision_id}, "
                f"latest_revision={state.latest_revision}"
            ),
        )

    if not isinstance(state.document, dict):
        raise HTTPException(status_code=422, detail="Cannot apply revisions without an existing annotation document")

    try:
        next_document = apply_revision_events_to_document(
            state.document,
            [event.model_dump() for event in payload.events],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    previous_revision = payload.parent_revision_id
    assigned_events: list[dict[str, Any]] = []
    for event in payload.events:
        state.latest_revision += 1
        event_data = event.model_dump()
        event_data["revisionId"] = state.latest_revision
        event_data["parentRevisionId"] = previous_revision
        event_data["actorId"] = payload.actor_id
        previous_revision = state.latest_revision
        state.events.append(event_data)
        assigned_events.append(event_data)

    sanitized_document, _ = _sanitize_document(next_document)
    state.document = sanitized_document

    if isinstance(state.document, dict):
        meta = state.document.setdefault("meta", {})
        if isinstance(meta, dict):
            meta["revision"] = state.latest_revision
            if payload.events:
                meta["updatedAt"] = payload.events[-1].timestamp
            else:
                meta.setdefault("updatedAt", _now_iso())

    _save_state(project_id, page, state)

    return {
        "status": "ok",
        "latest_revision": state.latest_revision,
        "events": assigned_events,
    }


@router.get("/{project_id}/revisions")
async def get_annotation_revisions(
    project_id: str,
    page: int = Query(default=1, ge=1),
    since: int = Query(default=0, ge=0),
):
    state = _load_state(project_id, page)
    events = [e for e in state.events if int(e.get("revisionId", 0)) > since]
    return {
        "status": "ok",
        "latest_revision": state.latest_revision,
        "events": events,
    }


@router.post("/extract-rooms")
async def post_extract_rooms(payload: RoomExtractionPayload):
    if not isinstance(payload.document, dict):
        raise HTTPException(status_code=422, detail="A valid annotation document is required")

    snapshot = build_takeoff_geometry_snapshot(
        payload.document,
        payload.revision,
        payload.effective_scale_px_per_ft,
    )
    result = extract_room_regions(snapshot, existing_document=payload.document)

    return {
        "status": "ok",
        "rooms": [_room_element_payload(room) for room in result.rooms],
        "summary": {
            "room_count": sum(1 for room in result.rooms if room.countable),
            "space_count": len(result.rooms),
            "non_countable_space_count": sum(1 for room in result.rooms if not room.countable),
            "total_area_sqft": round(float(sum(room.quantity_required for room in result.rooms)), 4),
            "status": result.status,
            "confidence": result.confidence,
        },
        "debug": result.debug,
    }
