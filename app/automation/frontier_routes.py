from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query

from .frontier_runtime import FrontierAutomationRuntime


def build_frontier_router(runtime: FrontierAutomationRuntime) -> APIRouter:
    router = APIRouter(prefix="/api/automation/frontier", tags=["automation-frontier"])

    @router.get("/status")
    async def status() -> dict[str, Any]:
        return await runtime.status()

    @router.post("/simulate")
    async def simulate_unsaved(document: dict[str, Any] = Body(...)) -> dict[str, Any]:
        try:
            return await runtime.simulate_document(
                dict(document["automation"]),
                str(document.get("event_type") or document["automation"].get("trigger") or "automation.manual"),
                dict(document.get("payload") or {}),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.get("/permissions")
    async def permissions() -> dict[str, Any]:
        return await runtime.permission_policy.list_permissions()

    @router.put("/permissions/{risk}")
    async def set_permission(risk: str, document: dict[str, Any] = Body(...)) -> dict[str, Any]:
        if risk in runtime.permission_policy.ALWAYS_BLOCKED:
            raise HTTPException(403, "Cette catégorie ne peut pas être autorisée")
        permissions = await runtime.permission_policy.set_permission(
            risk, bool(document.get("allowed", False))
        )
        return {"risk": risk, "allowed": permissions.get(risk, False), "permissions": permissions}

    @router.get("/permission-log")
    async def permission_log(limit: int = Query(100, ge=1, le=500)) -> list[dict[str, Any]]:
        return await runtime.permission_policy.recent_log(limit)

    @router.post("/dispatch")
    async def dispatch(document: dict[str, Any] = Body(...)) -> dict[str, Any]:
        event_type = str(document.get("event_type") or "automation.manual")
        reports = await runtime.dispatch(
            event_type,
            dict(document.get("payload") or {}),
            source="frontier-control",
        )
        return {"event_type": event_type, "reports": reports}

    @router.post("/emergency")
    async def emergency(document: dict[str, Any] = Body(...)) -> dict[str, Any]:
        active = bool(document.get("active", True))
        await runtime.db.set_setting("automation.emergency", active)
        reports = await runtime.dispatch(
            "automation.emergency",
            {"active": active},
            source="frontier-control",
        )
        return {"active": active, "reports": reports}

    return router
