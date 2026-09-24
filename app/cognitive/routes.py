from __future__ import annotations

import hmac
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request


def build_cognitive_router(kernel: Any, settings: Any) -> APIRouter:
    router = APIRouter(tags=["AURA Cognitive Kernel"])

    def _authorized(request: Request) -> bool:
        expected = str(getattr(settings, "aura_cloud_token", "") or "")
        if expected:
            header = str(request.headers.get("authorization") or "")
            token = header[7:].strip() if header.lower().startswith("bearer ") else ""
            return bool(token) and hmac.compare_digest(token, expected)
        host = str(request.client.host if request.client else "")
        return host in {"127.0.0.1", "::1", "localhost", "testclient"}

    def _require_private(request: Request) -> None:
        if not _authorized(request):
            raise HTTPException(status_code=401, detail="Accès privé AURA requis")

    @router.get("/api/kernel/status")
    async def kernel_status() -> dict[str, Any]:
        return await kernel.status()

    @router.get("/api/kernel/soul")
    async def kernel_soul() -> dict[str, Any]:
        return await kernel.soul()

    @router.get("/api/kernel/organism")
    async def kernel_organism(request: Request) -> dict[str, Any]:
        return await kernel.organism_state(public=not _authorized(request))

    @router.post("/api/kernel/tick")
    async def kernel_tick(
        request: Request,
        payload: dict[str, Any] = Body(default_factory=dict),
    ) -> dict[str, Any]:
        _require_private(request)
        return await kernel.tick(
            trigger=str(payload.get("trigger") or "manual"),
            text=str(payload.get("text") or ""),
            force=True,
        )

    @router.get("/api/kernel/reflections")
    async def kernel_reflections(request: Request, limit: int = 30) -> list[dict[str, Any]]:
        _require_private(request)
        return await kernel.reflections(limit)

    @router.get("/api/kernel/lessons")
    async def kernel_lessons(request: Request, limit: int = 30) -> list[dict[str, Any]]:
        _require_private(request)
        return await kernel.lessons(limit)

    @router.get("/api/kernel/intentions")
    async def kernel_intentions(request: Request, limit: int = 30) -> list[dict[str, Any]]:
        _require_private(request)
        return await kernel.intentions(limit)

    @router.post("/api/kernel/intentions")
    async def kernel_add_intention(
        request: Request,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        _require_private(request)
        statement = str(payload.get("statement") or "").strip()
        if not statement:
            raise HTTPException(status_code=422, detail="Intention vide")
        return await kernel.add_intention(
            statement,
            priority=float(payload.get("priority", 0.5)),
            source=str(payload.get("source") or "api"),
            context=dict(payload.get("context") or {}),
        )

    @router.post("/api/kernel/intentions/{intention_id}/complete")
    async def kernel_complete_intention(request: Request, intention_id: str) -> dict[str, Any]:
        _require_private(request)
        return {"ok": await kernel.complete_intention(intention_id)}

    @router.get("/api/kernel/routines")
    async def kernel_routines(request: Request) -> list[dict[str, Any]]:
        _require_private(request)
        return await kernel.routines()

    @router.post("/api/kernel/routines")
    async def kernel_add_routine(
        request: Request,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        _require_private(request)
        name = str(payload.get("name") or "").strip()
        prompt = str(payload.get("prompt") or "").strip()
        if not name or not prompt:
            raise HTTPException(status_code=422, detail="Nom et mission requis")
        return await kernel.add_routine(
            name,
            prompt,
            int(payload.get("every_seconds", 3600)),
        )

    @router.get("/api/kernel/improvements")
    async def kernel_improvements(request: Request, limit: int = 30) -> list[dict[str, Any]]:
        _require_private(request)
        return await kernel.improvements(limit)

    @router.post("/api/kernel/agents/run")
    async def kernel_agent(
        request: Request,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        _require_private(request)
        try:
            return await kernel.run_agent(
                str(payload.get("name") or ""),
                str(payload.get("task") or ""),
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.post("/api/kernel/agents/swarm")
    async def kernel_swarm(
        request: Request,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        _require_private(request)
        task = str(payload.get("task") or "").strip()
        if not task:
            raise HTTPException(status_code=422, detail="Mission vide")
        names = payload.get("names")
        return await kernel.swarm(task, list(names) if isinstance(names, list) else None)

    @router.post("/api/kernel/operator")
    async def kernel_operator(
        request: Request,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        _require_private(request)
        task = str(payload.get("task") or "").strip()
        if not task:
            raise HTTPException(status_code=422, detail="Mission vide")
        risks = payload.get("allowed_risks")
        requested_risks = (
            {str(item).casefold() for item in risks}
            if isinstance(risks, list)
            else None
        )
        return await kernel.operate(
            task,
            max_steps=int(payload.get("max_steps", 4)),
            requested_risks=requested_risks,
            source="private-api",
        )

    @router.post("/api/chat")
    async def aura_cloud_chat(
        request: Request,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        text = str(payload.get("text") or "").strip()
        if not text:
            raise HTTPException(status_code=422, detail="Message vide")
        try:
            return await kernel.chat(
                text,
                author=str(payload.get("author") or "Utilisateur"),
                private=_authorized(request),
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    return router
