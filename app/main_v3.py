from __future__ import annotations

import asyncio
import json
import logging
import os
import webbrowser
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import Body, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse

from app.config import BASE_DIR, RUNTIME_DIR
from app.main_v2 import app, aura, db, response_sync, settings, voice_input
from app.services.native_broadcast import NativeBroadcastService
from app.services.update_manager import update_manager
from app.services.voice_identity_lock import install_voice_identity_lock
from app.services.voice_realtime import install_voice_realtime

logger = logging.getLogger("aura-live-v3")

install_voice_identity_lock(aura)
voice_realtime = install_voice_realtime(aura, db, voice_input)
native_broadcast = NativeBroadcastService(settings)


async def _native_overlay_audio_listener(event: dict[str, Any]) -> None:
    if (
        not native_broadcast.selected
        or not native_broadcast.audio_bus_active()
        or not isinstance(event, dict)
    ):
        return

    event_type = str(event.get("type") or "").strip().lower()
    wants_voice = (
        event_type in {"tts", "avatar_voice", "aura_message", "avatar_test"}
        and event.get("speak", True) is not False
    )

    if wants_voice and not str(event.get("audio_url") or "").strip():
        text = " ".join(str(event.get("text") or event.get("message") or "").split()).strip()
        if text:
            try:
                audio_url = await aura.avatar_audio.synthesize(
                    text,
                    voice=str(event.get("voice") or ""),
                    rate=float(event.get("rate", 1.0) or 1.0),
                    pitch=float(event.get("pitch", 1.0) or 1.0),
                    volume=float(event.get("volume", 1.0) or 1.0),
                    context="native-broadcast",
                )
                if audio_url:
                    event["audio_url"] = audio_url
                    event["audio_engine"] = str(aura.avatar_audio.last_engine or "")
            except Exception as exc:  # noqa: BLE001
                logger.warning("Synthèse audio native non bloquante impossible: %s", exc)

    native_broadcast.enqueue_overlay_audio(event)


aura.overlay.subscribe(_native_overlay_audio_listener)
app.version = "2.7.3"


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
        raise RuntimeError("Impossible de lire la configuration locale Quantic Studio") from exc

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
        output.append("# Configuration enregistree depuis Quantic Studio")
        for key, value in remaining.items():
            output.append(f"{key}={value}")

    temporary = env_path.with_name(".env.aura-tmp")
    try:
        temporary.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")
        os.replace(temporary, env_path)
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        raise RuntimeError("Impossible d'enregistrer la configuration locale Quantic Studio") from exc


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


@app.get("/api/broadcast/status")
async def broadcast_status_v3() -> dict[str, Any]:
    native = await asyncio.to_thread(native_broadcast.status)
    engine = dict(native.get("engine") or {})
    return {
        **native,
        "backend": "native",
        "streaming": bool(engine.get("streaming")),
        "recording": bool(engine.get("recording")),
        "preview": bool(engine.get("preview")),
        "replay_buffering": bool(engine.get("replay_buffering")),
        "replay_seconds": int(engine.get("replay_seconds") or 30),
        "last_replay_file": str(engine.get("last_replay_file") or ""),
        "transition": str(engine.get("transition") or "fade"),
        "transition_ms": int(engine.get("transition_ms") or 350),
        "multistream_outputs": int(engine.get("multistream_outputs") or 0),
        "scene": str(engine.get("scene") or ""),
        "scenes": list(engine.get("scenes") or []),
        "sources": list(engine.get("sources") or []),
        "encoder": str(engine.get("encoder") or ""),
        "ffmpeg_ok": bool(engine.get("ffmpeg_ok")),
    }


@app.post("/api/broadcast/mode/{mode}")
async def broadcast_mode_v3(mode: str) -> dict[str, Any]:
    # Route conservée pour les anciens clients 2.7.x : tout mode demandé
    # converge désormais vers Quantic Studio Core.
    _write_runtime_env({
        "AURA_BROADCAST_ENGINE": "native",
        "OBS_ENABLED": "false",
        "OBS_AUTO_CONNECT": "false",
    })
    os.environ["AURA_BROADCAST_ENGINE"] = "native"
    os.environ["OBS_ENABLED"] = "false"
    os.environ["OBS_AUTO_CONNECT"] = "false"
    settings.broadcast_engine = "native"
    settings.obs_enabled = False
    return await asyncio.to_thread(native_broadcast.start)


