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
    if status != 200:
        return False
    lowered = body.casefold()
    return "aura live" in lowered or "mairaiy" in lowered or "neural" in lowered


def _port_is_busy(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.35):
            return True
    except OSError:
        return False


def _start_backend() -> bool:
    global _server, _server_thread, _owns_server

    url = _dashboard_url()
    host = _dashboard_host()
    port = int(settings.port)

    if _looks_like_aura(url):
        logger.info("Une instance Aura Live est deja active sur %s", url)
        _owns_server = False
        return False

    if _port_is_busy(host, port):
        raise RuntimeError(
            f"Le port {port} est deja utilise par une autre application. "
            "Ferme l'application qui l'utilise ou change AURA_PORT dans .env."
        )

    config = uvicorn.Config(
        app,
        host=str(settings.host or "127.0.0.1"),
        port=port,
        log_level=str(settings.log_level or "INFO").lower(),
        access_log=False,
        log_config=None,
    )
    _server = uvicorn.Server(config)
    _server_thread = threading.Thread(
        target=_server.run,
        name="AuraLiveBackend",
        daemon=True,
    )
    _owns_server = True
    _server_thread.start()
    return True


def _wait_until_ready(timeout_seconds: float = 45.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    url = _dashboard_url()
    while time.monotonic() < deadline:
        if _looks_like_aura(url):
            return
        if _owns_server and _server_thread is not None and not _server_thread.is_alive():
            raise RuntimeError("Le moteur Aura Live s'est arrete pendant le demarrage.")
        time.sleep(0.25)
    raise RuntimeError(
        "Le moteur Aura Live ne repond pas. Verifie .env, Twitch, Ollama et les journaux de lancement."
    )


def _stop_backend() -> None:
    global _server
    if _owns_server and _server is not None:
        _server.should_exit = True
        if _server_thread is not None and _server_thread.is_alive():
            _server_thread.join(timeout=8)


def _browser_candidates() -> list[Path]:
    candidates: list[Path] = []
    for executable in ("msedge.exe", "chrome.exe"):
        resolved = shutil.which(executable)
        if resolved:
            candidates.append(Path(resolved))

    env_paths = [
        (os.environ.get("PROGRAMFILES(X86)"), "Microsoft/Edge/Application/msedge.exe"),
        (os.environ.get("PROGRAMFILES"), "Microsoft/Edge/Application/msedge.exe"),
        (os.environ.get("LOCALAPPDATA"), "Microsoft/Edge/Application/msedge.exe"),
        (os.environ.get("PROGRAMFILES"), "Google/Chrome/Application/chrome.exe"),
        (os.environ.get("PROGRAMFILES(X86)"), "Google/Chrome/Application/chrome.exe"),
        (os.environ.get("LOCALAPPDATA"), "Google/Chrome/Application/chrome.exe"),
    ]
    for base, relative in env_paths:
        if base:
            candidates.append(Path(base) / relative)

    seen: set[str] = set()
    result: list[Path] = []
    for candidate in candidates:
        key = str(candidate).casefold()
        if key not in seen and candidate.is_file():
            seen.add(key)
            result.append(candidate)
    return result


def _launch_app_window(url: str) -> tuple[subprocess.Popen[bytes], Path]:
    browsers = _browser_candidates()
    if not browsers:
        raise RuntimeError(
            "Microsoft Edge ou Google Chrome est requis pour afficher Aura Live. "
            "Edge est normalement deja installe avec Windows."
        )

    profile_root = Path(tempfile.mkdtemp(prefix="AuraLiveBrowser-"))
    args = [
        str(browsers[0]),
        f"--app={url}",
        f"--user-data-dir={profile_root}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-mode",
        "--disable-features=msEdgeFirstRunExperience",
        "--window-size=1480,920",
    ]
    creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
    process = subprocess.Popen(args, creationflags=creationflags)
    return process, profile_root


def _show_error(message: str) -> None:
    logger.error(message)
    if sys.platform == "win32":
        try:
            ctypes.windll.user32.MessageBoxW(0, message, "Aura Live - erreur", 0x10)
            return
        except Exception:
            pass
    try:
        webbrowser.open("data:text/plain," + message)
    except Exception:
        pass


def run_desktop() -> None:
    browser_process: subprocess.Popen[bytes] | None = None
    profile_root: Path | None = None
    try:
        _start_backend()
        _wait_until_ready()
        browser_process, profile_root = _launch_app_window(_dashboard_url())
        browser_process.wait()
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        logger.exception("Demarrage desktop Aura Live impossible")
        _show_error(str(exc) or exc.__class__.__name__)
    finally:
        if browser_process is not None and browser_process.poll() is None:
            try:
                browser_process.terminate()
            except Exception:
                pass
        _stop_backend()
        if profile_root is not None:
            try:
                shutil.rmtree(profile_root, ignore_errors=True)
            except Exception:
                pass


if __name__ == "__main__":
    run_desktop()
