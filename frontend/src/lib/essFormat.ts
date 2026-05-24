/** Format ESS / SunVault snapshot fields for display. */

const ESS_LABELS: Record<string, string> = {
  soc: "State of charge",
  soh: "State of health",
  p: "Power",
  v: "Voltage",
  i: "Current",
  t: "Temperature",
  mode: "Operating mode",
  reserve: "Reserve",
  status: "Status",
};

function labelForKey(key: string): string {
  const tail = key.replace(/^.*\//, "").replace(/_/g, " ");
  const simple = tail.split("/").pop() ?? tail;
  return ESS_LABELS[simple.toLowerCase()] ?? simple;
}

export function formatEssRows(payload: Record<string, unknown> | undefined): [string, string][] {
  if (!payload) return [];
  const rows: [string, string][] = [];
  for (const [key, raw] of Object.entries(payload)) {
    if (raw == null || raw === "" || raw === "TBD") continue;
    const label = labelForKey(key);
    const value = typeof raw === "object" ? JSON.stringify(raw) : String(raw);
    rows.push([label, value]);
  }
  return rows.sort(([a], [b]) => a.localeCompare(b));
}

export function livedataBatteryRows(livedata: {
  battery_soc?: number | null;
  battery_kw?: number | null;
  backup_minutes?: number | null;
  mid_state?: number | null;
}): [string, string][] {
  const rows: [string, string][] = [];
  if (livedata.battery_soc != null) {
    rows.push(["State of charge", `${livedata.battery_soc.toFixed(0)}%`]);
  }
  if (livedata.battery_kw != null) {
    const kw = livedata.battery_kw;
    const dir = kw > 0.05 ? "Discharging" : kw < -0.05 ? "Charging" : "Idle";
    rows.push(["Battery power", `${Math.abs(kw).toFixed(2)} kW (${dir})`]);
  }
  if (livedata.backup_minutes != null) {
    rows.push(["Backup time remaining", `${livedata.backup_minutes} min`]);
  }
  if (livedata.mid_state != null && livedata.mid_state !== 0) {
    rows.push(["MID / transfer switch", String(livedata.mid_state)]);
  }
  return rows;
}
