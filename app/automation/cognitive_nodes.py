from __future__ import annotations

from typing import Any

from .models import Event
from .registry import AutomationRegistry


def _kernel(context: dict[str, Any]):
    service = context.get("services", {}).get("cognitive")
    if service is None:
        raise RuntimeError("Noyau cognitif AURA indisponible")
    return service


def install_cognitive_nodes(registry: AutomationRegistry) -> None:
    @registry.condition(
        "cognitive.soul.threshold",
        title="État Soul AURA",
        category="AURA Cognitive",
        description="Compare une variable du Soul persistant à un seuil.",
        config_schema={
            "field": "energy|curiosity|pressure|continuity|introspection|openness|reactivity|playfulness",
            "operator": "gt|gte|lt|lte|eq",
            "value": "number",
        },
    )
    async def soul_threshold(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        soul = await _kernel(context).soul()
        field = str(config.get("field") or "")
        if field not in soul:
            return False
        try:
            left = float(soul[field])
            right = float(config.get("value", 0))
        except (TypeError, ValueError):
            return False
        operator = str(config.get("operator") or "gte")
        return {
            "gt": left > right,
            "gte": left >= right,
            "lt": left < right,
            "lte": left <= right,
            "eq": left == right,
        }.get(operator, False)

    @registry.action(
        "cognitive.tick",
        title="Déclencher une réflexion AURA",
        category="AURA Cognitive",
        risk="safe",
        supports_simulation=False,
        config_schema={"trigger": "string", "text": "string"},
    )
    async def cognitive_tick(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await _kernel(context).tick(
            trigger=str(config.get("trigger") or event.type),
            text=str(config.get("text") or ""),
            force=True,
        )

    @registry.action(
        "cognitive.intent.add",
        title="Ajouter une intention AURA",
        category="AURA Cognitive",
        risk="safe",
        supports_simulation=False,
        config_schema={"statement": "string", "priority": "number"},
    )
    async def cognitive_intent(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await _kernel(context).add_intention(
            str(config["statement"]),
            priority=float(config.get("priority", 0.5)),
            source=f"automation:{event.type}",
            context={"event_id": event.id},
        )

    @registry.action(
        "cognitive.learn",
        title="Enregistrer une leçon AURA",
        category="AURA Cognitive",
        risk="safe",
        supports_simulation=False,
        config_schema={"key": "string", "content": "string", "confidence": "number"},
    )
    async def cognitive_learn(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await _kernel(context).learn(
            lesson_key=str(config["key"]),
            content=str(config["content"]),
            confidence=float(config.get("confidence", 0.6)),
            source=f"automation:{event.type}",
        )

    @registry.action(
        "cognitive.routine.add",
        title="Créer une routine cognitive AURA",
        category="AURA Cognitive",
        risk="safe",
        supports_simulation=False,
        config_schema={"name": "string", "prompt": "string", "every_seconds": "integer"},
    )
    async def cognitive_routine(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await _kernel(context).add_routine(
            str(config["name"]),
            str(config["prompt"]),
            int(config.get("every_seconds", 3600)),
        )

    @registry.action(
        "cognitive.agent",
        title="Lancer un sous-agent AURA",
        category="AURA Cognitive",
        risk="ai",
        supports_simulation=False,
        config_schema={"name": "planner|research|dev|security|operator|critic", "task": "string"},
    )
    async def cognitive_agent(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await _kernel(context).run_agent(
            str(config["name"]),
            str(config["task"]),
        )

    @registry.action(
        "cognitive.swarm",
        title="Conseil multi-agents AURA",
        category="AURA Cognitive",
        risk="ai",
        supports_simulation=False,
        config_schema={"task": "string", "names": "array"},
    )
    async def cognitive_swarm(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        names = config.get("names")
        return await _kernel(context).swarm(
            str(config["task"]),
            list(names) if isinstance(names, list) else None,
        )


    @registry.action(
        "cognitive.operator",
        title="AURA Sovereign : planifier et agir",
        category="AURA Cognitive",
        risk="ai",
        supports_simulation=False,
        config_schema={
            "task": "string",
            "max_steps": "integer",
            "allowed_risks": "array",
        },
    )
    async def cognitive_operator(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        requested = config.get("allowed_risks")
        requested_risks = (
            {str(item).casefold() for item in requested}
            if isinstance(requested, list)
            else None
        )
        return await _kernel(context).operate(
            str(config["task"]),
            max_steps=int(config.get("max_steps", 4)),
            requested_risks=requested_risks,
            source=f"automation:{event.type}",
        )
