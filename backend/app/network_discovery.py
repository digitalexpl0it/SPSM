"""Scan local /24 subnet for HTTP(S) hosts that look like a PVS."""

from __future__ import annotations

import asyncio
import ipaddress
import os
import platform
import socket
import struct
from typing import Any, Literal

import httpx

from app.lan_hostnames import display_hostname, resolve_lan_hostname
from app.pvs_serial_util import serial_from_hostname

Scheme = Literal["http", "https"]

# SunPower varserver: /auth?login with no credentials returns 400 (not 401).
PVS_AUTH_UNAUTH_STATUS = 400

# Docker / container bridge ranges — not the user's home LAN.
_CONTAINER_NETWORKS = (
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("100.64.0.0/10"),  # CGNAT / some container runtimes
    ipaddress.ip_network("192.168.65.0/24"),  # Docker Desktop VM (not the physical LAN)
)


def _is_usable_lan_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if addr.is_loopback or addr.is_link_local or not addr.is_private:
        return False
    return not any(addr in net for net in _CONTAINER_NETWORKS)


def _lan_dns_seed() -> str | None:
    """Router/gateway from LAN_DNS when running in Docker without a host LAN interface."""
    ip = os.environ.get("LAN_DNS", "").strip()
    if ip and _is_usable_lan_ip(ip):
        return ip
    return None


def _clamp_scan_network(network: ipaddress.IPv4Network | ipaddress.IPv6Network) -> ipaddress.IPv4Network | ipaddress.IPv6Network:
    """Never scan more than a /24; expand /32 docker addrs to a /24 scan window."""
    if network.version != 4:
        return network
    if network.prefixlen > 24 or network.num_addresses <= 2:
        return ipaddress.ip_network(f"{network.network_address}/24", strict=False)
    if network.prefixlen < 24:
        return ipaddress.ip_network(f"{network.network_address}/24", strict=False)
    return network


def _local_ip_via_udp(target: str) -> str | None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.settimeout(0.4)
        sock.connect((target, 53))
        return sock.getsockname()[0]
    except OSError:
        return None
    finally:
        sock.close()


def _network_from_ip(ip: str, netmask: str | None = None) -> tuple[str, str]:
    parsed = _parse_host_ip(ip)
    if not parsed:
        raise ValueError(f"Invalid scan seed: {ip!r}")
    if netmask:
        try:
            network = ipaddress.ip_network(f"{parsed}/{netmask}", strict=False)
        except ValueError:
            network = ipaddress.ip_network(f"{parsed}/24", strict=False)
    else:
        network = ipaddress.ip_network(f"{parsed}/24", strict=False)
    network = _clamp_scan_network(network)
    return parsed, str(network)


def _linux_assigned_ipv4() -> list[dict[str, str]]:
    """IPv4 addresses assigned to local interfaces (Linux)."""
    import fcntl

    results: list[dict[str, str]] = []
    net_dir = "/sys/class/net"
    if not os.path.isdir(net_dir):
        return results

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        for iface in sorted(os.listdir(net_dir)):
            if iface == "lo" or iface.startswith(("docker", "br-", "veth")):
                continue
            ifreq = struct.pack("256s", iface[:15].encode("ascii"))
            try:
                ip = socket.inet_ntoa(
                    fcntl.ioctl(sock.fileno(), 0x8915, ifreq)[20:24]  # SIOCGIFADDR
                )
                netmask = socket.inet_ntoa(
                    fcntl.ioctl(sock.fileno(), 0x891B, ifreq)[20:24]  # SIOCGIFNETMASK
                )
            except OSError:
                continue
            if ip == "0.0.0.0":
                continue
            results.append({"iface": iface, "ip": ip, "netmask": netmask})
    finally:
        sock.close()
    return results


def _default_route_from_path(path: str) -> tuple[str | None, str | None]:
    """Default-route interface and gateway from a route table file."""
    if not os.path.isfile(path):
        return None, None
    default_iface: str | None = None
    default_gw: str | None = None
    with open(path, encoding="ascii", errors="ignore") as fh:
        for line in fh.readlines()[1:]:
            parts = line.strip().split()
            if len(parts) < 4 or parts[1] != "00000000":
                continue
            iface, gateway_hex, flags_hex = parts[0], parts[2], parts[3]
            flags = int(flags_hex, 16)
            if not (flags & 0x0001):  # RTF_UP
                continue
            default_iface = iface
            if flags & 0x0002 and gateway_hex != "00000000":  # RTF_GATEWAY
                default_gw = socket.inet_ntoa(
                    struct.pack("<L", int(gateway_hex, 16))
                )
            else:
                default_gw = None
            break
    return default_iface, default_gw


def _default_route_linux() -> tuple[str | None, str | None]:
    """Default route from this network namespace, or the Docker host when mounted."""
    for path in ("/host/proc/net/route", "/proc/net/route"):
        iface, gw = _default_route_from_path(path)
        if iface:
            return iface, gw
    return None, None


def _env_host_lan_ip() -> str | None:
    """Optional override: SPSM_HOST_LAN_IP set on the Docker host (see .env.example)."""
    ip = os.environ.get("SPSM_HOST_LAN_IP", "").strip()
    if ip and _is_usable_lan_ip(ip):
        return ip
    return None


