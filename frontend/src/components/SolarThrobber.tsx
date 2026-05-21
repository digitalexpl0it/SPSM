export function SolarThrobber({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="solar-throbber">
        <div className="core" />
      </div>
      {label && (
        <span className="text-sm text-cyan-glow/80 animate-pulse">{label}</span>
      )}
    </div>
  );
}
