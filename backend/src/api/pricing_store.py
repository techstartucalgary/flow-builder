"""Shared helpers for material pricing catalog."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional
from pydantic import BaseModel

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "pricing"
DATA_DIR.mkdir(parents=True, exist_ok=True)
CATALOG_PATH = DATA_DIR / "catalog.json"


class MaterialPrice(BaseModel):
    material_key: str
    display_name: str
    unit: str
    unit_cost_usd: Optional[float] = None


DEFAULT_CATALOG: list[MaterialPrice] = [
    MaterialPrice(material_key="drywall_board", display_name='Drywall Board (4\'x12\')', unit="board", unit_cost_usd=None),
    MaterialPrice(material_key="hardwood", display_name="Hardwood Flooring", unit="sqft", unit_cost_usd=None),
    MaterialPrice(material_key="carpet", display_name="Carpet", unit="sqft", unit_cost_usd=None),
    MaterialPrice(material_key="tile", display_name="Tile", unit="sqft", unit_cost_usd=None),
    MaterialPrice(material_key="vinyl", display_name="Vinyl Flooring", unit="sqft", unit_cost_usd=None),
    MaterialPrice(material_key="laminate", display_name="Laminate Flooring", unit="sqft", unit_cost_usd=None),
]


def load_catalog() -> list[MaterialPrice]:
    if not CATALOG_PATH.exists():
        return [p.model_copy() for p in DEFAULT_CATALOG]
    try:
        raw = json.loads(CATALOG_PATH.read_text())
        loaded = {item["material_key"]: MaterialPrice(**item) for item in raw}
        # Merge with defaults so new keys are always present.
        result = []
        for default in DEFAULT_CATALOG:
            result.append(loaded.get(default.material_key, default.model_copy()))
        for key, item in loaded.items():
            if not any(d.material_key == key for d in DEFAULT_CATALOG):
                result.append(item)
        return result
    except Exception:
        return [p.model_copy() for p in DEFAULT_CATALOG]


def save_catalog(catalog: list[MaterialPrice]) -> None:
    CATALOG_PATH.write_text(
        json.dumps([p.model_dump() for p in catalog], indent=2)
    )


def get_price(material_key: str) -> Optional[float]:
    for item in load_catalog():
        if item.material_key == material_key:
            return item.unit_cost_usd
    return None