def detect_lan_scan_seed() -> tuple[str, str]:
    """
    Choose the subnet to scan from this server's assigned LAN address.

    Returns (seed_ip, subnet_cidr) e.g. ("192.168.0.45", "192.168.0.0/24").
    """
    default_iface: str | None = None
    default_gw: str | None = None
    if platform.system() == "Linux":
        default_iface, default_gw = _default_route_linux()

    host_ip = _env_host_lan_ip()
    if host_ip:
        return _network_from_ip(host_ip)

    lan_dns = _lan_dns_seed()
    if lan_dns:
        return _network_from_ip(lan_dns)

    # Prefer the default gateway when it is on the physical LAN (not Docker bridge).
    if default_gw and _is_usable_lan_ip(default_gw):
        return _network_from_ip(default_gw)

    candidates: list[tuple[str, str, int]] = []
    if platform.system() == "Linux":
        for entry in _linux_assigned_ipv4():
            ip = entry["ip"]
            if not _is_usable_lan_ip(ip):
                continue
            _, subnet = _network_from_ip(ip, entry.get("netmask"))
            score = 0
            if entry["iface"] == default_iface:
                score += 10
            candidates.append((ip, subnet, score))

    if candidates:
        candidates.sort(key=lambda item: (-item[2], item[0]))
        return candidates[0][0], candidates[0][1]

    udp_targets: list[str] = []
    if default_gw:
        udp_targets.append(default_gw)
    for target in ("8.8.8.8", "1.1.1.1"):
        if target not in udp_targets:
            udp_targets.append(target)

    for target in udp_targets:
        local = _local_ip_via_udp(target)
        if local and _is_usable_lan_ip(local):
            return _network_from_ip(local)

    raise ValueError(
        "Could not detect LAN subnet from this host. "
        "If the API runs in Docker, set LAN_DNS in .env to your router IP (e.g. 192.168.0.1)."
    )


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


def _looks_like_varserver_response(response: httpx.Response) -> bool:
    """Varserver JSON (success or SunPower error envelope)."""
    try:
        data = response.json()
    except ValueError:
        return False
    if not isinstance(data, dict):
        return False
    if isinstance(data.get("values"), list):
        return True
    return "errorcode" in data and "status" in data


def _is_likely_pvs(
    *,
    serial: str | None,
    auth_status: int | None,
    vars_response: httpx.Response | None,
) -> bool:
    if serial:
        return True
    if auth_status == PVS_AUTH_UNAUTH_STATUS:
        return True
    if vars_response is not None and vars_response.status_code in (400, 401, 403):
        return _looks_like_varserver_response(vars_response)
    return False


_PROBE_TIMEOUT = httpx.Timeout(connect=0.5, read=1.5, write=1.0, pool=0.5)


async def _probe_scheme(
    ip: str,
    scheme: Scheme,
) -> dict[str, Any] | None:
    base = f"{scheme}://{ip}"
    root_status: int | None = None
    vars_status: int | None = None
    vars_response: httpx.Response | None = None
    auth_status: int | None = None
    serial: str | None = None

    try:
        async with httpx.AsyncClient(verify=False, timeout=_PROBE_TIMEOUT) as client:
            try:
                ar = await client.get(f"{base}/auth?login")
                auth_status = ar.status_code
            except httpx.HTTPError:
                return None

            try:
                vr = await client.get(
                    f"{base}/vars",
                    params={"name": "/sys/info/serialnum"},
                )
                vars_response = vr
                vars_status = vr.status_code
                if vr.status_code == 200:
                    serial = _parse_serial(vr)
            except httpx.HTTPError:
                vars_status = None
                vars_response = None

            if not _is_likely_pvs(
                serial=serial,
                auth_status=auth_status,
                vars_response=vars_response,
            ):
                return None
    except httpx.HTTPError:
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
        "likely_pvs": True,
        "serial": serial,
        "hostname": None,
    }


async def _probe_host(ip: str) -> dict[str, Any] | None:
    # SunPower PVS serves HTTP; try it before HTTPS to skip slow TLS timeouts.
    for scheme in ("http", "https"):
        hit = await _probe_scheme(ip, scheme)
        if hit:
            return hit
    return None


async def scan_pvs_subnet(
    seed_host: str | None = None,
    *,
    concurrency: int = 64,
) -> dict[str, Any]:
    if seed_host and seed_host.strip():
        seed_ip, subnet = _network_from_ip(seed_host.strip())
    else:
        seed_ip, subnet = detect_lan_scan_seed()

    network = ipaddress.ip_network(subnet, strict=False)
    targets = [str(h) for h in network.hosts()]
    sem = asyncio.Semaphore(concurrency)
    found: list[dict[str, Any]] = []

    async def run_one(addr: str) -> None:
        async with sem:
            hit = await _probe_host(addr)
            if hit:
                fqdn = await asyncio.get_running_loop().run_in_executor(
                    None, resolve_lan_hostname, addr, seed_ip
                )
                hit["hostname"] = display_hostname(fqdn) if fqdn else None
                hit["hostname_fqdn"] = fqdn
                if not hit.get("serial"):
                    parsed = serial_from_hostname(fqdn) or serial_from_hostname(
                        hit.get("hostname")
                    )
                    if parsed:
                        hit["serial"] = parsed
                found.append(hit)

    await asyncio.gather(*(run_one(a) for a in targets))
    found.sort(key=lambda x: ipaddress.ip_address(x["ip"]))
    return {"seed_host": seed_ip, "subnet": subnet, "hosts": found}
