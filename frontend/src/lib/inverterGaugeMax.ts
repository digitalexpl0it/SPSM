/**
 * Gauge full-scale (W) — inverter AC output cap, not panel STC.
 * SunPower AC_Module_Type_E ≈ Enphase IQ7XS, ~315–320 VA continuous.
 */
const DEFAULT_MAX_W = 320;

const MODEL_MAX_W: Record<string, number> = {
  AC_Module_Type_E: 320,
  AC_Module_Type_D: 290,
  AC_Module_Type_C: 290,
};

export function inverterGaugeMaxW(prodMdlNm?: string | null): number {
  if (!prodMdlNm) return DEFAULT_MAX_W;
  const trimmed = prodMdlNm.trim();
  if (MODEL_MAX_W[trimmed]) return MODEL_MAX_W[trimmed];
  const m = trimmed.match(/(\d{3})\s*[-_]?\s*(?:W|w)/);
  if (m) return parseInt(m[1], 10);
  const spr = trimmed.match(/SPR-[A-Z0-9]+-(\d{3})/i);
  if (spr) return parseInt(spr[1], 10);
  return DEFAULT_MAX_W;
}
