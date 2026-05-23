"""Scan local /24 subnet for HTTP(S) hosts that look like a PVS."""

from __future__ import annotations

import asyncio
import ipaddress
from typing import Any, Literal

import httpx

from app.lan_hostnames import display_hostname, resolve_lan_hostname

Scheme = Literal["http", "https"]

PVS_API_STATUSES = frozenset({401, 403})


def _parse_host_ip(pvs_host: str) -> str | None:
    host = pvs_host.strip()
    for prefix in ("https://", "http://"):
        if host.lower().startswith(prefix):
            host = host[len(prefix) :]
    host = host.split("/")[0].split(":")[0]
    try:
        return str(ipaddress.ip_address(host))
    except ValueError:
        return None


def _parse_serial(body: httpx.Response) -> str | None:
    try:
        data = body.json()
    except ValueError:
        return None
    values = data.get("values") or []
    if not values:
        return None
    serial = values[0].get("value")
    return str(serial).strip() if serial else None


def _is_likely_pvs(*statuses: int | None) -> bool:
    return any(s in PVS_API_STATUSES for s in statuses if s is not None)


async def _probe_scheme(
    ip: str,
    scheme: Scheme,
    *,
    timeout: float = 2.0,
) -> dict[str, Any] | None:
    base = f"{scheme}://{ip}"
    root_status: int | None = None
    vars_status: int | None = None
    auth_status: int | None = None
    serial: str | None = None

    try:
        async with httpx.AsyncClient(verify=False, timeout=timeout) as client:
            try:
                root = await client.get(f"{base}/", follow_redirects=True)
                root_status = root.status_code
            except httpx.HTTPError:
                root_status = None

            try:
                vr = await client.get(
                    f"{base}/vars",
                    params={"name": "/sys/info/serialnum"},
                )
                vars_status = vr.status_code
                if vr.status_code == 200:
                    serial = _parse_serial(vr)
            except httpx.HTTPError:
                vars_status = None

            try:
                ar = await client.get(f"{base}/auth?login")
                auth_status = ar.status_code
            except httpx.HTTPError:
                auth_status = None
    except httpx.HTTPError:
        return None

    if root_status is None and vars_status is None and auth_status is None:
        return None

    likely_pvs = bool(serial) or _is_likely_pvs(vars_status, auth_status, root_status)

    # Skip random web servers unless they look like a PVS varserver endpoint.
    if not likely_pvs:
        if root_status is None or root_status >= 500:
            return None
        if root_status == 200 and vars_status is None and auth_status is None:
            return None

    status = next(
        (s for s in (vars_status, auth_status, root_status) if s is not None),
        0,
    )

    return {
        "ip": ip,
        "scheme": scheme,
        "status": status,
        "root_status": root_status,
        "pvs_api_status": vars_status if vars_status is not None else auth_status,
        "likely_pvs": likely_pvs,
        "serial": serial,
        "hostname": None,
    }


async def _probe_host(ip: str, *, timeout: float = 2.0) -> dict[str, Any] | None:
    hits: list[dict[str, Any]] = []
    for scheme in ("https", "http"):
        hit = await _probe_scheme(ip, scheme, timeout=timeout)
        if hit:
            hits.append(hit)
    if not hits:
        return None

    def rank(entry: dict[str, Any]) -> tuple[int, int, int, int]:
        return (
            0 if entry.get("likely_pvs") else 1,
            0 if entry.get("serial") else 1,
            0 if (entry.get("status") or 0) in PVS_API_STATUSES else 1,
            0 if entry["scheme"] == "http" else 1,
        )

    hits.sort(key=rank)
    return hits[0]


async def scan_pvs_subnet(seed_host: str, *, concurrency: int = 32) -> list[dict[str, Any]]:
    ip = _parse_host_ip(seed_host)
    if not ip:
        return []
    network = ipaddress.ip_network(f"{ip}/24", strict=False)
    targets = [str(h) for h in network.hosts()]
    sem = asyncio.Semaphore(concurrency)
    found: list[dict[str, Any]] = []

    async def run_one(addr: str) -> None:
        async with sem:
            hit = await _probe_host(addr)
            if hit:
                fqdn = await asyncio.get_running_loop().run_in_executor(
                    None, resolve_lan_hostname, addr, ip
                )
                hit["hostname"] = display_hostname(fqdn) if fqdn else None
                hit["hostname_fqdn"] = fqdn
                found.append(hit)

    await asyncio.gather(*(run_one(a) for a in targets))
    found.sort(
        key=lambda x: (
            0 if x.get("likely_pvs") else 1,
            ipaddress.ip_address(x["ip"]),
        )
    )
    return found
