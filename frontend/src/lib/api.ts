const API = import.meta.env.VITE_API_URL || "";

function headers(): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers(), ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const authApi = {
  status: () => api<{ has_user: boolean; setup_complete: boolean }>("/api/auth/status"),
  login: (username: string, password: string) => {
    const body = new URLSearchParams({ username, password });
    return fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }).then(async (r) => {
      if (!r.ok) throw new Error("Invalid credentials");
      return r.json() as Promise<{ access_token: string; setup_required: boolean }>;
    });
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

export interface DailyReportResponse {
  timezone: string;
  days: DailyReportDay[];
  totals: {
    pv_kwh: number;
    load_kwh: number;
    import_kwh: number;
    export_kwh: number;
    co2_kg: number;
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
  exportCsvUrl: (days: number) => `${API}/api/reports/export?days=${days}`,
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

export const healthApi = {
  site: () => api<HealthResponse>("/api/health/site"),
  history: (days = 30) => api<HealthHistoryEvent[]>(`/api/health/history?days=${days}`),
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