@app.post("/api/broadcast/engine/start")
async def broadcast_engine_start_v3() -> dict[str, Any]:
    return await asyncio.to_thread(native_broadcast.start)


@app.post("/api/broadcast/engine/stop")
async def broadcast_engine_stop_v3() -> dict[str, Any]:
    return await asyncio.to_thread(native_broadcast.stop)


async def _broadcast_command(action: str, value: str | None = None) -> dict[str, Any]:
    result = await asyncio.to_thread(native_broadcast.command, action, value)
    if result.get("error") == "native_engine_missing":
        raise HTTPException(
            status_code=503,
            detail="Quantic Studio Core n'est pas encore compilé ou installé.",
        )
    return await broadcast_status_v3()


@app.post("/api/broadcast/stream/start")
async def broadcast_stream_start_v3() -> dict[str, Any]:
    return await _broadcast_command("stream.start")


@app.post("/api/broadcast/stream/stop")
async def broadcast_stream_stop_v3() -> dict[str, Any]:
    return await _broadcast_command("stream.stop")


@app.post("/api/broadcast/record/start")
async def broadcast_record_start_v3() -> dict[str, Any]:
    return await _broadcast_command("record.start")


@app.post("/api/broadcast/record/stop")
async def broadcast_record_stop_v3() -> dict[str, Any]:
    return await _broadcast_command("record.stop")


@app.post("/api/broadcast/replay/start")
async def broadcast_replay_start_v3(
    payload: dict[str, Any] | None = Body(default=None),
) -> dict[str, Any]:
    payload = payload or {}
    try:
        seconds = max(10, min(300, int(payload.get("seconds", 30))))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Durée de replay invalide") from exc
    return await _broadcast_command("replay.start", json.dumps({"seconds": seconds}, separators=(",", ":")))


@app.post("/api/broadcast/replay/stop")
async def broadcast_replay_stop_v3() -> dict[str, Any]:
    return await _broadcast_command("replay.stop")


@app.post("/api/broadcast/replay/save")
async def broadcast_replay_save_v3() -> dict[str, Any]:
    return await _broadcast_command("replay.save")


@app.post("/api/broadcast/preview/start")
async def broadcast_preview_start_v3() -> dict[str, Any]:
    return await _broadcast_command("preview.start")


