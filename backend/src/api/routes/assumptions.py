"""Assumptions API — per-project, per-page assumption overrides."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from src.api.assumptions_store import (
    load_assumptions,
    save_assumptions,
    load_locked_keys,
    save_locked_keys,
)
from src.schemas.estimate import AssumptionsSnapshot

router = APIRouter(prefix="/api/assumptions", tags=["assumptions"])


class AssumptionsPatch(BaseModel):
    ceiling_height_ft: Optional[float] = None
    waste_factor: Optional[float] = None
    sheet_width_ft: Optional[float] = None
    sheet_length_ft: Optional[float] = None
    drywall_unit_cost_usd: Optional[float] = None
    markup_pct: Optional[float] = None
    tax_rate_pct: Optional[float] = None


class LockPatch(BaseModel):
    locked_keys: list[str]


@router.get("/{project_id}", response_model=AssumptionsSnapshot)
def get_assumptions(project_id: str, page: int = 1) -> AssumptionsSnapshot:
    return load_assumptions(project_id, page)


@router.patch("/{project_id}", response_model=AssumptionsSnapshot)
def patch_assumptions(
    project_id: str, body: AssumptionsPatch, page: int = 1
) -> AssumptionsSnapshot:
    current = load_assumptions(project_id, page)
    updated = current.model_dump()
    for key, value in body.model_dump(exclude_none=True).items():
        updated[key] = value
    snapshot = AssumptionsSnapshot(**updated)
    save_assumptions(project_id, page, snapshot)
    return snapshot


@router.get("/{project_id}/locks", response_model=list[str])
def get_locks(project_id: str, page: int = 1) -> list[str]:
    return load_locked_keys(project_id, page)


@router.put("/{project_id}/locks", response_model=list[str])
def set_locks(project_id: str, body: LockPatch, page: int = 1) -> list[str]:
    save_locked_keys(project_id, page, body.locked_keys)
    return body.locked_keys
