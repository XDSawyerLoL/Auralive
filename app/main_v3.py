from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import Body, HTTPException

from app.main_v2 import app, aura, db, response_sync, settings, voice_input
from app.services.voice_identity_lock import install_voice_identity_lock
from app.services.voice_realtime import install_voice_realtime

logger = logging.getLogger("aura-live-v3")

install_voice_identity_lock(aura)
voice_realtime = install_voice_realtime(aura, db, voice_input)
app.version = "2.5.0-alpha"


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


_remove_route("/api/voice/status", "GET")


@app.get("/api/voice/status")
async def voice_control_status_v3() -> dict[str, Any]:
    return {
        **voice_input.diagnostic(),
        "realtime": voice_realtime.diagnostic(),
        "avatar_connected": aura.overlay.count("avatar") > 0,
        "audio": aura.avatar_audio.diagnostic(),
        "response_sync": response_sync.diagnostic(),
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
