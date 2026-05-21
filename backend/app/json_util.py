"""JSON-safe serialization helpers."""

from __future__ import annotations

import math
from typing import Any


def safe_float(value: Any) -> float | None:
    if value is None or value == "N/A":
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def sanitize_for_json(obj: Any) -> Any:
    """Recursively replace NaN/Inf floats so FastAPI can encode responses."""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj
