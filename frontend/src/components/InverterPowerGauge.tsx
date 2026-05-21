interface Props {
  kw: number | null;
  active?: boolean;
  className?: string;
  /** AC output cap in watts (from module / inverter type). */
  maxW?: number;
}

function formatPower(kw: number): { value: string; unit: string } {
  const w = kw * 1000;
  if (kw >= 1) return { value: kw.toFixed(2), unit: "kW" };
  if (w >= 100) return { value: String(Math.round(w)), unit: "W" };
  return { value: w.toFixed(1), unit: "W" };
}

/** Semicircle from 180° (left) to 0° (right), opening upward. */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy - r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy - r * Math.sin(rad(endDeg));
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

const CX = 90;
const CY = 84;
const R = 56;
const ARC_LEN = Math.PI * R;

export function InverterPowerGauge({
  kw,
  active = false,
  className = "",
  maxW = 320,
}: Props) {
  const watts = kw != null ? Math.max(0, kw * 1000) : 0;
  const pct = Math.min(watts / maxW, 1);
  const filled = ARC_LEN * pct;
  const track = "rgba(255,255,255,0.14)";
  const fill = active ? "#fbbf24" : "#64748b";
  const path = arcPath(CX, CY, R, 180, 0);

  const formatted = kw != null ? formatPower(kw) : null;
  const valueFill = active ? "#fbbf24" : "#94a3b8";

  return (
    <div
      className={`mx-auto w-[180px] ${className}`}
      title={`Output vs ~${maxW} W AC limit`}
    >
      <svg viewBox="0 0 180 112" className="w-full h-auto" role="img">
        <path
          d={path}
          fill="none"
          stroke={track}
          strokeWidth={9}
          strokeLinecap="round"
        />
        {pct > 0.002 && (
          <path
            d={path}
            fill="none"
            stroke={fill}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${ARC_LEN}`}
          />
        )}
        <text x={14} y={106} fill="rgba(148,163,184,0.55)" fontSize={9}>
          0
        </text>
        <text x={138} y={106} fill="rgba(148,163,184,0.55)" fontSize={9}>
          {maxW}W
        </text>
        {formatted ? (
          <>
            <text
              x={CX}
              y={80}
              textAnchor="middle"
              fill={valueFill}
              fontSize={22}
              fontWeight={700}
              fontFamily="JetBrains Mono, monospace"
            >
              {formatted.value}
              <tspan fill="rgba(148,163,184,0.7)" fontSize={11} fontWeight={500}>
                {" "}
                {formatted.unit}
              </tspan>
            </text>
            <text
              x={CX}
              y={94}
              textAnchor="middle"
              fill="rgba(148,163,184,0.45)"
              fontSize={8}
              letterSpacing="0.08em"
            >
              NOW
            </text>
          </>
        ) : (
          <text x={CX} y={84} textAnchor="middle" fill="rgba(148,163,184,0.5)" fontSize={18}>
            —
          </text>
        )}
      </svg>

      <span className="sr-only">
        {formatted
          ? `Current output ${formatted.value} ${formatted.unit}, `
          : "Power unknown, "}
        scale zero to {maxW} watts
      </span>
    </div>
  );
}
