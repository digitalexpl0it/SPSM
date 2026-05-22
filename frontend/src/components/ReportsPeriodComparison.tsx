import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReportTotals } from "../lib/api";

function formatPeriodRange(start: string, end: string): string {
  const y = end.slice(0, 4);
  if (start.slice(0, 4) === y) {
    return `${start.slice(5)} – ${end.slice(5)}, ${y}`;
  }
  return `${start} – ${end}`;
}

function pctChange(current: number, prior: number): number | null {
  if (prior <= 0.01) return null;
  return ((current - prior) / prior) * 100;
}

type Row = {
  label: string;
  unit: string;
  current: number;
  prior: number;
  /** true = higher is better (solar, export, co2) */
  higherIsBetter?: boolean;
};

function ChangeBadge({
  pct,
  higherIsBetter = true,
}: {
  pct: number | null;
  higherIsBetter?: boolean;
}) {
  if (pct == null) return <span className="text-mist">—</span>;
  const up = pct >= 0;
  const good = higherIsBetter ? up : !up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${
        good ? "text-emerald-400" : "text-amber-400"
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {up ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  );
}

type Props = {
  periodLabel: string;
  current: ReportTotals;
  prior: ReportTotals;
  priorPeriod: { start: string; end: string };
  coverageNote?: string;
};

export function ReportsPeriodComparison({
  periodLabel,
  current,
  prior,
  priorPeriod,
  coverageNote,
}: Props) {
  const rows: Row[] = [
    { label: "Solar produced", unit: "kWh", current: current.pv_kwh, prior: prior.pv_kwh, higherIsBetter: true },
    { label: "Home load", unit: "kWh", current: current.load_kwh, prior: prior.load_kwh, higherIsBetter: false },
    { label: "Grid export", unit: "kWh", current: current.export_kwh, prior: prior.export_kwh, higherIsBetter: true },
    { label: "Est. CO₂ offset", unit: "kg", current: current.co2_kg, prior: prior.co2_kg, higherIsBetter: true },
  ];

  return (
    <div className="card-glow overflow-hidden">
      <div className="px-4 py-3 border-b border-surface/80">
        <h2 className="text-sm font-medium text-cyan-glow">Period comparison</h2>
        <p className="text-xs text-mist mt-1">
          {periodLabel} vs same dates last year ({formatPeriodRange(priorPeriod.start, priorPeriod.end)})
          {coverageNote ? ` · ${coverageNote}` : ""}
        </p>
      </div>
      <table className="table-zebra">
        <thead>
          <tr>
            <th>Metric</th>
            <th>This period</th>
            <th>Year ago</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="text-mist">{r.label}</td>
              <td className="tabular-nums">
                {r.current} {r.unit}
              </td>
              <td className="tabular-nums text-mist">
                {r.prior} {r.unit}
              </td>
              <td>
                <ChangeBadge
                  pct={pctChange(r.current, r.prior)}
                  higherIsBetter={r.higherIsBetter}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
