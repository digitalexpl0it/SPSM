"""Resolve LAN device hostnames (router DHCP DNS, mDNS, NetBIOS, reverse DNS)."""

from __future__ import annotations

import ipaddress
import random
import re
import socket
import struct
import subprocess
from pathlib import Path
from typing import Iterable


def _clean_hostname(name: str) -> str | None:
    name = name.strip().rstrip(".")
    if not name or name == "localhost":
        return None
    return name


def _short_label(fqdn: str) -> str:
    """panda.localdomain -> panda for compact UI."""
    return fqdn.split(".")[0] if fqdn else fqdn


def _resolve_gethostbyaddr(ip: str) -> str | None:
    try:
        name, _, _ = socket.gethostbyaddr(ip)
        return _clean_hostname(name)
    except (socket.herror, socket.gaierror, OSError):
        return None


def _read_resolv_nameservers() -> list[str]:
    """Nameservers from container resolv.conf (skip Docker/systemd stubs on loopback)."""
    path = Path("/etc/resolv.conf")
    if not path.is_file():
        return []
    servers: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line.startswith("nameserver"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        ns = parts[1]
        if ns.startswith("127."):
            continue
        try:
            ipaddress.ip_address(ns)
            servers.append(ns)
        except ValueError:
            continue
    return servers


def _encode_dns_name(name: str) -> bytes:
    out = b""
    for label in name.split("."):
        if not label:
            continue
        encoded = label.encode("ascii", errors="ignore")[:63]
        out += bytes([len(encoded)]) + encoded
    return out + b"\x00"


def _read_dns_name(data: bytes, offset: int) -> tuple[str, int]:
    labels: list[str] = []
    end = offset
    hops = 0
    while hops < 8 and offset < len(data):
        length = data[offset]
        if length == 0:
            end = offset + 1
            break
        if length & 0xC0 == 0xC0:
            if offset + 1 >= len(data):
                break
            pointer = struct.unpack("!H", data[offset : offset + 2])[0] & 0x3FFF
            offset = pointer
            hops += 1
            continue
        offset += 1
        label = data[offset : offset + length].decode("ascii", errors="ignore")
        labels.append(label)
        offset += length
        end = offset
    return ".".join(labels), end


def _parse_ptr_answers(data: bytes) -> str | None:
    if len(data) < 12:
        return None
    _, flags, qdcount, ancount, _, _ = struct.unpack("!HHHHHH", data[:12])
    if flags & 0x000F != 0 or ancount == 0:
        return None

    offset = 12
    for _ in range(qdcount):
        _, offset = _read_dns_name(data, offset)
        offset += 4

    for _ in range(ancount):
        _, offset = _read_dns_name(data, offset)
        if offset + 10 > len(data):
            break
        rtype, _, _, rdlength = struct.unpack("!HHIH", data[offset : offset + 10])
        offset += 10
        if offset + rdlength > len(data):
            break
        rdata_start = offset
        offset += rdlength
        if rtype == 12 and rdlength:
            ptr, _ = _read_dns_name(data, rdata_start)
            cleaned = _clean_hostname(ptr)
            if cleaned:
                return cleaned
    return None


def _dns_ptr_lookup(ip: str, nameserver: str, *, timeout: float = 1.5) -> str | None:
    """Query PTR on a LAN nameserver (router DHCP DNS, etc.)."""
    if ":" in ip:
        return None
    rev = ".".join(reversed(ip.split("."))) + ".in-addr.arpa"
    tid = random.randint(0, 65535)
    header = struct.pack("!HHHHHH", tid, 0x0100, 1, 0, 0, 0)
    question = _encode_dns_name(rev) + struct.pack("!HH", 12, 1)
    packet = header + question

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        sock.sendto(packet, (nameserver, 53))
        data, _ = sock.recvfrom(4096)
        return _parse_ptr_answers(data)
    except OSError:
        return None
    finally:
        sock.close()


def _mdns_ptr_lookup(ip: str, *, timeout: float = 2.0) -> str | None:
    """Multicast mDNS reverse lookup (systemd-resolved / .local names on LAN)."""
    if ":" in ip:
        return None
    rev = ".".join(reversed(ip.split("."))) + ".in-addr.arpa"
    tid = random.randint(0, 65535)
    header = struct.pack("!HHHHHH", tid, 0x0000, 1, 0, 0, 0)
    question = _encode_dns_name(rev) + struct.pack("!HH", 12, 1)
    packet = header + question

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.settimeout(timeout)
    try:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)
        try:
            mreq = struct.pack(
                "=4s4s", socket.inet_aton("224.0.0.251"), socket.inet_aton("0.0.0.0")
            )
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        except OSError:
            pass
        sock.sendto(packet, ("224.0.0.251", 5353))
        data, _ = sock.recvfrom(4096)
        return _parse_ptr_answers(data)
    except OSError:
        return None
    finally:
        sock.close()


