import { apiUrl, formatNetworkError, resolveApiBaseUrl } from "./apiBase";

export { apiUrl, resolveApiBaseUrl };

function formatApiDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: string }).msg);
        }
        return String(item);
      })
      .join("; ");
  }
  return "";
}

function headers(): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: { ...headers(), ...options?.headers },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(formatApiDetail(err.detail) || res.statusText || "Request failed");
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  } catch (e) {
    throw formatNetworkError(e);
  }
}

export const authApi = {
  status: () => api<{ has_user: boolean; setup_complete: boolean }>("/api/auth/status"),
  login: async (username: string, password: string) => {
    const body = new URLSearchParams({ username, password });
    try {
      const r = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!r.ok) throw new Error("Invalid credentials");
      return r.json() as Promise<{ access_token: string; setup_required: boolean }>;
    } catch (e) {
      throw formatNetworkError(e);
    }
  },
  register: (username: string, password: string) =>
    api<{ access_token: string; setup_required: boolean }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => api<{ username: string; is_admin: boolean }>("/api/auth/me"),
};

export const settingsApi = {
  get: () => api<Record<string, string>>("/api/settings"),
  update: (data: Record<string, unknown>) =>
    api<Record<string, string>>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  testPvs: (pvs_host: string, pvs_serial: string, pvs_verify_ssl = false) =>
    api<{ ok: boolean; message: string; data: Record<string, string> }>(
      "/api/settings/test-pvs",
      {
        method: "POST",
        body: JSON.stringify({ pvs_host, pvs_serial, pvs_verify_ssl }),
      }
    ),
  testNotify: () =>
    api<{ ok: boolean; message: string }>("/api/settings/test-notify", { method: "POST" }),
  testMonthlyReport: () =>
    api<{ ok: boolean; message: string }>("/api/settings/test-monthly-report", {
      method: "POST",
    }),
};

export interface DailyReportDay {
  date: string;
  pv_kwh: number;
  load_kwh: number;
  import_kwh: number;
  export_kwh: number;
  self_consumption_pct: number | null;
  co2_kg: number;
  sample_count: number;
}

export interface ReportTotals {
  pv_kwh: number;
  load_kwh: number;
  import_kwh: number;
  export_kwh: number;
  co2_kg: number;
}

export interface ReportPeriod {
  start: string;
  end: string;
}

export interface DailyReportResponse {
  timezone: string;
  period: ReportPeriod;
  days: DailyReportDay[];
  totals: ReportTotals;
  year_ago: {
    available: boolean;
    period: ReportPeriod;
    days_with_data: number;
    days_in_period: number;
    totals: ReportTotals;
  };
}

export interface HealthHistoryEvent {
  id: number;
  alert_id: string;
  severity: string;
  title: string;
  message: string;
  detail: string;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
  active: boolean;
}

export const reportsApi = {
  daily: (days: number) => api<DailyReportResponse>(`/api/reports/daily?days=${days}`),
  exportCsvUrl: (days: number) => apiUrl(`/api/reports/export?days=${days}`),
  inverterRank: () =>
    api<{ ts: string; items: { path: string; serial: string; kw: number; temp: number | null }[] }>(
      "/api/reports/inverters/rank"
    ),
};

export type PortalUser = { id: number; username: string; is_admin: boolean };

export const usersApi = {
  list: () => api<PortalUser[]>("/api/users"),
  create: (username: string, password: string, is_admin: boolean) =>
    api<PortalUser>("/api/users", {
      method: "POST",
      body: JSON.stringify({ username, password, is_admin }),
    }),
  update: (
    id: number,
    body: { username?: string; password?: string; is_admin?: boolean }
  ) =>
    api<PortalUser>(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: number) =>
    api<void>(`/api/users/${id}`, { method: "DELETE" }),
};

export interface HealthAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  detail?: string | null;
}

export interface HealthResponse {
  checked_at: string;
  pvs_connected: boolean;
  collector_enabled: boolean;
  latest_reading_at: string | null;
  temp_config?: { unit: "c" | "f"; warning: number; critical: number };
  alerts: HealthAlert[];
  ok: string[];
  summary: "healthy" | "critical" | "warning" | "info";
}

export interface HealthRuleTunable {
  key: string;
  label: string;
  type: "int" | "float";
  min: number;
  max: number;
  step?: number;
  default: number;
  value: number;
  help?: string;
}

export interface HealthRuleCatalogEntry {
  id: string;
  setting_key: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  enabled: boolean;
  tunables: HealthRuleTunable[];
}

