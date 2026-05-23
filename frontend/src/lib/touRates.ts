/** Optional TOU rates from user settings — used for Reports when TOU estimates are enabled. */

export type TouScheduleId = "sce_tou_d_4_9" | "all_off_peak";

export type TouRateConfig = {
  scheduleName: string;
  peakRate: number;
  offPeakRate: number;
  superOffPeakRate: number;
  estimatesEnabled?: boolean;
  schedule?: TouScheduleId;
};

export const TOU_SCHEDULE_OPTIONS: {
  id: TouScheduleId;
  label: string;
  hint: string;
}[] = [
  {
    id: "sce_tou_d_4_9",
    label: "Weekday peak 4–9 PM (SCE TOU-D style)",
    hint: "Mon–Fri: peak 4–9 PM, super off peak 8 AM–4 PM, off peak otherwise. Weekends all off peak.",
  },
  {
    id: "all_off_peak",
    label: "All off peak",
    hint: "Every hour uses the off-peak rate (simple flat TOU).",
  },
];

export function hasTouReference(config: TouRateConfig): boolean {
  return (
    config.scheduleName.trim().length > 0 ||
    config.peakRate > 0 ||
    config.offPeakRate > 0 ||
    config.superOffPeakRate > 0
  );
}

export function hasTouRatesFilled(config: TouRateConfig): boolean {
  return config.peakRate > 0 || config.offPeakRate > 0 || config.superOffPeakRate > 0;
}

export function canUseTouEstimates(config: TouRateConfig): boolean {
  return Boolean(config.estimatesEnabled) && hasTouRatesFilled(config);
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

export function touScheduleLabel(schedule: TouScheduleId | undefined): string {
  return TOU_SCHEDULE_OPTIONS.find((o) => o.id === schedule)?.label ?? "TOU schedule";
}
