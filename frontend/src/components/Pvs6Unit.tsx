const PVS6_SRC = "/images/pvs6-sideview.png";

type Size = "sm" | "md" | "lg";

const sizes: Record<Size, { img: string; dot: string }> = {
  sm: { img: "h-16 w-auto", dot: "w-1.5 h-1.5 top-2 left-1/2 -translate-x-1/2" },
  md: { img: "h-28 w-auto", dot: "w-2 h-2 top-3 left-1/2 -translate-x-1/2" },
  lg: { img: "h-40 w-auto max-w-[140px]", dot: "w-2.5 h-2.5 top-4 left-1/2 -translate-x-1/2" },
};

interface Props {
  size?: Size;
  connected?: boolean;
  className?: string;
  showLabel?: boolean;
}

/** SunPower PVS6 unit photo with optional live-status LED overlay. */
export function Pvs6Unit({
  size = "md",
  connected,
  className = "",
  showLabel = false,
}: Props) {
  const s = sizes[size];

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <div className="relative">
        {connected !== undefined && (
          <span
            className={`absolute z-10 rounded-full ${s.dot} ${
              connected
                ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-throb"
                : "bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
            }`}
            title={connected ? "PVS online" : "PVS offline"}
            aria-hidden
          />
        )}
        <img
          src={PVS6_SRC}
          alt="SunPower PVS6 monitoring unit"
          className={`${s.img} object-contain drop-shadow-[0_8px_24px_rgba(34,211,238,0.25)]`}
        />
      </div>
      {showLabel && (
        <span className="text-[10px] uppercase tracking-widest text-mist mt-1">PVS6</span>
      )}
    </div>
  );
}
