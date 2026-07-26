from __future__ import annotations

import asyncio
from typing import Any

from .models import Event
from .registry import AutomationRegistry


def install_builtins(registry: AutomationRegistry) -> None:
    @registry.condition("event.equals")
    async def event_equals(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        key = str(config["key"])
        return event.payload.get(key) == config.get("value")

    @registry.condition("viewer.role")
    async def viewer_role(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        expected = set(config.get("roles", []))
        current = set(event.payload.get("roles", []))
        return bool(expected & current)

    @registry.action("flow.delay")
    async def delay(config: dict[str, Any], event: Event, context: dict[str, Any]) -> float:
        seconds = max(0.0, float(config.get("seconds", 0)))
        await asyncio.sleep(seconds)
        return seconds

    @registry.action("variables.set")
    async def variables_set(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        scope = str(config.get("scope", "local"))
        name = str(config["name"])
        value = config.get("value")
        if scope not in {"local", "viewer", "global"}:
            raise ValueError(f"Portée invalide : {scope}")
        context[scope][name] = value
        return value

    @registry.action("variables.increment")
    async def variables_increment(
        config: dict[str, Any], event: Event, context: dict[str, Any]
    ) -> int | float:
        scope = str(config.get("scope", "local"))
        name = str(config["name"])
        amount = config.get("amount", 1)
        current = context[scope].get(name, 0)
        context[scope][name] = current + amount
        return context[scope][name]

    @registry.action("debug.capture")
    async def debug_capture(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return {
            "message": config.get("message"),
            "event": event.payload,
            "variables": context,
        }
