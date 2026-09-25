from __future__ import annotations

import json
import re
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

_VERSION_RE = re.compile(r"QuanticStudio-(\d+\.\d+\.\d+)-Windows-Native(?:-LITE)?-(\d{8}|\d{4}-\d{2}-\d{2})")


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return _project_root()


@lru_cache(maxsize=1)
def version_manifest() -> dict[str, Any]:
    candidates = [
        _project_root() / "VERSION.json",
        _runtime_root() / "VERSION.json",
        _runtime_root() / "aura-source" / "VERSION.json",
    ]
    for path in candidates:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(payload, dict) and payload.get("studio"):
            return payload
    return {
        "cloud": "0.0.0",
        "studio": "0.0.0",
        "native_engine": "0.0.0",
        "updated_at": "",
    }


def installed_build_id() -> str:
    path = _runtime_root() / "BUILD-ID.txt"
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""
    return value


def studio_version() -> str:
    build_id = installed_build_id()
    match = _VERSION_RE.search(build_id)
    if match:
        return match.group(1)
    return str(version_manifest().get("studio") or "0.0.0")


def cloud_version() -> str:
    return str(version_manifest().get("cloud") or "0.0.0")


def native_engine_version() -> str:
    return str(version_manifest().get("native_engine") or "0.0.0")


def build_id(*, lite: bool = False) -> str:
    installed = installed_build_id()
    if installed:
        return installed
    manifest = version_manifest()
    version = str(manifest.get("studio") or "0.0.0")
    date = str(manifest.get("updated_at") or "").replace("-", "") or "unknown"
    suffix = "-LITE" if lite else ""
    return f"QuanticStudio-{version}-Windows-Native{suffix}-{date}"
