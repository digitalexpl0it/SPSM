import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: ReactNode;
  accent?: "cyan" | "amber" | "purple" | "emerald";
}

const accents = {
  cyan: "from-cyan/30 to-purple/20 text-cyan-glow",
  amber: "from-amber-500/30 to-orange-500/10 text-amber-400",
  purple: "from-purple/30 to-cyan/10 text-purple-400",
  emerald: "from-emerald-500/30 to-cyan/10 text-emerald-400",
};

export function StatCard({ icon: Icon, label, value, sub, accent = "cyan" }: Props) {
  return (
    <div className="card-glow p-4 flex gap-4 items-start">
      <div
        className={`p-3 rounded-xl bg-gradient-to-br ${accents[accent]} border border-white/5`}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-mist uppercase tracking-wider whitespace-nowrap">{label}</p>
        <p className="text-2xl font-bold text-gradient mt-0.5 whitespace-nowrap">{value}</p>
        {sub && <p className="text-xs text-mist mt-1 whitespace-nowrap">{sub}</p>}
      </div>
    </div>
  );
}
