from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import Body, HTTPException, Request
from fastapi.responses import HTMLResponse

from app.automation.pro_nodes import (
    automation_replaces_legacy,
    install_pro_nodes,
)
from app.automation.resilience_nodes import install_resilience_nodes
from app.automation.routes import build_automation_router
from app.automation.runtime import AutomationStudioRuntime
from app.config import BASE_DIR, settings
from app.main import app, aura, db
from app.services.avatar_audio import install_avatar_audio
from app.services.cohost import install_cohost
from app.services.eventsub_compat import install_eventsub_compat
from app.services.gemini_provider import install_gemini_provider
from app.services.oauth_resilience import install_oauth_resilience
from app.services.response_sync import install_response_sync
from app.services.tts_budget import install_tts_budget
from app.services.voice_input import install_voice_input

logger = logging.getLogger("aura-live-v2")
install_gemini_provider(aura.ai)
install_eventsub_compat(aura.twitch)
install_oauth_resilience(aura.twitch)
install_avatar_audio(aura)
install_tts_budget(aura.avatar_audio)
cohost = install_cohost(aura, db, settings)
response_sync = install_response_sync(aura, cohost)
voice_input = install_voice_input(aura, db, cohost, settings)
automation = AutomationStudioRuntime(aura, db, settings)
install_pro_nodes(automation.registry)
install_resilience_nodes(automation.registry)
automation.engine.set_service("moderation", aura.moderation)
automation.engine.set_service("cohost", cohost)
automation.engine.set_service("voice_input", voice_input)
_original_lifespan = app.router.lifespan_context
_original_twitch_handler = aura.handle_twitch_event


async def _run_historical_support_without_default_response(
    event_type: str, event: dict[str, Any]
) -> None:
    """Conserve sécurité, Streamathon et intégrations sans doubler le message public."""
    await db.log_event(event_type, event)
    if event_type != "channel.chat.message":
        await aura.power.on_twitch_event(event_type, event)
        await aura.complete.on_twitch_event(event_type, event)


async def _block_commercial_spam(event: dict[str, Any]) -> bool:
    user_id = str(event.get("chatter_user_id") or event.get("user_id") or "")
    display_name = str(
        event.get("chatter_user_name")
        or event.get("user_name")
        or event.get("chatter_user_login")
        or "compte suspect"
    )
    message = event.get("message") or {}
    text = str(message.get("text", "") if isinstance(message, dict) else message)
    badges = list(event.get("badges") or [])
    is_broadcaster = any(
        str((badge or {}).get("set_id", "")) == "broadcaster"
        for badge in badges
    )
    if not user_id or not text:
        return False

    decision = await aura.moderation.commercial_spam_decision(
        user_id,
        text,
        badges,
        is_broadcaster,
    )
    if not decision.blocked:
        return False

    message_id = str(event.get("message_id") or "")
    if message_id:
        try:
            await aura.twitch.delete_message(message_id)
        except Exception:
            logger.debug("Suppression du spam impossible", exc_info=True)

    action = str(
        await db.get_setting("moderation.commercial_spam.action", "ban")
    ).casefold()
    applied_action = "ban"
    try:
        if action == "ban":
            await aura.twitch.request(
                "POST",
                "/moderation/bans",
                role="bot",
                params={
                    "broadcaster_id": aura.twitch.broadcaster_user_id,
                    "moderator_id": aura.twitch.bot_user_id,
                },
                json_body={
                    "data": {
                        "user_id": user_id,
                        "reason": decision.reason[:500],
                    }
                },
            )
        else:
            applied_action = "timeout"
            await aura.twitch.timeout_user(
                user_id,
                decision.timeout_seconds,
                decision.reason,
            )
    except Exception:
        logger.warning(
            "Bannissement automatique impossible pour %s, bascule en timeout",
            display_name,
            exc_info=True,
        )
        applied_action = "timeout"
        try:
            await aura.twitch.timeout_user(
                user_id,
                decision.timeout_seconds,
                decision.reason,
            )
        except Exception:
            logger.exception("Sanction Twitch impossible pour %s", display_name)
            applied_action = "suppression"

    await aura.studio.log_moderation(
        user_id,
        display_name,
        decision.reason,
        applied_action,
        text,
    )
    logger.warning(
        "Spam commercial bloqué silencieusement: viewer=%s action=%s signature=%s",
        display_name,
        applied_action,
        decision.fingerprint,
    )
    return True


