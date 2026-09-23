from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


class HorizonFactInput(BaseModel):
    domain: str = Field(min_length=1, max_length=64)
    key: str = Field(min_length=1, max_length=128)
    value: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    sensitivity: str = Field(default="personal", pattern="^(standard|personal|sensitive)$")
    expires_at: str | None = None
    replace_current: bool = True


class HorizonIntentInput(BaseModel):
    kind: str = Field(min_length=1, max_length=64)
    statement: str = Field(min_length=1, max_length=2000)
    target: dict[str, Any] = Field(default_factory=dict)
    priority: float = Field(default=0.5, ge=0.0, le=1.0)


def build_horizon_router(bridge: Any) -> APIRouter:
    router = APIRouter(prefix="/api/horizon", tags=["HORIZON"])

    @router.get("/status")
    async def horizon_status() -> dict[str, Any]:
        return bridge.status()

    @router.post("/sync")
    async def horizon_sync() -> dict[str, Any]:
        try:
            return await bridge.sync_once()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=503, detail=str(exc) or exc.__class__.__name__) from exc

    @router.post("/context/facts")
    async def horizon_fact(payload: HorizonFactInput) -> dict[str, Any]:
        try:
            return await bridge.push_fact(**payload.model_dump())
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=503, detail=str(exc) or exc.__class__.__name__) from exc

    @router.post("/context/intents")
    async def horizon_intent(payload: HorizonIntentInput) -> dict[str, Any]:
        try:
            return await bridge.push_intent(**payload.model_dump())
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=503, detail=str(exc) or exc.__class__.__name__) from exc

    return router
