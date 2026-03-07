"""Shared helpers for persisted annotation documents and revisions."""

from __future__ import annotations

from datetime import UTC, datetime
import json
import re
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "annotations"
DATA_DIR.mkdir(parents=True, exist_ok=True)
SUPPORTED_ELEMENT_TYPES = {"wall", "door", "window", "room"}
SUPPORTED_GEOMETRY_KINDS = {"segment", "rect"}
LAYER_DEFAULTS = {
    "wall": True,
    "door": True,
    "window": True,
    "room": True,
}


class StoreState(BaseModel):
    status: str = "ok"
    latest_revision: int = 0
    document: Optional[dict[str, Any]] = None
    events: list[dict[str, Any]] = Field(default_factory=list)


def _safe_project_id(project_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", project_id)


def _doc_path(project_id: str, page: int) -> Path:
    safe = _safe_project_id(project_id)
    return DATA_DIR / f"{safe}_page_{page}.json"


def _load_state(project_id: str, page: int) -> StoreState:
    path = _doc_path(project_id, page)
    if not path.exists():
        return StoreState()

    data = json.loads(path.read_text())
    return StoreState(**data)


def _save_state(project_id: str, page: int, state: StoreState) -> None:
    path = _doc_path(project_id, page)
    path.write_text(json.dumps(state.model_dump(), indent=2))


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _sanitize_document(document: Optional[dict[str, Any]]) -> tuple[Optional[dict[str, Any]], bool]:
    if document is None:
        return None, False
    if not isinstance(document, dict):
        return None, True

    changed = False
    sanitized = dict(document)

    raw_layers = document.get("layers")
    layers: dict[str, bool] = {}
    if not isinstance(raw_layers, dict):
        changed = True
        raw_layers = {}
    for layer_name, default_value in LAYER_DEFAULTS.items():
        raw_value = raw_layers.get(layer_name)
        if isinstance(raw_value, bool):
            layers[layer_name] = raw_value
        else:
            layers[layer_name] = default_value
            if layer_name in raw_layers or raw_layers:
                changed = True
    if set(raw_layers.keys()) != set(LAYER_DEFAULTS.keys()):
        changed = True
    sanitized["layers"] = layers

    raw_elements = document.get("elements")
    filtered_elements: list[dict[str, Any]] = []
    if not isinstance(raw_elements, list):
        raw_elements = []
        changed = True
    for element in raw_elements:
        if not isinstance(element, dict):
            changed = True
            continue
        element_type = element.get("type")
        geometry = element.get("geometry")
        geometry_kind = geometry.get("kind") if isinstance(geometry, dict) else None
        if element_type not in SUPPORTED_ELEMENT_TYPES:
            changed = True
            continue
        if geometry_kind not in SUPPORTED_GEOMETRY_KINDS:
            changed = True
            continue
        relations = element.get("relations")
        if (
            element_type in {"door", "window"}
            and isinstance(relations, dict)
            and relations.get("source") == "tag_projected"
        ):
            changed = True
            continue
        filtered_elements.append(element)
    if len(filtered_elements) != len(raw_elements):
        changed = True
    sanitized["elements"] = filtered_elements

    valid_ids = {element.get("id") for element in filtered_elements}
    raw_issues = document.get("issues")
    filtered_issues: list[dict[str, Any]] = []
    if isinstance(raw_issues, list):
        for issue in raw_issues:
            if not isinstance(issue, dict):
                changed = True
                continue
            element_id = issue.get("elementId")
            if element_id not in valid_ids:
                changed = True
                continue
            filtered_issues.append(issue)
    elif raw_issues is not None:
        changed = True
    if raw_issues is not None and isinstance(raw_issues, list) and len(filtered_issues) != len(raw_issues):
        changed = True
    sanitized["issues"] = filtered_issues

    return sanitized, changed


def _apply_sanitization_if_needed(
    state: StoreState,
    project_id: str,
    page: int,
) -> StoreState:
    sanitized_document, changed = _sanitize_document(state.document)
    if not changed:
        return state

    previous_revision = state.latest_revision
    state.document = sanitized_document
    state.latest_revision += 1

    if isinstance(state.document, dict):
        meta = state.document.setdefault("meta", {})
        if isinstance(meta, dict):
            meta["revision"] = state.latest_revision
            meta["updatedAt"] = _now_iso()

    state.events.append(
        {
            "id": f"evt_system_cleanup_{state.latest_revision}",
            "revisionId": state.latest_revision,
            "parentRevisionId": previous_revision,
            "actorId": "system_cleanup",
            "timestamp": _now_iso(),
            "operations": [],
        }
    )
    _save_state(project_id, page, state)
    return state
