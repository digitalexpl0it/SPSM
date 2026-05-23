import { useState } from "react";
import { Loader2, Radar, Search, X } from "lucide-react";
import { settingsApi, pvsHostFromDiscovery, type PvsDiscoveryHost } from "../lib/api";
import { effectiveDiscoverySerial } from "../lib/pvsSerial";
import { formatErrorMessage, useToast } from "../lib/toast";

type LanModalProps = {
  open: boolean;
  onClose: () => void;
  onSelectHost: (ip: string) => void;
  onSelectSerial: (serial: string) => void;
};

function HostResult({
  host,
  onSelect,
}: {
  host: PvsDiscoveryHost;
  onSelect: (host: PvsDiscoveryHost) => void;
}) {
  const serial = effectiveDiscoverySerial(host);
  return (
    <li className="rounded-lg border border-surface/80 px-3 py-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="mono text-cyan-glow font-medium">{host.hostname ?? host.ip}</p>
          {host.hostname && <p className="text-xs text-mist mt-0.5 mono">{host.ip}</p>}
          {host.hostname && host.hostname_fqdn && host.hostname !== host.hostname_fqdn && (
            <p className="text-xs text-mist/70 truncate mt-0.5" title={host.hostname_fqdn}>
              {host.hostname_fqdn}
            </p>
          )}
        </div>
        <span className="text-xs text-mist shrink-0 text-right">
          {(host.scheme ?? "https").toUpperCase()} {host.status}
          {host.likely_pvs && (
            <span className="block text-purple-300/90">PVS API</span>
          )}
          {host.pvs_api_status != null && host.pvs_api_status !== host.status && (
            <span className="block text-mist/80">/vars {host.pvs_api_status}</span>
          )}
          {serial ? <span className="block">{serial}</span> : null}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onSelect(host)}
        className="w-full px-3 py-2 rounded-lg border border-cyan/30 text-cyan-glow text-xs hover:bg-cyan/10 transition text-center"
      >
        {serial ? "Use this PVS" : "Use as host"}
      </button>
    </li>
  );
}

export function PvsLanDiscoveryModal({
  open,
  onClose,
  onSelectHost,
  onSelectSerial,
}: LanModalProps) {
  const { showToast } = useToast();
  const [scanLoading, setScanLoading] = useState(false);
  const [hosts, setHosts] = useState<PvsDiscoveryHost[]>([]);
  const [scanned, setScanned] = useState(false);
  const [subnet, setSubnet] = useState<string | null>(null);

  if (!open) return null;

  const scan = async () => {
    setScanLoading(true);
    setScanned(false);
    try {
      const res = await settingsApi.discoverPvs();
      setHosts(res.hosts);
      setSubnet(res.subnet);
      setScanned(true);
      showToast(
        "success",
        `Found ${res.hosts.length} PVS candidate(s) on ${res.subnet}.`
      );
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setScanLoading(false);
    }
  };

  const selectHost = (host: PvsDiscoveryHost) => {
    const hostValue = pvsHostFromDiscovery(host);
    const serial = effectiveDiscoverySerial(host);
    onSelectHost(hostValue);
    if (serial) {
      onSelectSerial(serial);
    }
    onClose();
    showToast(
      "success",
      serial
        ? `PVS host and serial applied (${hostValue}, ${serial}) — save to apply.`
        : `PVS host set to ${hostValue} — save settings to apply.`
    );
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
                Scans the subnet of this server&apos;s assigned LAN address
                {subnet ? (
                  <>
                    {" "}
                    (<span className="mono text-cyan-glow/80">{subnet}</span>)
                  </>
                ) : (
                  " (detected from network interfaces)"
                )}
                . Usually finishes in under a minute.
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
            disabled={scanLoading}
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
        </div>

        {(scanned || hosts.length > 0) && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-0 border-t border-surface/60">
            {scanned && hosts.length === 0 && (
              <p className="text-sm text-mist text-center py-4">
                No SunPower PVS devices found on this subnet.
              </p>
            )}

            {hosts.length > 0 && (
              <ul className="text-sm space-y-2 pt-4">
                {hosts.map((h) => (
                  <HostResult key={h.ip} host={h} onSelect={selectHost} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
