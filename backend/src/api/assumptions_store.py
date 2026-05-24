"""Shared helpers for persisted assumption overrides."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional
from pydantic import BaseModel

from src.schemas.estimate import AssumptionsSnapshot


class LockedAssumptionsState(BaseModel):
    """Tracks which assumption keys are locked and cannot be overridden by request params."""
    locked_keys: list[str] = []
    snapshot: Optional[AssumptionsSnapshot] = None

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "assumptions"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DEFAULTS = AssumptionsSnapshot(
    ceiling_height_ft=9.0,
    waste_factor=0.15,
    sheet_width_ft=4.0,
    sheet_length_ft=12.0,
    drywall_unit_cost_usd=None,
    markup_pct=None,
    tax_rate_pct=None,
)


def _safe_id(project_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", project_id)


def _path(project_id: str, page: int) -> Path:
    return DATA_DIR / f"{_safe_id(project_id)}_page_{page}.json"


def load_assumptions(project_id: str, page: int) -> AssumptionsSnapshot:
    p = _path(project_id, page)
    if not p.exists():
        return DEFAULTS.model_copy()
    try:
        data = json.loads(p.read_text())
        return AssumptionsSnapshot(**{**DEFAULTS.model_dump(), **data})
    except Exception:
        return DEFAULTS.model_copy()


def save_assumptions(project_id: str, page: int, snapshot: AssumptionsSnapshot) -> None:
    _path(project_id, page).write_text(json.dumps(snapshot.model_dump(), indent=2))


def _locks_path(project_id: str, page: int) -> Path:
    return DATA_DIR / f"{_safe_id(project_id)}_page_{page}_locks.json"


def load_locked_keys(project_id: str, page: int) -> list[str]:
    p = _locks_path(project_id, page)
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text())
    except Exception:
        return []


def save_locked_keys(project_id: str, page: int, locked_keys: list[str]) -> None:
    _locks_path(project_id, page).write_text(json.dumps(locked_keys, indent=2))


def apply_locked_assumptions(
    req_values: dict,
    saved: AssumptionsSnapshot,
    locked_keys: list[str],
) -> dict:
    """Return req_values with locked assumption keys replaced by saved values."""
    result = dict(req_values)
    for key in locked_keys:
        saved_val = getattr(saved, key, None)
        if saved_val is not None:
            result[key] = saved_val
    return result
