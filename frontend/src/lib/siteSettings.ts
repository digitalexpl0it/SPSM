import { settingsApi } from "./api";

const DEFAULT_TZ = "America/Los_Angeles";

let cached: Record<string, string> | null = null;
let cachePromise: Promise<Record<string, string>> | null = null;

export async function loadSiteSettings(force = false): Promise<Record<string, string>> {
  if (!force && cached) return cached;
  if (!force && cachePromise) return cachePromise;
  cachePromise = settingsApi.get().then((s) => {
    cached = s;
    cachePromise = null;
    return s;
  });
  return cachePromise;
}

export function getSiteTimezone(settings?: Record<string, string>): string {
  const tz = (settings?.site_timezone || cached?.site_timezone || "").trim();
  return tz || DEFAULT_TZ;
}

export function clearSiteSettingsCache(): void {
  cached = null;
  cachePromise = null;
}
