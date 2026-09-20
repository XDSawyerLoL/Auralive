from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from app.config import BASE_DIR, RUNTIME_DIR, Settings


class NativeBroadcastService:
    """Local controller for Aura Live's Rust broadcast engine.

    Communication deliberately stays on the local filesystem. No socket is
    exposed and no stream key is returned through diagnostics.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self.runtime_dir = RUNTIME_DIR / "data" / "native_broadcast"
        self.command_path = self.runtime_dir / "command.json"
        self.status_path = self.runtime_dir / "status.json"
        self.config_path = self.runtime_dir / "engine.json"
        self.preview_path = self.runtime_dir / "preview.jpg"
        self._process: subprocess.Popen[bytes] | None = None
        self._owns_process = False
        self._lock = threading.RLock()
        self._command_id = int(time.time() * 1000)

    @property
    def selected(self) -> bool:
        return str(getattr(self.settings, "broadcast_engine", "obs") or "obs").lower() == "native"

    def executable(self) -> Path | None:
        configured = str(getattr(self.settings, "native_engine_exe", "") or "").strip()
        candidates: list[Path] = []
        if configured:
            configured_path = Path(configured)
            candidates.append(configured_path if configured_path.is_absolute() else RUNTIME_DIR / configured_path)

        candidates.extend(
            [
                RUNTIME_DIR / "AuraNativeBroadcast.exe",
                RUNTIME_DIR / "Quantic-Live.exe",
                BASE_DIR / "engine" / "quantic-live" / "target" / "release" / "quantic-live.exe",
                BASE_DIR / "engine" / "quantic-live" / "target" / "debug" / "quantic-live.exe",
            ]
        )

        seen: set[str] = set()
        for candidate in candidates:
            key = str(candidate.resolve(strict=False)).casefold()
            if key in seen:
                continue
            seen.add(key)
            if candidate.is_file():
                return candidate
        return None

    def process_running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def start(self) -> dict[str, Any]:
        with self._lock:
            if self.process_running():
                return self.status()

            executable = self.executable()
            if executable is None:
                return {
                    **self.status(),
                    "ok": False,
                    "error": "native_engine_missing",
                    "message": "Le moteur Aura Native Broadcast n'est pas encore compilé ou installé.",
                }

            self.runtime_dir.mkdir(parents=True, exist_ok=True)
            env = os.environ.copy()
            env["AURA_NATIVE_CONTROL_FILE"] = str(self.command_path)
            env["AURA_NATIVE_STATUS_FILE"] = str(self.status_path)
            env["AURA_NATIVE_CONFIG_FILE"] = str(self.config_path)
            env["AURA_NATIVE_PREVIEW_FILE"] = str(self.preview_path)

            creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
            self._process = subprocess.Popen(
                [str(executable)],
                cwd=str(RUNTIME_DIR),
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags,
            )
            self._owns_process = True

        deadline = time.monotonic() + 3.0
        while time.monotonic() < deadline:
            if self._read_status().get("ok"):
                break
            if not self.process_running():
                break
            time.sleep(0.05)
        return self.status()

    def stop(self) -> dict[str, Any]:
        with self._lock:
            process = self._process
            if process is not None and process.poll() is None and self._owns_process:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=2)
            self._process = None
            self._owns_process = False

        return self.status()

    def close(self) -> None:
        self.stop()

    def command(self, action: str, value: str | None = None, *, auto_start: bool = True) -> dict[str, Any]:
        allowed = {
            "stream.start",
            "stream.stop",
            "record.start",
            "record.stop",
            "preview.start",
            "preview.stop",
            "scene.select",
            "runtime.refresh",
        }
        if action not in allowed:
            raise ValueError(f"Commande native inconnue: {action}")

        if auto_start and not self.process_running():
            started = self.start()
            if not started.get("process_running"):
                return started

        with self._lock:
            self.runtime_dir.mkdir(parents=True, exist_ok=True)
            self._command_id += 1
            payload: dict[str, Any] = {"id": self._command_id, "action": action}
            if value is not None:
                payload["value"] = value
            self._atomic_json(self.command_path, payload)
            command_id = self._command_id

        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            status = self._read_status()
            if int(status.get("last_command_id") or 0) >= command_id:
                return self.status()
            if not self.process_running():
                break
            time.sleep(0.04)
        return self.status()

    def status(self) -> dict[str, Any]:
        engine_status = self._read_status()
        executable = self.executable()
        process_running = self.process_running()
        status_age = self._status_age_seconds()
        responsive = bool(engine_status.get("ok")) and status_age is not None and status_age < 3.0

        return {
            "ok": True,
            "mode": str(getattr(self.settings, "broadcast_engine", "obs") or "obs").lower(),
            "selected": self.selected,
            "engine_available": executable is not None,
            "process_running": process_running,
            "responsive": responsive,
            "executable": str(executable) if executable else "",
            "status_age_seconds": round(status_age, 3) if status_age is not None else None,
            "engine": engine_status,
            "obs_fallback_enabled": bool(getattr(self.settings, "obs_enabled", False)),
            "preview_frame_available": self.preview_path.is_file(),
        }

    def _read_status(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.status_path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _status_age_seconds(self) -> float | None:
        try:
            return max(0.0, time.time() - self.status_path.stat().st_mtime)
        except OSError:
            return None

    @staticmethod
    def _atomic_json(path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        os.replace(temporary, path)
