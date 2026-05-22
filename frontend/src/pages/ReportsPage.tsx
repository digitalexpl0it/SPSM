import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Download, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card-glow p-4">
              <p className="text-xs text-mist">Solar produced</p>
              <p className="text-2xl font-bold text-amber-300">{data.totals.pv_kwh} kWh</p>
            </div>
            <div className="card-glow p-4">
              <p className="text-xs text-mist">Home load</p>
              <p className="text-2xl font-bold text-purple-300">{data.totals.load_kwh} kWh</p>
            </div>
            <div className="card-glow p-4">
              <p className="text-xs text-mist">Grid export</p>
              <p className="text-2xl font-bold text-emerald-300">{data.totals.export_kwh} kWh</p>
            </div>
            <div className="card-glow p-4">
              <p className="text-xs text-mist">Est. CO₂ offset</p>
              <p className="text-2xl font-bold text-cyan-glow">{data.totals.co2_kg} kg</p>
            </div>
          </div>

          <div className="card-glow p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,211,238,0.08)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} unit=" kWh" />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid rgba(34,211,238,0.2)",
                  }}
                />
                <Bar dataKey="pv" name="PV kWh" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                <Bar dataKey="load" name="Load kWh" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

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
