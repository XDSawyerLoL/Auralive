from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import urllib.request
from pathlib import Path
from typing import Any

from app.config import RUNTIME_DIR

CURRENT_VERSION = "2.7.3"
REPOSITORY = "XDSawyerLoL/Auralive"
LATEST_RELEASE_API = f"https://api.github.com/repos/{REPOSITORY}/releases/latest"
USER_AGENT = f"QuanticStudioUpdater/{CURRENT_VERSION}"
_INSTALLER_PATTERN = re.compile(r"^QuanticStudio-Setup-(\d+\.\d+\.\d+)\.exe$", re.IGNORECASE)


def _version_tuple(value: str) -> tuple[int, int, int]:
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", str(value or ""))
    if not match:
        return (0, 0, 0)
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def _http_json(url: str, timeout: float = 8.0) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _download_bytes(url: str, timeout: float = 15.0) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


class UpdateManager:
    def __init__(self) -> None:
        local_app_data = os.getenv("LOCALAPPDATA") if os.name == "nt" else ""
        self.directory = (
            Path(local_app_data) / "QuanticStudio" / "updates"
            if local_app_data
            else Path(RUNTIME_DIR) / "updates"
        )
        self._lock = threading.RLock()
        self._last: dict[str, Any] | None = None

    @property
    def installed(self) -> bool:
        return bool(getattr(sys, "frozen", False))

    def _release_info(self, payload: dict[str, Any]) -> dict[str, Any]:
        tag = str(payload.get("tag_name") or "")
        version = ".".join(str(part) for part in _version_tuple(tag))
        assets = list(payload.get("assets") or [])
        installer: dict[str, Any] | None = None
        sums_asset: dict[str, Any] | None = None
        for asset in assets:
            name = str(asset.get("name") or "")
            installer_match = _INSTALLER_PATTERN.match(name)
            if installer_match and installer_match.group(1) == version:
                installer = asset
            elif name.casefold() == "sha256sums.txt":
                sums_asset = asset

        result = {
            "current_version": CURRENT_VERSION,
            "latest_version": version,
            "tag": tag,
            "release_url": str(payload.get("html_url") or ""),
            "published_at": str(payload.get("published_at") or ""),
            "update_available": _version_tuple(version) > _version_tuple(CURRENT_VERSION),
            "installer_available": bool(installer),
            "installed": self.installed,
            "installer": None,
        }
        if installer:
            result["installer"] = {
                "name": str(installer.get("name") or ""),
                "url": str(installer.get("browser_download_url") or ""),
                "digest": str(installer.get("digest") or ""),
                "size": int(installer.get("size") or 0),
            }
        if sums_asset:
            result["checksums_url"] = str(sums_asset.get("browser_download_url") or "")
        return result

    def check(self) -> dict[str, Any]:
        with self._lock:
            payload = _http_json(LATEST_RELEASE_API)
            self._last = self._release_info(payload)
            return dict(self._last)

    def status(self) -> dict[str, Any]:
        with self._lock:
            if self._last is None:
                return {
                    "current_version": CURRENT_VERSION,
                    "latest_version": "",
                    "update_available": False,
                    "installer_available": False,
                    "installed": self.installed,
                    "checked": False,
                }
            return {**self._last, "checked": True}

    def _expected_sha256(self, info: dict[str, Any]) -> str:
        installer = dict(info.get("installer") or {})
        digest = str(installer.get("digest") or "")
        if digest.startswith("sha256:"):
            return digest.split(":", 1)[1].strip().lower()

        sums_url = str(info.get("checksums_url") or "")
        name = str(installer.get("name") or "")
        if sums_url and name:
            text = _download_bytes(sums_url).decode("utf-8", errors="replace")
            for line in text.splitlines():
                fields = line.strip().split()
                if len(fields) >= 2 and fields[-1].lstrip("*") == name:
                    candidate = fields[0].strip().lower()
                    if re.fullmatch(r"[0-9a-f]{64}", candidate):
                        return candidate
        raise RuntimeError("La release ne fournit pas d'empreinte SHA-256 vérifiable pour l'installateur.")

    def download(self) -> dict[str, Any]:
        with self._lock:
            info = self.check()
            if not info.get("update_available"):
                return {**info, "downloaded": False, "up_to_date": True}
            installer = dict(info.get("installer") or {})
            if not installer:
                raise RuntimeError("La nouvelle release ne contient pas d'installateur Quantic Studio.")
            url = str(installer.get("url") or "")
            name = str(installer.get("name") or "")
            if not url.startswith("https://github.com/") or not _INSTALLER_PATTERN.match(name):
                raise RuntimeError("Installateur de mise à jour non reconnu.")

            expected = self._expected_sha256(info)
            self.directory.mkdir(parents=True, exist_ok=True)
            target = self.directory / name
            partial = target.with_suffix(target.suffix + ".part")
            partial.unlink(missing_ok=True)
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            hasher = hashlib.sha256()
            with urllib.request.urlopen(request, timeout=30.0) as response, partial.open("wb") as output:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    hasher.update(chunk)

            actual = hasher.hexdigest().lower()
            if actual != expected:
                partial.unlink(missing_ok=True)
                raise RuntimeError("L'empreinte SHA-256 de la mise à jour ne correspond pas à la release officielle.")

            os.replace(partial, target)
            return {
                **info,
                "downloaded": True,
                "up_to_date": False,
                "path": str(target),
                "sha256": actual,
            }

    def install(self) -> dict[str, Any]:
        with self._lock:
            downloaded = self.download()
            if downloaded.get("up_to_date"):
                return downloaded
            path = Path(str(downloaded.get("path") or ""))
            if not path.is_file():
                raise RuntimeError("L'installateur téléchargé est introuvable.")
            if os.name != "nt":
                raise RuntimeError("L'installation automatique est disponible sous Windows uniquement.")

            flags = int(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
            subprocess.Popen(
                [
                    str(path),
                    "/SP-",
                    "/SILENT",
                    "/SUPPRESSMSGBOXES",
                    "/CLOSEAPPLICATIONS",
                    "/RESTARTAPPLICATIONS",
                ],
                close_fds=True,
                creationflags=flags,
            )
            return {
                **downloaded,
                "installer_started": True,
                "message": "L'installateur Quantic Studio a été lancé. Il fermera et relancera l'application si nécessaire.",
            }


update_manager = UpdateManager()
