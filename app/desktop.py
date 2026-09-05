from __future__ import annotations

import ctypes
import logging
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path


_stdio_sink = None
BUILD_ID = "AuraLive-2.5-Windows-KokoroPrimary-2026-09-05"


def _startup_log_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "AuraLive-startup.log"
    return Path(tempfile.gettempdir()) / "AuraLive-startup.log"


def _ensure_stdio() -> None:
    """Guarantee usable stdio and leave an on-disk startup diagnostic.

    The packaged Windows app uses PyInstaller's console bootloader with the
    console hidden, so stdout/stderr remain real streams. The fallback below is
    retained for safety and also creates a deterministic startup log beside the
    executable so field failures can be identified unambiguously.
    """

    global _stdio_sink
    candidates = [_startup_log_path(), Path(tempfile.gettempdir()) / "AuraLive-startup.log"]

    sink = None
    for path in candidates:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            sink = path.open("a", encoding="utf-8", errors="replace", buffering=1)
            sink.write(
                f"\n=== {BUILD_ID} pid={os.getpid()} frozen={bool(getattr(sys, 'frozen', False))} "
                f"stdout={'ok' if sys.stdout is not None else 'none'} "
                f"stderr={'ok' if sys.stderr is not None else 'none'} ===\n"
            )
            break
        except OSError:
            continue

    if sink is None:
        sink = open(os.devnull, "w", encoding="utf-8")

    _stdio_sink = sink
    if sys.stdout is None:
        sys.stdout = sink
    if sys.stderr is None:
        sys.stderr = sink


_ensure_stdio()

import uvicorn

from app.config import settings
from app.main_v3 import app

logger = logging.getLogger("aura-live-desktop")

_server: uvicorn.Server | None = None
_server_thread: threading.Thread | None = None
_owns_server = False


def _dashboard_host() -> str:
    host = str(settings.host or "127.0.0.1").strip()
    if host in {"0.0.0.0", "::", "[::]", "localhost"}:
        return "127.0.0.1"
    return host


def _dashboard_url() -> str:
    return f"http://{_dashboard_host()}:{int(settings.port)}"


def _request_text(url: str, timeout: float = 0.8) -> tuple[int, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "AuraLiveDesktop/2.5"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read(96_000).decode("utf-8", errors="ignore")
        return int(getattr(response, "status", 200)), body


def _looks_like_aura(url: str) -> bool:
    try:
        status, body = _request_text(url, timeout=0.7)
    except Exception:
        return False
    return status == 200 and "Aura Live" in body


def _find_free_port(preferred: int) -> int:
    for port in [preferred, *range(preferred + 1, preferred + 31)]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((_dashboard_host(), port))
                return port
            except OSError:
                continue
    raise RuntimeError("Aucun port local disponible pour Aura Live.")


def _start_backend() -> str:
    global _server, _server_thread, _owns_server

    preferred = int(settings.port)
    existing_url = f"http://{_dashboard_host()}:{preferred}"
    if _looks_like_aura(existing_url):
        _owns_server = False
        return existing_url

    port = _find_free_port(preferred)
    settings.port = port
    config = uvicorn.Config(
        app,
        host=str(settings.host or "127.0.0.1"),
        port=port,
        log_level=str(settings.log_level or "INFO").lower(),
        access_log=False,
        log_config=None,
    )
    _server = uvicorn.Server(config)
    _server_thread = threading.Thread(target=_server.run, name="AuraLiveBackend", daemon=True)
    _server_thread.start()
    _owns_server = True

    url = f"http://{_dashboard_host()}:{port}"
    deadline = time.monotonic() + 35
    while time.monotonic() < deadline:
        if _server_thread and not _server_thread.is_alive():
            break
        if _looks_like_aura(url):
            return url
        time.sleep(0.15)
    raise RuntimeError(
        "Le moteur local Aura Live n'a pas demarre. Consulte AuraLive-startup.log a cote de AuraLive.exe."
    )


def _stop_backend() -> None:
    if _owns_server and _server is not None:
        _server.should_exit = True
    if _owns_server and _server_thread is not None and _server_thread.is_alive():
        _server_thread.join(timeout=4)


def _browser_candidates() -> list[Path]:
    roots = [
        os.getenv("PROGRAMFILES"),
        os.getenv("PROGRAMFILES(X86)"),
        os.getenv("LOCALAPPDATA"),
    ]
    candidates: list[Path] = []
    for root in [item for item in roots if item]:
        base = Path(root)
        candidates.extend(
            [
                base / "Microsoft" / "Edge" / "Application" / "msedge.exe",
                base / "Google" / "Chrome" / "Application" / "chrome.exe",
            ]
        )
    for command in ("msedge.exe", "chrome.exe", "msedge", "google-chrome", "chromium"):
        found = shutil.which(command)
        if found:
            candidates.append(Path(found))
    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate).casefold()
        if key not in seen and candidate.exists():
            seen.add(key)
            unique.append(candidate)
    return unique


