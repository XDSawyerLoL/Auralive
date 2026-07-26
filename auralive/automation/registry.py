from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from .models import Event

ActionHandler = Callable[[dict[str, Any], Event, dict[str, Any]], Awaitable[Any]]
ConditionHandler = Callable[[dict[str, Any], Event, dict[str, Any]], Awaitable[bool]]


class AutomationRegistry:
    def __init__(self) -> None:
        self.actions: dict[str, ActionHandler] = {}
        self.conditions: dict[str, ConditionHandler] = {}

    def action(self, name: str) -> Callable[[ActionHandler], ActionHandler]:
        def decorator(handler: ActionHandler) -> ActionHandler:
            if name in self.actions:
                raise ValueError(f"Action déjà enregistrée : {name}")
            self.actions[name] = handler
            return handler

        return decorator

    def condition(self, name: str) -> Callable[[ConditionHandler], ConditionHandler]:
        def decorator(handler: ConditionHandler) -> ConditionHandler:
            if name in self.conditions:
                raise ValueError(f"Condition déjà enregistrée : {name}")
            self.conditions[name] = handler
            return handler

        return decorator
