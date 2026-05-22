import { useEffect, useState, type FormEvent } from "react";
import {
  Battery,
  CheckCircle2,
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
  Timer,
  UserCircle,
  Wrench,
} from "lucide-react";
import {
  DEFAULT_TEMP_THRESHOLDS,
  defaultThresholdsLabel,
  PANEL_TEMP_REFERENCE,
  type TempUnit,
} from "../lib/temperatureSettings";
import { AccountSettings } from "../components/AccountSettings";
import { SolarThrobber } from "../components/SolarThrobber";
import { settingsApi } from "../lib/api";
import { useAuth } from "../lib/auth";

type SettingsTab = "system" | "accounts";

/** Placeholder only — not a real device serial. */
const EXAMPLE_PVS_SERIAL = "ZT223485000000W0000";

const TABS: { id: SettingsTab; label: string; icon: typeof Wrench }[] = [
  { id: "system", label: "System", icon: Wrench },
  { id: "accounts", label: "Accounts", icon: UserCircle },
];

export function SettingsPage() {
  const { refreshStatus } = useAuth();
  const [tab, setTab] = useState<SettingsTab>("system");
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
    setup_complete: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [message, setMessage] = useState("");

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
          setup_complete: s.setup_complete === "true",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await settingsApi.testPvs(
        form.pvs_host,
        form.pvs_serial,
        form.pvs_verify_ssl
      );
      setTestResult({ ok: true, message: res.message });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.pvs_host || !form.pvs_serial) {
      setMessage("PVS host and serial are required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const {
        inverter_gauge_auto,
        inverter_gauge_max_w,
        temp_threshold_auto,
        temp_warning,
        temp_critical,
        ...rest
      } = form;
      await settingsApi.update({
        ...rest,
        inverter_gauge_max_w: inverter_gauge_auto ? 0 : inverter_gauge_max_w,
        temp_warning: temp_threshold_auto ? 0 : temp_warning,
        temp_critical: temp_threshold_auto ? 0 : temp_critical,
        setup_complete: true,
      });
      await refreshStatus();
      setMessage("Settings saved. Collector will use these on the next poll.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
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
          Configure your PVS6 connection and portal accounts.
        </p>
      </header>

      <nav
        className="flex gap-1 p-1 rounded-xl bg-panel/60 border border-surface/80 w-fit"
        aria-label="Settings sections"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
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

              <label className="flex items-center gap-2 text-sm text-mist cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.pvs_verify_ssl}
                  onChange={(e) => setForm({ ...form, pvs_verify_ssl: e.target.checked })}
                  className="rounded border-surface"
                />
                <Shield className="w-4 h-4" />
                Verify SSL certificate (usually off for local PVS)
              </label>

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

              {testResult && (
                <p
                  className={`text-sm flex items-center gap-2 ${
                    testResult.ok ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {testResult.message}
                </p>
              )}
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
                <label className="flex items-center gap-2 text-sm text-mist">
                  <input
                    type="checkbox"
                    checked={form.collector_enabled}
                    onChange={(e) => setForm({ ...form, collector_enabled: e.target.checked })}
                  />
                  Enable background collector
                </label>
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
                <label className="flex items-center gap-2 text-sm text-mist">
                  <input
                    type="checkbox"
                    checked={form.inverter_gauge_auto}
                    onChange={(e) =>
                      setForm({ ...form, inverter_gauge_auto: e.target.checked })
                    }
                  />
                  Automatic (from module type, usually 320W)
                </label>
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
                <label className="flex items-center gap-2 text-sm text-mist">
                  <input
                    type="checkbox"
                    checked={form.temp_threshold_auto}
                    onChange={(e) => {
                      const auto = e.target.checked;
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
                  />
                  Default alert thresholds ({defaultThresholdsLabel(form.temp_unit)})
                </label>
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
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.battery_enabled}
                    onChange={(e) => setForm({ ...form, battery_enabled: e.target.checked })}
                  />
                  Enable battery monitoring
                </label>
              </section>
            </div>
          </div>

          {message && <p className="text-sm text-cyan-glow">{message}</p>}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}

      {tab === "accounts" && <AccountSettings />}
    </div>
  );
}
