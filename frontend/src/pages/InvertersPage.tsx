import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, Cpu, Gauge, Sun, Thermometer, Zap } from "lucide-react";
import { InverterPowerGauge } from "../components/InverterPowerGauge";
import { SolarThrobber } from "../components/SolarThrobber";
import { dataApi } from "../lib/api";
import { inverterGaugeMaxW } from "../lib/inverterGaugeMax";

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

/** Heatsink °C from live PVS data — green → amber → orange → red. */
function tempPillStyle(c: number | null): string {
  if (c == null) return "bg-surface/80 text-mist border-mist/30";
  if (c < 40) return "bg-cyan-500/15 text-cyan-300 border-cyan-500/35";
  if (c < 50) return "bg-amber-500/15 text-amber-300 border-amber-500/35";
  if (c < 65) return "bg-orange-500/20 text-orange-300 border-orange-500/40";
  return "bg-red-500/25 text-red-300 border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.25)]";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dataApi
      .live()
      .then((res) => {
        setConnected(res.connected);
        const inv = (res.telemetry?.inverters || {}) as Record<string, InverterData | string>;
        const parsed: Record<string, InverterData> = {};
        for (const [key, val] of Object.entries(inv)) {
          if (typeof val === "object" && val !== null) parsed[key] = val as InverterData;
        }
        setInverters(parsed);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SolarThrobber label="Loading inverters…" />;

  const entries = Object.entries(inverters);
  const producing = entries.filter(([, inv]) => {
    const kw = num(inv.pMppt1Kw ?? inv.p3phsumKw);
    return kw != null && kw > 0.001;
  }).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
          <Cpu className="w-7 h-7 text-cyan" />
          Micro-inverters
        </h1>
        <p className="text-sm text-mist mt-2 max-w-2xl">
          Each card is one SunPower micro-inverter on your roof — power, temperature, and lifetime
          energy for that panel. Data comes straight from your PVS6 over the local network.
        </p>
      </div>

      {!connected && (
        <p className="text-red-400 text-sm">PVS not connected — check Settings.</p>
      )}

      {entries.length === 0 ? (
        <div className="card-glow p-6 text-mist text-sm space-y-2">
          <p>No inverter data returned from the PVS.</p>
          <p>
            At night inverters often report zero power but should still appear here once the
            connection is working. If this persists during daylight, use Settings → Test
            connection.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-cyan-glow">
            {entries.length} inverter{entries.length !== 1 ? "s" : ""} found
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
                      maxW={inverterGaugeMaxW(inv.prodMdlNm)}
                    />
                  </div>

                  <div className="relative z-[1] mt-5 flex flex-wrap justify-center gap-2 max-w-full">
                    <Pill icon={Thermometer} className={tempPillStyle(temp)}>
                      {temp != null ? `${Math.round(temp)}°C` : "—°C"}
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
