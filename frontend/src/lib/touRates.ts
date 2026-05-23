/** Optional TOU rates from user settings — reference only; savings still use blended import rate. */

export type TouRateConfig = {
  scheduleName: string;
  peakRate: number;
  offPeakRate: number;
  superOffPeakRate: number;
};

export function hasTouReference(config: TouRateConfig): boolean {
  return (
    config.scheduleName.trim().length > 0 ||
    config.peakRate > 0 ||
    config.offPeakRate > 0 ||
    config.superOffPeakRate > 0
  );
}

export function averageTouRate(config: TouRateConfig): number | null {
  const rates = [config.peakRate, config.offPeakRate, config.superOffPeakRate].filter((r) => r > 0);
  if (rates.length === 0) return null;
  return Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 1000) / 1000;
}

export function touPeriodsForDisplay(config: TouRateConfig): { label: string; rate: number }[] {
  const rows: { label: string; rate: number }[] = [];
  if (config.peakRate > 0) rows.push({ label: "Peak", rate: config.peakRate });
  if (config.offPeakRate > 0) rows.push({ label: "Off peak", rate: config.offPeakRate });
  if (config.superOffPeakRate > 0) rows.push({ label: "Super off peak", rate: config.superOffPeakRate });
  return rows;
}
