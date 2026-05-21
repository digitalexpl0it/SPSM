/** Heatsink temperature display and alert thresholds (Settings → System). */

export type TempUnit = "c" | "f";

/** Panel industry reference (STC / hot climate / max rated) — used for defaults and help text. */
export const PANEL_TEMP_REFERENCE = {
  stc: { f: 77, c: 25 },
  hotClimateTypical: { f: 149, c: 65 },
  maxRated: { f: 185, c: 85 },
} as const;

/** Default alerts: hot-climate typical → max module operating temperature. */
export const DEFAULT_TEMP_THRESHOLDS: Record<TempUnit, { warning: number; critical: number }> = {
  f: {
    warning: PANEL_TEMP_REFERENCE.hotClimateTypical.f,
    critical: PANEL_TEMP_REFERENCE.maxRated.f,
  },
  c: {
    warning: PANEL_TEMP_REFERENCE.hotClimateTypical.c,
    critical: PANEL_TEMP_REFERENCE.maxRated.c,
  },
};

export interface TempSettings {
  unit: TempUnit;
  warning: number;
  critical: number;
  usesCustomThresholds: boolean;
}

export function parseTempSettings(raw: Record<string, string>): TempSettings {
  const unit: TempUnit = raw.temp_unit === "c" ? "c" : "f";
  const defs = DEFAULT_TEMP_THRESHOLDS[unit];
  const warnRaw = parseInt(raw.temp_warning || "", 10);
  const critRaw = parseInt(raw.temp_critical || "", 10);
  const usesCustom = warnRaw > 0 || critRaw > 0;
  return {
    unit,
    warning: warnRaw > 0 ? warnRaw : defs.warning,
    critical: critRaw > 0 ? critRaw : defs.critical,
    usesCustomThresholds: usesCustom,
  };
}

export function formatHeatsinkTemp(value: number | null, unit: TempUnit): string {
  if (value == null || Number.isNaN(value)) return unit === "f" ? "—°F" : "—°C";
  return `${Math.round(value)}°${unit === "f" ? "F" : "C"}`;
}

export function defaultThresholdsLabel(unit: TempUnit): string {
  const d = DEFAULT_TEMP_THRESHOLDS[unit];
  const u = unit === "f" ? "F" : "C";
  return `${d.warning}°${u} warning · ${d.critical}°${u} critical`;
}

/** Pill colors on Inverters page — compare in the user's chosen unit. */
export function heatsinkPillClass(
  temp: number | null,
  { unit, warning, critical }: Pick<TempSettings, "unit" | "warning" | "critical">
): string {
  if (temp == null) return "bg-surface/80 text-mist border-mist/30";
  if (temp >= critical) {
    return "bg-red-500/25 text-red-300 border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.25)]";
  }
  if (temp >= warning) {
    return "bg-orange-500/20 text-orange-300 border-orange-500/40";
  }
  const stc = PANEL_TEMP_REFERENCE.stc[unit];
  if (temp <= stc + (warning - stc) * 0.15) {
    return "bg-cyan-500/15 text-cyan-300 border-cyan-500/35";
  }
  return "bg-amber-500/15 text-amber-300 border-amber-500/35";
}

export function tempThresholdsLabel(cfg: Pick<TempSettings, "unit" | "warning" | "critical">): string {
  const u = cfg.unit === "f" ? "F" : "C";
  return `≥${cfg.warning}°${u} warning · ≥${cfg.critical}°${u} critical`;
}

export function defaultHealthThresholdsLine(unit: TempUnit = "f"): string {
  return tempThresholdsLabel({ unit, ...DEFAULT_TEMP_THRESHOLDS[unit] });
}
