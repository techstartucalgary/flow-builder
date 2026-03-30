"""Shared Pydantic schemas for the estimate engine."""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


class AssumptionsSnapshot(BaseModel):
    ceiling_height_ft: float
    waste_factor: float
    sheet_width_ft: float
    sheet_length_ft: float
    drywall_unit_cost_usd: Optional[float] = None
    markup_pct: Optional[float] = None
    tax_rate_pct: Optional[float] = None


class LineItem(BaseModel):
    material_key: str
    display_name: str
    quantity: float
    unit: str
    unit_cost_usd: Optional[float] = None
    line_total_usd: Optional[float] = None


class FlooringMaterialSummary(BaseModel):
    area_sqft: float
    quantity_required: float
