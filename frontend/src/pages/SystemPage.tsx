import { useEffect, useState } from "react";
import { Activity, ChevronDown, HardDrive, Wifi } from "lucide-react";
import { Pvs6Unit } from "../components/Pvs6Unit";
import { SolarThrobber } from "../components/SolarThrobber";
import { dataApi, settingsApi } from "../lib/api";

const LABELS: Record<string, string> = {
  serialnum: "Serial number",
  sw_rev: "Firmware",
  hwrev: "Hardware revision",
  fwrev: "Firmware (detail)",
  model: "Model",
  uptime: "Uptime",
  sys_type: "System type",
  cpu_usage: "CPU usage",
  ram_usage: "RAM usage",
  flash_usage: "Flash usage",
  active_interface: "Active interface",
  lmac: "MAC address",
  flashwear_type_b: "eMMC flash wear",
};

function formatSystemRows(system: Record<string, unknown>): [string, string][] {
  const rows: [string, string][] = [];
  for (const [key, raw] of Object.entries(system)) {
    if (raw == null || raw === "" || raw === "TBD") continue;
    const labelKey = key.replace(/^\/sys\/(info|pvs)\//, "");
    const label = LABELS[labelKey] ?? labelKey.replace(/_/g, " ");
    const value =
      typeof raw === "object" ? JSON.stringify(raw) : String(raw);
    rows.push([label, value]);
  }
  return rows.sort(([a], [b]) => a.localeCompare(b));
}

export function SystemPage() {
  const [system, setSystem] = useState<Record<string, unknown>>({});
  const [meters, setMeters] = useState<Record<string, unknown>>({});
  const [siteMeta, setSiteMeta] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    Promise.all([dataApi.live(), settingsApi.get()])
      .then(([res, settings]) => {
        setConnected(res.connected);
        setSystem((res.telemetry?.system || {}) as Record<string, unknown>);
        setMeters((res.telemetry?.meters || {}) as Record<string, unknown>);
        setSiteMeta({
          site_name: settings.site_name || "",
          site_id: settings.site_id || "",
          pvs_serial: settings.pvs_serial || "",
          pvs_host: settings.pvs_host || "",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SolarThrobber label="Loading system…" />;

  const rows = formatSystemRows(system);
  const metaRows = [
    siteMeta.site_name && ["Site name", siteMeta.site_name],
    siteMeta.site_id && ["Site ID", siteMeta.site_id],
    siteMeta.pvs_serial && ["Configured serial", siteMeta.pvs_serial],
    siteMeta.pvs_host && ["PVS host", siteMeta.pvs_host],
  ].filter(Boolean) as [string, string][];
  const allRows = [...rows, ...metaRows.filter(([label]) => !rows.some(([r]) => r === label))];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
        <Activity className="w-7 h-7" />
        PVS System
      </h1>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-shrink-0 flex flex-col items-center rounded-2xl bg-void/50 border border-cyan/10 p-6 lg:sticky lg:top-6">
          <Pvs6Unit size="lg" connected={connected} />
          <p className="text-xs text-mist text-center mt-4 max-w-[160px]">
            SunPower PVS6 monitoring unit
          </p>
          <p className="text-[10px] text-mist/80 mt-1">
            {connected ? "Communicating on your network" : "Not reachable"}
          </p>
        </div>

        <div className="flex-1 min-w-0 space-y-6 w-full">
          <div className="card-glow p-6">
            <h2 className="text-sm text-mist mb-4 flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              Supervisor
            </h2>
            {allRows.length === 0 ? (
              <p className="text-sm text-mist">
                No supervisor data from the PVS — check connection in Settings and refresh.
              </p>
            ) : (
              <dl className="grid gap-2 sm:grid-cols-2">
                {allRows.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between gap-4 py-2 border-b border-surface/50"
                  >
                    <dt className="text-xs text-mist truncate">{label}</dt>
                    <dd className="text-sm text-cyan-glow font-mono text-right break-all">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {Object.keys(meters).length > 0 && (
            <details className="card-glow p-6 group">
              <summary className="text-sm text-mist flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                <Wifi className="w-4 h-4 shrink-0" />
                <span>Meters (raw)</span>
                <span className="text-xs text-mist/60">— advanced / debug</span>
                <ChevronDown className="w-4 h-4 ml-auto shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <pre className="mt-4 text-xs text-mist overflow-auto max-h-96 mono rounded-lg bg-void/60 border border-cyan/10 p-3">
                {JSON.stringify(meters, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
