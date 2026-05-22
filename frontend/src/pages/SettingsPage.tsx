import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Battery,
  Cpu,
  Globe,
  Hash,
  Home,
  Info,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  Thermometer,
  BarChart3,
  Bell,
  Archive,
  Database,
  HeartPulse,
  Timer,
  UserCircle,
  Wrench,
} from "lucide-react";
import { clearSiteSettingsCache } from "../lib/siteSettings";

const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "Pacific/Honolulu",
  "UTC",
];
import {
  DEFAULT_TEMP_THRESHOLDS,
  defaultThresholdsLabel,
  PANEL_TEMP_REFERENCE,
  type TempUnit,
} from "../lib/temperatureSettings";
import { AccountSettings } from "../components/AccountSettings";
import { BackupSettings } from "../components/BackupSettings";
import { DatabaseSettings } from "../components/DatabaseSettings";
import { HealthRulesSettings } from "../components/HealthRulesSettings";
import { SolarThrobber } from "../components/SolarThrobber";
import { Toggle } from "../components/Toggle";
import { settingsApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatErrorMessage, useToast } from "../lib/toast";

type SettingsTab =
  | "system"
  | "notifications"
  | "health"
  | "accounts"
  | "backup"
  | "database";

/** Placeholder only — not a real device serial. */
const EXAMPLE_PVS_SERIAL = "ZT223485000000W0000";

function isSmtpConfigured(form: {
  notify_smtp_host: string;
  notify_smtp_to: string;
  notify_smtp_from: string;
  notify_smtp_username: string;
}) {
  return Boolean(
    form.notify_smtp_host.trim() &&
      form.notify_smtp_to.trim() &&
      (form.notify_smtp_from.trim() || form.notify_smtp_username.trim())
  );
}

const TABS: { id: SettingsTab; label: string; icon: typeof Wrench }[] = [
  { id: "system", label: "System", icon: Wrench },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "health", label: "Health alerts", icon: HeartPulse },
  { id: "accounts", label: "Accounts", icon: UserCircle },
  { id: "backup", label: "Backup", icon: Archive },
  { id: "database", label: "Database", icon: Database },
];

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

function tabFromSearch(params: URLSearchParams): SettingsTab {
  const t = params.get("tab");
  return TAB_IDS.has(t ?? "") ? (t as SettingsTab) : "system";
}

