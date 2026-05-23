import type { PvsDiscoveryHost } from "./api";

/** e.g. pvs6-ZT223485000549W1183 or pvs6-ZT223485000549W1183.localdomain */
const PVS_HOSTNAME_SERIAL = /pvs6[-_]([A-Z0-9]{12,32})/i;

export function serialFromHostname(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const first = name.trim().split(".")[0];
  const match = first.match(PVS_HOSTNAME_SERIAL);
  return match ? match[1].toUpperCase() : null;
}

/** Serial from API probe or parsed from pvs6-* hostname. */
export function effectiveDiscoverySerial(host: PvsDiscoveryHost): string | null {
  if (host.serial?.trim()) return host.serial.trim().toUpperCase();
  return (
    serialFromHostname(host.hostname_fqdn) ??
    serialFromHostname(host.hostname) ??
    null
  );
}
