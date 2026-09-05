from __future__ import annotations

import asyncio
import logging
import os
import webbrowser
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import Body, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import BASE_DIR, RUNTIME_DIR
from app.main_v2 import app, aura, db, response_sync, settings, voice_input
from app.services.voice_identity_lock import install_voice_identity_lock
from app.services.voice_realtime import install_voice_realtime

logger = logging.getLogger("aura-live-v3")

install_voice_identity_lock(aura)
voice_realtime = install_voice_realtime(aura, db, voice_input)
app.version = "2.5.2-alpha"


def _remove_route(path: str, method: str) -> None:
    wanted = method.upper()
    app.router.routes = [
        route
        for route in app.router.routes
        if not (
            getattr(route, "path", None) == path
            and wanted in set(getattr(route, "methods", set()) or set())
        )
    ]


def _write_runtime_env(values: dict[str, str]) -> None:
    """Met a jour le .env local sans exposer les secrets dans les logs."""
    env_path = RUNTIME_DIR / ".env"
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    except OSError as exc:
        raise RuntimeError("Impossible de lire la configuration locale Aura Live") from exc

    remaining = dict(values)
    output: list[str] = []
    for line in lines:
        stripped = line.strip()
        replaced = False
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in remaining:
                output.append(f"{key}={remaining.pop(key)}")
                replaced = True
        if not replaced:
            output.append(line)

    if remaining:
        if output and output[-1].strip():
            output.append("")
        output.append("# Configuration enregistree depuis Aura Live")
        for key, value in remaining.items():
            output.append(f"{key}={value}")

    temporary = env_path.with_name(".env.aura-tmp")
    try:
        temporary.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")
        os.replace(temporary, env_path)
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        raise RuntimeError("Impossible d'enregistrer la configuration locale Aura Live") from exc


def _open_external_url(url: str) -> bool:
    """Ouvre OAuth dans le navigateur Windows normal, jamais dans l'app Chromium Aura."""
    try:
        if os.name == "nt" and hasattr(os, "startfile"):
            os.startfile(url)  # type: ignore[attr-defined]
            return True
        return bool(webbrowser.open(url, new=2, autoraise=True))
    except Exception:
        logger.exception("Ouverture du navigateur système impossible")
        return False


_remove_route("/", "GET")
_remove_route("/api/voice/status", "GET")
_remove_route("/auth/twitch/{role}", "GET")
_remove_route("/api/avatar/test", "POST")


@app.get("/", response_class=HTMLResponse)
async def dashboard_v3() -> HTMLResponse:
    """Charge le correctif de test vocal après le studio historique."""
    path = BASE_DIR / "app" / "web" / "templates" / "index.html"
    content = path.read_text(encoding="utf-8")
    patch = '<script src="/static/avatar-test-fast.js?v=2.5.2"></script>'
    if patch not in content:
        content = content.replace("</body>", f"  {patch}\n</body>")
    response = HTMLResponse(content)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


@app.get("/api/voice/status")
async def voice_control_status_v3() -> dict[str, Any]:
    return {
        **voice_input.diagnostic(),
        "realtime": voice_realtime.diagnostic(),
        "avatar_connected": aura.overlay.count("avatar") > 0,
        "audio": aura.avatar_audio.diagnostic(),
        "response_sync": response_sync.diagnostic(),
        "local_voice_mode": True,
        "gemini_required": False,
    }


