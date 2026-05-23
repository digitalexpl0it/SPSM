import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Info, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReportSavings, ReportTotals } from "../lib/api";
import { NEM_PLAN_LABELS, nemPlanSavingsNote, parseNemPlan } from "../lib/nemPlan";

type Props = {
  savings: ReportSavings;
  totals: ReportTotals;
  periodStart: string;
  periodEnd: string;
};

const accentStyles = {
  amber: "from-amber-500/30 to-orange-500/10 text-amber-400 border-amber-500/20",
  rose: "from-rose-500/25 to-orange-500/10 text-rose-300 border-rose-500/25",
  emerald: "from-emerald-500/30 to-cyan/10 text-emerald-400 border-emerald-500/25",
};

function Metric({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  accent: keyof typeof accentStyles;
}) {
  return (
    <div className="card-glow p-4 flex gap-3 items-start border border-surface/80">
      <div
        className={`p-2.5 rounded-xl bg-gradient-to-br shrink-0 border ${accentStyles[accent]}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-mist uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-gradient mt-0.5">{value}</p>
        <p className="text-xs text-mist mt-1 mono">{sub}</p>
      </div>
    </div>
  );
}

function fmtUsd(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtRate(n: number) {
  return n.toFixed(2);
}

export function EstimatedSavingsCard({ savings, totals, periodStart, periodEnd }: Props) {
  const ratesUnset = savings.import_rate === 0 && savings.export_rate === 0;
  const noEnergy =
    totals.pv_kwh === 0 &&
    totals.load_kwh === 0 &&
    totals.import_kwh === 0 &&
    totals.export_kwh === 0;

  const netPositive = savings.net_savings >= 0;
  const nemPlan = parseNemPlan(savings.nem_plan);
  const planNote = nemPlanSavingsNote(nemPlan);

  return (
    <section className="card-glow p-5 sm:p-6 space-y-4 border border-cyan/15">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-cyan-glow flex items-center gap-2">
            <CircleDollarSign className="w-5 h-5" />
            Estimated savings
          </h2>
          <p className="text-xs text-mist mt-1">
            {periodStart} – {periodEnd} · {NEM_PLAN_LABELS[nemPlan]} · bill impact from kWh totals
          </p>
        </div>
        <div
          className={`px-4 py-2 rounded-xl border text-right ${
            netPositive
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-amber-500/30 bg-amber-500/10"
          }`}
        >
          <p className="text-[10px] uppercase tracking-wider text-mist">Net estimate</p>
          <p
            className={`text-2xl font-bold ${
              netPositive ? "text-emerald-400" : "text-amber-300"
            }`}
          >
            {fmtUsd(savings.net_savings)}
          </p>
        </div>
      </div>

      {planNote && (
        <p className="text-sm text-mist bg-surface/40 border border-surface/80 rounded-xl px-4 py-3">
          {planNote}
        </p>
      )}

      {ratesUnset && (
        <p className="text-sm text-amber-300/95 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          Import and export rates are not set (currently $0/kWh), so all dollar values stay at
          $0.00. Set your rates in{" "}
          <Link to="/settings?tab=system" className="text-cyan-glow hover:underline font-medium">
            Settings → System → Reports &amp; estimates
          </Link>
          , then save.
        </p>
      )}

      {!ratesUnset && noEnergy && (
        <p className="text-sm text-mist bg-surface/40 border border-surface/80 rounded-xl px-4 py-3">
          No collector energy data for this period yet — kWh totals are zero, so savings are $0.00
          until readings arrive.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          icon={Sun}
          label="Self-consumed value"
          value={fmtUsd(savings.self_consumption_value)}
          sub={`${savings.self_consumption_kwh} kWh × $${fmtRate(savings.import_rate)}/kWh`}
          accent="amber"
        />
        <Metric
          icon={ArrowDownRight}
          label="Import cost"
          value={fmtUsd(savings.import_cost)}
          sub={`${totals.import_kwh} kWh × $${fmtRate(savings.import_rate)}/kWh`}
          accent="rose"
        />
        <Metric
          icon={ArrowUpRight}
          label="Export credit"
          value={fmtUsd(savings.export_credit)}
          sub={`${totals.export_kwh} kWh × $${fmtRate(savings.export_rate)}/kWh`}
          accent="emerald"
        />
      </div>

      <details className="group rounded-xl border border-surface/80 bg-panel/40">
        <summary className="flex items-center gap-2 cursor-pointer list-none px-4 py-3 text-sm text-mist hover:text-cyan-glow/90">
          <Info className="w-4 h-4 shrink-0" />
          <span>How this is calculated</span>
        </summary>
        <div className="px-4 pb-4 text-xs text-mist space-y-2 leading-relaxed border-t border-surface/60 pt-3 mx-4">
          <p>
            <strong className="text-cyan-glow/90">Self-consumed</strong> = min(solar produced, home
            load) — energy your panels covered instead of buying from the grid, valued at your
            import rate.
          </p>
          <p>
            <strong className="text-cyan-glow/90">Net savings</strong> = self-consumed value +
            export credit − import cost.
          </p>
          <p className="mono text-[11px] text-cyan-glow/70">
            {fmtUsd(savings.self_consumption_value)} + {fmtUsd(savings.export_credit)} −{" "}
            {fmtUsd(savings.import_cost)} = {fmtUsd(savings.net_savings)}
          </p>
          <p>
            Rates: ${fmtRate(savings.import_rate)}/kWh import, ${fmtRate(savings.export_rate)}/kWh
            export —{" "}
            <Link to="/settings?tab=system" className="text-cyan-glow hover:underline">
              edit in Settings
            </Link>
            .
          </p>
        </div>
      </details>
    </section>
  );
}
