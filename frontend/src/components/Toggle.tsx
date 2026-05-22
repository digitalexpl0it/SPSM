import { useId, type ReactNode } from "react";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  className = "",
}: Props) {
  const autoId = useId();
  const switchId = id ?? autoId;

  return (
    <div
      className={`flex items-center justify-between gap-4 ${disabled ? "opacity-50" : ""} ${className}`}
    >
      {(label || description) && (
        <label htmlFor={switchId} className="flex flex-col gap-0.5 cursor-pointer min-w-0">
          {label && <span className="text-sm text-mist">{label}</span>}
          {description && <span className="text-xs text-mist/80">{description}</span>}
        </label>
      )}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50 ${
          checked
            ? "bg-cyan/80 border-cyan/60"
            : "bg-surface border-surface hover:border-mist/40"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
          aria-hidden
        />
      </button>
    </div>
  );
}
