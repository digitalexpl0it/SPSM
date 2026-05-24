import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Battery, PlugZap, Sun, Zap } from "lucide-react";
import type { Reading } from "../lib/api";

const HOUSE_IMG_DAY = "/images/solar-house.webp";
const HOUSE_IMG_NIGHT = "/images/solar-house-night.png";

/** Horizontal layout: Solar — Home (+ battery below) — Grid. */
const POS = {
  solar: { x: 18, y: 46 },
  home: { x: 50, y: 44 },
  grid: { x: 82, y: 46 },
} as const;

/** viewBox units = CSS % on the stage (SVG stretched to fill, no letterboxing). */
const VB = { w: 100, h: 52 } as const;
const SVG_VIEW = `0 0 ${VB.w} ${VB.h}`;

/** Horizontal connectors at icon row height (y 23 ≈ 46% node row). */
const LINES = {
  solarHome: { x1: 24, y1: 23, x2: 37, y2: 23 },
  homeGrid: { x1: 63, y1: 23, x2: 76, y2: 23 },
  homeBattery: { x1: 50, y1: 27, x2: 50, y2: 42 },
} as const;

const STROKE = { active: 2, idle: 1.25 } as const;

/** Darker strokes so dashed flow reads on black background. */
const FLOW_COLORS = {
  solar: "#ca8a04",
  gridExport: "#059669",
  gridImport: "#7c3aed",
  battery: "#059669",
  idle: "rgba(75,85,99,0.55)",
} as const;

function isNightHour(hour: number) {
  return hour < 6 || hour >= 20;
}

function pct(x: number, y: number): CSSProperties {
  return { left: `${x}%`, top: `${y}%` };
}

interface Props {
  data: Reading | null;
  connected: boolean;
  hasBattery?: boolean;
  large?: boolean;
}

