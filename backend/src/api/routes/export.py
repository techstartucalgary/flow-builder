"""Export API — project takeoff CSV download."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.api.annotation_store import _load_state
from src.api.assumptions_store import load_assumptions

router = APIRouter(prefix="/api/export", tags=["export"])


class ExportRequest(BaseModel):
    page_number: int = 1
    include_pricing: bool = True
    include_room_schedule: bool = True
    # Takeoff fields — caller passes in the latest result rather than re-running CV.
    floor_area_sqft: float = 0.0
    net_wall_board_sqft: float = 0.0
    ceiling_board_sqft: float = 0.0
    opening_deduction_sqft: float = 0.0
    waste_sqft: float = 0.0
    area_with_waste_sqft: float = 0.0
    sheets_required: int = 0
    perimeter_linear_ft: float = 0.0
    partition_linear_ft: float = 0.0
    unknown_linear_ft: float = 0.0
    geometry_source: str = "cv_pipeline"
    estimate_ready: bool = False
    blocked_reasons: list[str] = []
    material_cost_usd: Optional[float] = None
    markup_usd: Optional[float] = None
    tax_usd: Optional[float] = None
    total_cost_usd: Optional[float] = None
    line_items: list[dict] = []
    flooring_by_material: dict[str, dict] = {}


def _fmt(value: Optional[float], decimals: int = 2) -> str:
    if value is None:
        return ""
    return f"{value:,.{decimals}f}"


def _fmt_usd(value: Optional[float]) -> str:
    if value is None:
        return ""
    return f"${value:,.2f}"


@router.post("/{project_id}/csv")
async def export_csv(project_id: str, body: ExportRequest):
    assumptions = load_assumptions(project_id, body.page_number)
    generated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

    buf = io.StringIO()
    writer = csv.writer(buf)

    # Header
    writer.writerow(["ESTIMATE SUMMARY"])
    writer.writerow(["Project ID", project_id])
    writer.writerow(["Generated", generated_at])
    writer.writerow(["Page", body.page_number])
    writer.writerow(["Geometry Source", body.geometry_source])
    writer.writerow(["Estimate Ready", "Yes" if body.estimate_ready else "No"])
    if body.blocked_reasons:
        for reason in body.blocked_reasons:
            writer.writerow(["Blocker", reason])
    writer.writerow([])

    # Assumptions
    writer.writerow(["ASSUMPTIONS USED"])
    writer.writerow(["Ceiling Height", f"{assumptions.ceiling_height_ft} ft"])
    writer.writerow(["Waste Factor", f"{assumptions.waste_factor * 100:.0f}%"])
    writer.writerow(["Sheet Size", f"{assumptions.sheet_width_ft}' x {assumptions.sheet_length_ft}'"])
    if assumptions.markup_pct is not None:
        writer.writerow(["Markup", f"{assumptions.markup_pct * 100:.1f}%"])
    if assumptions.tax_rate_pct is not None:
        writer.writerow(["Tax Rate", f"{assumptions.tax_rate_pct * 100:.1f}%"])
    writer.writerow([])

    # Drywall quantities
    writer.writerow(["DRYWALL QUANTITIES"])
    writer.writerow(["Category", "Linear Ft", "Board Sqft"])
    writer.writerow(["Perimeter Walls", _fmt(body.perimeter_linear_ft), ""])
    writer.writerow(["Partition Walls", _fmt(body.partition_linear_ft), ""])
    writer.writerow(["Unknown Walls", _fmt(body.unknown_linear_ft), ""])
    writer.writerow(["Net Wall Board", "", _fmt(body.net_wall_board_sqft)])
    writer.writerow(["Ceiling Board", "", _fmt(body.ceiling_board_sqft)])
    writer.writerow(["Opening Deductions", "", f"-{_fmt(body.opening_deduction_sqft)}"])
    writer.writerow(["Waste", "", _fmt(body.waste_sqft)])
    writer.writerow(["Total with Waste", "", _fmt(body.area_with_waste_sqft)])
    writer.writerow(["Sheets Required", body.sheets_required, ""])
    writer.writerow([])

    # Room schedule
    if body.include_room_schedule and body.flooring_by_material:
        writer.writerow(["ROOM SCHEDULE"])
        writer.writerow(["Material", "Area (sqft)", "Unit Cost", "Line Total"])
        for mat_key, summary in body.flooring_by_material.items():
            area = summary.get("area_sqft", 0)
            writer.writerow([
                mat_key.replace("_", " ").title(),
                _fmt(area),
                "",
                "",
            ])
        writer.writerow([])

    # Cost summary
    if body.include_pricing and body.line_items:
        writer.writerow(["LINE ITEMS"])
        writer.writerow(["Material", "Qty", "Unit", "Unit Cost", "Line Total"])
        for item in body.line_items:
            writer.writerow([
                item.get("display_name", ""),
                _fmt(item.get("quantity")),
                item.get("unit", ""),
                _fmt_usd(item.get("unit_cost_usd")),
                _fmt_usd(item.get("line_total_usd")),
            ])
        writer.writerow([])

        writer.writerow(["COST SUMMARY"])
        writer.writerow(["Material Subtotal", _fmt_usd(body.material_cost_usd)])
        if body.markup_usd is not None:
            writer.writerow(["Markup", _fmt_usd(body.markup_usd)])
        if body.tax_usd is not None:
            writer.writerow(["Tax", _fmt_usd(body.tax_usd)])
        writer.writerow(["Total", _fmt_usd(body.total_cost_usd)])

    buf.seek(0)
    filename = f"estimate_{project_id}_page{body.page_number}.csv"
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
