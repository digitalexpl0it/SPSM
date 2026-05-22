import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, Cpu, Gauge, Loader2, RefreshCw, Sun, Thermometer, Zap } from "lucide-react";
import { InverterPowerGauge } from "../components/InverterPowerGauge";
import { SolarThrobber } from "../components/SolarThrobber";
import { dataApi } from "../lib/api";
import { formatChartDateTime } from "../lib/formatChartDateTime";
import { inverterGaugeMaxW } from "../lib/inverterGaugeMax";
import { getSiteTimezone, loadSiteSettings } from "../lib/siteSettings";
import { isSnapshotRecent } from "../lib/snapshotStale";
import {
  formatHeatsinkTemp,
  heatsinkPillClass,
  parseTempSettings,
} from "../lib/temperatureSettings";

interface InverterData {
  sn?: string;
  pMppt1Kw?: number;
  p3phsumKw?: number;
  tHtsnkDegc?: number;
  vMppt1V?: number;
  iMppt1A?: number;
  ltea3phsumKwh?: number;
  prodMdlNm?: string;
  msmtEps?: string;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

function panelLabel(path: string, inv: InverterData) {
  const m = path.match(/inverter\/(\d+)/);
  const idx = m ? parseInt(m[1], 10) + 1 : "?";
  return inv.sn || `Panel ${idx}`;
}

function parseInverters(payload: Record<string, unknown> | undefined) {
  const parsed: Record<string, InverterData> = {};
  if (!payload) return parsed;
  for (const [key, val] of Object.entries(payload)) {
    if (typeof val === "object" && val !== null) parsed[key] = val as InverterData;
  }
  return parsed;
}

function Pill({
  icon: Icon,
  children,
  className,
  title,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  className: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${className}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0 opacity-90" />}
      {children}
    </span>
  );
}

export function InvertersPage() {
  const [inverters, setInverters] = useState<Record<string, InverterData>>({});
  const [connected, setConnected] = useState(false);
  const [gaugeMaxOverride, setGaugeMaxOverride] = useState<number | null>(null);
  const [tempSettings, setTempSettings] = useState(() => parseTempSettings({}));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<"cached" | "live">("cached");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [siteTz, setSiteTz] = useState<string | undefined>();

  const applyPayload = useCallback(
    (
      payload: Record<string, unknown> | undefined,
      ts: string | null,
      source: "cached" | "live"
    ) => {
      setInverters(parseInverters(payload));
      setSnapshotAt(ts);
      setDataSource(source);
    },
    []
  );

  const loadCached = useCallback(async () => {
    const [settings, snaps] = await Promise.all([
      loadSiteSettings(),
      dataApi.devices("inverters"),
    ]);
    setSiteTz(getSiteTimezone(settings));
    const w = parseInt(settings.inverter_gauge_max_w || "", 10);
    setGaugeMaxOverride(!Number.isNaN(w) && w > 0 ? w : null);
    setTempSettings(parseTempSettings(settings));
    const snap = snaps[0];
    applyPayload(snap?.payload as Record<string, unknown>, snap?.ts ?? null, "cached");
    setConnected(isSnapshotRecent(snap?.ts ?? null));
    setRefreshError(null);
  }, [applyPayload]);

  const refreshFromPvs = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await dataApi.live();
      setConnected(res.connected);
      if (!res.connected) {
        setRefreshError(res.error || "PVS not reachable");
        return;
      }
      const inv = (res.telemetry?.inverters || {}) as Record<string, unknown>;
      applyPayload(inv, res.ts ?? new Date().toISOString(), "live");
    } catch (e) {
      setConnected(false);
      setRefreshError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    loadCached()
      .catch(() => setRefreshError("Could not load saved inverter data"))
      .finally(() => setLoading(false));
  }, [loadCached]);

  const resolveGaugeMax = (prodMdlNm?: string) =>
    inverterGaugeMaxW(prodMdlNm, gaugeMaxOverride);

  if (loading) return <SolarThrobber label="Loading inverters…" />;

  const entries = Object.entries(inverters);
  const producing = entries.filter(([, inv]) => {
    const kw = num(inv.pMppt1Kw ?? inv.p3phsumKw);
    return kw != null && kw > 0.001;
  }).length;

  const updatedLabel = snapshotAt ? formatChartDateTime(snapshotAt, siteTz) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
            <Cpu className="w-7 h-7 text-cyan" />
            Micro-inverters
          </h1>
          <p className="text-sm text-mist mt-2 max-w-2xl">
            Each card is one SunPower micro-inverter — power, temperature, and lifetime energy.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {updatedLabel && (
            <p className="text-xs text-mist text-right max-w-xs">
              {dataSource === "live" ? "Live from PVS" : "From collector"}: {updatedLabel}
              {dataSource === "cached" && !isSnapshotRecent(snapshotAt) && (
                <span className="text-amber-400/90"> · may be stale</span>
              )}
            </p>
          )}
          <button
            type="button"
            onClick={refreshFromPvs}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan/30 text-cyan-glow hover:bg-cyan/10 transition text-sm"
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh from PVS
          </button>
        </div>
      </div>

      {refreshError && <p className="text-sm text-red-400">{refreshError}</p>}

      {!connected && dataSource === "cached" && entries.length === 0 && (
        <p className="text-amber-400 text-sm">
          No cached inverter data — run the collector or refresh from PVS.
        </p>
      )}

      {entries.length === 0 ? (
        <div className="card-glow p-6 text-mist text-sm space-y-2">
          <p>No inverter data yet.</p>
          <p>
            Click <span className="text-cyan-glow">Refresh from PVS</span> or wait for the
            collector.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-cyan-glow">
            {entries.length} inverter{entries.length !== 1 ? "s" : ""}
            {producing > 0 ? ` · ${producing} producing now` : " · none producing (night/cloud?)"}
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {entries.map(([path, inv]) => {
              const kw = num(inv.pMppt1Kw ?? inv.p3phsumKw);
              const active = kw != null && kw > 0.001;
              const temp = num(inv.tHtsnkDegc);
              const volts = num(inv.vMppt1V);
              const lifetime = num(inv.ltea3phsumKwh);

              return (
                <div
                  key={path}
                  className="card-glow px-4 pt-3 pb-4 flex flex-col items-center text-center"
                >
                  <Pill
                    className="relative z-[1] bg-surface/90 text-mist border-white/10 mono max-w-full truncate text-[10px]"
                    title={panelLabel(path, inv)}
                  >
                    {panelLabel(path, inv)}
                  </Pill>

                  <div className="relative z-[1] mt-2 flex justify-center">
                    {active ? (
                      <Pill
                        icon={Sun}
                        className="bg-amber-500/20 text-amber-300 border-amber-400/40"
                      >
                        Producing
                      </Pill>
                    ) : (
                      <Pill className="bg-surface/80 text-mist/90 border-mist/25">Idle</Pill>
                    )}
                  </div>

                  <div className="relative z-[1] mt-1 w-full flex justify-center">
                    <InverterPowerGauge
                      kw={kw}
                      active={active}
                      maxW={resolveGaugeMax(inv.prodMdlNm)}
                    />
                  </div>

                  <div className="relative z-[1] mt-5 flex flex-wrap justify-center gap-2 max-w-full">
                    <Pill
                      icon={Thermometer}
                      className={heatsinkPillClass(temp, tempSettings)}
                    >
                      {formatHeatsinkTemp(temp, tempSettings.unit)}
                    </Pill>
                    <Pill
                      icon={Zap}
                      className="bg-purple-500/15 text-purple-300 border-purple-500/35"
                    >
                      {volts != null ? `${volts.toFixed(1)} V` : "— V"}
                    </Pill>
                    <Pill
                      icon={Gauge}
                      className="bg-cyan-500/10 text-cyan-200/90 border-cyan-500/25"
                    >
                      {lifetime != null ? `${lifetime.toFixed(1)} kWh` : "— kWh"}
                    </Pill>
                  </div>

                  {inv.prodMdlNm && (
                    <Pill
                      icon={Activity}
                      className="relative z-[1] mt-2 bg-surface/80 text-mist border-mist/20 max-w-full truncate text-[10px]"
                      title={inv.prodMdlNm}
                    >
                      {inv.prodMdlNm}
                    </Pill>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
