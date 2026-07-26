from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import Request

from app.automation.routes import build_automation_router
from app.automation.runtime import AutomationStudioRuntime
from app.config import settings
from app.main import app, aura, db

logger = logging.getLogger("aura-live-v2")
automation = AutomationStudioRuntime(aura, db, settings)
_original_lifespan = app.router.lifespan_context
_original_twitch_handler = aura.handle_twitch_event


async def _combined_twitch_handler(event_type: str, event: dict[str, Any]) -> None:
    # Les fonctions historiques restent exécutées en premier. Automation Studio
    # ajoute ensuite les scénarios personnalisés sans supprimer le comportement V1.2.
    await _original_twitch_handler(event_type, event)
    try:
        await automation.dispatch(event_type, event, source="twitch")
    except Exception:
        logger.exception("Automation Studio n’a pas pu traiter %s", event_type)


aura.twitch.handler = _combined_twitch_handler


@asynccontextmanager
async def _v2_lifespan(application):
    async with _original_lifespan(application):
        await automation.initialize()
        await automation.dispatch(
            "aura.started",
            {"version": "2.0.0-alpha", "stream_online": aura.stream_online},
            source="system",
        )
        try:
            yield
        finally:
            try:
                await automation.dispatch(
                    "aura.stopping",
                    {"version": "2.0.0-alpha", "stream_online": aura.stream_online},
                    source="system",
                )
            finally:
                await automation.close()


app.router.lifespan_context = _v2_lifespan
app.include_router(build_automation_router(automation))
app.version = "2.0.0-alpha"


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
