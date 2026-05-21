"""SunPower PVS6 local varserver API client (BUILD 61840+)."""

from __future__ import annotations

import base64
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.json_util import safe_float

logger = logging.getLogger(__name__)

LIVEDATA_VARS = [
    "/sys/livedata/pv_p",
    "/sys/livedata/pv_en",
    "/sys/livedata/net_p",
    "/sys/livedata/net_en",
    "/sys/livedata/site_load_p",
    "/sys/livedata/site_load_en",
    "/sys/livedata/ess_p",
    "/sys/livedata/ess_en",
    "/sys/livedata/soc",
    "/sys/livedata/backupTimeRemaining",
    "/sys/livedata/midstate",
    "/sys/livedata/time",
]

SYSTEM_VARS = [
    "/sys/info/serialnum",
    "/sys/info/sw_rev",
    "/sys/info/hwrev",
    "/sys/info/model",
    "/sys/info/uptime",
    "/sys/info/sys_type",
    "/sys/info/cpu_usage",
    "/sys/info/ram_usage",
    "/sys/info/flash_usage",
    "/sys/info/active_interface",
]


@dataclass
class PvsClient:
    host: str
    serial: str
    verify_ssl: bool = False
    _cookies: dict[str, str] = field(default_factory=dict)

    @property
    def password(self) -> str:
        return self.serial.strip()[-5:].upper()

    @property
    def base_url(self) -> str:
        host = self.host.strip()
        if not host.startswith("http"):
            host = f"https://{host}"
        return host.rstrip("/")

    def _auth_header(self) -> dict[str, str]:
        token = base64.b64encode(f"ssm_owner:{self.password}".encode()).decode()
        return {"Authorization": f"Basic {token}"}

    async def login(self, client: httpx.AsyncClient) -> bool:
        # Must be exactly /auth?login — ?login= (empty value) returns 400 from PVS.
        r = await client.get(
            f"{self.base_url}/auth?login",
            headers=self._auth_header(),
        )
        if r.status_code != 200:
            logger.warning("PVS login failed: %s %s", r.status_code, r.text[:200])
            return False
        for name, value in r.cookies.items():
            self._cookies[name] = value
        if "session" not in self._cookies and r.text:
            try:
                body = r.json()
                if session := body.get("session"):
                    self._cookies["session"] = session
            except json.JSONDecodeError:
                pass
        return bool(self._cookies.get("session"))

    async def _get_vars(
        self, client: httpx.AsyncClient, **params: str
    ) -> dict[str, Any]:
        if not self._cookies and not await self.login(client):
            return {}
        r = await client.get(
            f"{self.base_url}/vars",
            params=params,
            cookies=self._cookies,
        )
        if r.status_code == 401:
            self._cookies.clear()
            if await self.login(client):
                r = await client.get(
                    f"{self.base_url}/vars",
                    params=params,
                    cookies=self._cookies,
                )
        if r.status_code != 200:
            logger.warning("vars query failed: %s", r.status_code)
            return {}
        data = r.json()
        if params.get("fmt") == "obj":
            return data if isinstance(data, dict) else {}
        values = data.get("values", [])
        return {v["name"]: v.get("value") for v in values if "name" in v}

    async def fetch_livedata(self, client: httpx.AsyncClient) -> dict[str, Any]:
        return await self.fetch_match(client, "livedata", "ldata")

    async def fetch_system_info(self, client: httpx.AsyncClient) -> dict[str, Any]:
        """Supervisor fields under /sys/info/ (and a few /sys/pvs/ metrics)."""
        merged: dict[str, Any] = {}
        for match in ("info", "/sys/info"):
            raw = await self.fetch_match(client, match, "sys")
            merged.update(_filter_prefix(raw, "/sys/info/"))
            merged.update(_filter_prefix(raw, "/sys/pvs/"))
            if merged:
                return merged

        # Fallback: explicit names (comma-separated works on PVS6 61840+).
        extra = ["/sys/info/fwrev", "/sys/info/lmac", "/sys/pvs/flashwear_type_b"]
        names = ",".join([*SYSTEM_VARS, *extra])
        named = await self._get_vars(client, name=names)
        for key, value in named.items():
            if key.startswith("/sys/info/") or key.startswith("/sys/pvs/"):
                merged[key] = _parse_json_value(value)
        if not merged:
            logger.warning("fetch_system_info: no /sys/info data from PVS")
        return merged

    async def fetch_match(
        self, client: httpx.AsyncClient, match: str, cache: str
    ) -> dict[str, Any]:
        return await self._get_vars(
            client, match=match, fmt="obj", cache=cache
        )

    async def fetch_cached(
        self, client: httpx.AsyncClient, cache: str
    ) -> dict[str, Any]:
        return await self._get_vars(client, fmt="obj", cache=cache)

    async def fetch_all_telemetry(
        self, client: httpx.AsyncClient, *, include_battery: bool = False
    ) -> dict[str, Any]:
        """Pull livedata, meters, inverters, system; optionally ESS / transfer switch."""
        if not self._cookies:
            await self.login(client)

        livedata = await self.fetch_match(client, "livedata", "ldata")
        meters_raw = await self.fetch_match(client, "meter", "meters")
        inverters_raw = await self.fetch_match(client, "inverter", "inv")
        system = await self.fetch_system_info(client)

        result: dict[str, Any] = {
            "livedata": livedata,
            "meters": _group_device_vars(meters_raw, "meter"),
            "inverters": _group_device_vars(inverters_raw, "inverter"),
            "system": system,
        }
        if include_battery:
            for match, cache, key in [
                ("devices/ess", "ess", "ess"),
                ("transfer_switch", "xfer", "transfer_switches"),
            ]:
                data = await self.fetch_match(client, match, cache)
                filtered = _filter_prefix(data, "/sys/devices/")
                if filtered:
                    result[key] = filtered
        return result

    async def test_connection(self) -> tuple[bool, str, dict[str, Any]]:
        async with httpx.AsyncClient(verify=self.verify_ssl, timeout=30.0) as client:
            if not await self.login(client):
                return False, "Authentication failed — check IP and serial number", {}
            info = await self.fetch_system_info(client)
            livedata = await self.fetch_livedata(client)
            if not info and not livedata:
                return False, "Connected but no data returned", {}
            return True, "Connected", {**info, **livedata}


