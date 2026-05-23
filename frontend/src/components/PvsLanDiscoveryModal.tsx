import { useState } from "react";
import { Loader2, Radar, Search, X } from "lucide-react";
import { settingsApi, type PvsDiscoveryHost } from "../lib/api";
import { formatErrorMessage, useToast } from "../lib/toast";

type LanModalProps = {
  open: boolean;
  seedHost: string;
  onClose: () => void;
  onSelectHost: (ip: string) => void;
  onSelectSerial: (serial: string) => void;
};

function HostResult({
  host,
  onPickHost,
  onPickSerial,
}: {
  host: PvsDiscoveryHost;
  onPickHost: (ip: string) => void;
  onPickSerial: (serial: string) => void;
}) {
  return (
    <li className="rounded-lg border border-surface/80 px-3 py-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="mono text-cyan-glow font-medium">{host.ip}</p>
          {host.hostname && (
            <p className="text-xs text-mist truncate mt-0.5" title={host.hostname}>
              {host.hostname}
            </p>
          )}
        </div>
        <span className="text-xs text-mist shrink-0">
          HTTP {host.status}
          {host.serial ? ` · ${host.serial}` : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onPickHost(host.ip)}
          className="px-3 py-1.5 rounded-lg border border-cyan/30 text-cyan-glow text-xs hover:bg-cyan/10 transition"
        >
          Use as host
        </button>
        {host.serial && (
          <button
            type="button"
            onClick={() => onPickSerial(host.serial!)}
            className="px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-300 text-xs hover:bg-purple-500/10 transition"
          >
            Use serial
          </button>
        )}
      </div>
    </li>
  );
}

export function PvsLanDiscoveryModal({
  open,
  seedHost,
  onClose,
  onSelectHost,
  onSelectSerial,
}: LanModalProps) {
  const { showToast } = useToast();
  const [scanLoading, setScanLoading] = useState(false);
  const [hosts, setHosts] = useState<PvsDiscoveryHost[]>([]);
  const [scanned, setScanned] = useState(false);

  if (!open) return null;

  const scan = async () => {
    setScanLoading(true);
    setScanned(false);
    try {
      const res = await settingsApi.discoverPvs();
      setHosts(res.hosts);
      setScanned(true);
      showToast("success", `Found ${res.hosts.length} HTTPS host(s) on ${res.seed_host}/24.`);
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setScanLoading(false);
    }
  };

  const pickHost = (ip: string) => {
    onSelectHost(ip);
    onClose();
    showToast("success", `PVS host set to ${ip} — save settings to apply.`);
  };

  const pickSerial = (serial: string) => {
    onSelectSerial(serial);
    onClose();
    showToast("success", "Serial applied — save settings to apply.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-void/80 backdrop-blur-sm"
        aria-label="Close scanner"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lan-scan-title"
        className="relative w-full sm:max-w-lg max-h-[85vh] flex flex-col card-glow rounded-t-2xl sm:rounded-2xl border border-surface/80 safe-bottom overflow-hidden"
      >
        <div className="p-6 pb-4 space-y-4 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="lan-scan-title"
                className="text-lg font-semibold text-cyan-glow flex items-center gap-2"
              >
                <Radar className="w-5 h-5" />
                LAN PVS discovery
              </h2>
              <p className="text-xs text-mist mt-1">
                Scans the /24 subnet around{" "}
                <span className="mono text-cyan-glow/80">{seedHost || "your PVS host"}</span>. May
                take up to a minute.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-mist hover:text-cyan-glow hover:bg-surface/60"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={scan}
            disabled={scanLoading || !seedHost.trim()}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-cyan/30 text-cyan-glow hover:bg-cyan/10 min-h-[2.75rem] disabled:opacity-50"
          >
            {scanLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning subnet…
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Start scan
              </>
            )}
          </button>

          {!seedHost.trim() && (
            <p className="text-xs text-amber-400/90">Enter a PVS host IP first (used as scan seed).</p>
          )}
        </div>

        {(scanned || hosts.length > 0) && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-0 border-t border-surface/60">
            {scanned && hosts.length === 0 && (
              <p className="text-sm text-mist text-center py-4">
                No HTTPS devices found on this subnet.
              </p>
            )}

            {hosts.length > 0 && (
              <ul className="text-sm space-y-2 pt-4">
                {hosts.map((h) => (
                  <HostResult
                    key={h.ip}
                    host={h}
                    onPickHost={pickHost}
                    onPickSerial={pickSerial}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
