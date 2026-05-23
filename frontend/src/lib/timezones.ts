/** IANA timezone ids for Settings (backend accepts any valid ZoneInfo name). */
export function getTimezoneOptions(): string[] {
  try {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      return (Intl as typeof Intl & { supportedValuesOf: (key: string) => string[] })
        .supportedValuesOf("timeZone")
        .slice()
        .sort();
    }
  } catch {
    /* older browsers */
  }
  return FALLBACK_TIMEZONES;
}

/** Frequently used zones — shown first in the select. */
export const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
] as const;

const COMMON_SET = new Set<string>(COMMON_TIMEZONES);

const FALLBACK_TIMEZONES = [
  ...COMMON_TIMEZONES,
  "America/Boise",
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Juneau",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export type TimezoneGroup = { label: string; zones: string[] };

/** Ensure saved value appears even if browser list differs. */
export function timezoneOptionsIncluding(current: string): string[] {
  const base = getTimezoneOptions();
  const tz = current.trim();
  if (!tz || base.includes(tz)) return base;
  return [tz, ...base];
}

/** Optgroups for a native &lt;select&gt; — common first, then by region. */
export function timezoneGroupsForSelect(current: string): TimezoneGroup[] {
  const all = timezoneOptionsIncluding(current);
  const currentTz = current.trim();
  const byRegion = new Map<string, string[]>();

  for (const tz of all) {
    if (COMMON_SET.has(tz)) continue;
    const prefix = tz.includes("/") ? tz.split("/")[0]! : "Other";
    const list = byRegion.get(prefix) ?? [];
    list.push(tz);
    byRegion.set(prefix, list);
  }

  const groups: TimezoneGroup[] = [];

  const commonZones = COMMON_TIMEZONES.filter((tz) => all.includes(tz));
  if (currentTz && COMMON_SET.has(currentTz) && !commonZones.includes(currentTz as (typeof COMMON_TIMEZONES)[number])) {
    commonZones.unshift(currentTz as (typeof COMMON_TIMEZONES)[number]);
  }
  if (commonZones.length > 0) {
    groups.push({ label: "Common", zones: [...commonZones] });
  }

  for (const [label, zones] of [...byRegion.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    groups.push({ label, zones: zones.sort() });
  }

  const listed = new Set(groups.flatMap((g) => g.zones));
  if (currentTz && !listed.has(currentTz)) {
    groups.unshift({ label: "Saved", zones: [currentTz] });
  }

  return groups;
}

export function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function formatTimezoneLabel(tz: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(now);
    const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return offset ? `${tz} (${offset})` : tz;
  } catch {
    return tz;
  }
}
