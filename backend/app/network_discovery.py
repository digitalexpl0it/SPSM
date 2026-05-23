"""Scan local /24 subnet for HTTPS hosts that look like a PVS."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from typing import Any

import httpx


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


def _resolve_hostname(ip: str) -> str | None:
    try:
        name, _, _ = socket.gethostbyaddr(ip)
        name = name.rstrip(".")
        if name and name != ip:
            return name
    except (socket.herror, socket.gaierror, OSError):
        pass
    return None


async def _probe_host(ip: str, *, timeout: float = 2.0) -> dict[str, Any] | None:
    url = f"https://{ip}/"
    try:
        async with httpx.AsyncClient(verify=False, timeout=timeout) as client:
            r = await client.get(url, follow_redirects=True)
        if r.status_code >= 500:
            return None
        serial = None
        try:
            async with httpx.AsyncClient(verify=False, timeout=timeout) as client:
                vr = await client.get(
                    f"https://{ip}/vars",
                    params={"name": "/sys/info/serialnum"},
                )
                if vr.status_code == 200:
                    data = vr.json()
                    values = data.get("values") or []
                    if values:
                        serial = values[0].get("value")
        except (httpx.HTTPError, ValueError, KeyError, IndexError):
            pass
        return {
            "ip": ip,
            "status": r.status_code,
            "serial": str(serial).strip() if serial else None,
            "hostname": None,
        }
    except httpx.HTTPError:
        return None


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
                hostname = await asyncio.get_running_loop().run_in_executor(
                    None, _resolve_hostname, addr
                )
                hit["hostname"] = hostname
                found.append(hit)

    await asyncio.gather(*(run_one(a) for a in targets))
    found.sort(key=lambda x: ipaddress.ip_address(x["ip"]))
    return found
