import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Battery,
  Gauge,
  Home,
  Info,
  PlugZap,
  Sun,
  TrendingUp,
  Zap,
  Wifi,
  WifiOff,
} from "lucide-react";
import { EnergyFlowDiagram } from "../components/EnergyFlowDiagram";
import { PowerChart } from "../components/PowerChart";
import { SolarThrobber } from "../components/SolarThrobber";
import { StatCard } from "../components/StatCard";
import { dataApi, type LiveResponse, type Reading, type SeriesPoint, type SummaryResponse } from "../lib/api";
import { loadSiteSettings } from "../lib/siteSettings";

import { apiUrl } from "../lib/api";

const RANGES = ["hour", "day", "week", "month", "year"] as const;
type Range = (typeof RANGES)[number];

function gridNow(ld: Reading | null) {
  const net = ld?.net_kw ?? 0;
  if (net < -0.05) {
    return {
      label: "To grid now",
      value: `${Math.abs(net).toFixed(2)} kW`,
      accent: "emerald" as const,
    };
  }
  if (net > 0.05) {
    return {
      label: "From grid now",
      value: `${Math.abs(net).toFixed(2)} kW`,
      accent: "purple" as const,
    };
  }
  return { label: "Grid now", value: "—", accent: "cyan" as const };
}

function solarOffsetPercent(pv: number | null | undefined, load: number | null | undefined) {
  const p = pv ?? 0;
  const l = load ?? 0;
  if (l <= 0.01) return p > 0.01 ? "100%" : "—";
  return `${Math.min(100, Math.round((Math.min(p, l) / l) * 100))}%`;
}

