/** Map Settings form values to the PUT /api/settings payload (mirrors SettingsPage save). */

type SettingsForm = {
  pvs_host: string;
  pvs_serial: string;
  pvs_verify_ssl: boolean;
  pvs_model: string;
  pvs_firmware_build: string;
  poll_interval_seconds: number;
  site_name: string;
  site_id: string;
  site_address: string;
  collector_enabled: boolean;
  battery_enabled: boolean;
  inverter_gauge_auto: boolean;
  inverter_gauge_max_w: number;
  temp_unit: string;
  temp_threshold_auto: boolean;
  temp_warning: number;
  temp_critical: number;
  websocket_live: boolean;
  site_timezone: string;
  notify_enabled: boolean;
  notify_webhook_enabled: boolean;
  notify_ntfy_enabled: boolean;
  notify_smtp_enabled: boolean;
  notify_webhook_url: string;
  notify_ntfy_topic: string;
  notify_min_severity: string;
  notify_smtp_host: string;
  notify_smtp_port: number;
  notify_smtp_use_tls: boolean;
  notify_smtp_username: string;
  notify_smtp_password: string;
  notify_smtp_from: string;
  notify_smtp_to: string;
  portal_public_url: string;
  monthly_report_enabled: boolean;
  co2_kg_per_kwh: number;
  electricity_import_rate: number;
  electricity_export_rate: number;
  nem_plan: string;
  rate_schedule_name: string;
  tou_peak_rate: number;
  tou_off_peak_rate: number;
  tou_super_off_peak_rate: number;
  tou_estimates_enabled: boolean;
  tou_schedule: string;
  temp_coefficient_pct_per_c: number;
  derating_display_enabled: boolean;
  notify_quiet_hours_enabled: boolean;
  notify_quiet_start: string;
  notify_quiet_end: string;
  notify_quiet_allow_critical: boolean;
  setup_complete: boolean;
};

const BOOL_KEYS = new Set([
  "pvs_verify_ssl",
  "collector_enabled",
  "websocket_live",
  "battery_enabled",
  "notify_enabled",
  "notify_webhook_enabled",
  "notify_ntfy_enabled",
  "notify_smtp_enabled",
  "notify_smtp_use_tls",
  "notify_quiet_hours_enabled",
  "notify_quiet_allow_critical",
  "monthly_report_enabled",
  "derating_display_enabled",
  "tou_estimates_enabled",
  "setup_complete",
]);

function normalizePayloadValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (BOOL_KEYS.has(key)) return value ? "true" : "false";
  if (key === "inverter_gauge_max_w" || key === "temp_warning" || key === "temp_critical") {
    const n = Number(value);
    return n <= 0 ? "" : String(n);
  }
  return String(value);
}

export function buildSettingsUpdatePayload(form: SettingsForm): Record<string, unknown> {
  const {
    inverter_gauge_auto,
    inverter_gauge_max_w,
    temp_threshold_auto,
    temp_warning,
    temp_critical,
    ...rest
  } = form;
  const portalUrl =
    form.portal_public_url.trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return {
    ...rest,
    portal_public_url: portalUrl,
    inverter_gauge_max_w: inverter_gauge_auto ? 0 : inverter_gauge_max_w,
    temp_warning: temp_threshold_auto ? 0 : temp_warning,
    temp_critical: temp_threshold_auto ? 0 : temp_critical,
    setup_complete: true,
  };
}

/** True when stored settings match what we attempted to save. */
export function savedSettingsMatchPayload(
  saved: Record<string, string>,
  payload: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(payload)) {
    if (key === "notify_smtp_password" && (value === "" || value == null)) continue;
    const expected = normalizePayloadValue(key, value);
    const actual = saved[key] ?? "";
    if (actual !== expected) return false;
  }
  return true;
}
