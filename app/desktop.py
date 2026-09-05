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

    The packaged Windows app now uses PyInstaller's console bootloader with the
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
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=0",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-mode",
        "--disable-features=msEdgeFirstRunExperience",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=1480,920",
    ]
    creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
    process = subprocess.Popen(args, creationflags=creationflags)
    return process, profile_root


def _read_devtools_port(profile_root: Path) -> int | None:
    marker = profile_root / "DevToolsActivePort"
    try:
        if not marker.is_file():
            return None
        first_line = marker.read_text(encoding="utf-8", errors="ignore").splitlines()[0].strip()
        port = int(first_line)
        return port if 0 < port < 65536 else None
    except (OSError, ValueError, IndexError):
        return None


def _wait_for_app_window(profile_root: Path, process: subprocess.Popen[bytes]) -> None:
    """Keep Aura alive for the actual Chromium profile, not only its launcher PID."""

    deadline = time.monotonic() + 15.0
    devtools_port: int | None = None
    while time.monotonic() < deadline:
        devtools_port = _read_devtools_port(profile_root)
        if devtools_port is not None:
            break
        if _owns_server and _server_thread is not None and not _server_thread.is_alive():
            raise RuntimeError("Le moteur Aura Live s'est arrete pendant l'ouverture de la fenetre.")
        time.sleep(0.2)

    if devtools_port is None:
        logger.warning("Suivi Chromium avance indisponible; maintien du moteur Aura Live en mode securise.")
        while _looks_like_aura(_dashboard_url()):
            if _owns_server and _server_thread is not None and not _server_thread.is_alive():
                return
            time.sleep(2.0)
        return

    logger.info("Fenetre Aura Live suivie via Chromium sur le port local %s", devtools_port)
    while True:
        if _owns_server and _server_thread is not None and not _server_thread.is_alive():
            return
        if not _port_is_busy("127.0.0.1", devtools_port):
            return
        time.sleep(0.75)


def _show_error(message: str) -> None:
    logger.error(message)
    try:
        if _stdio_sink is not None:
            _stdio_sink.write(f"ERROR: {message}\n")
            _stdio_sink.flush()
    except Exception:
        pass
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
        _wait_for_app_window(profile_root, browser_process)
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