export function DashboardPage() {
  const [range, setRange] = useState<Range>("day");
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeLoading, setRangeLoading] = useState(false);
  const hasLoadedOnce = useRef(false);

  const refreshLive = useCallback(async () => {
    const [liveRes, summaryRes] = await Promise.allSettled([
      dataApi.live(),
      dataApi.summary(),
    ]);

    if (liveRes.status === "fulfilled") {
      setLive(liveRes.value);
    } else {
      setLive({
        connected: false,
        error:
          liveRes.reason instanceof Error
            ? liveRes.reason.message
            : "Failed to load live data",
      });
    }

    if (summaryRes.status === "fulfilled") {
      setSummary(summaryRes.value);
    }
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let pollId: ReturnType<typeof setInterval> | undefined;

    const start = async () => {
      const settings = await loadSiteSettings();
      const token = localStorage.getItem("token");
      if (settings.websocket_live === "true" && token) {
        es = new EventSource(
          `${apiUrl("/api/live/stream")}?token=${encodeURIComponent(token)}`
        );
        es.onmessage = (ev) => {
          try {
            const d = JSON.parse(ev.data) as LiveResponse;
            setLive(d);
          } catch {
            /* ignore */
          }
        };
        pollId = setInterval(() => dataApi.summary().then(setSummary), 60000);
      } else {
        refreshLive();
        pollId = setInterval(refreshLive, 15000);
      }
    };
    start();
    return () => {
      es?.close();
      if (pollId) clearInterval(pollId);
    };
  }, [refreshLive]);

  useEffect(() => {
    let cancelled = false;
    const isRangeChange = hasLoadedOnce.current;
    if (isRangeChange) setRangeLoading(true);

    const bucket = range === "hour" ? "minute" : "hour";
    const seriesPromise = dataApi.series(range, bucket);
    const livePromise = isRangeChange ? Promise.resolve() : refreshLive();

    Promise.all([livePromise, seriesPromise])
      .then(([, data]) => {
        if (!cancelled) setSeries(data);
      })
      .catch(() => {
        /* keep previous chart data on error */
      })
      .finally(() => {
        if (!cancelled) {
          setRangeLoading(false);
          setLoading(false);
          hasLoadedOnce.current = true;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [range, refreshLive]);

  const ld: Reading | null = live?.livedata
    ? {
        ts: live.ts || "",
        pv_kw: live.livedata.pv_kw ?? (live.livedata as unknown as Reading).pv_kw,
        net_kw: live.livedata.net_kw,
        load_kw: live.livedata.load_kw,
        battery_kw: live.livedata.battery_kw,
        battery_soc: live.livedata.battery_soc,
      }
    : summary?.current ?? null;

  const batteryEnabled = live?.battery_enabled === true;
  const grid = gridNow(ld);
  const todayNet = summary?.today_net_kwh ?? 0;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <SolarThrobber label="Loading solar data…" />
      </div>
    );
  }

  return (
    <>
      {rangeLoading && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-void/55 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <SolarThrobber label="Loading chart…" />
        </div>
      )}

      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gradient">Dashboard</h1>
            <p className="text-sm text-mist flex items-center gap-2 mt-1">
              {live?.connected ? (
                <>
                  <Wifi className="w-4 h-4 text-emerald-400" />
                  PVS connected
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-400" />
                  {live?.error || "PVS offline — check Settings"}
                </>
              )}
            </p>
          </div>

          <div className="flex gap-1 p-1 rounded-xl bg-surface border border-cyan/10">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                disabled={rangeLoading}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize transition disabled:opacity-50 ${
                  range === r
                    ? "bg-gradient-brand text-void font-medium"
                    : "text-mist hover:text-cyan-glow"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </header>

        {live?.hints && live.hints.length > 0 && (
          <div className="card-glow p-4 border border-amber-500/25 bg-amber-500/5">
            {live.hints.map((h) => (
              <p key={h.id} className="text-sm text-amber-200/90 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                {h.message}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
          <div className="grid grid-cols-2 gap-3 lg:contents shrink-0">
            <div className="flex flex-col gap-3 shrink-0 w-full sm:min-w-[11rem] lg:w-52 xl:w-56">
              <StatCard
                icon={Sun}
                label="Solar now"
                value={ld?.pv_kw != null ? `${ld.pv_kw.toFixed(2)} kW` : "—"}
                accent="amber"
              />
              <StatCard
                icon={Gauge}
                label="Home load"
                value={ld?.load_kw != null ? `${ld.load_kw.toFixed(2)} kW` : "—"}
                accent="cyan"
              />
              <StatCard
                icon={PlugZap}
                label={grid.label}
                value={grid.value}
                accent={grid.accent}
              />
              <StatCard
                icon={Zap}
                label="Load from solar"
                value={solarOffsetPercent(ld?.pv_kw, ld?.load_kw)}
                sub="of home use, right now"
                accent="amber"
              />
            </div>

            <div className="flex flex-col gap-3 shrink-0 w-full sm:min-w-[13.5rem] lg:w-64 xl:w-72">
              <StatCard
                icon={TrendingUp}
                label="Today production"
                value={`${summary?.today_pv_kwh?.toFixed(1) ?? "0"} kWh`}
                sub={
                  <>
                    {summary?.sample_count ?? 0} samples ·{" "}
                    <Link to="/reports" className="text-cyan-glow hover:underline">
                      View report
                    </Link>
                  </>
                }
                accent="amber"
              />
              <StatCard
                icon={Home}
                label="Today consumption"
                value={`${summary?.today_load_kwh?.toFixed(1) ?? "0"} kWh`}
                accent="cyan"
              />
              <StatCard
                icon={PlugZap}
                label="Today net (grid)"
                value={`${Math.abs(todayNet).toFixed(1)} kWh`}
                sub={
                  todayNet > 0.05
                    ? "net import today"
                    : todayNet < -0.05
                      ? "net export today"
                      : "balanced"
                }
                accent={todayNet < -0.05 ? "emerald" : todayNet > 0.05 ? "purple" : "cyan"}
              />
              {batteryEnabled && (
                <StatCard
                  icon={Battery}
                  label="Battery"
                  value={ld?.battery_soc != null ? `${ld.battery_soc.toFixed(0)}%` : "—"}
                  sub={ld?.battery_kw != null ? `${ld.battery_kw.toFixed(2)} kW` : undefined}
                  accent="emerald"
                />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <EnergyFlowDiagram
              large
              data={ld}
              connected={!!live?.connected}
              hasBattery={batteryEnabled}
            />
          </div>
        </div>

        <div className={rangeLoading ? "opacity-60 transition-opacity" : ""}>
          <PowerChart data={series} range={range} />
        </div>
      </div>
    </>
  );
}
