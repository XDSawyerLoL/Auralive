from __future__ import annotations

from typing import Any, Protocol


class TwitchGateway(Protocol):
    async def call(self, operation: str, payload: dict[str, Any]) -> Any: ...


class ObsGateway(Protocol):
    async def call(self, request_type: str, payload: dict[str, Any]) -> Any: ...


class MairaiyGateway(Protocol):
    async def ask(
        self,
        prompt: str,
        *,
        user_id: str | None = None,
        channel_context: list[dict[str, Any]] | None = None,
        max_characters: int | None = None,
    ) -> str: ...

    async def speak(self, text: str, *, voice: str | None = None) -> Any: ...

    async def remember(self, user_id: str, fact: str) -> Any: ...

    async def forget(self, user_id: str, query: str | None = None) -> Any: ...


class OverlayGateway(Protocol):
    async def publish(self, channel: str, payload: dict[str, Any]) -> Any: ...


class ServiceUnavailable(RuntimeError):
    pass


def require_service(services: dict[str, Any], name: str) -> Any:
    service = services.get(name)
    if service is None:
        raise ServiceUnavailable(f"Service {name} non configuré")
    return service
