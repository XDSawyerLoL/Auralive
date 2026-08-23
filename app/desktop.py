from __future__ import annotations

import html
import logging
import os
import socket
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from typing import Any

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


def _loading_html() -> str:
    return """
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aura Live</title>
<style>
html,body{height:100%;margin:0;background:#071019;color:#f3f7fb;font-family:Segoe UI,system-ui,sans-serif}
body{display:grid;place-items:center;overflow:hidden}
.shell{width:min(620px,84vw);padding:42px;border:1px solid rgba(115,223,255,.18);border-radius:28px;background:linear-gradient(145deg,rgba(14,31,46,.96),rgba(6,14,22,.96));box-shadow:0 32px 90px rgba(0,0,0,.45)}
.brand{font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:#77dfff;margin-bottom:12px}.title{font-size:40px;font-weight:750;letter-spacing:-.04em}.sub{margin-top:10px;color:#9fb1c2;line-height:1.55}.bar{height:5px;border-radius:99px;background:#142737;overflow:hidden;margin-top:28px}.bar:after{content:"";display:block;height:100%;width:38%;border-radius:99px;background:#78e4ff;animation:move 1.2s ease-in-out infinite}@keyframes move{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}
</style>
</head>
<body><main class="shell"><div class="brand">Mairaiy system</div><div class="title">Aura Live</div><div class="sub">Demarrage du moteur Twitch, de l'IA et du tableau de bord...</div><div class="bar"></div></main></body>
</html>
"""


def _error_html(exc: BaseException) -> str:
    message = html.escape(str(exc) or exc.__class__.__name__)
    return f"""
<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Aura Live</title>
<style>html,body{{height:100%;margin:0;background:#0b1118;color:#f4f7fa;font-family:Segoe UI,system-ui,sans-serif}}body{{display:grid;place-items:center}}main{{width:min(720px,84vw);padding:38px;border-radius:24px;background:#121d28;border:1px solid #2c4052}}h1{{margin:0 0 12px;font-size:30px}}p{{color:#b8c6d1;line-height:1.6}}code{{display:block;white-space:pre-wrap;padding:16px;border-radius:14px;background:#091018;color:#ffb2b2}}</style></head>
<body><main><h1>Aura Live n'a pas pu demarrer</h1><p>Le portail n'est pas perdu : le moteur local a rencontre un probleme au lancement.</p><code>{message}</code><p>Tu peux fermer cette fenetre, corriger le probleme puis relancer Aura Live.</p></main></body></html>
"""


def _boot_window(window: Any) -> None:
    try:
        _start_backend()
        _wait_until_ready()
        window.load_url(_dashboard_url())
    except Exception as exc:
        logger.exception("Demarrage desktop Aura Live impossible")
        try:
            window.load_html(_error_html(exc))
        except Exception:
            pass


def run_desktop() -> None:
    os.environ.setdefault("PYWEBVIEW_GUI", "edgechromium")

    try:
        import webview
    except Exception:
        # Secours pour une installation source incomplete : le portail reste accessible.
        _start_backend()
        _wait_until_ready()
        webbrowser.open(_dashboard_url())
        try:
            while _server_thread is not None and _server_thread.is_alive():
                time.sleep(0.5)
        except KeyboardInterrupt:
            pass
        finally:
            _stop_backend()
        return

    window = webview.create_window(
        "Aura Live",
        html=_loading_html(),
        width=1480,
        height=920,
        min_size=(1080, 700),
        resizable=True,
    )
    window.events.closed += lambda: _stop_backend()
    webview.start(_boot_window, window, debug=False)
    _stop_backend()


if __name__ == "__main__":
    run_desktop()
