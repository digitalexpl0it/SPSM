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

/** MM-DD-YYYY hh:mm AM/PM in the user's local timezone. */
export function formatChartDateTime(ts: string): string {
  const d = parseApiTimestamp(ts);
  if (Number.isNaN(d.getTime())) return ts;

  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mins = String(d.getMinutes()).padStart(2, "0");
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;

  return `${mm}-${dd}-${yyyy} ${String(h).padStart(2, "0")}:${mins} ${ampm}`;
}

/** Shorter x-axis labels depending on selected range. */
export function formatChartAxis(ts: string, range: string): string {
  const d = parseApiTimestamp(ts);
  if (Number.isNaN(d.getTime())) return ts;

  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mins = String(d.getMinutes()).padStart(2, "0");
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const time = `${h}:${mins} ${ampm}`;

  if (range === "year") return `${mm}-${yyyy}`;
  if (range === "month") return `${mm}-${dd}-${yyyy}`;
  if (range === "week" || range === "day") return `${mm}-${dd} ${time}`;
  return time;
}
