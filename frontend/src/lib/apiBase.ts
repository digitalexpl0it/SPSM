/**
 * API base URL for fetch/EventSource.
 * Empty string = same origin (Vite dev proxies /api → api:8000; works on mobile LAN).
 * If VITE_API_URL points at localhost but the page is opened via LAN IP, rewrite to that host on port 8000.
 */
export function resolveApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "";
  if (typeof window === "undefined") return configured.replace(/\/$/, "");

  if (!configured) return "";

  try {
    const configuredUrl = new URL(configured);
    const pageHost = window.location.hostname;
    const localApi =
      configuredUrl.hostname === "localhost" || configuredUrl.hostname === "127.0.0.1";
    const remotePage = pageHost !== "localhost" && pageHost !== "127.0.0.1";
    if (localApi && remotePage) {
      const port = configuredUrl.port || "8000";
      return `${window.location.protocol}//${pageHost}:${port}`;
    }
    return configured.replace(/\/$/, "");
  } catch {
    return configured.replace(/\/$/, "");
  }
}

export function apiUrl(path: string): string {
  const base = resolveApiBaseUrl();
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

/** Swagger UI — same origin via Vite proxy, or direct API port when VITE_API_URL is set. */
export function apiDocsUrl(): string {
  return apiUrl("/docs");
}

export function formatNetworkError(err: unknown): Error {
  if (
    err instanceof TypeError &&
    (err.message === "Failed to fetch" ||
      err.message.includes("NetworkError") ||
      err.message.includes("Load failed"))
  ) {
    return new Error(
      "Cannot reach the API. On a phone or tablet, open the portal at your server's LAN address (e.g. http://192.168.1.10:5173), not localhost. Ensure the API container is running."
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}
