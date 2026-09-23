from __future__ import annotations

import hmac
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request


def build_evolution_router(evolution: Any, settings: Any) -> APIRouter:
    router = APIRouter(tags=["AURA Evolution"])

    def _authorized(request: Request) -> bool:
        expected = str(getattr(settings, "aura_cloud_token", "") or "")
        header = str(request.headers.get("authorization") or "")
        token = header[7:].strip() if header.lower().startswith("bearer ") else ""
        if expected:
            return bool(token) and hmac.compare_digest(token, expected)
        host = str(request.client.host if request.client else "")
        return host in {"127.0.0.1", "::1", "localhost", "testclient"}

    def _require_private(request: Request) -> None:
        if not _authorized(request):
            raise HTTPException(status_code=401, detail="Accès privé AURA requis")

    @router.get("/api/evolution/status")
    async def evolution_status(request: Request) -> dict[str, Any]:
        _require_private(request)
        return await evolution.status()

    @router.get("/api/evolution/cycles")
    async def evolution_cycles(request: Request, limit: int = 30) -> list[dict[str, Any]]:
        _require_private(request)
        return await evolution.cycles(limit)

    @router.post("/api/evolution/run")
    async def evolution_run(
        request: Request,
        payload: dict[str, Any] = Body(default_factory=dict),
    ) -> dict[str, Any]:
        _require_private(request)
        objective = str(payload.get("objective") or "").strip()
        if not objective:
            objective = await evolution._next_objective()
        return await evolution.run_cycle(
            objective,
            trigger=str(payload.get("trigger") or "private-api"),
            submit=payload.get("submit"),
        )

    @router.post("/api/evolution/reconcile")
    async def evolution_reconcile(request: Request) -> dict[str, Any]:
        _require_private(request)
        results = await evolution.reconcile_remote_candidates()
        return {"ok": True, "results": results}

    return router