@app.get("/api/broadcast/system-audio.pcm")
async def broadcast_system_audio_pcm_v3() -> StreamingResponse:
    async def pcm_stream():
        while True:
            try:
                chunk = await asyncio.to_thread(native_broadcast.system_audio_chunk, 19200)
                yield chunk
                await asyncio.sleep(0.10)
            except asyncio.CancelledError:
                raise

    return StreamingResponse(
        pcm_stream(),
        media_type="application/octet-stream",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@app.get("/api/broadcast/audio.pcm")
async def broadcast_native_audio_pcm_v3() -> StreamingResponse:
    async def pcm_stream():
        while True:
            try:
                chunk = await asyncio.to_thread(native_broadcast.native_audio_chunk, 19200)
                yield chunk
                await asyncio.sleep(0.10)
            except asyncio.CancelledError:
                raise

    return StreamingResponse(
        pcm_stream(),
        media_type="application/octet-stream",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@app.get("/api/broadcast/preview.mjpeg")
async def broadcast_preview_mjpeg_v3() -> StreamingResponse:
    async def frames():
        boundary = b"--frame\r\n"
        last_mtime = 0
        while True:
            try:
                stat = native_broadcast.preview_path.stat()
                mtime = stat.st_mtime_ns
                if mtime != last_mtime:
                    payload = await asyncio.to_thread(native_broadcast.preview_path.read_bytes)
                    if payload.startswith(b"\xff\xd8") and payload.endswith(b"\xff\xd9"):
                        last_mtime = mtime
                        yield (
                            boundary
                            + b"Content-Type: image/jpeg\r\n"
                            + f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii")
                            + payload
                            + b"\r\n"
                        )
                await asyncio.sleep(0.06)
            except asyncio.CancelledError:
                raise
            except OSError:
                await asyncio.sleep(0.10)

    return StreamingResponse(
        frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@app.post("/api/broadcast/preview/stop")
async def broadcast_preview_stop_v3() -> dict[str, Any]:
    return await _broadcast_command("preview.stop")


@app.get("/api/broadcast/discover")
async def broadcast_discover_v3() -> dict[str, Any]:
    return await asyncio.to_thread(native_broadcast.discover_sources)


@app.post("/api/broadcast/pick-image")
async def broadcast_pick_image_v3() -> dict[str, Any]:
    path = await asyncio.to_thread(native_broadcast.pick_image)
    return {"ok": bool(path), "path": path}


@app.get("/api/broadcast/browser-source/{source_id}.mjpeg")
async def broadcast_browser_source_mjpeg_v3(source_id: int) -> StreamingResponse:
    if source_id <= 0:
        raise HTTPException(status_code=404, detail="Source inconnue")

    async def frames():
        boundary = b"--frame\r\n"
        while True:
            try:
                frame = await asyncio.to_thread(native_broadcast.browser_frame, source_id)
                if frame:
                    yield (
                        boundary
                        + b"Content-Type: image/jpeg\r\n"
                        + f"Content-Length: {len(frame)}\r\n\r\n".encode("ascii")
                        + frame
                        + b"\r\n"
                    )
                await asyncio.sleep(0.075)
            except asyncio.CancelledError:
                raise

    return StreamingResponse(
        frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


async def _ensure_native_source_editable() -> dict[str, Any]:
    return await broadcast_status_v3()


@app.get("/api/broadcast/output")
async def broadcast_output_settings_v3() -> dict[str, Any]:
    return await asyncio.to_thread(native_broadcast.output_configuration)


@app.put("/api/broadcast/output")
async def broadcast_output_settings_update_v3(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    state = await broadcast_status_v3()
    if state.get("streaming") or state.get("recording"):
        raise HTTPException(
            status_code=409,
            detail="Arrête le direct et l'enregistrement avant de modifier la destination RTMP",
        )

    rtmp_url = str(payload.get("rtmp_url") or "").strip()
    stream_key_raw = payload.get("stream_key")
    stream_key = None if stream_key_raw is None else str(stream_key_raw).strip()
    clear_stream_key = bool(payload.get("clear_stream_key", False))

    try:
        result = await asyncio.to_thread(
            native_broadcast.configure_output,
            rtmp_url,
            stream_key,
            clear_stream_key=clear_stream_key,
            destinations=payload.get("destinations"),
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        **result,
        "engine": (await broadcast_status_v3()).get("engine", {}),
    }


@app.put("/api/broadcast/audio")
async def broadcast_audio_mix_v3(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    def gain(name: str, default: float) -> float:
        try:
            return max(0.0, min(2.0, float(payload.get(name, default))))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"Valeur audio {name} invalide") from exc

    state = await broadcast_status_v3()
    engine = dict(state.get("engine") or {})
    value = {
        "mic_volume": gain("mic_volume", float(engine.get("mic_volume", 0.82) or 0.82)),
        "system_volume": gain("system_volume", float(engine.get("system_volume", 0.72) or 0.72)),
        "aura_volume": gain("aura_volume", float(engine.get("desktop_volume", 0.72) or 0.72)),
        "mic_muted": bool(payload.get("mic_muted", engine.get("mic_muted", False))),
        "system_muted": bool(payload.get("system_muted", engine.get("system_muted", False))),
        "aura_muted": bool(payload.get("aura_muted", engine.get("desktop_muted", False))),
    }
    return await _broadcast_command("audio.update", json.dumps(value, separators=(",", ":")))


@app.post("/api/broadcast/source")
async def broadcast_source_add_v3(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    state = await _ensure_native_source_editable()
    if len(list(state.get("sources") or [])) >= 24:
        raise HTTPException(status_code=422, detail="Maximum de 24 sources par scène")

    kind = str(payload.get("kind") or "").strip().lower()
    allowed = {"desktop", "window", "game", "webcam", "image", "text", "browser"}
    if kind not in allowed:
        raise HTTPException(status_code=422, detail="Type de source inconnu")
    if kind == "desktop" and any(str(source.get("kind") or "") == "Écran" for source in list(state.get("sources") or [])):
        raise HTTPException(status_code=409, detail="Cette scène possède déjà une capture d'écran")

    name = " ".join(str(payload.get("name") or "").split()).strip()[:120]
    target = str(payload.get("target") or "").strip()[:1000]
    if kind == "browser" and not target:
        target = "/overlay/avatar"
    if kind in {"window", "game", "webcam", "image"} and not target:
        raise HTTPException(status_code=422, detail="Cette source exige une cible")

    value = {"kind": kind, "name": name, "target": target}
    return await _broadcast_command("source.add", json.dumps(value, ensure_ascii=False, separators=(",", ":")))


@app.patch("/api/broadcast/source/{source_id}")
async def broadcast_source_configure_v3(source_id: int, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if source_id <= 0:
        raise HTTPException(status_code=422, detail="Source invalide")
    await _ensure_native_source_editable()

    value: dict[str, Any] = {"id": source_id}
    if "name" in payload:
        value["name"] = " ".join(str(payload.get("name") or "").split()).strip()[:120]
    if "target" in payload:
        value["target"] = str(payload.get("target") or "").strip()[:1000]
    return await _broadcast_command("source.configure", json.dumps(value, ensure_ascii=False, separators=(",", ":")))


@app.delete("/api/broadcast/source/{source_id}")
async def broadcast_source_remove_v3(source_id: int) -> dict[str, Any]:
    if source_id <= 0:
        raise HTTPException(status_code=422, detail="Source invalide")
    await _ensure_native_source_editable()
    return await _broadcast_command("source.remove", json.dumps({"id": source_id}, separators=(",", ":")))


@app.post("/api/broadcast/scene")
async def broadcast_scene_v3(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    scene = " ".join(str(payload.get("scene") or "").split()).strip()
    if not scene:
        raise HTTPException(status_code=422, detail="Nom de scène requis")
    return await _broadcast_command("scene.select", scene)


@app.post("/api/broadcast/scenes")
async def broadcast_scene_create_v3(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    state = await _ensure_native_source_editable()
    if len(list(state.get("scenes") or [])) >= 24:
        raise HTTPException(status_code=422, detail="Maximum de 24 scènes")
    name = " ".join(str(payload.get("name") or "").split()).strip()[:80]
    if not name:
        raise HTTPException(status_code=422, detail="Nom de scène requis")
    if any(str(scene).lower() == name.lower() for scene in list(state.get("scenes") or [])):
        raise HTTPException(status_code=409, detail="Une scène porte déjà ce nom")
    return await _broadcast_command("scene.create", json.dumps({"name": name}, ensure_ascii=False, separators=(",", ":")))


@app.patch("/api/broadcast/scenes/{scene_name}")
async def broadcast_scene_rename_v3(scene_name: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    await _ensure_native_source_editable()
    current = " ".join(str(scene_name or "").split()).strip()[:80]
    name = " ".join(str(payload.get("name") or "").split()).strip()[:80]
    if not current or not name:
        raise HTTPException(status_code=422, detail="Nom de scène requis")
    return await _broadcast_command(
        "scene.rename",
        json.dumps({"current": current, "name": name}, ensure_ascii=False, separators=(",", ":")),
    )


@app.delete("/api/broadcast/scenes/{scene_name}")
async def broadcast_scene_remove_v3(scene_name: str) -> dict[str, Any]:
    state = await _ensure_native_source_editable()
    name = " ".join(str(scene_name or "").split()).strip()[:80]
    if not name:
        raise HTTPException(status_code=422, detail="Nom de scène requis")
    if len(list(state.get("scenes") or [])) <= 1:
        raise HTTPException(status_code=409, detail="Aura doit conserver au moins une scène")
    return await _broadcast_command(
        "scene.remove",
        json.dumps({"name": name}, ensure_ascii=False, separators=(",", ":")),
    )


@app.put("/api/broadcast/transition")
async def broadcast_transition_v3(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    kind = str(payload.get("kind") or "fade").strip().lower()
    if kind not in {"cut", "fade"}:
        raise HTTPException(status_code=422, detail="Transition inconnue")
    try:
        duration_ms = max(80, min(3000, int(payload.get("duration_ms", 350))))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Durée de transition invalide") from exc
    return await _broadcast_command(
        "transition.update",
        json.dumps({"kind": kind, "duration_ms": duration_ms}, separators=(",", ":")),
    )


@app.put("/api/broadcast/source/{source_id}/transform")
async def broadcast_source_transform_v3(source_id: int, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if source_id <= 0:
        raise HTTPException(status_code=422, detail="Source invalide")
    def number(name: str, default: float) -> float:
        try:
            return float(payload.get(name, default))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"Valeur {name} invalide") from exc

    transform = {
        "id": source_id,
        "x": max(0.0, min(1.0, number("x", 0.0))),
        "y": max(0.0, min(1.0, number("y", 0.0))),
        "width": max(0.05, min(1.0, number("width", 1.0))),
        "height": max(0.05, min(1.0, number("height", 1.0))),
    }
    if transform["x"] + transform["width"] > 1.0:
        transform["x"] = max(0.0, 1.0 - transform["width"])
    if transform["y"] + transform["height"] > 1.0:
        transform["y"] = max(0.0, 1.0 - transform["height"])

    return await _broadcast_command("source.transform", json.dumps(transform, separators=(",", ":")))


@app.put("/api/broadcast/source/{source_id}/visibility")
async def broadcast_source_visibility_v3(source_id: int, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if source_id <= 0:
        raise HTTPException(status_code=422, detail="Source invalide")
    value = {"id": source_id, "visible": bool(payload.get("visible", True))}
    return await _broadcast_command("source.visibility", json.dumps(value, separators=(",", ":")))


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


@app.get("/api/update/status")
async def update_status_v3() -> dict[str, Any]:
    return update_manager.status()


@app.post("/api/update/check")
async def update_check_v3() -> dict[str, Any]:
    try:
        return await asyncio.to_thread(update_manager.check)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc) or "Vérification de mise à jour impossible") from exc


@app.post("/api/update/download")
async def update_download_v3() -> dict[str, Any]:
    try:
        return await asyncio.to_thread(update_manager.download)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc) or "Téléchargement de mise à jour impossible") from exc


@app.post("/api/update/install")
async def update_install_v3() -> dict[str, Any]:
    try:
        return await asyncio.to_thread(update_manager.install)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc) or "Installation de mise à jour impossible") from exc


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
        "<p>Cette fenêtre Quantic Studio peut rester ouverte.</p></body>"
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
        aura.overlay.subscribe(_native_overlay_audio_listener)
        kokoro_warmup = asyncio.create_task(_prewarm_kokoro(), name="kokoro-voice-warmup")
        if settings.broadcast_engine == "native" and settings.native_engine_autostart:
            try:
                await asyncio.to_thread(native_broadcast.start)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Démarrage Quantic Studio Core Broadcast non bloquant impossible: %s", exc)
        try:
            yield
        finally:
            if not kokoro_warmup.done():
                kokoro_warmup.cancel()
                try:
                    await kokoro_warmup
                except asyncio.CancelledError:
                    pass
            aura.overlay.unsubscribe(_native_overlay_audio_listener)
            await voice_realtime.close()
            await asyncio.to_thread(native_broadcast.close)


app.router.lifespan_context = _v3_lifespan


if __name__ == "__main__":
    uvicorn.run(
        "app.main_v3:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )
