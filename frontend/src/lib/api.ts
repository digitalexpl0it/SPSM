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
  today_load_kwh: number;
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