def _avahi_resolve(ip: str, *, timeout: float = 2.5) -> str | None:
    try:
        proc = subprocess.run(
            ["avahi-resolve-address", "-4", ip],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None
    if proc.returncode != 0:
        return None
    line = (proc.stdout or "").strip().splitlines()
    if not line:
        return None
    parts = re.split(r"\s+", line[-1].strip(), maxsplit=1)
    if len(parts) != 2 or parts[0] != ip:
        return None
    return _clean_hostname(parts[1])


def _encode_netbios_name(name: str) -> bytes:
    padded = (name.upper() + "\x00" * 16)[:16]
    wire = b""
    for char in padded:
        o = ord(char)
        wire += bytes([((o >> 4) & 0x0F) + 0x41, (o & 0x0F) + 0x41])
    return bytes([32]) + wire


def _netbios_node_name(ip: str, *, timeout: float = 1.5) -> str | None:
    if ":" in ip:
        return None

    tid = random.randint(0, 65535)
    header = struct.pack("!HHHHHH", tid, 0x0010, 1, 0, 0, 0)
    question = _encode_netbios_name("*") + struct.pack("!HH", 0x0021, 0x0001)
    packet = header + question

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        sock.sendto(packet, (ip, 137))
        data, _ = sock.recvfrom(4096)
    except OSError:
        return None
    finally:
        sock.close()

    if len(data) < 57:
        return None
    offset = 12
    _, offset = _read_dns_name(data, offset)
    offset += 4
    if offset + 10 > len(data):
        return None
    _, _, _, rdlength = struct.unpack("!HHIH", data[offset : offset + 10])
    offset += 10
    if offset + rdlength > len(data) or rdlength < 1:
        return None

    num_names = data[offset]
    pos = offset + 1
    best: str | None = None
    for _ in range(num_names):
        if pos + 18 > len(data):
            break
        raw = data[pos : pos + 15].decode("ascii", errors="ignore").strip()
        suffix = data[pos + 15]
        flags = struct.unpack("!H", data[pos + 16 : pos + 18])[0]
        pos += 18
        if not raw or (flags & 0x8000) == 0:
            continue
        if suffix in (0x00, 0x20) and (best is None or suffix == 0x00):
            best = raw
    return _clean_hostname(best) if best else None


def _gateway_candidates(network: ipaddress.IPv4Network) -> list[str]:
    if network.version != 4:
        return []
    base = int(network.network_address)
    last = int(network.broadcast_address)
    out: list[str] = []
    for addr in (base + 1, last - 1):
        if network.network_address < ipaddress.IPv4Address(addr) < network.broadcast_address:
            out.append(str(ipaddress.IPv4Address(addr)))
    return out


def _nameserver_candidates(seed_ip: str, network: ipaddress.IPv4Network) -> Iterable[str]:
    seen: set[str] = set()
    for candidate in (
        *_read_resolv_nameservers(),
        *_gateway_candidates(network),
        seed_ip,
    ):
        if candidate not in seen:
            seen.add(candidate)
            yield candidate


def resolve_lan_hostname(ip: str, seed_ip: str) -> str | None:
    """Best-effort LAN hostname for an IP address."""
    try:
        network = ipaddress.ip_network(f"{ip}/24", strict=False)
    except ValueError:
        network = None

    for resolver in (
        _resolve_gethostbyaddr,
        lambda addr: _avahi_resolve(addr),
        lambda addr: _mdns_ptr_lookup(addr),
    ):
        name = resolver(ip)
        if name:
            return name

    if network is not None:
        for ns in _nameserver_candidates(seed_ip, network):
            name = _dns_ptr_lookup(ip, ns)
            if name:
                return name

    return _netbios_node_name(ip)


def display_hostname(fqdn: str | None) -> str | None:
    if not fqdn:
        return None
    return _short_label(fqdn)
