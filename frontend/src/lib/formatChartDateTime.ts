/** Parse API timestamps (UTC ISO or legacy bucket strings) for chart display. */
export function parseApiTimestamp(ts: string): Date {
  if (/^\d{4}-\d{2}$/.test(ts)) {
    return new Date(`${ts}-01T12:00:00Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) {
    return new Date(`${ts}T12:00:00Z`);
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(ts)) {
    return new Date(`${ts.replace(" ", "T")}:00Z`);
  }
  const normalized = ts.includes("T") ? ts : ts.replace(" ", "T");
  const hasTz = /[Zz]$/.test(normalized) || /[+-]\d{2}:\d{2}$/.test(normalized);
  return new Date(hasTz ? normalized : `${normalized}Z`);
}

function formatInZone(d: Date, timeZone?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  };
  const parts = new Intl.DateTimeFormat("en-US", opts).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const h = parseInt(get("hour"), 10);
  return `${get("month")}-${get("day")}-${get("year")} ${h}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
}

/** MM-DD-YYYY hh:mm AM/PM in site timezone (or browser local). */
export function formatChartDateTime(ts: string, timeZone?: string): string {
  const d = parseApiTimestamp(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return formatInZone(d, timeZone);
}

/** Shorter x-axis labels depending on selected range. */
export function formatChartAxis(ts: string, range: string, timeZone?: string): string {
  const d = parseApiTimestamp(ts);
  if (Number.isNaN(d.getTime())) return ts;

  const opts: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  };
  const parts = new Intl.DateTimeFormat("en-US", opts).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const h = parseInt(get("hour"), 10);
  const time = `${h}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
  const md = `${get("month")}-${get("day")}`;
  const y = get("year");

  if (range === "year") return `${md}-${y}`;
  if (range === "month") return `${md}-${y}`;
  if (range === "week" || range === "day") return `${md} ${time}`;
  return time;
}
