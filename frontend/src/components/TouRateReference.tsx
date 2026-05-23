import { Info } from "lucide-react";
import {
  averageTouRate,
  canUseTouEstimates,
  hasTouReference,
  touPeriodsForDisplay,
  touScheduleLabel,
  type TouRateConfig,
} from "../lib/touRates";

type Props = {
  config: TouRateConfig;
  importRate: number;
  onApplyAverage: (rate: number) => void;
};

export function TouRateReference({ config, importRate, onApplyAverage }: Props) {
  if (!hasTouReference(config)) return null;

  const periods = touPeriodsForDisplay(config);
  const average = averageTouRate(config);
  const title = config.scheduleName.trim()
    ? `TOU rates (${config.scheduleName.trim()})`
    : "TOU rates";
  const usingTou = canUseTouEstimates(config);

  return (
    <details className="rounded-xl border border-surface/80 bg-panel/40">
      <summary className="flex items-center gap-2 cursor-pointer list-none px-4 py-3 text-sm text-mist hover:text-cyan-glow/90">
        <Info className="w-4 h-4 shrink-0" />
        <span>{title}</span>
      </summary>
      <div className="px-4 pb-4 text-xs text-mist space-y-3 border-t border-surface/60 pt-3 mx-4 leading-relaxed">
        <p>
          {usingTou ? (
            <>
              TOU estimates are <strong className="text-cyan-glow/90">enabled</strong> — Reports
              attribute grid import/export to each period using{" "}
              <strong className="text-cyan-glow/90">{touScheduleLabel(config.schedule)}</strong> and
              your site timezone.
            </>
          ) : (
            <>
              Optional rates from your utility bill. Enable TOU estimates above to use per-period
              math on Reports; otherwise the single import/export rate is used.
            </>
          )}
        </p>
        {periods.length > 0 && (
          <ul className="space-y-1 mono text-[11px]">
            {periods.map((p) => (
              <li key={p.label} className="flex justify-between gap-4">
                <span>{p.label}</span>
                <span className="text-cyan-glow/80 shrink-0">${p.rate.toFixed(3)}/kWh</span>
              </li>
            ))}
          </ul>
        )}
        {average != null && !usingTou && (
          <p>
            Average of entered TOU rates:{" "}
            <strong className="text-cyan-glow/90">${average.toFixed(2)}/kWh</strong>. You can use
            peak for a conservative import estimate, or the average as a simple blend.
          </p>
        )}
        {average != null && !usingTou && Math.abs(importRate - average) >= 0.005 && (
          <button
            type="button"
            onClick={() => onApplyAverage(average)}
            className="text-xs text-cyan-glow border border-cyan/30 px-3 py-1.5 rounded-lg hover:bg-cyan/10"
          >
            Apply ${average.toFixed(2)}/kWh average to import rate
          </button>
        )}
      </div>
    </details>
  );
}