def _read_devtools_port(profile_dir: Path) -> int | None:
    marker = profile_dir / "DevToolsActivePort"
    try:
        first_line = marker.read_text(encoding="utf-8", errors="ignore").splitlines()[0].strip()
        port = int(first_line)
        return port if 0 < port < 65536 else None
    except (OSError, ValueError, IndexError):
        return None


def _devtools_alive(port: int) -> bool:
    try:
        status, _ = _request_text(f"http://127.0.0.1:{port}/json/version", timeout=0.8)
        return status == 200
    except Exception:
        return False


def _wait_for_app_window(process: subprocess.Popen, profile_dir: Path, url: str) -> None:
    devtools_port: int | None = None
    discovery_deadline = time.monotonic() + 12
    while time.monotonic() < discovery_deadline:
        devtools_port = _read_devtools_port(profile_dir)
        if devtools_port and _devtools_alive(devtools_port):
            break
        if not _looks_like_aura(url):
            return
        time.sleep(0.2)

    if devtools_port:
        while _devtools_alive(devtools_port):
            if not _looks_like_aura(url):
                break
            time.sleep(0.8)
        return

    while _looks_like_aura(url):
        if process.poll() is None:
            time.sleep(0.8)
            continue
        # Chromium peut transferer la fenetre vers un autre processus. Tant que
        # le dashboard repond, ne pas tuer le backend sur la seule fin du PID bootstrap.
        time.sleep(0.8)


def _launch_chromium_app(url: str) -> bool:
    candidates = _browser_candidates()
    if not candidates:
        return False

    profile_dir = Path(tempfile.mkdtemp(prefix="AuraLiveBrowser-"))
    args = [
        str(candidates[0]),
        f"--app={url}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-mode",
        "--disable-features=msEdgeFirstRunExperience",
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=0",
        "--window-size=1480,920",
    ]
    process: subprocess.Popen | None = None
    try:
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _wait_for_app_window(process, profile_dir, url)
        return True
    except OSError:
        return False
    finally:
        try:
            shutil.rmtree(profile_dir, ignore_errors=True)
        except OSError:
            pass


def _message_box(message: str, title: str = "Aura Live") -> None:
    try:
        ctypes.windll.user32.MessageBoxW(None, str(message), str(title), 0x10)
    except Exception:
        print(f"{title}: {message}", file=sys.stderr)


def main() -> int:
    try:
        url = _start_backend()
    except Exception as exc:
        logger.exception("Aura Live desktop startup failed")
        _message_box(str(exc))
        return 1

    try:
        if not _launch_chromium_app(url):
            webbrowser.open(url)
            while _looks_like_aura(url):
                time.sleep(1.0)
        return 0
    finally:
        _stop_backend()


if __name__ == "__main__":
    raise SystemExit(main())
