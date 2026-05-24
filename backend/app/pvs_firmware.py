"""PVS5/PVS6 firmware BUILD detection and varserver compatibility (ha-esunpower thresholds)."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any, Literal

from app.pvs_serial_util import model_from_hostname

FirmwareStatus = Literal["supported", "experimental", "unsupported", "unknown"]

MIN_BUILD: dict[str, int] = {
    "PVS5": 5408,
    "PVS6": 61840,
}

_BUILD_IN_TEXT = re.compile(r"[Bb]uild\s+(\d+)")


def parse_build_number(build_raw: Any) -> int | None:
    """Parse BUILD from varserver / supervisor strings (PVS5 and PVS6 formats)."""
    if build_raw is None:
        return None
    if isinstance(build_raw, int):
        return build_raw
    build_str = str(build_raw).strip()
    if not build_str or build_str.upper() == "TBD":
        return None

    match = _BUILD_IN_TEXT.search(build_str)
    if match:
        return int(match.group(1))

    if "." in build_str:
        for part in reversed(build_str.split(".")):
            part = part.strip().rstrip(",")
            try:
                build_num = int(part)
            except ValueError:
                continue
            if build_num >= 1000:
                return build_num

    try:
        return int(build_str)
    except ValueError:
        return None


def _info_value(info: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        raw = info.get(key)
        if raw is None:
            continue
        text = str(raw).strip()
        if text and text.upper() != "TBD":
            return text
    return None


def detect_model(info: dict[str, Any], hostname: str | None = None) -> str | None:
    """Return PVS5 or PVS6 when identifiable."""
    model_raw = _info_value(info, "/sys/info/model", "model")
    if model_raw:
        upper = model_raw.upper()
        if "PVS5" in upper:
            return "PVS5"
        if "PVS6" in upper:
            return "PVS6"

    from_host = model_from_hostname(hostname)
    if from_host:
        return from_host

    return None


def livedata_ok(data: dict[str, Any]) -> bool:
    for key in (
        "/sys/livedata/pv_p",
        "/sys/livedata/net_p",
        "/sys/livedata/site_load_p",
    ):
        val = data.get(key)
        if val is not None and str(val).strip() not in ("", "TBD"):
            return True
    return False


@dataclass
class FirmwareAssessment:
    status: FirmwareStatus
    model: str | None
    build: int | None
    min_build: int | None
    sw_rev: str | None
    summary: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def assess_firmware(
    info: dict[str, Any],
    *,
    livedata_ok: bool,
    hostname: str | None = None,
) -> FirmwareAssessment:
    model = detect_model(info, hostname)
    sw_rev = _info_value(info, "/sys/info/sw_rev", "sw_rev")
    fwrev = _info_value(info, "/sys/info/fwrev", "fwrev")
    build = parse_build_number(sw_rev) or parse_build_number(fwrev)
    min_build = MIN_BUILD.get(model) if model else None

    if not livedata_ok:
        return FirmwareAssessment(
            status="unsupported",
            model=model,
            build=build,
            min_build=min_build,
            sw_rev=sw_rev,
            summary=(
                "Connected but no livedata returned — firmware may be too old for the "
                "varserver API. PVS6 requires BUILD 61840+; PVS5 requires BUILD 5408+."
            ),
        )

    if model and build is not None and min_build is not None:
        if build < min_build:
            return FirmwareAssessment(
                status="unsupported",
                model=model,
                build=build,
                min_build=min_build,
                sw_rev=sw_rev or fwrev,
                summary=(
                    f"{model} firmware BUILD {build} is too old. "
                    f"Upgrade to BUILD {min_build}+ for local varserver monitoring."
                ),
            )
        if model == "PVS5":
            return FirmwareAssessment(
                status="experimental",
                model=model,
                build=build,
                min_build=min_build,
                sw_rev=sw_rev or fwrev,
                summary=(
                    f"Connected — {model} firmware BUILD {build} (supported API; "
                    "PVS5 support in SPSM is community-tested)."
                ),
            )
        return FirmwareAssessment(
            status="supported",
            model=model,
            build=build,
            min_build=min_build,
            sw_rev=sw_rev or fwrev,
            summary=f"Connected — {model} firmware BUILD {build} (supported).",
        )

    if model == "PVS5":
        return FirmwareAssessment(
            status="experimental",
            model=model,
            build=build,
            min_build=MIN_BUILD["PVS5"],
            sw_rev=sw_rev or fwrev,
            summary=(
                f"Connected — {model} detected; firmware BUILD could not be verified. "
                "PVS5 requires BUILD 5408+ for the varserver API."
            ),
        )

    return FirmwareAssessment(
        status="unknown",
        model=model,
        build=build,
        min_build=min_build,
        sw_rev=sw_rev or fwrev,
        summary=(
            "Connected — livedata OK but firmware version could not be verified. "
            "PVS6 requires BUILD 61840+; PVS5 requires BUILD 5408+."
        ),
    )


def connection_message(assessment: FirmwareAssessment) -> str:
    return assessment.summary
