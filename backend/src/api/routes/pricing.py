"""Pricing API — material unit cost catalog."""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.api.pricing_store import MaterialPrice, load_catalog, save_catalog

router = APIRouter(prefix="/api/pricing", tags=["pricing"])


class PricePatch(BaseModel):
    unit_cost_usd: Optional[float] = None


@router.get("", response_model=list[MaterialPrice])
def list_pricing() -> list[MaterialPrice]:
    return load_catalog()


@router.patch("/{material_key}", response_model=MaterialPrice)
def patch_price(material_key: str, body: PricePatch) -> MaterialPrice:
    catalog = load_catalog()
    for item in catalog:
        if item.material_key == material_key:
            item.unit_cost_usd = body.unit_cost_usd
            save_catalog(catalog)
            return item
    raise HTTPException(status_code=404, detail=f"Material '{material_key}' not found in catalog")