async def _combined_twitch_handler(event_type: str, event: dict[str, Any]) -> None:
    if event_type == "channel.chat.message":
        try:
            if await _block_commercial_spam(event):
                return
        except Exception:
            logger.exception("Préfiltre anti-faux-viewers en erreur")

    try:
        await cohost.observe_event(event_type, event)
    except Exception:
        logger.exception("Le contexte de coanimation n'a pas pu observer %s", event_type)

    reports: list[dict[str, Any]] = []
    try:
        reports = await automation.dispatch(event_type, event, source="twitch")
    except Exception:
        logger.exception("Automation Studio n’a pas pu traiter %s", event_type)

    if automation_replaces_legacy(event_type, reports):
        try:
            await _run_historical_support_without_default_response(event_type, event)
        except Exception:
            logger.exception("Les services historiques annexes ont échoué pour %s", event_type)
        return

    await _original_twitch_handler(event_type, event)


aura.twitch.handler = _combined_twitch_handler


async def _migrate_youthful_voice_preset() -> None:
    """Applique le nouveau preset uniquement aux anciennes valeurs standard."""
    current_voice = str(await db.get_setting("avatar.voice", "") or "").strip()
    if current_voice.casefold() in {"", "aoede", "laomedeia"}:
        await db.set_setting("avatar.voice", "Leda")
    try:
        current_rate = float(await db.get_setting("avatar.rate", 1.0))
    except (TypeError, ValueError):
        current_rate = 1.0
    try:
        current_pitch = float(await db.get_setting("avatar.pitch", 1.0))
    except (TypeError, ValueError):
        current_pitch = 1.0
    if current_rate <= 1.10:
        await db.set_setting("avatar.rate", 1.12)
    if current_pitch <= 1.08:
        await db.set_setting("avatar.pitch", 1.14)


@asynccontextmanager
async def _v2_lifespan(application):
    async with _original_lifespan(application):
        await automation.initialize()
        await cohost.start()
        await _migrate_youthful_voice_preset()
        await automation.dispatch(
            "aura.started",
            {"version": "2.1.0-alpha", "stream_online": aura.stream_online},
            source="system",
        )
        try:
            yield
        finally:
            try:
                await automation.dispatch(
                    "aura.stopping",
                    {"version": "2.1.0-alpha", "stream_online": aura.stream_online},
                    source="system",
                )
            finally:
                await cohost.close()
                await automation.close()


app.router.lifespan_context = _v2_lifespan
app.include_router(build_automation_router(automation))
app.version = "2.1.0-alpha"


@app.get("/api/ai/runtime")
async def ai_runtime_diagnostic() -> dict[str, Any]:
    return aura.ai.diagnostic()


@app.post("/api/ai/recover")
async def ai_runtime_recover() -> dict[str, Any]:
    try:
        return await aura.ai.recover()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc) or exc.__class__.__name__) from exc


@app.get("/api/avatar/runtime")
async def avatar_runtime_diagnostic() -> dict[str, Any]:
    return {
        "enabled": bool(await db.get_setting("avatar.enabled", True)),
        "avatar_overlay_connected": aura.overlay.count("avatar") > 0,
        "overlay_clients": aura.overlay.summary(),
        "audio": aura.avatar_audio.diagnostic(),
        "response_sync": response_sync.diagnostic(),
        "visibility": "speaking-only",
        "obs_instruction": "Active Contrôler l’audio via OBS sur la source /overlay/avatar.",
    }


@app.get("/voice-control", response_class=HTMLResponse)
async def voice_control_page() -> HTMLResponse:
    path = BASE_DIR / "app" / "web" / "templates" / "voice_control.html"
    return HTMLResponse(path.read_text(encoding="utf-8"))


@app.get("/api/voice/status")
async def voice_control_status() -> dict[str, Any]:
    return {
        **voice_input.diagnostic(),
        "avatar_connected": aura.overlay.count("avatar") > 0,
        "response_sync": response_sync.diagnostic(),
    }


