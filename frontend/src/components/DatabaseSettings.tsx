import { useCallback, useEffect, useState } from "react";
import { Database, Loader2, Trash2 } from "lucide-react";
import { databaseApi, type DatabaseStats } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatErrorMessage, useToast } from "../lib/toast";
import { SnapshotExportPanel } from "./SnapshotExportPanel";
import { Toggle } from "./Toggle";

function formatBytes(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const YEAR_OPTIONS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50];

export function DatabaseSettings() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionYears, setRetentionYears] = useState(5);
  const [confirmPurge, setConfirmPurge] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await databaseApi.stats();
      setStats(s);
      setRetentionEnabled(s.retention.enabled);
      setRetentionYears(s.retention.years);
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const saveRetention = async () => {
    setSaving(true);
    try {
      const res = await databaseApi.updateRetention({
        data_retention_enabled: retentionEnabled,
        data_retention_years: retentionYears,
      });
      setStats((prev) =>
        prev ? { ...prev, retention: res.retention } : prev
      );
      showToast(
        "success",
        retentionEnabled
          ? `Retention saved — keeping ${retentionYears} years of data.`
          : "Retention disabled — data is kept indefinitely."
      );
      await load();
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const runPurge = async () => {
    if (confirmPurge.trim().toUpperCase() !== "PURGE") {
      showToast("error", 'Type PURGE below to confirm.');
      return;
    }
    setPurging(true);
    try {
      const res = await databaseApi.purge(
        retentionEnabled ? undefined : retentionYears
      );
      showToast("success", res.message);
      setConfirmPurge("");
      await load();
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setPurging(false);
    }
  };

  if (!isAdmin) {
    return (
      <p className="text-sm text-mist card-glow p-6">
        Database management is available to admin accounts only.
      </p>
    );
  }

  const older = stats?.retention.rows_older_than_cutoff;
  const olderTotal = older
    ? Object.values(older).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="card-glow p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
          <Database className="w-5 h-5" />
          Database statistics
        </h2>
        {loading ? (
          <p className="text-sm text-mist flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </p>
        ) : stats ? (
          <div className="space-y-4 text-sm text-mist">
            <p>
              PostgreSQL size:{" "}
              <span className="text-cyan-glow">{formatBytes(stats.database_size_bytes)}</span>
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
              <li>Readings: {stats.counts.readings.toLocaleString()}</li>
              <li>Device snapshots: {stats.counts.device_snapshots.toLocaleString()}</li>
              <li>Chart rollups: {stats.counts.reading_rollups.toLocaleString()}</li>
              <li>Health events: {stats.counts.health_events.toLocaleString()}</li>
              <li>Settings keys: {stats.counts.app_settings}</li>
              <li>Portal users: {stats.counts.users}</li>
            </ul>
            <div className="border-t border-surface/80 pt-3 space-y-1">
              <p>Oldest reading: {formatTs(stats.oldest_reading)}</p>
              <p>Newest reading: {formatTs(stats.newest_reading)}</p>
              {stats.retention.last_purge && (
                <p>Last purge: {formatTs(stats.retention.last_purge)}</p>
              )}
            </div>
            <button
              type="button"
              onClick={load}
              className="text-xs text-cyan-glow hover:underline"
            >
              Refresh stats
            </button>
          </div>
        ) : null}
      </section>

      <section className="card-glow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-cyan-glow">Data retention</h2>
        <p className="text-sm text-mist">
          When disabled, collector data is kept forever. When enabled, readings, snapshots,
          rollups, and health history older than the limit are removed automatically (about once
          per day) and can be purged manually below.
        </p>

        <Toggle
          checked={retentionEnabled}
          onChange={setRetentionEnabled}
          label="Enable data retention limit"
          description={
            retentionEnabled
              ? `Delete data older than ${retentionYears} years`
              : "Keep all historical data indefinitely"
          }
        />

        <div className={retentionEnabled ? "" : "opacity-50 pointer-events-none"}>
          <label className="text-xs text-mist block mb-1">Keep data for (years)</label>
          <select
            className="input-dark w-full max-w-xs"
            value={retentionYears}
            onChange={(e) => setRetentionYears(parseInt(e.target.value, 10))}
            disabled={!retentionEnabled}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y} {y === 1 ? "year" : "years"}
              </option>
            ))}
          </select>
        </div>

        {retentionEnabled && stats?.retention.cutoff && olderTotal > 0 && (
          <p className="text-xs text-amber-400/90">
            About {olderTotal.toLocaleString()} rows are older than the cutoff (
            {stats.retention.cutoff.slice(0, 10)}).
          </p>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={saveRetention}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save retention settings"}
        </button>
      </section>

      <section className="card-glow p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
          <Trash2 className="w-5 h-5" />
          Purge old data
        </h2>
        <p className="text-sm text-mist">
          Removes readings, device snapshots, chart rollups, and health events before the
          retention cutoff. Does not delete settings or portal users.
        </p>
        <div>
          <label className="text-xs text-mist block mb-1">
            Type <span className="mono text-amber-400">PURGE</span> to confirm
          </label>
          <input
            className="input-dark w-full max-w-xs mono"
            value={confirmPurge}
            onChange={(e) => setConfirmPurge(e.target.value)}
            placeholder="PURGE"
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          disabled={purging}
          onClick={runPurge}
          className="flex items-center gap-2 text-sm border border-red-500/40 text-red-300 px-4 py-2 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
        >
          {purging ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          {purging ? "Purging…" : `Purge data older than ${retentionYears} years`}
        </button>
        {!retentionEnabled && (
          <p className="text-xs text-mist">
            Retention is off — manual purge uses the years selected above ({retentionYears}).
            Enable retention to match automatic purges to the same limit.
          </p>
        )}
      </section>

      <SnapshotExportPanel />
    </div>
  );
}
