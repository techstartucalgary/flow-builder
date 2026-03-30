import { getBackendUrl } from '@/lib/backendUrl';
import type { TakeoffData } from '@/lib/parseTakeoff';

const BACKEND_URL = getBackendUrl();

export async function downloadTakeoffCsv(
  projectId: string,
  takeoff: TakeoffData,
  options: { includePricing?: boolean; includeRoomSchedule?: boolean } = {},
): Promise<void> {
  const body = {
    page_number: 1,
    include_pricing: options.includePricing ?? true,
    include_room_schedule: options.includeRoomSchedule ?? true,
    floor_area_sqft: takeoff.floorArea,
    net_wall_board_sqft: takeoff.netWallBoard,
    ceiling_board_sqft: takeoff.ceilingBoard,
    opening_deduction_sqft: takeoff.openingDeduction,
    waste_sqft: takeoff.wasteSqFt,
    area_with_waste_sqft: takeoff.areaWithWaste,
    sheets_required: takeoff.sheetsRequired,
    perimeter_linear_ft: takeoff.perimeterLinearFt,
    partition_linear_ft: takeoff.partitionLinearFt,
    unknown_linear_ft: takeoff.unknownLinearFt,
    geometry_source: takeoff.geometrySource,
    estimate_ready: takeoff.estimateReady,
    blocked_reasons: takeoff.blockedReasons,
    material_cost_usd: takeoff.materialCostUsd,
    markup_usd: takeoff.markupUsd,
    tax_usd: takeoff.taxUsd,
    total_cost_usd: takeoff.totalCostUsd,
    line_items: takeoff.lineItems,
    flooring_by_material: takeoff.flooringByMaterial,
  };

  const res = await fetch(`${BACKEND_URL}/api/export/${projectId}/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Export failed (${res.status})`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estimate_${projectId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