export function SettingsPage() {
  const { refreshStatus } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() => tabFromSearch(searchParams));

  useEffect(() => {
    const fromUrl = tabFromSearch(searchParams);
    setTab((current) => (current === fromUrl ? current : fromUrl));
  }, [searchParams]);

  const selectTab = (id: SettingsTab) => {
    setTab(id);
    setSearchParams(id === "system" ? {} : { tab: id }, { replace: true });
  };
  const [form, setForm] = useState({
    pvs_host: "",
    pvs_serial: "",
    pvs_verify_ssl: false,
    poll_interval_seconds: 60,
    site_name: "",
    site_id: "",
    site_address: "",
    collector_enabled: true,
    battery_enabled: false,
    inverter_gauge_auto: true,
    inverter_gauge_max_w: 320,
    temp_unit: "f" as TempUnit,
    temp_threshold_auto: true,
    temp_warning: DEFAULT_TEMP_THRESHOLDS.f.warning,
    temp_critical: DEFAULT_TEMP_THRESHOLDS.f.critical,
    websocket_live: false,
    site_timezone: "America/Los_Angeles",
    notify_enabled: false,
    notify_webhook_enabled: false,
    notify_ntfy_enabled: false,
    notify_smtp_enabled: false,
    notify_webhook_url: "",
    notify_ntfy_topic: "",
    notify_min_severity: "critical" as "warning" | "critical",
    notify_smtp_host: "",
    notify_smtp_port: 587,
    notify_smtp_use_tls: true,
    notify_smtp_username: "",
    notify_smtp_password: "",
    notify_smtp_from: "",
    notify_smtp_to: "",
    portal_public_url: "",
    monthly_report_enabled: false,
    setup_complete: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingNotify, setTestingNotify] = useState(false);
  const [testingMonthlyReport, setTestingMonthlyReport] = useState(false);

  useEffect(() => {
    settingsApi
      .get()
      .then((s) => {
        setForm({
          pvs_host: s.pvs_host || "",
          pvs_serial: s.pvs_serial || "",
          pvs_verify_ssl: s.pvs_verify_ssl === "true",
          poll_interval_seconds: parseInt(s.poll_interval_seconds || "60", 10),
          site_name: s.site_name || "",
          site_id: s.site_id || "",
          site_address: s.site_address || "",
          collector_enabled: s.collector_enabled !== "false",
          battery_enabled: s.battery_enabled === "true",
          inverter_gauge_auto: !(s.inverter_gauge_max_w || "").trim(),
          inverter_gauge_max_w: (() => {
            const n = parseInt(s.inverter_gauge_max_w || "", 10);
            return !Number.isNaN(n) && n > 0 ? n : 320;
          })(),
          temp_unit: s.temp_unit === "c" ? "c" : "f",
          temp_threshold_auto: !(s.temp_warning || "").trim() && !(s.temp_critical || "").trim(),
          temp_warning: (() => {
            const unit: TempUnit = s.temp_unit === "c" ? "c" : "f";
            const n = parseInt(s.temp_warning || "", 10);
            return !Number.isNaN(n) && n > 0 ? n : DEFAULT_TEMP_THRESHOLDS[unit].warning;
          })(),
          temp_critical: (() => {
            const unit: TempUnit = s.temp_unit === "c" ? "c" : "f";
            const n = parseInt(s.temp_critical || "", 10);
            return !Number.isNaN(n) && n > 0 ? n : DEFAULT_TEMP_THRESHOLDS[unit].critical;
          })(),
          websocket_live: s.websocket_live === "true",
          site_timezone: s.site_timezone || "America/Los_Angeles",
          notify_enabled: s.notify_enabled === "true",
          notify_webhook_enabled: s.notify_webhook_enabled === "true",
          notify_ntfy_enabled: s.notify_ntfy_enabled === "true",
          notify_smtp_enabled: s.notify_smtp_enabled === "true",
          notify_webhook_url: s.notify_webhook_url || "",
          notify_ntfy_topic: s.notify_ntfy_topic || "",
          notify_min_severity:
            s.notify_min_severity === "warning" ? "warning" : "critical",
          notify_smtp_host: s.notify_smtp_host || "",
          notify_smtp_port: (() => {
            const n = parseInt(s.notify_smtp_port || "587", 10);
            return !Number.isNaN(n) && n > 0 ? n : 587;
          })(),
          notify_smtp_use_tls: s.notify_smtp_use_tls !== "false",
          notify_smtp_username: s.notify_smtp_username || "",
          notify_smtp_password: s.notify_smtp_password || "",
          notify_smtp_from: s.notify_smtp_from || "",
          notify_smtp_to: s.notify_smtp_to || "",
          portal_public_url:
            s.portal_public_url?.trim() ||
            (typeof window !== "undefined" ? window.location.origin : ""),
          monthly_report_enabled: s.monthly_report_enabled === "true",
          setup_complete: s.setup_complete === "true",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await settingsApi.testPvs(
        form.pvs_host,
        form.pvs_serial,
        form.pvs_verify_ssl
      );
      showToast("success", res.message);
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  const testMonthlyReport = async () => {
    setTestingMonthlyReport(true);
    try {
      const res = await settingsApi.testMonthlyReport();
      showToast("success", res.message);
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setTestingMonthlyReport(false);
    }
  };

  const testNotification = async () => {
    setTestingNotify(true);
    try {
      const res = await settingsApi.testNotify();
      showToast("success", res.message);
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setTestingNotify(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.pvs_host || !form.pvs_serial) {
      showToast("error", "PVS host and serial are required.");
      return;
    }
    setSaving(true);
    try {
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
      await settingsApi.update({
        ...rest,
        portal_public_url: portalUrl,
        inverter_gauge_max_w: inverter_gauge_auto ? 0 : inverter_gauge_max_w,
        temp_warning: temp_threshold_auto ? 0 : temp_warning,
        temp_critical: temp_threshold_auto ? 0 : temp_critical,
        setup_complete: true,
      });
      clearSiteSettingsCache();
      await refreshStatus();
      showToast("success", "Settings saved. Collector will use these on the next poll.");
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SolarThrobber label="Loading settings…" />;

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gradient">Settings</h1>
        <p className="text-sm text-mist mt-1">
          System, notifications, health alerts, accounts, backup, and database.
        </p>
      </header>

      <nav
        className="flex flex-wrap gap-1 p-1 rounded-xl bg-panel/60 border border-surface/80 w-fit max-w-full"
        aria-label="Settings sections"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === id
                ? "bg-gradient-to-r from-cyan/20 to-purple-500/20 text-cyan-glow border border-cyan/30 shadow-[0_0_16px_rgb(34_211_238/0.15)]"
                : "text-mist hover:text-cyan-glow/90 border border-transparent"
            }`}
            aria-current={tab === id ? "page" : undefined}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {tab === "system" && (
        <form onSubmit={save} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="space-y-6">
            <section className="card-glow p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
                <Server className="w-5 h-5" />
                PVS connection
              </h2>

              <div>
                <label className="text-xs text-mist flex items-center gap-1 mb-1">
                  <Globe className="w-3 h-3" /> PVS IP or hostname
                </label>
                <input
                  className="input-dark mono"
                  placeholder="192.168.1.x"
                  value={form.pvs_host}
                  onChange={(e) => setForm({ ...form, pvs_host: e.target.value })}
                  required
                />
                <p className="text-xs text-mist mt-1">
                  Find in your router DHCP list as &quot;PVS&quot; or &quot;SunPower&quot;. Reserve
                  this IP.
                </p>
              </div>

              <div>
                <label className="text-xs text-mist flex items-center gap-1 mb-1">
                  <Hash className="w-3 h-3" /> PVS serial number
                  <button
                    type="button"
                    className="inline-flex text-mist/70 hover:text-cyan-glow transition"
                    title="The portal builds the PVS login password automatically from the last five characters of your serial. You only need to enter the serial here."
                    aria-label="PVS password is derived from serial"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </label>
                <input
                  className="input-dark mono"
                  placeholder={EXAMPLE_PVS_SERIAL}
                  value={form.pvs_serial}
                  onChange={(e) => setForm({ ...form, pvs_serial: e.target.value.toUpperCase() })}
                  required
                />
                <p className="text-xs text-mist mt-1">
                  From System Info in the SunPower app. Example:{" "}
                  <span className="text-cyan/80 mono">{EXAMPLE_PVS_SERIAL}</span>
                </p>
              </div>

              <Toggle
                checked={form.pvs_verify_ssl}
                onChange={(pvs_verify_ssl) => setForm({ ...form, pvs_verify_ssl })}
                label={
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0" />
                    Verify SSL certificate (usually off for local PVS)
                  </span>
                }
              />

              <button
                type="button"
                onClick={testConnection}
                disabled={testing || !form.pvs_host}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan/30 text-cyan-glow hover:bg-cyan/10 transition"
              >
                {testing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Test connection
              </button>
            </section>

              <section className="card-glow p-6 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Home className="w-5 h-5 text-purple-400" />
                  Site info
                </h2>
                <input
                  className="input-dark"
                  placeholder="Site name"
                  value={form.site_name}
                  onChange={(e) => setForm({ ...form, site_name: e.target.value })}
                />
                <input
                  className="input-dark"
                  placeholder="Site ID"
                  value={form.site_id}
                  onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                />
                <input
                  className="input-dark"
                  placeholder="Address"
                  value={form.site_address}
                  onChange={(e) => setForm({ ...form, site_address: e.target.value })}
                />
                <div>
                  <label className="text-xs text-mist block mb-1">Timezone</label>
                  <select
                    className="input-dark w-full"
                    value={form.site_timezone}
                    onChange={(e) => setForm({ ...form, site_timezone: e.target.value })}
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-mist mt-1">
                    Used for &quot;today&quot; totals, reports, and daylight health checks.
                  </p>
                </div>
              </section>

              <section className="card-glow p-6 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Timer className="w-5 h-5" />
                  Collector
                </h2>
                <div>
                  <label className="text-xs text-mist block mb-1">Poll interval</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={10}
                      max={3600}
                      className="input-dark w-28"
                      value={form.poll_interval_seconds}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          poll_interval_seconds: parseInt(e.target.value, 10) || 10,
                        })
                      }
                    />
                    <span className="text-sm text-mist">seconds</span>
                  </div>
                  <p className="text-xs text-mist mt-1">
                    How often the collector pulls data from your PVS (10–3600).{" "}
                    <span className="text-cyan/80">60 = once per minute.</span>
                  </p>
                </div>
                <Toggle
                  checked={form.collector_enabled}
                  onChange={(collector_enabled) => setForm({ ...form, collector_enabled })}
                  label="Enable background collector"
                />
                <Toggle
                  checked={form.websocket_live}
                  onChange={(websocket_live) => setForm({ ...form, websocket_live })}
                  label="Live dashboard updates (SSE, polls PVS every 5s)"
                />
              </section>
            </div>

            <div className="space-y-6">
              <section className="card-glow p-6 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
                  <Cpu className="w-5 h-5" />
                  Micro-inverter gauges
                </h2>
                <p className="text-sm text-mist">
                  Full-scale on the power gauge on the Inverters page (0 → max watts). Use
                  automatic detection from each module type, or set one value for all panels.
                </p>
                <Toggle
                  checked={form.inverter_gauge_auto}
                  onChange={(inverter_gauge_auto) => setForm({ ...form, inverter_gauge_auto })}
                  label="Automatic (from module type, usually 320W)"
                />
                {!form.inverter_gauge_auto && (
                  <div>
                    <label className="text-xs text-mist block mb-1">Gauge maximum (watts)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={50}
                        max={600}
                        className="input-dark w-28"
                        value={form.inverter_gauge_max_w}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            inverter_gauge_max_w: parseInt(e.target.value, 10) || 320,
                          })
                        }
                      />
                      <span className="text-sm text-mist">W</span>
                    </div>
                    <p className="text-xs text-mist mt-1">
                      Typical micro-inverters: 290–400W. Lower = fuller arc at partial sun;
                      higher = arc stays shorter at peak.
                    </p>
                  </div>
                )}
              </section>

              <section className="card-glow p-6 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
                  <Thermometer className="w-5 h-5" />
                  Temperature
                </h2>
                <p className="text-sm text-mist">
                  Each micro-inverter reports a heatsink{" "}
                  temperature from your PVS (not the glass surface, but it reflects heat stress on
                  the electronics). Panels are tested at STC (
                  {PANEL_TEMP_REFERENCE.stc.f}°F / {PANEL_TEMP_REFERENCE.stc.c}°C) and are typically
                  rated to {PANEL_TEMP_REFERENCE.maxRated.f}°F (
                  {PANEL_TEMP_REFERENCE.maxRated.c}°C) maximum; in hot climates, cell temperatures
                  often reach {PANEL_TEMP_REFERENCE.hotClimateTypical.f}–
                  {PANEL_TEMP_REFERENCE.maxRated.f}°F. Default alerts use those markers — lower them
                  if you want earlier warnings in milder weather.
                </p>
                <div>
                  <label className="text-xs text-mist block mb-1">Display unit</label>
                  <div className="flex gap-2">
                    {(["f", "c"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          const defs = DEFAULT_TEMP_THRESHOLDS[u];
                          setForm((prev) => ({
                            ...prev,
                            temp_unit: u,
                            ...(prev.temp_threshold_auto
                              ? {
                                  temp_warning: defs.warning,
                                  temp_critical: defs.critical,
                                }
                              : {}),
                          }));
                        }}
                        className={`px-4 py-2 rounded-xl text-sm border transition ${
                          form.temp_unit === u
                            ? "border-cyan/50 bg-cyan/15 text-cyan-glow"
                            : "border-surface text-mist hover:border-cyan/30"
                        }`}
                      >
                        °{u === "f" ? "F" : "C"}
                      </button>
                    ))}
                  </div>
                </div>
                <Toggle
                  checked={form.temp_threshold_auto}
                  onChange={(auto) => {
                    const defs = DEFAULT_TEMP_THRESHOLDS[form.temp_unit];
                    setForm({
                      ...form,
                      temp_threshold_auto: auto,
                      ...(auto
                        ? {
                            temp_warning: defs.warning,
                            temp_critical: defs.critical,
                          }
                        : {}),
                    });
                  }}
                  label={`Default alert thresholds (${defaultThresholdsLabel(form.temp_unit)})`}
                />
                {!form.temp_threshold_auto && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-mist block mb-1">Warning at or above</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={20}
                          max={250}
                          className="input-dark w-24"
                          value={form.temp_warning}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              temp_warning: parseInt(e.target.value, 10) || 0,
                            })
                          }
                        />
                        <span className="text-sm text-mist">
                          °{form.temp_unit === "f" ? "F" : "C"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-mist block mb-1">Critical at or above</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={20}
                          max={250}
                          className="input-dark w-24"
                          value={form.temp_critical}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              temp_critical: parseInt(e.target.value, 10) || 0,
                            })
                          }
                        />
                        <span className="text-sm text-mist">
                          °{form.temp_unit === "f" ? "F" : "C"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="card-glow p-6 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
                  <Battery className="w-5 h-5" />
                  Battery / SunVault
                </h2>
                <p className="text-sm text-mist">
                  Turn on if your site has a SunVault or other ESS. Solar-only systems should leave
                  this off to skip battery API calls and hide battery UI on the dashboard.
                </p>
                <Toggle
                  checked={form.battery_enabled}
                  onChange={(battery_enabled) => setForm({ ...form, battery_enabled })}
                  label="Enable battery monitoring"
                />
              </section>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}

      {tab === "notifications" && (
        <form onSubmit={save} className="space-y-6 max-w-5xl">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <section className="card-glow p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
              <Bell className="w-5 h-5" />
              Alert notifications
            </h2>
            <p className="text-sm text-mist">
              Webhook (Discord/Slack), ntfy.sh, or SMTP email when new health alerts fire.
              Turn on each channel you want to use.
            </p>
            <Toggle
              checked={form.notify_enabled}
              onChange={(notify_enabled) => setForm({ ...form, notify_enabled })}
              label="Enable notifications"
              description="Master switch for all alert channels below"
            />

            <div>
              <label className="text-xs text-mist block mb-1">Portal URL (email links)</label>
              <input
                className="input-dark mono text-sm"
                placeholder="http://192.168.1.50:5173"
                value={form.portal_public_url}
                onChange={(e) => setForm({ ...form, portal_public_url: e.target.value })}
              />
              <p className="text-xs text-mist mt-1">
                Used for &quot;View Health dashboard&quot; in alert emails. Use the same address you
                open in your browser (LAN IP, not localhost). Saved automatically from this page
                when you save settings.
              </p>
              <button
                type="button"
                className="mt-2 text-xs text-cyan-glow hover:underline"
                onClick={() =>
                  setForm({
                    ...form,
                    portal_public_url:
                      typeof window !== "undefined" ? window.location.origin : "",
                  })
                }
              >
                Use current browser address
              </button>
            </div>

            <div className="border-t border-surface/80 pt-4 space-y-4">
              <Toggle
                checked={form.notify_webhook_enabled}
                onChange={(notify_webhook_enabled) =>
                  setForm({ ...form, notify_webhook_enabled })
                }
                label="Webhook"
                description="Discord, Slack, or any incoming webhook URL"
                disabled={!form.notify_enabled}
              />
              <input
                className="input-dark"
                placeholder="Webhook URL"
                value={form.notify_webhook_url}
                onChange={(e) => setForm({ ...form, notify_webhook_url: e.target.value })}
                disabled={!form.notify_enabled || !form.notify_webhook_enabled}
              />
            </div>

            <div className="border-t border-surface/80 pt-4 space-y-4">
              <Toggle
                checked={form.notify_ntfy_enabled}
                onChange={(notify_ntfy_enabled) => setForm({ ...form, notify_ntfy_enabled })}
                label="ntfy"
                description="Push alerts via ntfy.sh topic or full URL"
                disabled={!form.notify_enabled}
              />
              <input
                className="input-dark"
                placeholder="ntfy topic or URL"
                value={form.notify_ntfy_topic}
                onChange={(e) => setForm({ ...form, notify_ntfy_topic: e.target.value })}
                disabled={!form.notify_enabled || !form.notify_ntfy_enabled}
              />
            </div>

            <div className="border-t border-surface/80 pt-4 space-y-4">
              <Toggle
                checked={form.notify_smtp_enabled}
                onChange={(notify_smtp_enabled) => setForm({ ...form, notify_smtp_enabled })}
                label="SMTP email"
                description="TLS email (e.g. Mailtrap live SMTP)"
                disabled={!form.notify_enabled}
              />
              <div
                className={`space-y-3 ${
                  !form.notify_enabled || !form.notify_smtp_enabled
                    ? "opacity-50 pointer-events-none"
                    : ""
                }`}
              >
                <p className="text-xs text-mist">
                  Example Mailtrap: host{" "}
                  <span className="mono text-cyan-glow/80">live.smtp.mailtrap.io</span>, port{" "}
                  <span className="mono">587</span>, username <span className="mono">api</span>,
                  password = API token.
                </p>
                <input
                  className="input-dark"
                  placeholder="SMTP host (e.g. live.smtp.mailtrap.io)"
                  value={form.notify_smtp_host}
                  onChange={(e) => setForm({ ...form, notify_smtp_host: e.target.value })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-mist block mb-1">Port</label>
                    <input
                      type="number"
                      className="input-dark w-full"
                      min={1}
                      max={65535}
                      value={form.notify_smtp_port}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          notify_smtp_port: parseInt(e.target.value, 10) || 587,
                        })
                      }
                    />
                  </div>
                  <Toggle
                    checked={form.notify_smtp_use_tls}
                    onChange={(notify_smtp_use_tls) =>
                      setForm({ ...form, notify_smtp_use_tls })
                    }
                    label="Use TLS (STARTTLS)"
                    className="items-end pb-1"
                  />
                </div>
                <input
                  className="input-dark"
                  placeholder="SMTP username (e.g. api)"
                  value={form.notify_smtp_username}
                  onChange={(e) => setForm({ ...form, notify_smtp_username: e.target.value })}
                  autoComplete="off"
                />
                <input
                  type="password"
                  className="input-dark"
                  placeholder="SMTP password / API token"
                  value={form.notify_smtp_password}
                  onChange={(e) => setForm({ ...form, notify_smtp_password: e.target.value })}
                  autoComplete="new-password"
                />
                <input
                  className="input-dark"
                  type="email"
                  placeholder="From address"
                  value={form.notify_smtp_from}
                  onChange={(e) => setForm({ ...form, notify_smtp_from: e.target.value })}
                />
                <input
                  className="input-dark"
                  type="email"
                  placeholder="To address (comma-separated)"
                  value={form.notify_smtp_to}
                  onChange={(e) => setForm({ ...form, notify_smtp_to: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-mist block mb-1">Minimum severity</label>
              <select
                className="input-dark"
                value={form.notify_min_severity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notify_min_severity: e.target.value as "warning" | "critical",
                  })
                }
              >
                <option value="critical">Critical only</option>
                <option value="warning">Warning and critical</option>
              </select>
            </div>
            <button
              type="button"
              disabled={testingNotify}
              onClick={testNotification}
              className="text-sm text-cyan-glow border border-cyan/30 px-4 py-2 rounded-lg hover:bg-cyan/10 w-full sm:w-auto"
            >
              {testingNotify ? "Sending…" : "Send test alert email"}
            </button>
          </section>

          <section className="card-glow p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
              <BarChart3 className="w-5 h-5" />
              Monthly report
            </h2>
            <p className="text-sm text-mist">
              Email-only summary of the previous calendar month (PV, load, grid, CO₂). Sent
              automatically on the 1st of each month in your site timezone.
            </p>
            <Toggle
              checked={form.monthly_report_enabled}
              onChange={(monthly_report_enabled) => {
                if (monthly_report_enabled && !isSmtpConfigured(form)) {
                  showToast(
                    "error",
                    "Configure SMTP host, from, and to addresses in the left column before enabling."
                  );
                  return;
                }
                setForm({ ...form, monthly_report_enabled });
              }}
              label="Enable monthly report email"
              description={
                isSmtpConfigured(form)
                  ? "Uses the same SMTP settings as alert emails"
                  : "Requires SMTP host, from, and to below"
              }
              disabled={!isSmtpConfigured(form) && !form.monthly_report_enabled}
            />
            {!isSmtpConfigured(form) && (
              <p className="text-xs text-amber-400/90">
                Fill in SMTP host, from, and to under Alert notifications, then save settings.
              </p>
            )}
            <button
              type="button"
              disabled={testingMonthlyReport || !isSmtpConfigured(form)}
              onClick={testMonthlyReport}
              className="text-sm text-cyan-glow border border-cyan/30 px-4 py-2 rounded-lg hover:bg-cyan/10 w-full sm:w-auto disabled:opacity-50"
            >
              {testingMonthlyReport ? "Sending…" : "Send sample monthly report"}
            </button>
            <p className="text-xs text-mist">
              Sample uses the previous calendar month from your stored readings. Save SMTP settings
              before testing.
            </p>
          </section>
          </div>

          <p className="text-xs text-mist">
            Save settings before testing — the server uses your saved configuration. Alert test
            emails show Warning &amp; Critical samples; monthly test sends a production report
            layout.
          </p>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}

      {tab === "health" && <HealthRulesSettings />}

      {tab === "accounts" && <AccountSettings />}

      {tab === "backup" && <BackupSettings />}

      {tab === "database" && <DatabaseSettings />}
    </div>
  );
}
