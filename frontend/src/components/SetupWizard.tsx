import { useState } from "react";
import { CheckCircle2, Loader2, Radar, Server } from "lucide-react";
import { PvsLanDiscoveryModal } from "./PvsLanDiscoveryModal";
import { settingsApi } from "../lib/api";
import { clearSiteSettingsCache } from "../lib/siteSettings";
import { useAuth } from "../lib/auth";

const EXAMPLE_PVS_SERIAL = "ZT223485000000W0000";

export function SetupWizard() {
  const { refreshStatus } = useAuth();
  const [host, setHost] = useState("");
  const [serial, setSerial] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [lanScanOpen, setLanScanOpen] = useState(false);

  const test = async () => {
    setTesting(true);
    setTestOk(null);
    setMessage("");
    try {
      const res = await settingsApi.testPvs(host, serial.toUpperCase(), false);
      setTestOk(true);
      setMessage(res.message);
    } catch (e) {
      setTestOk(false);
      setMessage(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await settingsApi.update({
        pvs_host: host,
        pvs_serial: serial.toUpperCase(),
        setup_complete: true,
        collector_enabled: true,
      });
      clearSiteSettingsCache();
      await refreshStatus();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="max-w-lg mx-auto card-glow p-8 space-y-6">
        <div className="text-center">
          <Server className="w-12 h-12 text-cyan mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gradient">Welcome to SPSM</h1>
          <p className="text-sm text-mist mt-2">
            Connect your SunPower PVS6 on the local network to start monitoring.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-mist block mb-1">PVS IP or hostname</label>
            <input
              className="input-dark mono w-full"
              placeholder="192.168.1.x or http://192.168.1.x"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <p className="text-xs text-mist mt-1">
              Don&apos;t know the address? Use <strong className="text-cyan-glow/90">Scan LAN</strong>{" "}
              to search this server&apos;s subnet — no IP needed first.
            </p>
          </div>
          <div>
            <label className="text-xs text-mist block mb-1">PVS serial number</label>
            <input
              className="input-dark mono w-full"
              placeholder={EXAMPLE_PVS_SERIAL}
              value={serial}
              onChange={(e) => setSerial(e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={test}
              disabled={testing || !host || !serial}
              className="flex-1 min-w-[10rem] flex justify-center items-center gap-2 py-2 rounded-xl border border-cyan/30 text-cyan-glow hover:bg-cyan/10 disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Test connection
            </button>
            <button
              type="button"
              onClick={() => setLanScanOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition text-sm"
            >
              <Radar className="w-4 h-4" />
              Scan LAN
            </button>
          </div>
          {testOk === true && (
            <p className="text-sm text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {message}
            </p>
          )}
          {testOk === false && <p className="text-sm text-red-400">{message}</p>}
          <button
            type="button"
            onClick={save}
            disabled={saving || !host || !serial || testOk !== true}
            className="btn-primary w-full"
          >
            {saving ? "Saving…" : "Save and open dashboard"}
          </button>
        </div>
      </div>

      <PvsLanDiscoveryModal
        open={lanScanOpen}
        onClose={() => setLanScanOpen(false)}
        onSelectHost={setHost}
        onSelectSerial={(s) => setSerial(s.toUpperCase())}
      />
    </>
  );
}