@app.post("/api/voice/talk")
async def voice_control_talk(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        return await voice_input.talk(
            str(payload.get("audio_base64") or ""),
            str(payload.get("mime_type") or "audio/wav"),
            send_to_chat=bool(payload.get("send_to_chat", False)),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Dialogue vocal en erreur")
        raise HTTPException(status_code=503, detail=str(exc) or exc.__class__.__name__) from exc


@app.get("/api/cohost/status")
async def cohost_status() -> dict[str, Any]:
    return await cohost.status()


@app.get("/api/cohost/profile")
async def cohost_profile() -> dict[str, Any]:
    return cohost.profile


@app.put("/api/cohost/profile")
async def cohost_profile_update(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        return await cohost.save_profile(payload)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/cohost/context/refresh")
async def cohost_context_refresh() -> dict[str, Any]:
    await cohost.refresh_live_context(force=True)
    return cohost.current_context()


@app.post("/api/cohost/screen/analyze")
async def cohost_screen_analyze() -> dict[str, Any]:
    return await cohost.analyze_screen(force=True)


@app.post("/api/cohost/session/reset")
async def cohost_session_reset() -> dict[str, Any]:
    cohost.reset_session()
    return await cohost.status()


@app.post("/api/cohost/test/initiative")
async def cohost_test_initiative(
    payload: dict[str, Any] = Body(default_factory=dict),
) -> dict[str, Any]:
    text = await cohost.generate_initiative(force=True)
    published = False
    if bool(payload.get("publish", False)) and text:
        published = await cohost._publish(text, kind="initiative:test")
    return {"text": text, "published": published}


@app.post("/api/cohost/test/cta")
async def cohost_test_cta(
    payload: dict[str, Any] = Body(default_factory=dict),
) -> dict[str, Any]:
    campaign_id = str(payload.get("campaign_id") or "justplayer")
    text = await cohost.generate_cta(campaign_id, force=True)
    published = False
    if bool(payload.get("publish", False)) and text:
        published = await cohost._publish(text, kind=f"cta:{campaign_id}:test")
    return {"campaign_id": campaign_id, "text": text, "published": published}


@app.get("/api/twitch/eventsub")
async def twitch_eventsub_diagnostic() -> dict[str, Any]:
    return await aura.twitch.eventsub_diagnostic()


@app.get("/api/twitch/oauth")
async def twitch_oauth_diagnostic() -> dict[str, Any]:
    return await aura.twitch.oauth_diagnostic()


@app.get("/api/security/diagnostic")
async def security_diagnostic() -> dict[str, Any]:
    domains = await db.get_setting(
        "moderation.commercial_spam.blocked_domains",
        ["streamboo.com"],
    )
    logs = await db.fetchall(
        """
        SELECT user_id,display_name,reason,action,message,created_at
        FROM moderation_log
        ORDER BY id DESC LIMIT 30
        """
    )
    return {
        "commercial_spam_enabled": bool(
            await db.get_setting("moderation.commercial_spam.enabled", True)
        ),
        "commercial_spam_timeout_seconds": int(
            await db.get_setting(
                "moderation.commercial_spam.timeout_seconds",
                1_209_600,
            )
        ),
        "blocked_domains": domains,
        "recent_moderation": logs,
    }


@app.post("/api/security/block-domain")
async def security_block_domain(
    payload: dict[str, Any] = Body(default_factory=dict),
) -> dict[str, Any]:
    domain = str(payload.get("domain", "")).casefold().strip()
    if domain.startswith("www."):
        domain = domain[4:]
    if not domain or "." not in domain:
        raise HTTPException(status_code=422, detail="Domaine invalide")
    domains = {
        str(item).casefold().strip()
        for item in await db.get_setting(
            "moderation.commercial_spam.blocked_domains",
            ["streamboo.com"],
        )
        if str(item).strip()
    }
    domains.add(domain)
    result = sorted(domains)
    await db.set_setting("moderation.commercial_spam.blocked_domains", result)
    return {"ok": True, "blocked_domains": result}


@app.middleware("http")
async def automation_no_cache(request: Request, call_next):
    response = await call_next(request)
    if (
        request.url.path == "/automation"
        or request.url.path == "/voice-control"
        or request.url.path.startswith("/static/automation")
        or request.url.path.startswith("/static/cohost")
        or request.url.path.startswith("/static/avatar")
    ):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


if __name__ == "__main__":
    uvicorn.run(
        "app.main_v2:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )
