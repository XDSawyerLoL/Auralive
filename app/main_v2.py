from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import Request
from fastapi.responses import JSONResponse

from app.automation.frontier_routes import build_frontier_router
from app.automation.frontier_runtime import FrontierAutomationRuntime
from app.automation.routes import build_automation_router
from app.config import settings
from app.main import app, aura, db
from app.services.twitch_frontier import FrontierTwitchClient

logger = logging.getLogger("aura-live-v2")

# Remplacement avant le démarrage : tous les modules V1.2 continuent d'utiliser
# aura.twitch, mais reçoivent désormais le client natif Frontier.
aura.twitch = FrontierTwitchClient(settings, db, aura.handle_twitch_event)
automation = FrontierAutomationRuntime(aura, db, settings)
_original_lifespan = app.router.lifespan_context
_original_twitch_handler = aura.handle_twitch_event


def _normalize_frontier_event(event_type: str, event: dict[str, Any]) -> dict[str, Any]:
    """Ajoute des champs stables sans altérer le payload Twitch original."""
    payload = dict(event)
    message = payload.get("message")
    if isinstance(message, dict):
        payload.setdefault("text", str(message.get("text") or ""))
        payload.setdefault("fragments", list(message.get("fragments") or []))
    payload.setdefault(
        "user_id",
        payload.get("chatter_user_id")
        or payload.get("from_broadcaster_user_id")
        or payload.get("user_id"),
    )
    payload.setdefault(
        "user_name",
        payload.get("chatter_user_name")
        or payload.get("from_broadcaster_user_name")
        or payload.get("user_name"),
    )
    payload.setdefault("message_id", payload.get("message_id"))
    badges = payload.get("badges") or []
    if isinstance(badges, list):
        payload.setdefault(
            "roles",
            sorted(
                {
                    str(item.get("set_id"))
                    for item in badges
                    if isinstance(item, dict) and item.get("set_id")
                }
            ),
        )
    payload["event_type"] = event_type
    return payload


async def _combined_twitch_handler(event_type: str, event: dict[str, Any]) -> None:
    # Les fonctions historiques restent exécutées en premier. Automation Studio
    # ajoute ensuite les scénarios personnalisés sans supprimer le comportement V1.2.
    await _original_twitch_handler(event_type, event)
    try:
        await automation.dispatch(
            event_type,
            _normalize_frontier_event(event_type, event),
            source="twitch",
        )
    except Exception:
        logger.exception("Automation Studio n’a pas pu traiter %s", event_type)


aura.twitch.handler = _combined_twitch_handler


@asynccontextmanager
async def _v2_lifespan(application):
    async with _original_lifespan(application):
        await automation.initialize()
        await automation.install_frontier_defaults()
        await automation.dispatch(
            "aura.started",
            {"version": "2.0.0-frontier", "stream_online": aura.stream_online},
            source="system",
        )
        try:
            yield
        finally:
            try:
                await automation.dispatch(
                    "aura.stopping",
                    {"version": "2.0.0-frontier", "stream_online": aura.stream_online},
                    source="system",
                )
            finally:
                await automation.close()


app.router.lifespan_context = _v2_lifespan
app.include_router(build_automation_router(automation))
app.include_router(build_frontier_router(automation))
app.version = "2.0.0-frontier"
app.title = "Aura Live 2 — Frontier"


@app.middleware("http")
async def frontier_local_and_no_cache(request: Request, call_next):
    client_host = request.client.host if request.client else ""
    if request.url.path.startswith(("/automation", "/api/automation")):
        if client_host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
            return JSONResponse(
                {"detail": "Automation Studio est réservé au PC de streaming."},
                status_code=403,
            )
    response = await call_next(request)
    if request.url.path == "/automation" or request.url.path.startswith("/static/automation"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


@app.get("/api/frontier/status")
async def frontier_status() -> dict[str, Any]:
    status = await automation.status()
    status["twitch_frontier"] = isinstance(aura.twitch, FrontierTwitchClient)
    status["version"] = "2.0.0-frontier"
    return status


if __name__ == "__main__":
    uvicorn.run(
        "app.main_v2:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )
