"""Parse SunPower PVS serial numbers from DHCP/mDNS hostnames."""

from __future__ import annotations

import re

# e.g. pvs6-ZT223485000549W1183 or pvs5-ZT223485000549W1183.localdomain
PVS_HOSTNAME_SERIAL = re.compile(
    r"(?i)pvs[56][-_](?P<serial>[A-Z0-9]{12,32})"
)
PVS_HOSTNAME_MODEL = re.compile(r"(?i)^pvs(?P<model>[56])[-_]")


def serial_from_hostname(name: str | None) -> str | None:
    if not name or not name.strip():
        return None
    first = name.strip().split(".")[0]
    match = PVS_HOSTNAME_SERIAL.search(first)
    if not match:
        return None
    return match.group("serial").upper()


def model_from_hostname(name: str | None) -> str | None:
    if not name or not name.strip():
        return None
    first = name.strip().split(".")[0]
    match = PVS_HOSTNAME_MODEL.match(first)
    if not match:
        return None
    return f"PVS{match.group('model')}"
