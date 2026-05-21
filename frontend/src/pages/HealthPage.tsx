import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  HeartPulse,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { SolarThrobber } from "../components/SolarThrobber";
import { healthApi, type HealthResponse, type HealthAlert } from "../lib/api";
import { formatChartDateTime } from "../lib/formatChartDateTime";
import {
  defaultHealthThresholdsLine,
  tempThresholdsLabel,
} from "../lib/temperatureSettings";

const SEVERITY_META: Record<
  HealthAlert["severity"],
  { icon: typeof AlertCircle; label: string; row: string }
> = {
  critical: {
    icon: AlertCircle,
    label: "Critical",
    row: "text-red-300",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    row: "text-amber-300",
  },
  info: {
    icon: Info,
    label: "Info",
    row: "text-cyan-200",
  },
};

function SummaryBadge({ summary }: { summary: HealthResponse["summary"] }) {
  const styles =
    summary === "healthy"
      ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
      : summary === "critical"
        ? "text-red-400 border-red-500/40 bg-red-500/10"
        : summary === "warning"
          ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
          : "text-cyan-300 border-cyan-500/30 bg-cyan-500/10";
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${styles}`}>
      {summary === "healthy" ? "All clear" : summary.charAt(0).toUpperCase() + summary.slice(1)}
    </span>
  );
}

export function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (initial = false) => {
    if (!initial) setRefreshing(true);
    setError(null);
    try {
      setData(await healthApi.site());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Health check failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  if (loading) return <SolarThrobber label="Running health checks…" />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
            <HeartPulse className="w-7 h-7" />
            System health
          </h1>
          <p className="text-sm text-mist mt-2 max-w-xl">
            Rule-based checks on collector data and a quick PVS connection test. Not a
            substitute for the SunPower app or installer diagnostics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(false)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan/30 text-cyan-glow hover:bg-cyan/10 transition text-sm shrink-0"
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Re-run checks
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {data && (
        <>
          <div className="card-glow p-4 flex flex-wrap items-center gap-4">
            <SummaryBadge summary={data.summary} />
            <div className="text-xs text-mist space-y-0.5">
              <p>
                Checked {formatChartDateTime(data.checked_at)}
                {data.pvs_connected ? " · PVS reachable" : " · PVS not reachable"}
              </p>
              {data.latest_reading_at && (
                <p>Last reading {formatChartDateTime(data.latest_reading_at)}</p>
              )}
            </div>
          </div>

          <details className="card-glow p-5 group" open>
            <summary className="text-sm font-medium text-cyan-glow/90 flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <Info className="w-4 h-4 shrink-0" />
              What we check
              <span className="text-xs font-normal text-mist/60">8 rules</span>
              <ChevronDown className="w-4 h-4 ml-auto shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-3 text-sm text-mist space-y-1.5 list-disc pl-5">
              <li>PVS reachable (quick login test)</li>
              <li>Collector gaps — no readings for ~10+ minutes</li>
              <li>Daylight hours (UTC) with near-zero site PV for ~45 minutes</li>
              <li>One inverter at ~0 W while others produce</li>
              <li>
                Micro-inverter heatsink temperature —{" "}
                {data.temp_config
                  ? tempThresholdsLabel({
                      unit: data.temp_config.unit,
                      warning: data.temp_config.warning,
                      critical: data.temp_config.critical,
                    })
                  : defaultHealthThresholdsLine("f")}
              </li>
              <li>Sharp drop vs recent average production</li>
              <li>Non-zero MID / transfer switch state</li>
              <li>Fault / alarm / error fields in latest inverter or system snapshots</li>
            </ul>
          </details>

          {data.ok.length > 0 && (
            <div className="card-glow p-5 space-y-2">
              <h2 className="text-sm font-medium text-emerald-400/90 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Looking good
              </h2>
              <ul className="text-sm text-mist space-y-1">
                {data.ok.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <span className="text-emerald-500/80 mt-0.5">•</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.alerts.length > 0 ? (
            <div className="card-glow overflow-hidden">
              <h2 className="text-sm font-medium text-mist px-4 py-3 border-b border-surface/80">
                {data.alerts.length} alert{data.alerts.length !== 1 ? "s" : ""}
              </h2>
              <div className="overflow-x-auto">
                <table className="table-zebra">
                  <thead>
                    <tr>
                      <th className="w-28">Severity</th>
                      <th className="w-44">Issue</th>
                      <th>Summary</th>
                      <th className="min-w-[12rem]">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.alerts.map((alert) => {
                      const meta = SEVERITY_META[alert.severity];
                      const Icon = meta.icon;
                      return (
                        <tr key={alert.id}>
                          <td>
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${meta.row}`}
                            >
                              <Icon className="w-3.5 h-3.5 shrink-0" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="font-medium text-cyan-glow/90">{alert.title}</td>
                          <td className="text-mist">{alert.message}</td>
                          <td className="text-xs text-mist/80">{alert.detail || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-mist card-glow p-4">No alerts at this time.</p>
          )}
        </>
      )}
    </div>
  );
}