def _filter_prefix(data: dict[str, Any], prefix: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in data.items():
        if k.startswith(prefix):
            out[k] = _parse_json_value(v)
    return out


_DEVICE_FIELD = re.compile(r"^/sys/devices/(inverter|meter)/(\d+)/([^/]+)$")


def _group_device_vars(data: dict[str, Any], device_type: str) -> dict[str, dict[str, Any]]:
    """Turn flat varserver keys into one object per inverter/meter index."""
    grouped: dict[str, dict[str, Any]] = {}
    for key, value in data.items():
        m = _DEVICE_FIELD.match(str(key))
        if not m or m.group(1) != device_type:
            continue
        device_key = f"/sys/devices/{device_type}/{m.group(2)}"
        field = m.group(3)
        parsed = _parse_json_value(value)
        if device_type == "inverter" and field.endswith("Degc") and parsed is not None:
            try:
                parsed = int(float(parsed))
            except (TypeError, ValueError):
                pass
        grouped.setdefault(device_key, {})[field] = parsed
    return grouped


def _parse_json_value(v: Any) -> Any:
    if isinstance(v, str) and v.startswith("{"):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            pass
    return v


def parse_livedata(raw: dict[str, Any]) -> dict[str, float | int | None]:
    def f(key: str) -> float | None:
        return safe_float(raw.get(key))

    def i(key: str) -> int | None:
        v = safe_float(raw.get(key))
        return int(v) if v is not None else None

    soc = f("/sys/livedata/soc")
    return {
        "pv_kw": f("/sys/livedata/pv_p"),
        "net_kw": f("/sys/livedata/net_p"),
        "load_kw": f("/sys/livedata/site_load_p"),
        "battery_kw": f("/sys/livedata/ess_p"),
        "battery_soc": soc * 100 if soc is not None and soc <= 1 else soc,
        "pv_kwh_total": f("/sys/livedata/pv_en"),
        "net_kwh_total": f("/sys/livedata/net_en"),
        "load_kwh_total": f("/sys/livedata/site_load_en"),
        "battery_kwh_total": f("/sys/livedata/ess_en"),
        "backup_minutes": i("/sys/livedata/backupTimeRemaining"),
        "mid_state": i("/sys/livedata/midstate"),
    }
