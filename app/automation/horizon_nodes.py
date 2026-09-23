from __future__ import annotations

from typing import Any

from .models import Event
from .registry import AutomationRegistry


def _horizon(context: dict[str, Any]):
    service = context.get("services", {}).get("horizon")
    if service is None:
        raise RuntimeError("Pont HORIZON indisponible")
    return service


def install_horizon_nodes(registry: AutomationRegistry) -> None:
    @registry.condition(
        "horizon.domain",
        title="Domaine HORIZON",
        category="HORIZON",
        description="Filtre un signal HORIZON par domaine monde.",
        config_schema={"domains": "array"},
    )
    async def horizon_domain(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        domains = {str(item) for item in config.get("domains", [])}
        return str(event.payload.get("domain") or "") in domains

    @registry.condition(
        "horizon.epistemic_status",
        title="Statut épistémique HORIZON",
        category="HORIZON",
        description="Permet d'exiger explicitement fait/événement, hypothèse ou prévision.",
        config_schema={"allowed": "array"},
    )
    async def horizon_epistemic(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        allowed = {str(item) for item in config.get("allowed", [])}
        return str(event.payload.get("epistemic_status") or "") in allowed

    @registry.condition(
        "horizon.personal",
        title="Signal personnel HORIZON",
        category="HORIZON",
        config_schema={"expected": "boolean"},
    )
    async def horizon_personal(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        return bool(event.payload.get("personal", False)) is bool(config.get("expected", True))

    @registry.condition(
        "horizon.safe_for_autonomy",
        title="HORIZON autorise une proposition d'action",
        category="HORIZON",
        description=(
            "Refuse les hypothèses non confirmées. Cette condition n'accorde jamais à elle seule "
            "une permission système: les garde-fous de l'action ciblée restent applicables."
        ),
        config_schema={},
    )
    async def horizon_safe_for_autonomy(
        config: dict[str, Any], event: Event, context: dict[str, Any]
    ) -> bool:
        if event.type == "horizon.world.emerging":
            return False
        return str(event.payload.get("autonomy_hint") or "") in {
            "verify_then_act",
            "personal_relevance_gate_then_propose",
        }

    @registry.action(
        "horizon.sync",
        title="Synchroniser HORIZON maintenant",
        category="HORIZON",
        risk="network",
        supports_simulation=False,
        config_schema={},
    )
    async def horizon_sync(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await _horizon(context).sync_once()

    @registry.action(
        "horizon.context.fact",
        title="Envoyer un fait de contexte local à HORIZON",
        category="HORIZON",
        risk="network",
        supports_simulation=False,
        config_schema={
            "domain": "string",
            "key": "string",
            "value": "object",
            "confidence": "number",
            "sensitivity": "standard|personal|sensitive",
            "expires_at": "datetime|null",
            "replace_current": "boolean",
        },
    )
    async def horizon_context_fact(
        config: dict[str, Any], event: Event, context: dict[str, Any]
    ) -> Any:
        return await _horizon(context).push_fact(
            domain=str(config["domain"]),
            key=str(config["key"]),
            value=dict(config.get("value") or {}),
            confidence=float(config.get("confidence", 1.0)),
            sensitivity=str(config.get("sensitivity", "personal")),
            expires_at=str(config["expires_at"]) if config.get("expires_at") else None,
            replace_current=bool(config.get("replace_current", True)),
        )

    @registry.action(
        "horizon.context.intent",
        title="Envoyer une intention à HORIZON",
        category="HORIZON",
        risk="network",
        supports_simulation=False,
        config_schema={
            "kind": "string",
            "statement": "string",
            "target": "object",
            "priority": "number",
        },
    )
    async def horizon_context_intent(
        config: dict[str, Any], event: Event, context: dict[str, Any]
    ) -> Any:
        return await _horizon(context).push_intent(
            kind=str(config["kind"]),
            statement=str(config["statement"]),
            target=dict(config.get("target") or {}),
            priority=float(config.get("priority", 0.5)),
        )
