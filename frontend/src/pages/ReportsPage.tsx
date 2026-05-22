import { useCallback, useEffect, useState } from "react";
import { BarChart3, Download, Home, Leaf, Loader2, PlugZap, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { ReportsEnergyChart } from "../components/ReportsEnergyChart";
import { StatCard } from "../components/StatCard";
import { SolarThrobber } from "../components/SolarThrobber";
import { reportsApi, type DailyReportResponse } from "../lib/api";
import { getSiteTimezone, loadSiteSettings } from "../lib/siteSettings";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

export function ReportsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DailyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tz, setTz] = useState("America/Los_Angeles");
  const [rank, setRank] = useState<
    { path: string; serial: string; kw: number; temp: number | null }[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await loadSiteSettings();
      setTz(getSiteTimezone(settings));
      const [report, rankRes] = await Promise.all([
        reportsApi.daily(days),
        reportsApi.inverterRank(),
      ]);
      setData(report);
      setRank(rankRes.items.slice(0, 5));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadCsv = () => {
    const token = localStorage.getItem("token");
    const url = reportsApi.exportCsvUrl(days);
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `spsm-report-${days}d.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  if (loading && !data) return <SolarThrobber label="Loading reports…" />;

  const chartData =
    data?.days.map((d) => ({
      date: d.date.slice(5),
      pv: d.pv_kwh,
      load: d.load_kwh,
    })) ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
            <BarChart3 className="w-7 h-7" />
            Energy reports
          </h1>
          <p className="text-sm text-mist mt-2">
            Daily production and consumption from collector data ({tz}).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                days === r.days
                  ? "border-cyan/50 bg-cyan/15 text-cyan-glow"
                  : "border-surface text-mist hover:border-cyan/30"
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={downloadCsv}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan/30 text-cyan-glow text-sm hover:bg-cyan/10"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-mist flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Updating…
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Sun}
              label="Solar produced"
              value={`${data.totals.pv_kwh} kWh`}
              accent="amber"
            />
            <StatCard
              icon={Home}
              label="Home load"
              value={`${data.totals.load_kwh} kWh`}
              accent="cyan"
            />
            <StatCard
              icon={PlugZap}
              label="Grid export"
              value={`${data.totals.export_kwh} kWh`}
              accent="emerald"
            />
            <StatCard
              icon={Leaf}
              label="Est. CO₂ offset"
              value={`${data.totals.co2_kg} kg`}
              accent="purple"
            />
          </div>

          <ReportsEnergyChart data={chartData} />

          <div className="card-glow overflow-hidden">
            <table className="table-zebra">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>PV</th>
                  <th>Load</th>
                  <th>Import</th>
                  <th>Export</th>
                  <th>Self-use</th>
                </tr>
              </thead>
              <tbody>
                {[...data.days].reverse().map((d) => (
                  <tr key={d.date}>
                    <td className="mono text-sm">{d.date}</td>
                    <td>{d.pv_kwh} kWh</td>
                    <td>{d.load_kwh} kWh</td>
                    <td>{d.import_kwh} kWh</td>
                    <td>{d.export_kwh} kWh</td>
                    <td>{d.self_consumption_pct != null ? `${d.self_consumption_pct}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rank.length > 0 && (
            <div className="card-glow p-4">
              <h2 className="text-sm font-medium text-mist mb-2">Lowest output right now</h2>
              <ul className="text-sm space-y-1">
                {rank.map((r) => (
                  <li key={r.path} className="flex justify-between gap-4">
                    <span className="mono text-cyan-glow/80 truncate">{r.serial}</span>
                    <span className="text-mist shrink-0">{r.kw.toFixed(3)} kW</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-mist">
            <Link to="/settings" className="text-cyan-glow hover:underline">
              Settings
            </Link>{" "}
            — timezone and CO₂ factor affect these totals.
          </p>
        </>
      )}
    </div>
  );
}
