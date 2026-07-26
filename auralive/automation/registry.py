from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from .models import Event

ActionHandler = Callable[[dict[str, Any], Event, dict[str, Any]], Awaitable[Any]]
ConditionHandler = Callable[[dict[str, Any], Event, dict[str, Any]], Awaitable[bool]]
RollbackHandler = Callable[[Any, dict[str, Any], Event, dict[str, Any]], Awaitable[None]]


@dataclass(slots=True)
class NodeDefinition:
    name: str
    title: str
    category: str
    description: str = ""
    config_schema: dict[str, Any] = field(default_factory=dict)
    risk: str = "safe"
    supports_simulation: bool = True


@dataclass(slots=True)
class ActionDefinition(NodeDefinition):
    handler: ActionHandler | None = None
    rollback: RollbackHandler | None = None


@dataclass(slots=True)
class ConditionDefinition(NodeDefinition):
    handler: ConditionHandler | None = None


class AutomationRegistry:
    def __init__(self) -> None:
        self.actions: dict[str, ActionHandler] = {}
        self.conditions: dict[str, ConditionHandler] = {}
        self.action_definitions: dict[str, ActionDefinition] = {}
        self.condition_definitions: dict[str, ConditionDefinition] = {}

    def action(
        self,
        name: str,
        *,
        title: str | None = None,
        category: str = "Général",
        description: str = "",
        config_schema: dict[str, Any] | None = None,
        risk: str = "safe",
        supports_simulation: bool = True,
        rollback: RollbackHandler | None = None,
    ) -> Callable[[ActionHandler], ActionHandler]:
        def decorator(handler: ActionHandler) -> ActionHandler:
            if name in self.actions:
                raise ValueError(f"Action déjà enregistrée : {name}")
            self.actions[name] = handler
            self.action_definitions[name] = ActionDefinition(
                name=name,
                title=title or name,
                category=category,
                description=description,
                config_schema=config_schema or {},
                risk=risk,
                supports_simulation=supports_simulation,
                handler=handler,
                rollback=rollback,
            )
            return handler

        return decorator

    def condition(
        self,
        name: str,
        *,
        title: str | None = None,
        category: str = "Général",
        description: str = "",
        config_schema: dict[str, Any] | None = None,
    ) -> Callable[[ConditionHandler], ConditionHandler]:
        def decorator(handler: ConditionHandler) -> ConditionHandler:
            if name in self.conditions:
                raise ValueError(f"Condition déjà enregistrée : {name}")
            self.conditions[name] = handler
            self.condition_definitions[name] = ConditionDefinition(
                name=name,
                title=title or name,
                category=category,
                description=description,
                config_schema=config_schema or {},
                handler=handler,
            )
            return handler

        return decorator

    def catalog(self) -> dict[str, list[dict[str, Any]]]:
        def export(definition: NodeDefinition) -> dict[str, Any]:
            return {
                "name": definition.name,
                "title": definition.title,
                "category": definition.category,
                "description": definition.description,
                "config_schema": definition.config_schema,
                "risk": definition.risk,
                "supports_simulation": definition.supports_simulation,
            }

        return {
            "actions": [export(item) for item in self.action_definitions.values()],
            "conditions": [export(item) for item in self.condition_definitions.values()],
        }
