import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InverterSeriesPoint } from "../lib/api";
import { formatChartAxis, formatChartDateTime } from "../lib/formatChartDateTime";

type Props = {
  data: InverterSeriesPoint[];
  range: string;
  siteTz?: string;
};

export function InverterMiniChart({ data, range, siteTz }: Props) {
  if (!data.length) {
    return <p className="text-xs text-mist py-4 text-center">No history for this range yet.</p>;
  }

  const chartData = data.map((p) => ({
    ...p,
    label: formatChartAxis(p.ts, range, siteTz),
  }));

  return (
    <div className="h-36 w-full mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="invKwGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} width={36} unit="kW" />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
            labelFormatter={(_, payload) => {
              const ts = payload?.[0]?.payload?.ts as string | undefined;
              return ts ? formatChartDateTime(ts, siteTz) : "";
            }}
          />
          <Area
            type="monotone"
            dataKey="kw"
            stroke="#fbbf24"
            fill="url(#invKwGrad)"
            strokeWidth={2}
            name="Power"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
