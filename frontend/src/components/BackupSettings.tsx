import { useCallback, useEffect, useRef, useState } from "react";
import { Database, Download, Loader2, Upload } from "lucide-react";
import { backupApi, type BackupStats } from "../lib/api";
import { useAuth } from "../lib/auth";
import { clearSiteSettingsCache } from "../lib/siteSettings";
import { formatErrorMessage, useToast } from "../lib/toast";
import { Toggle } from "./Toggle";

export function BackupSettings() {
  const { isAdmin, refreshStatus } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSettings, setImportSettings] = useState(true);
  const [importHistoricalData, setImportHistoricalData] = useState(true);
  const [importUsers, setImportUsers] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [confirmReplace, setConfirmReplace] = useState("");

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      setStats(await backupApi.stats());
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setLoadingStats(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isAdmin) loadStats();
  }, [isAdmin, loadStats]);

  const exportBackup = async () => {
    setExporting(true);
    try {
      await backupApi.downloadExport();
      showToast("success", "Backup downloaded.");
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const runImport = async (file: File) => {
    if (replaceExisting && confirmReplace.trim().toUpperCase() !== "REPLACE") {
      showToast("error", 'Type REPLACE below to confirm replacing existing data.');
      return;
    }
    setImporting(true);
    try {
      const res = await backupApi.import(file, {
        import_settings: importSettings,
        import_historical_data: importHistoricalData,
        import_users: importUsers,
        replace_existing: replaceExisting,
      });
      const parts = Object.entries(res.imported)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join(", ");
      showToast("success", parts ? `Imported — ${parts}` : res.message);
      setConfirmReplace("");
      if (fileRef.current) fileRef.current.value = "";
      clearSiteSettingsCache();
      await refreshStatus();
      await loadStats();
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void runImport(file);
  };

  if (!isAdmin) {
    return (
      <p className="text-sm text-mist card-glow p-6">
        Backup and restore is available to admin accounts only.
      </p>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="card-glow p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
          <Database className="w-5 h-5" />
          Export backup
        </h2>
        <p className="text-sm text-mist">
          Downloads a gzip JSON file with all portal settings, collector readings, device
          snapshots, chart rollups, health history, and user password hashes. Keep this file
          private — it includes SMTP credentials and PVS settings.
        </p>
        {loadingStats ? (
          <p className="text-sm text-mist flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading counts…
          </p>
        ) : stats ? (
          <ul className="text-sm text-mist grid grid-cols-2 gap-x-4 gap-y-1">
            <li>Settings keys: {stats.app_settings}</li>
            <li>Portal users: {stats.users}</li>
            <li>Readings: {stats.readings.toLocaleString()}</li>
            <li>Device snapshots: {stats.device_snapshots.toLocaleString()}</li>
            <li>Chart rollups: {stats.reading_rollups.toLocaleString()}</li>
            <li>Health events: {stats.health_events.toLocaleString()}</li>
          </ul>
        ) : null}
        <button
          type="button"
          disabled={exporting}
          onClick={exportBackup}
          className="flex items-center gap-2 text-sm text-cyan-glow border border-cyan/30 px-4 py-2 rounded-lg hover:bg-cyan/10 disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {exporting ? "Exporting…" : "Download full backup"}
        </button>
      </section>

      <section className="card-glow p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
          <Upload className="w-5 h-5" />
          Import backup
        </h2>
        <p className="text-sm text-mist">
          Restore into a fresh install after you create an admin account. Typical flow: install
          SPSM → sign in → import settings and historical data here (leave portal users off to
          keep your new login).
        </p>

        <div className="space-y-3 border-t border-surface/80 pt-4">
          <Toggle
            checked={importSettings}
            onChange={setImportSettings}
            label="Import settings"
            description="PVS connection, site info, notifications, timezone, etc."
          />
          <Toggle
            checked={importHistoricalData}
            onChange={setImportHistoricalData}
            label="Import historical data"
            description="Readings, rollups, device snapshots, health event history"
          />
          <Toggle
            checked={importUsers}
            onChange={setImportUsers}
            label="Import portal users"
            description="Restores password hashes from backup — you will need to sign in again"
          />
          <Toggle
            checked={replaceExisting}
            onChange={setReplaceExisting}
            label="Replace existing data first"
            description="Clears selected tables before import (recommended for migration)"
          />
        </div>

        {replaceExisting && (
          <div>
            <label className="text-xs text-mist block mb-1">
              Type <span className="mono text-amber-400">REPLACE</span> to confirm
            </label>
            <input
              className="input-dark w-full max-w-xs mono"
              value={confirmReplace}
              onChange={(e) => setConfirmReplace(e.target.value)}
              placeholder="REPLACE"
              autoComplete="off"
            />
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".json,.gz,application/json,application/gzip"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 btn-primary disabled:opacity-50"
        >
          {importing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {importing ? "Importing…" : "Choose backup file…"}
        </button>
        <p className="text-xs text-mist">
          Accepts <span className="mono">.json.gz</span> or uncompressed <span className="mono">.json</span>{" "}
          from Export above. Large backups may take a minute.
        </p>
      </section>
    </div>
  );
}
