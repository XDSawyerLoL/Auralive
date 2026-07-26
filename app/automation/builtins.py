from __future__ import annotations

import asyncio
import json
import random
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib import request

from .models import Event
from .registry import AutomationRegistry


def _value_at(path: str, event: Event, context: dict[str, Any]) -> Any:
    current: Any = {"event": event.payload, **context}
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
        if current is None:
            return None
    return current


def _compare(left: Any, operator: str, right: Any) -> bool:
    if operator == "eq":
        return left == right
    if operator == "ne":
        return left != right
    if operator == "contains":
        return right in left if left is not None else False
    if operator == "starts_with":
        return str(left).startswith(str(right))
    if operator == "ends_with":
        return str(left).endswith(str(right))
    if operator == "gt":
        return float(left) > float(right)
    if operator == "gte":
        return float(left) >= float(right)
    if operator == "lt":
        return float(left) < float(right)
    if operator == "lte":
        return float(left) <= float(right)
    raise ValueError(f"Opérateur inconnu : {operator}")


def install_builtins(registry: AutomationRegistry) -> None:
    @registry.condition(
        "event.equals",
        title="Champ d’événement égal à",
        category="Événement",
        config_schema={"key": "string", "value": "any"},
    )
    async def event_equals(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        key = str(config["key"])
        return event.payload.get(key) == config.get("value")

    @registry.condition(
        "data.compare",
        title="Comparer une donnée",
        category="Logique",
        description="Compare une valeur de l’événement ou du contexte avec une autre valeur.",
        config_schema={"path": "string", "operator": "string", "value": "any"},
    )
    async def data_compare(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        return _compare(
            _value_at(str(config["path"]), event, context),
            str(config.get("operator", "eq")),
            config.get("value"),
        )

    @registry.condition(
        "text.regex",
        title="Expression régulière",
        category="Texte",
        config_schema={"path": "string", "pattern": "string", "ignore_case": "boolean"},
    )
    async def text_regex(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        flags = re.IGNORECASE if config.get("ignore_case", True) else 0
        value = str(_value_at(str(config["path"]), event, context) or "")
        return re.search(str(config["pattern"]), value, flags) is not None

    @registry.condition(
        "viewer.role",
        title="Rôle du viewer",
        category="Communauté",
        config_schema={"roles": "array"},
    )
    async def viewer_role(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        expected = set(config.get("roles", []))
        current = set(event.payload.get("roles", []))
        return bool(expected & current)

    @registry.condition(
        "random.chance",
        title="Chance aléatoire",
        category="Logique",
        config_schema={"percent": "number"},
    )
    async def random_chance(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        percent = min(100.0, max(0.0, float(config.get("percent", 100))))
        return random.random() * 100 < percent

    @registry.condition(
        "time.window",
        title="Plage horaire",
        category="Temps",
        config_schema={"start": "HH:MM", "end": "HH:MM"},
    )
    async def time_window(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        now = datetime.now().time()
        start = datetime.strptime(str(config["start"]), "%H:%M").time()
        end = datetime.strptime(str(config["end"]), "%H:%M").time()
        return start <= now <= end if start <= end else now >= start or now <= end

    @registry.action(
        "flow.delay",
        title="Attendre",
        category="Flux",
        config_schema={"seconds": "number"},
    )
    async def delay(config: dict[str, Any], event: Event, context: dict[str, Any]) -> float:
        seconds = max(0.0, float(config.get("seconds", 0)))
        await asyncio.sleep(seconds)
        return seconds

    @registry.action(
        "flow.emit",
        title="Émettre un événement",
        category="Flux",
        description="Déclenche un nouvel événement interne dans Aura Live.",
        config_schema={"type": "string", "payload": "object"},
    )
    async def emit(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        dispatcher = context.get("services", {}).get("dispatch")
        if dispatcher is None:
            raise RuntimeError("Service de dispatch indisponible")
        emitted = Event(
            str(config["type"]),
            dict(config.get("payload", {})),
            source="automation",
        )
        reports = await dispatcher(emitted)
        return {"event_id": emitted.id, "reports": len(reports)}

    @registry.action(
        "variables.set",
        title="Définir une variable",
        category="Variables",
        config_schema={"scope": "local|viewer|global", "name": "string", "value": "any"},
    )
    async def variables_set(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        scope = str(config.get("scope", "local"))
        name = str(config["name"])
        value = config.get("value")
        if scope not in {"local", "viewer", "global"}:
            raise ValueError(f"Portée invalide : {scope}")
        context[scope][name] = value
        return value

    @registry.action(
        "variables.increment",
        title="Incrémenter une variable",
        category="Variables",
        config_schema={"scope": "local|viewer|global", "name": "string", "amount": "number"},
    )
    async def variables_increment(
        config: dict[str, Any], event: Event, context: dict[str, Any]
    ) -> int | float:
        scope = str(config.get("scope", "local"))
        name = str(config["name"])
        amount = config.get("amount", 1)
        current = context[scope].get(name, 0)
        context[scope][name] = current + amount
        return context[scope][name]

    @registry.action(
        "variables.delete",
        title="Supprimer une variable",
        category="Variables",
        config_schema={"scope": "local|viewer|global", "name": "string"},
    )
    async def variables_delete(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        scope = str(config.get("scope", "local"))
        name = str(config["name"])
        return context[scope].pop(name, None) is not None

    @registry.action(
        "files.write",
        title="Écrire un fichier local",
        category="Système local",
        config_schema={"path": "string", "content": "string", "append": "boolean"},
        risk="local-write",
        supports_simulation=False,
    )
    async def files_write(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        root = Path(context.get("services", {}).get("files_root", "data/automation-files")).resolve()
        relative = Path(str(config["path"]))
        target = (root / relative).resolve()
        if root != target and root not in target.parents:
            raise ValueError("Chemin de fichier hors de l’espace Aura Live")
        target.parent.mkdir(parents=True, exist_ok=True)
        mode = "a" if config.get("append", False) else "w"
        with target.open(mode, encoding="utf-8") as handle:
            handle.write(str(config.get("content", "")))
        return {"path": str(target), "bytes": target.stat().st_size}

    @registry.action(
        "http.request",
        title="Requête HTTP",
        category="Réseau",
        config_schema={
            "url": "string",
            "method": "string",
            "headers": "object",
            "body": "any",
            "timeout": "number",
        },
        risk="network",
        supports_simulation=False,
    )
    async def http_request(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        def run() -> dict[str, Any]:
            body = config.get("body")
            data = None if body is None else json.dumps(body).encode("utf-8")
            req = request.Request(
                str(config["url"]),
                data=data,
                method=str(config.get("method", "GET")).upper(),
                headers={str(k): str(v) for k, v in dict(config.get("headers", {})).items()},
            )
            with request.urlopen(req, timeout=float(config.get("timeout", 10))) as response:
                raw = response.read()
                text = raw.decode("utf-8", errors="replace")
                try:
                    parsed: Any = json.loads(text)
                except json.JSONDecodeError:
                    parsed = text
                return {"status": response.status, "headers": dict(response.headers), "body": parsed}

        return await asyncio.to_thread(run)

    @registry.action(
        "debug.capture",
        title="Capturer le contexte",
        category="Débogage",
        config_schema={"message": "string"},
    )
    async def debug_capture(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return {
            "message": config.get("message"),
            "event": event.payload,
            "variables": context,
        }
