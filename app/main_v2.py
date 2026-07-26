from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import Body, HTTPException, Request

from app.automation.pro_nodes import (
    automation_replaces_legacy,
    install_pro_nodes,
)
from app.automation.resilience_nodes import install_resilience_nodes
from app.automation.routes import build_automation_router
from app.automation.runtime import AutomationStudioRuntime
from app.config import settings
from app.main import app, aura, db

logger = logging.getLogger("aura-live-v2")
automation = AutomationStudioRuntime(aura, db, settings)
install_pro_nodes(automation.registry)
install_resilience_nodes(automation.registry)
automation.engine.set_service("moderation", aura.moderation)
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


async def _combined_twitch_handler(event_type: str, event: dict[str, Any]) -> None:
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


@asynccontextmanager
async def _v2_lifespan(application):
    async with _original_lifespan(application):
        await automation.initialize()
        await automation.dispatch(
            "aura.started",
            {"version": "2.0.2-alpha", "stream_online": aura.stream_online},
            source="system",
        )
        try:
            yield
        finally:
            try:
                await automation.dispatch(
                    "aura.stopping",
                    {"version": "2.0.2-alpha", "stream_online": aura.stream_online},
                    source="system",
                )
            finally:
                await automation.close()


app.router.lifespan_context = _v2_lifespan
app.include_router(build_automation_router(automation))
app.version = "2.0.2-alpha"


@app.get("/api/ai/runtime")
async def ai_runtime_diagnostic() -> dict[str, Any]:
    return aura.ai.diagnostic()


@app.post("/api/ai/recover")
async def ai_runtime_recover() -> dict[str, Any]:
    try:
        return await aura.ai.recover()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc) or exc.__class__.__name__) from exc


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
    if request.url.path == "/automation" or request.url.path.startswith("/static/automation"):
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
