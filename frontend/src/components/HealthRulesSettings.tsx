import { useCallback, useEffect, useState } from "react";
import { HeartPulse, Loader2 } from "lucide-react";
import { healthApi, settingsApi, type HealthRuleCatalogEntry } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatErrorMessage, useToast } from "../lib/toast";
import { Toggle } from "./Toggle";

const SEVERITY_CLASS: Record<string, string> = {
  critical: "text-red-300/90",
  warning: "text-amber-300/90",
  info: "text-cyan-200/80",
};

export function HealthRulesSettings() {
  const { isAdmin, isReadonly } = useAuth();
  const { showToast } = useToast();
  const [rules, setRules] = useState<HealthRuleCatalogEntry[]>([]);
  const [smartSunriseRamp, setSmartSunriseRamp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, settings] = await Promise.all([healthApi.rules(), settingsApi.get()]);
      setRules(res.rules);
      setSmartSunriseRamp(settings.health_sunrise_ramp_smart === "true");
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const setEnabled = (settingKey: string, enabled: boolean) => {
    setRules((prev) =>
      prev.map((r) =>
        r.setting_key === settingKey ? { ...r, enabled } : r
      )
    );
  };

  const setTunable = (ruleId: string, tunableKey: string, value: number) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== ruleId) return r;
        return {
          ...r,
          tunables: r.tunables.map((t) =>
            t.key === tunableKey ? { ...t, value } : t
          ),
        };
      })
    );
  };

  const save = async () => {
    setSaving(true);
    const settings: Record<string, string | boolean | number> = {};
    for (const rule of rules) {
      settings[rule.setting_key] = rule.enabled;
      for (const t of rule.tunables) {
        settings[t.key] = t.value;
      }
    }
    settings.health_sunrise_ramp_smart = smartSunriseRamp;
    try {
      const res = await healthApi.saveRules({ settings });
      setRules(res.rules);
      showToast("success", "Health alert rules saved.");
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <p className="text-sm text-mist">
        Health alert rules can be configured by admin accounts only.
      </p>
    );
  }

  return (
    <section className="card-glow p-6 space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
        <HeartPulse className="w-5 h-5" />
        Health alert rules
      </h2>
      <p className="text-sm text-mist">
        Choose which checks appear on the Health page and trigger notifications (when
        notifications are enabled). Disabled rules are skipped entirely. Temperature thresholds
        are set on the System tab.
      </p>

      {loading ? (
        <p className="text-sm text-mist flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading rules…
        </p>
      ) : (
        <ul className="space-y-4">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="border border-surface/80 rounded-xl p-4 space-y-3 bg-void/40"
            >
              <Toggle
                checked={rule.enabled}
                onChange={(enabled) => setEnabled(rule.setting_key, enabled)}
                label={rule.title}
                description={rule.description}
              />
              <p className={`text-xs uppercase tracking-wide ${SEVERITY_CLASS[rule.severity] ?? ""}`}>
                Default severity: {rule.severity}
              </p>
              {rule.enabled && rule.tunables.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  {rule.tunables.map((t) => (
                    <div key={t.key}>
                      <label className="text-xs text-mist block mb-1">{t.label}</label>
                      <input
                        type="number"
                        className="input-dark w-full"
                        min={t.min}
                        max={t.max}
                        step={t.type === "float" ? t.step ?? 0.01 : 1}
                        value={t.value}
                        onChange={(e) =>
                          setTunable(
                            rule.id,
                            t.key,
                            t.type === "float"
                              ? parseFloat(e.target.value) || t.default
                              : parseInt(e.target.value, 10) || t.default
                          )
                        }
                      />
                      {t.help && <p className="text-xs text-mist/70 mt-1">{t.help}</p>}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="border border-surface/80 rounded-xl p-4 bg-void/40 space-y-2">
        <Toggle
          checked={smartSunriseRamp}
          onChange={setSmartSunriseRamp}
          label="Smart sunrise ramp"
          description="Widen the morning ramp in winter and narrow it in summer (daylight zero-PV check only). Off uses a fixed 3-hour ramp after 6 AM local."
        />
      </div>

      <button
        type="button"
        disabled={saving || loading || isReadonly}
        onClick={save}
        className="btn-primary disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save health rules"}
      </button>
    </section>
  );
}
