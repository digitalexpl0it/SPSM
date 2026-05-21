import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "../lib/api";
import { formatChartAxis, formatChartDateTime } from "../lib/formatChartDateTime";

const COLORS = {
  pv: "#fbbf24",
  load: "#22d3ee",
  net: "#a855f7",
  battery: "#34d399",
};

interface Props {
  data: SeriesPoint[];
  range: string;
}

export function PowerChart({ data, range }: Props) {
  return (
    <div className="card-glow p-4 h-[340px]">
      <h3 className="text-sm font-medium text-mist mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-gradient-brand" />
        Power over time
      </h3>
      <ResponsiveContainer width="100%" height="90%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1a1a22" strokeDasharray="3 3" />
          <XAxis
            dataKey="ts"
            tickFormatter={(ts) => formatChartAxis(String(ts), range)}
            stroke="#6b7280"
            fontSize={11}
            minTickGap={28}
          />
          <YAxis stroke="#6b7280" fontSize={11} unit=" kW" />
          <Tooltip
            contentStyle={{
              background: "#0d0d12",
              border: "1px solid rgba(34,211,238,0.3)",
              borderRadius: 12,
            }}
            labelStyle={{ color: "#67e8f9" }}
            labelFormatter={(ts) => formatChartDateTime(String(ts))}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="pv_kw"
            name="Solar"
            stroke={COLORS.pv}
            fill="url(#pvGrad)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="load_kw"
            name="Load"
            stroke={COLORS.load}
            fill="url(#loadGrad)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="net_kw"
            name="Net"
            stroke={COLORS.net}
            fill="transparent"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
