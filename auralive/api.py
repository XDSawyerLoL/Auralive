from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .automation import Event
from .automation.serialization import automation_from_dict, automation_to_dict, report_to_dict
from .runtime import AuraRuntime

_WEB_ROOT = Path(__file__).with_name("web")
_LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}


def _remote_allowed(host: str) -> bool:
    allow_remote = os.getenv("AURALIVE_ALLOW_REMOTE", "false").lower() == "true"
    return allow_remote or host in _LOCAL_HOSTS


def create_app(runtime: AuraRuntime | None = None) -> FastAPI:
    aura = runtime or AuraRuntime()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await aura.initialize()
        app.state.aura = aura
        try:
            yield
        finally:
            await aura.shutdown()

    app = FastAPI(
        title="Aura Live 2 — Automation Studio",
        version="2.0.0-alpha.2",
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        host = request.client.host if request.client else ""
        if not _remote_allowed(host):
            return JSONResponse(
                {"detail": "Aura Live refuse les connexions distantes par défaut."},
                status_code=403,
            )
        return await call_next(request)

    app.mount("/assets", StaticFiles(directory=_WEB_ROOT), name="assets")

    @app.get("/", include_in_schema=False)
    async def studio() -> FileResponse:
        return FileResponse(_WEB_ROOT / "index.html")

    @app.get("/overlay/avatar", include_in_schema=False)
    async def avatar_overlay() -> FileResponse:
        return FileResponse(_WEB_ROOT / "avatar.html")

    @app.get("/overlay/alerts", include_in_schema=False)
    async def alerts_overlay() -> FileResponse:
        return FileResponse(_WEB_ROOT / "alerts.html")

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return aura.health()

    @app.get("/api/emergency")
    async def emergency_status() -> dict[str, bool]:
        return {"active": aura.emergency_active}

    @app.post("/api/emergency")
    async def emergency(document: dict[str, Any] = Body(...)) -> dict[str, bool]:
        return {"active": await aura.set_emergency(bool(document.get("active", True)))}

    @app.get("/api/catalog")
    async def catalog() -> dict[str, Any]:
        return aura.catalog()

    @app.get("/api/automations")
    async def list_automations() -> list[dict[str, Any]]:
        return [
            automation_to_dict(item)
            for item in sorted(aura.engine.automations.values(), key=lambda value: value.priority)
        ]

    @app.get("/api/automations/{automation_id}")
    async def get_automation(automation_id: str) -> dict[str, Any]:
        automation = aura.engine.automations.get(automation_id)
        if automation is None:
            raise HTTPException(404, "Automatisation introuvable")
        return automation_to_dict(automation)

    @app.post("/api/automations")
    async def save_automation(document: dict[str, Any] = Body(...)) -> dict[str, Any]:
        try:
            automation = automation_from_dict(document)
            saved = await aura.upsert(automation)
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc
        return automation_to_dict(saved)

    @app.put("/api/automations/{automation_id}")
    async def replace_automation(
        automation_id: str, document: dict[str, Any] = Body(...)
    ) -> dict[str, Any]:
        document["id"] = automation_id
        return await save_automation(document)

    @app.delete("/api/automations/{automation_id}", status_code=204)
    async def delete_automation(automation_id: str) -> None:
        if automation_id not in aura.engine.automations:
            raise HTTPException(404, "Automatisation introuvable")
        await aura.remove(automation_id)

    @app.post("/api/events/dispatch")
    async def dispatch_event(document: dict[str, Any] = Body(...)) -> dict[str, Any]:
        event = Event(
            type=str(document.get("type", "internal.test")),
            payload=dict(document.get("payload", {})),
            source=str(document.get("source", "api")),
        )
        reports = await aura.dispatch(event)
        return {
            "event": {
                "id": event.id,
                "type": event.type,
                "source": event.source,
                "payload": event.payload,
            },
            "reports": [report_to_dict(report) for report in reports],
        }

    @app.post("/api/automations/{automation_id}/simulate")
    async def simulate(
        automation_id: str, document: dict[str, Any] = Body(default={})
    ) -> dict[str, Any]:
        if automation_id not in aura.engine.automations:
            raise HTTPException(404, "Automatisation introuvable")
        event = Event(
            type=str(document.get("type") or aura.engine.automations[automation_id].trigger),
            payload=dict(document.get("payload", {})),
            source="simulation",
        )
        return report_to_dict(await aura.simulate(automation_id, event))

    @app.post("/api/simulate")
    async def simulate_document(document: dict[str, Any] = Body(...)) -> dict[str, Any]:
        try:
            automation = automation_from_dict(dict(document["automation"]))
            event_document = dict(document.get("event", {}))
            event = Event(
                type=str(event_document.get("type") or automation.trigger),
                payload=dict(event_document.get("payload", {})),
                source="simulation",
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc
        return report_to_dict(await aura.simulate_document(automation, event))

    @app.get("/api/executions")
    async def executions(limit: int = 100) -> list[dict[str, Any]]:
        return await aura.store.list_reports(limit=limit)

    @app.post("/api/overlay/{channel}")
    async def publish_overlay(
        channel: str, document: dict[str, Any] = Body(...)
    ) -> dict[str, Any]:
        overlay = aura.services.get("overlay")
        if overlay is None:
            raise HTTPException(503, "Service overlay indisponible")
        return await overlay.publish(channel, document)

    @app.websocket("/ws/executions")
    async def execution_socket(websocket: WebSocket) -> None:
        host = websocket.client.host if websocket.client else ""
        if not _remote_allowed(host):
            await websocket.close(code=1008)
            return
        await websocket.accept()
        try:
            async for payload in aura.bus.subscribe():
                await websocket.send_json(payload)
        except WebSocketDisconnect:
            return

    @app.websocket("/ws/overlay/{channel}")
    async def overlay_socket(websocket: WebSocket, channel: str) -> None:
        host = websocket.client.host if websocket.client else ""
        if not _remote_allowed(host):
            await websocket.close(code=1008)
            return
        overlay = aura.services.get("overlay")
        if overlay is None:
            await websocket.close(code=1011)
            return
        await websocket.accept()
        try:
            async for payload in overlay.subscribe(channel):
                await websocket.send_json(payload)
        except WebSocketDisconnect:
            return

    return app


app = create_app()
