"""Annotation document + revision persistence endpoints."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/annotations", tags=["annotations"])

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "annotations"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _safe_project_id(project_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", project_id)


def _doc_path(project_id: str, page: int) -> Path:
    safe = _safe_project_id(project_id)
    return DATA_DIR / f"{safe}_page_{page}.json"


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


class StoreState(BaseModel):
    status: str = "ok"
    latest_revision: int = 0
    document: Optional[dict[str, Any]] = None
    events: list[dict[str, Any]] = Field(default_factory=list)


def _load_state(project_id: str, page: int) -> StoreState:
    path = _doc_path(project_id, page)
    if not path.exists():
        return StoreState()

    data = json.loads(path.read_text())
    return StoreState(**data)


def _save_state(project_id: str, page: int, state: StoreState) -> None:
    path = _doc_path(project_id, page)
    path.write_text(json.dumps(state.model_dump(), indent=2))


@router.get("/{project_id}")
async def get_annotation_document(project_id: str, page: int = Query(default=1, ge=1)):
    state = _load_state(project_id, page)
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

    state.document = payload.document
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

    for event in payload.events:
        state.latest_revision += 1
        event_data = event.model_dump()
        event_data["revisionId"] = state.latest_revision
        event_data["parentRevisionId"] = payload.parent_revision_id
        event_data["actorId"] = payload.actor_id
        state.events.append(event_data)

    if state.document and isinstance(state.document, dict):
        meta = state.document.setdefault("meta", {})
        if isinstance(meta, dict):
            meta["revision"] = state.latest_revision

    _save_state(project_id, page, state)

    return {
        "status": "ok",
        "latest_revision": state.latest_revision,
        "events": payload.events,
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
