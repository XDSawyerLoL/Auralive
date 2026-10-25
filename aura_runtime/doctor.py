"""Read-only AURA Runtime preflight, without model, cloud requests, or secrets."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
from urllib.parse import urlparse


def inspect_environment(environ: dict[str, str] | None = None) -> dict:
    env = os.environ if environ is None else environ
    base = str(env.get("AURA_CLOUD_BASE_URL") or "").strip()
    parsed = urlparse(base)
    cloud_url_safe = (
        parsed.scheme == "https" and bool(parsed.hostname)
        and parsed.username is None and parsed.password is None
        and not parsed.query and not parsed.fragment
    )
    bridge_ready = bool(str(env.get("AURA_BRIDGE_TOKEN") or "").strip())
    def installed(name: str) -> bool:
        try:
            return importlib.util.find_spec(name) is not None
        except (ValueError, ImportError):
            return False

    browser_candidates = ("chromium", "chromium-browser", "google-chrome", "msedge")
    executable_found = any(shutil.which(name) for name in browser_candidates)
    playwright_present = installed("playwright")
    aiohttp_present = installed("aiohttp")
    python_ok = sys.version_info >= (3, 12)
    audit_ready = playwright_present and executable_found
    # Browser binaries installed via Playwright may not be in PATH. Report
    # missing PATH executables as unknown instead of guessing they are absent.
    blockers = []
    if not cloud_url_safe:
        blockers.append("AURA_CLOUD_BASE_URL HTTPS manquant ou invalide")
    if not bridge_ready:
        blockers.append("AURA_BRIDGE_TOKEN non configuré")
    if not python_ok:
        blockers.append("Python 3.12 minimum requis")
    if not aiohttp_present:
        blockers.append("aiohttp absent; installer les dépendances Runtime")
    return {
        "component": "aura-runtime-doctor-v1",
        "read_only": True,
        "requests_sent": 0,
        "model_calls": 0,
        "python_ok": python_ok,
        "cloud_base_url_valid": cloud_url_safe,
        "bridge_token_configured": bridge_ready,
        "aiohttp_installed": aiohttp_present,
        "playwright_installed": playwright_present,
        "system_browser_in_path": bool(executable_found),
        "browser_audit_ready": "possible" if audit_ready else "a_verifier",
        "ready_for_bridge_start": cloud_url_safe and bridge_ready and python_ok and aiohttp_present,
        "blockers": blockers,
        "browser_hint": (
            "Le navigateur Playwright peut être installé hors PATH; "
            "vérifier avec python -m playwright install chromium."
        ),
    }


def main() -> int:
    report = inspect_environment()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ready_for_bridge_start"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