export const healthApi = {
  site: () => api<HealthResponse>("/api/health/site"),
  history: (days = 30) => api<HealthHistoryEvent[]>(`/api/health/history?days=${days}`),
  rules: () => api<{ rules: HealthRuleCatalogEntry[] }>("/api/health/rules"),
  saveRules: (body: { settings: Record<string, string | boolean | number> }) =>
    api<{ ok: boolean; rules: HealthRuleCatalogEntry[] }>("/api/health/rules", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};

export const dataApi = {
  live: () => api<LiveResponse>("/api/data/live"),
  latest: () => api<Reading | null>("/api/data/latest"),
  series: (range: string, bucket = "hour") =>
    api<SeriesPoint[]>(`/api/data/series?range=${range}&bucket=${bucket}`),
  summary: () => api<SummaryResponse>("/api/data/summary"),
  devices: (category?: string) =>
    api<DeviceSnapshot[]>(
      `/api/data/devices/latest${category ? `?category=${category}` : ""}`
    ),
};

export interface Reading {
  ts: string;
  pv_kw: number | null;
  net_kw: number | null;
  load_kw: number | null;
  battery_kw: number | null;
  battery_soc: number | null;
  pv_kwh_total?: number | null;
  net_kwh_total?: number | null;
  load_kwh_total?: number | null;
  battery_kwh_total?: number | null;
  backup_minutes?: number | null;
  mid_state?: number | null;
}

export interface SeriesPoint {
  ts: string;
  pv_kw?: number;
  net_kw?: number;
  load_kw?: number;
  battery_kw?: number;
  battery_soc?: number;
  samples?: number;
}

export interface SummaryResponse {
  today_pv_kwh: number;
  today_net_kwh?: number;
  today_import_kwh?: number;
  today_export_kwh?: number;
  today_load_kwh: number;
  timezone?: string;
  current?: Reading;
  sample_count: number;
}

export interface LiveResponse {
  connected: boolean;
  error?: string;
  ts?: string;
  battery_enabled?: boolean;
  livedata?: Reading;
  telemetry?: Record<string, unknown>;
}

export interface DeviceSnapshot {
  ts: string;
  category: string;
  payload: Record<string, unknown>;
}

export interface BackupStats {
  app_settings: number;
  users: number;
  readings: number;
  device_snapshots: number;
  reading_rollups: number;
  health_events: number;
}

export interface BackupImportResult {
  ok: boolean;
  message: string;
  imported: Record<string, number>;
  exported_at?: string;
}

export interface DatabaseStats {
  counts: BackupStats;
  oldest_reading: string | null;
  newest_reading: string | null;
  oldest_device_snapshot: string | null;
  newest_device_snapshot: string | null;
  database_size_bytes: number | null;
  retention: {
    enabled: boolean;
    years: number;
    cutoff: string | null;
    last_purge: string | null;
    rows_older_than_cutoff: Record<string, number> | null;
  };
}

export const databaseApi = {
  stats: () => api<DatabaseStats>("/api/database/stats"),
  updateRetention: (body: { data_retention_enabled: boolean; data_retention_years: number }) =>
    api<{ ok: boolean; retention: DatabaseStats["retention"] }>("/api/database/retention", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  purge: (years?: number) => {
    const q = years != null ? `?years=${years}` : "";
    return api<{
      ok: boolean;
      message: string;
      deleted: Record<string, number>;
      cutoff: string;
      retention_years: number;
    }>(`/api/database/purge${q}`, { method: "POST" });
  },
};

export const backupApi = {
  stats: () => api<BackupStats>("/api/backup/stats"),
  downloadExport: async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(apiUrl("/api/backup/export"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(formatApiDetail(err.detail) || res.statusText || "Export failed");
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition");
      const match = disp?.match(/filename="?([^";]+)"?/);
      const name =
        match?.[1] || `spsm-backup-${new Date().toISOString().slice(0, 10)}.json.gz`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      throw formatNetworkError(e);
    }
  },
  import: async (
    file: File,
    opts: {
      import_settings: boolean;
      import_historical_data: boolean;
      import_users: boolean;
      replace_existing: boolean;
    }
  ) => {
    const token = localStorage.getItem("token");
    const params = new URLSearchParams({
      import_settings: String(opts.import_settings),
      import_historical_data: String(opts.import_historical_data),
      import_users: String(opts.import_users),
      replace_existing: String(opts.replace_existing),
    });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(apiUrl(`/api/backup/import?${params}`), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(formatApiDetail(err.detail) || res.statusText || "Import failed");
      }
      return (await res.json()) as BackupImportResult;
    } catch (e) {
      throw formatNetworkError(e);
    }
  },
};
