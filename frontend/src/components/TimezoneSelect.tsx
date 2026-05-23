import { useMemo } from "react";
import {
  browserTimezone,
  formatTimezoneLabel,
  timezoneGroupsForSelect,
} from "../lib/timezones";

type Props = {
  value: string;
  onChange: (tz: string) => void;
};

export function TimezoneSelect({ value, onChange }: Props) {
  const groups = useMemo(() => timezoneGroupsForSelect(value), [value]);
  const browserTz = browserTimezone();

  return (
    <div className="space-y-2">
      <select
        className="input-dark w-full mono text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.zones.map((tz) => (
              <option key={tz} value={tz}>
                {formatTimezoneLabel(tz)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {browserTz && browserTz !== value && (
        <button
          type="button"
          onClick={() => onChange(browserTz)}
          className="text-xs text-cyan-glow hover:underline"
        >
          Use browser timezone ({browserTz})
        </button>
      )}
    </div>
  );
}