function kw(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Math.abs(v).toFixed(2)} kW`;
}

interface FlowLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
  reverse?: boolean;
  color: string;
  inactiveColor?: string;
}

function FlowLine({
  x1,
  y1,
  x2,
  y2,
  active,
  reverse,
  color,
  inactiveColor = FLOW_COLORS.idle,
}: FlowLineProps) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={active ? color : inactiveColor}
      strokeWidth={active ? STROKE.active : STROKE.idle}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      className={active ? (reverse ? "flow-line-reverse" : "flow-line") : undefined}
    />
  );
}

interface NodeProps {
  style: CSSProperties;
  children: ReactNode;
  label: string;
  value: string;
  valueClass: string;
  z?: number;
}

function FlowNode({ style, children, label, value, valueClass, z = 20 }: NodeProps) {
  return (
    <div
      className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2"
      style={{ ...style, zIndex: z }}
    >
      {children}
      <span className="text-[10px] text-mist uppercase tracking-wider whitespace-nowrap">{label}</span>
      <span className={`text-sm font-mono font-semibold whitespace-nowrap ${valueClass}`}>{value}</span>
    </div>
  );
}

export function EnergyFlowDiagram({ data, connected, hasBattery = false, large = false }: Props) {
  const iconCls = large ? "w-10 h-10" : "w-8 h-8";
  const nodePad = large ? "p-3" : "p-3";
  const houseCls = large
    ? "h-24 sm:h-28 w-auto object-contain drop-shadow-[0_0_24px_rgba(34,211,238,0.3)]"
    : "h-20 sm:h-24 w-auto object-contain drop-shadow-[0_0_24px_rgba(34,211,238,0.25)]";
  const stageCls = large
    ? hasBattery
      ? "relative w-full aspect-[2/1] min-h-[260px] max-h-[300px]"
      : "relative w-full aspect-[2/1] min-h-[200px] max-h-[240px]"
    : hasBattery
      ? "relative w-full max-w-2xl mx-auto aspect-[2/1] min-h-[280px]"
      : "relative w-full max-w-2xl mx-auto aspect-[2/1] min-h-[220px]";

  const [isNight, setIsNight] = useState(() => isNightHour(new Date().getHours()));

  useEffect(() => {
    const tick = () => setIsNight(isNightHour(new Date().getHours()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const pv = data?.pv_kw ?? 0;
  const load = data?.load_kw ?? 0;
  const net = data?.net_kw ?? 0;
  const batt = data?.battery_kw ?? 0;
  const soc = data?.battery_soc;

  const exporting = net < -0.05;
  const importing = net > 0.05;
  const charging = batt > 0.05;
  const discharging = batt < -0.05;
  const solarProducing = pv > 0.01;

  const solarDimmed = isNight;
  const solarLineActive = connected && solarProducing && !isNight;
  const gridLineActive = connected && Math.abs(net) > 0.01;
  const battLineActive =
    connected && hasBattery && (charging || discharging || Math.abs(batt) > 0.05);

  return (
    <div
      className={`card-glow relative overflow-hidden flex flex-col ${large ? "p-4" : "p-6"}`}
    >
      <div className={`flex items-center gap-2 ${large ? "mb-2" : "mb-2"}`}>
        <Zap className="w-5 h-5 text-cyan" />
        <h2 className="text-lg font-semibold text-gradient">Live Energy Flow</h2>
        <span
          className={`ml-auto flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
            connected
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-red-500/20 text-red-400"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-throb" : "bg-red-400"}`}
          />
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      <div className={stageCls}>
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-[5]"
          viewBox={SVG_VIEW}
          preserveAspectRatio="none"
          aria-hidden
        >
          <FlowLine
            x1={LINES.solarHome.x1}
            y1={LINES.solarHome.y1}
            x2={LINES.solarHome.x2}
            y2={LINES.solarHome.y2}
            active={solarLineActive}
            color={FLOW_COLORS.solar}
          />
          <FlowLine
            x1={LINES.homeGrid.x1}
            y1={LINES.homeGrid.y1}
            x2={LINES.homeGrid.x2}
            y2={LINES.homeGrid.y2}
            active={gridLineActive}
            reverse={!exporting}
            color={exporting ? FLOW_COLORS.gridExport : FLOW_COLORS.gridImport}
          />
          {hasBattery && (
            <FlowLine
              x1={LINES.homeBattery.x1}
              y1={LINES.homeBattery.y1}
              x2={LINES.homeBattery.x2}
              y2={LINES.homeBattery.y2}
              active={battLineActive}
              reverse={discharging}
              color={FLOW_COLORS.battery}
            />
          )}
        </svg>

        <FlowNode
          style={pct(POS.solar.x, POS.solar.y)}
          label="Solar"
          value={kw(pv)}
          valueClass={solarDimmed ? "text-mist" : "text-amber-400"}
        >
          <div
            className={`${nodePad} rounded-2xl bg-surface border transition-all duration-500 ${
              solarDimmed
                ? "border-mist/20 opacity-35 grayscale"
                : "border-amber-400/30 shadow-[0_0_16px_rgba(251,191,36,0.3)]"
            } ${solarLineActive ? "animate-pulse-slow" : ""}`}
          >
            <Sun className={`${iconCls} ${solarDimmed ? "text-mist" : "text-amber-400"}`} />
          </div>
          {isNight && <span className="text-[9px] text-mist/80 -mt-0.5">Night</span>}
        </FlowNode>

        <div
          className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2"
          style={{ ...pct(POS.home.x, POS.home.y), zIndex: 10 }}
        >
          <div className="relative flex flex-col items-center">
            <img
              src={isNight ? HOUSE_IMG_NIGHT : HOUSE_IMG_DAY}
              alt=""
              className={`${houseCls} transition-opacity duration-500`}
            />
            {connected && load > 0.05 && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400 animate-throb shadow-glow-cyan" />
            )}
          </div>
          <span className="text-[10px] text-mist uppercase tracking-wider whitespace-nowrap mt-1">
            Home
          </span>
          <span className="text-sm font-mono font-semibold whitespace-nowrap text-cyan-glow">
            {kw(load)}
          </span>
          {hasBattery && (
            <div className="mt-3 flex flex-col items-center gap-1">
              <div
                className={`${nodePad} rounded-2xl bg-surface border border-emerald-400/25 ${
                  battLineActive ? "shadow-glow-cyan" : ""
                }`}
              >
                <Battery className={`${iconCls} text-emerald-400`} />
              </div>
              <span className="text-[10px] text-mist uppercase tracking-wider whitespace-nowrap">
                {charging ? "Charging" : discharging ? "Discharging" : "Battery"}
              </span>
              <span className="text-sm font-mono font-semibold whitespace-nowrap text-emerald-400">
                {soc != null ? `${soc.toFixed(0)}% · ${kw(batt)}` : kw(batt)}
              </span>
            </div>
          )}
        </div>

        <FlowNode
          style={pct(POS.grid.x, POS.grid.y)}
          label={exporting ? "To Grid" : importing ? "From Grid" : "Grid"}
          value={kw(net)}
          valueClass={exporting ? "text-emerald-400" : "text-purple-400"}
        >
          <div
            className={`${nodePad} rounded-2xl bg-surface border border-purple-400/25 ${
              gridLineActive
                ? exporting
                  ? "shadow-[0_0_16px_rgba(5,150,105,0.35)]"
                  : "shadow-[0_0_16px_rgba(124,58,237,0.35)]"
                : ""
            }`}
          >
            <PlugZap
              className={`${iconCls} ${exporting ? "text-emerald-400" : "text-purple-400"}`}
            />
          </div>
        </FlowNode>
      </div>
    </div>
  );
}
