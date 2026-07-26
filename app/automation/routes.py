from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import HTMLResponse

from app.config import BASE_DIR

from .runtime import AutomationStudioRuntime


def build_automation_router(runtime: AutomationStudioRuntime) -> APIRouter:
    router = APIRouter()

    @router.get("/automation", response_class=HTMLResponse)
    async def automation_page() -> HTMLResponse:
        path = BASE_DIR / "app" / "web" / "templates" / "automation.html"
        return HTMLResponse(path.read_text(encoding="utf-8"))

    @router.get("/api/automation/status")
    async def automation_status() -> dict[str, Any]:
        definitions = await runtime.list_definitions()
        reports = await runtime.reports(20)
        return {
            "started": runtime.started,
            "definitions": len(definitions),
            "enabled": sum(1 for item in definitions if item.get("enabled")),
            "recent_runs": len(reports),
            "actions": len(runtime.registry.actions),
            "conditions": len(runtime.registry.conditions),
            "version": "2.0.0-alpha",
        }

    @router.get("/api/automation/catalog")
    async def automation_catalog() -> dict[str, Any]:
        return runtime.catalog()

    @router.get("/api/automation/templates")
    async def automation_templates() -> list[dict[str, Any]]:
        return runtime.templates()

    @router.get("/api/automation/definitions")
    async def automation_definitions() -> list[dict[str, Any]]:
        return await runtime.list_definitions()

    @router.post("/api/automation/definitions")
    async def automation_upsert(definition: dict[str, Any] = Body(...)) -> dict[str, Any]:
        payload = dict(definition)
        payload.setdefault("id", f"automation-{uuid4()}")
        try:
            return await runtime.upsert(payload)
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.delete("/api/automation/definitions/{automation_id}")
    async def automation_delete(automation_id: str) -> dict[str, Any]:
        if not await runtime.remove(automation_id):
            raise HTTPException(status_code=404, detail="Automatisation introuvable")
        return {"ok": True}

    @router.post("/api/automation/definitions/{automation_id}/simulate")
    async def automation_simulate(
        automation_id: str, payload: dict[str, Any] = Body(default_factory=dict)
    ) -> dict[str, Any]:
        if automation_id not in runtime.engine.automations:
            raise HTTPException(status_code=404, detail="Automatisation introuvable")
        event_type = str(payload.pop("event_type", "automation.manual"))
        try:
            return await runtime.simulate(automation_id, event_type, payload)
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.post("/api/automation/dispatch")
    async def automation_dispatch(payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
        event_type = str(payload.pop("event_type", "automation.manual"))
        reports = await runtime.dispatch(event_type, payload, source="dashboard")
        return {"ok": all(item.get("ok") for item in reports) if reports else True, "reports": reports}

    @router.post("/api/automation/templates/{template_id}/install")
    async def automation_install_template(template_id: str) -> dict[str, Any]:
        template = next((item for item in runtime.templates() if item["id"] == template_id), None)
        if not template:
            raise HTTPException(status_code=404, detail="Modèle introuvable")
        definition = dict(template)
        definition["id"] = template_id.replace("template-", "automation-")
        return await runtime.upsert(definition)

    @router.get("/api/automation/reports")
    async def automation_reports(limit: int = 100) -> list[dict[str, Any]]:
        return await runtime.reports(limit)

    return router