@app.post("/api/voice/text")
async def voice_control_text(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        return await voice_realtime.talk_text(
            str(payload.get("transcript") or ""),
            send_to_chat=bool(payload.get("send_to_chat", False)),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Dialogue vocal temps réel en erreur")
        raise HTTPException(status_code=503, detail=str(exc) or exc.__class__.__name__) from exc


@app.post("/api/avatar/test")
async def avatar_test_v3(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Teste réellement la voix locale sans exiger OBS ni l'overlay avatar."""
    text = " ".join(str(payload.get("text") or "Bonjour, je suis Mairaiy.").split()).strip()[:430]
    if not text:
        raise HTTPException(status_code=422, detail="Texte vocal vide")
    voice = str(await db.get_setting("avatar.voice", "") or "")
    rate = float(await db.get_setting("avatar.rate", 1.0) or 1.0)
    pitch = float(await db.get_setting("avatar.pitch", 1.0) or 1.0)
    volume = float(await db.get_setting("avatar.volume", 1.0) or 1.0)
    audio_url = await aura.avatar_audio.synthesize(
        text,
        voice=voice,
        rate=rate,
        pitch=pitch,
        volume=volume,
        context="test",
    )
    if not audio_url:
        raise HTTPException(
            status_code=503,
            detail=str(aura.avatar_audio.last_error or "La voix locale n'a pas pu être générée"),
        )
    return {
        "ok": True,
        "audio_url": audio_url,
        "engine": str(aura.avatar_audio.last_engine or ""),
        "voice": str(aura.avatar_audio.last_voice or voice),
        "generation_ms": int(aura.avatar_audio.last_duration_ms or 0),
        "audio_duration_ms": int(aura.avatar_audio.last_audio_duration_ms or 0),
        "overlay_required": False,
    }


@app.get("/setup", response_class=HTMLResponse)
async def local_setup_page() -> HTMLResponse:
    path = BASE_DIR / "app" / "web" / "templates" / "setup.html"
    response = HTMLResponse(path.read_text(encoding="utf-8"))
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


@app.get("/api/setup/status")
async def local_setup_status() -> dict[str, Any]:
    kokoro = getattr(aura, "local_kokoro_voice", None)
    return {
        "ok": True,
        "twitch_configured": bool(settings.twitch_configured),
        "twitch_client_id_present": bool(settings.twitch_client_id),
        "twitch_secret_present": bool(settings.twitch_client_secret),
        "kokoro": kokoro.diagnostic() if kokoro is not None else {"enabled": False, "ready": False},
        "gemini_required": False,
    }


@app.post("/api/setup/twitch")
async def local_setup_twitch(
    request: Request,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    client_host = str(request.client.host if request.client else "")
    if client_host not in {"127.0.0.1", "::1", "localhost"}:
        raise HTTPException(status_code=403, detail="Configuration disponible uniquement depuis ce PC")

    client_id = str(payload.get("client_id") or "").strip()
    client_secret = str(payload.get("client_secret") or "").strip()
    if not client_id or not client_secret:
        raise HTTPException(status_code=422, detail="Le Client ID et le Client Secret Twitch sont requis")
    if len(client_id) > 200 or len(client_secret) > 300:
        raise HTTPException(status_code=422, detail="Identifiants Twitch invalides")
    if any(char in client_id + client_secret for char in ("\r", "\n")):
        raise HTTPException(status_code=422, detail="Identifiants Twitch invalides")

    _write_runtime_env(
        {
            "TWITCH_CLIENT_ID": client_id,
            "TWITCH_CLIENT_SECRET": client_secret,
        }
    )
    os.environ["TWITCH_CLIENT_ID"] = client_id
    os.environ["TWITCH_CLIENT_SECRET"] = client_secret
    settings.twitch_client_id = client_id
    settings.twitch_client_secret = client_secret

    return {
        "ok": True,
        "twitch_configured": bool(settings.twitch_configured),
        "saved_locally": True,
    }


@app.get("/auth/twitch/{role}", response_class=HTMLResponse)
async def twitch_auth_v3(role: str, request: Request) -> HTMLResponse:
    if role not in {"bot", "broadcaster"}:
        raise HTTPException(status_code=404, detail="Rôle Twitch inconnu")
    if not settings.twitch_configured:
        return RedirectResponse(url=f"/setup?role={role}", status_code=302)
    try:
        url = await aura.twitch.build_auth_url(role)
    except Exception as exc:
        logger.warning("Preparation OAuth Twitch impossible: %s", exc)
        return RedirectResponse(url=f"/setup?role={role}", status_code=302)

    client_host = str(request.client.host if request.client else "")
    if client_host not in {"127.0.0.1", "::1", "localhost"}:
        raise HTTPException(status_code=403, detail="Connexion Twitch disponible uniquement depuis ce PC")

    opened = await asyncio.to_thread(_open_external_url, url)
    if not opened:
        return HTMLResponse(
            "<h1>Impossible d'ouvrir le navigateur système</h1>"
            f"<p><a href=\"{url}\" target=\"_blank\" rel=\"noreferrer\">Ouvrir Twitch manuellement</a></p>",
            status_code=503,
        )
    account = "mairaiy" if role == "bot" else "SANSAHD"
    return HTMLResponse(
        "<!doctype html><meta charset='utf-8'><title>Twitch</title>"
        "<body style=\"font-family:Segoe UI,sans-serif;background:#080b12;color:#eef3ff;padding:40px\">"
        f"<h1>Connexion {account} ouverte</h1>"
        "<p>Twitch s'est ouvert dans ton navigateur Windows normal. Termine l'autorisation là-bas.</p>"
        "<p>Cette fenêtre Aura Live peut rester ouverte.</p></body>"
    )


_original_v3_lifespan = app.router.lifespan_context


async def _prewarm_kokoro() -> None:
    voice = getattr(aura, "local_kokoro_voice", None)
    if voice is None or not getattr(voice, "enabled", False):
        return
    try:
        ready = await voice.ensure_ready()
        if ready:
            logger.info("Voix Kokoro locale prete: %s", voice.voice_name)
        else:
            logger.warning("Voix Kokoro locale indisponible: %s", voice.last_error)
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("Prechargement Kokoro non bloquant impossible: %s", exc)


@asynccontextmanager
async def _v3_lifespan(application):
    async with _original_v3_lifespan(application):
        kokoro_warmup = asyncio.create_task(_prewarm_kokoro(), name="kokoro-voice-warmup")
        try:
            yield
        finally:
            if not kokoro_warmup.done():
                kokoro_warmup.cancel()
                try:
                    await kokoro_warmup
                except asyncio.CancelledError:
                    pass
            await voice_realtime.close()


app.router.lifespan_context = _v3_lifespan


if __name__ == "__main__":
    uvicorn.run(
        "app.main_v3:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )
