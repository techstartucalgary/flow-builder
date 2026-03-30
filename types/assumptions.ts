export interface AssumptionsSnapshot {
  ceiling_height_ft: number;
  waste_factor: number;
  sheet_width_ft: number;
  sheet_length_ft: number;
  drywall_unit_cost_usd: number | null;
  markup_pct: number | null;
  tax_rate_pct: number | null;
}

export interface AssumptionOverride {
  key: keyof AssumptionsSnapshot;
  value: number;
  locked: boolean;
  reason: string;
  set_at: string;
}

export const DEFAULT_ASSUMPTIONS: AssumptionsSnapshot = {
  ceiling_height_ft: 9.0,
  waste_factor: 0.15,
  sheet_width_ft: 4.0,
  sheet_length_ft: 12.0,
  drywall_unit_cost_usd: null,
  markup_pct: null,
  tax_rate_pct: null,
};
