/** Expected AC power from heatsink temp and nameplate (STC 25°C). */

export function expectedDeratedKw(
  ratedKw: number,
  tempC: number | null,
  coeffPctPerC: number
): number | null {
  if (ratedKw <= 0 || tempC == null || !Number.isFinite(tempC)) return null;
  const factor = 1 + (coeffPctPerC / 100) * (tempC - 25);
  return Math.max(0, Math.min(ratedKw, ratedKw * factor));
}
