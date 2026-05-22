import { parseApiTimestamp } from "./formatChartDateTime";

/** Snapshots older than this are treated as stale. */
export const STALE_MS = 10 * 60 * 1000;

export function isSnapshotRecent(ts: string | null): boolean {
  if (!ts) return false;
  const t = parseApiTimestamp(ts).getTime();
  return !Number.isNaN(t) && Date.now() - t < STALE_MS;
}
