import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ReportsChartPoint {
  date: string;
  pv: number;
  load: number;
  export: number;
  import: number;
}

interface Props {
  data: ReportsChartPoint[];
}

export function ReportsEnergyChart({ data }: Props) {
  return (
    <div className="card-glow p-4 h-[340px]">
      <h3 className="text-sm font-medium text-mist mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-gradient-brand" />
        Daily energy
      </h3>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="reportsPvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.25} />
            </linearGradient>
            <linearGradient id="reportsLoadGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.25} />
            </linearGradient>
            <linearGradient id="reportsExportGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0.25} />
            </linearGradient>
            <linearGradient id="reportsImportGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#a855f7" stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1a1a22" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tick={{ fill: "#94a3b8" }} />
          <YAxis stroke="#6b7280" fontSize={11} unit=" kWh" tick={{ fill: "#94a3b8" }} />
          <Tooltip
            cursor={{
              fill: "rgba(34, 211, 238, 0.1)",
              stroke: "rgba(34, 211, 238, 0.35)",
              strokeWidth: 1,
            }}
            contentStyle={{
              background: "#0d0d12",
              border: "1px solid rgba(34,211,238,0.3)",
              borderRadius: 12,
            }}
            labelStyle={{ color: "#67e8f9" }}
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : Number(value);
              return [
                `${Number.isFinite(n) ? n.toFixed(2) : "—"} kWh`,
                String(name),
              ];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="pv"
            name="Solar"
            fill="url(#reportsPvGrad)"
            stroke="#fbbf24"
            strokeWidth={1}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="load"
            name="Load"
            fill="url(#reportsLoadGrad)"
            stroke="#22d3ee"
            strokeWidth={1}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="export"
            name="Export"
            fill="url(#reportsExportGrad)"
            stroke="#34d399"
            strokeWidth={1}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="import"
            name="Import"
            fill="url(#reportsImportGrad)"
            stroke="#a855f7"
            strokeWidth={1}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
