from __future__ import annotations

import ast
import asyncio
import copy
import json
import random
from pathlib import Path
from typing import Any

from .models import ActionSpec, Event, FailurePolicy
from .registry import AutomationRegistry


_ALLOWED_MATH_NODES = {
    ast.Expression,
    ast.Constant,
    ast.Name,
    ast.Load,
    ast.BinOp,
    ast.UnaryOp,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.FloorDiv,
    ast.Mod,
    ast.Pow,
    ast.USub,
    ast.UAdd,
    ast.Compare,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.BoolOp,
    ast.And,
    ast.Or,
    ast.Not,
    ast.UnaryOp,
}


def _services(context: dict[str, Any]) -> dict[str, Any]:
    return context.get("services", {})


def _path_get(value: Any, path: str, default: Any = None) -> Any:
    current = value
    for part in [item for item in str(path).split(".") if item]:
        if isinstance(current, dict):
            current = current.get(part, default)
        elif isinstance(current, (list, tuple)) and part.isdigit():
            index = int(part)
            current = current[index] if 0 <= index < len(current) else default
        else:
            current = getattr(current, part, default)
        if current is default:
            break
    return current


def _action_specs(items: list[dict[str, Any]]) -> list[ActionSpec]:
    specs: list[ActionSpec] = []
    for item in items:
        specs.append(
            ActionSpec(
                type=str(item["type"]),
                config=dict(item.get("config") or {}),
                timeout_seconds=float(item.get("timeout_seconds", 30)),
                failure_policy=FailurePolicy(str(item.get("failure_policy", "stop"))),
                enabled=bool(item.get("enabled", True)),
                retries=max(0, int(item.get("retries", 0))),
                retry_delay_seconds=max(0.0, float(item.get("retry_delay_seconds", 0))),
                save_as=item.get("save_as"),
                id=str(item.get("id") or ""),
            )
        )
    return specs


def _safe_expression(expression: str, variables: dict[str, Any]) -> Any:
    tree = ast.parse(expression, mode="eval")
    for node in ast.walk(tree):
        if type(node) not in _ALLOWED_MATH_NODES:
            raise ValueError(f"Élément interdit dans l’expression : {type(node).__name__}")
        if isinstance(node, ast.Name) and node.id.startswith("__"):
            raise ValueError("Nom de variable interdit")
    return eval(compile(tree, "<automation-expression>", "eval"), {"__builtins__": {}}, variables)


def _clean_ai_text(value: str, limit: int = 450) -> str:
    text = " ".join(str(value).replace("\n", " ").split()).strip()
    lowered = text.casefold()
    if "je réfléchis" in lowered or "je reflechis" in lowered:
        text = text.replace("je réfléchis", "").replace("Je réfléchis", "")
        text = text.replace("je reflechis", "").replace("Je reflechis", "").strip(" .…:-")
    if not text:
        raise ValueError("Mairaiy n’a produit aucune réponse finale exploitable")
    return text[:limit].rstrip()


def install_frontier_nodes(registry: AutomationRegistry) -> None:
    @registry.condition(
        "frontier.expression",
        title="Expression logique sûre",
        category="Frontier · Logique",
        description="Évalue une expression sans appel de fonction ni accès système.",
        config_schema={"expression": "string", "variables": "object"},
    )
    async def expression_condition(
        config: dict[str, Any], event: Event, context: dict[str, Any]
    ) -> bool:
        variables = dict(config.get("variables") or {})
        variables.setdefault("event", event.payload)
        variables.setdefault("global_vars", context.get("global", {}))
        variables.setdefault("viewer", context.get("viewer", {}))
        variables.setdefault("local", context.get("local", {}))
        return bool(_safe_expression(str(config.get("expression", "False")), variables))

    @registry.action(
        "flow.branch",
        title="Branche Si / Sinon",
        category="Frontier · Flux",
        description="Exécute une liste d’actions selon une condition enregistrée.",
        config_schema={
            "condition": "object",
            "then_actions": "array",
            "else_actions": "array",
        },
    )
    async def flow_branch(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        runtime = _services(context)["automation_runtime"]
        condition = dict(config.get("condition") or {})
        result = await runtime.evaluate_inline_condition(condition, event, context)
        branch = config.get("then_actions", []) if result else config.get("else_actions", [])
        steps = await runtime.execute_inline(_action_specs(list(branch)), event, context)
        return {"condition": result, "steps": steps}

    @registry.action(
        "flow.repeat",
        title="Répéter un groupe",
        category="Frontier · Flux",
        config_schema={"count": "number", "actions": "array", "delay_seconds": "number"},
    )
    async def flow_repeat(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        runtime = _services(context)["automation_runtime"]
        count = max(0, min(int(config.get("count", 1)), 100))
        delay = max(0.0, min(float(config.get("delay_seconds", 0)), 60.0))
        specs = _action_specs(list(config.get("actions") or []))
        results = []
        for index in range(count):
            context["local"]["repeat_index"] = index
            results.append(await runtime.execute_inline(specs, event, context))
            if delay and index + 1 < count:
                await asyncio.sleep(delay)
        return {"iterations": count, "results": results}

    @registry.action(
        "flow.parallel",
        title="Branches parallèles",
        category="Frontier · Flux",
        config_schema={"branches": "array"},
    )
    async def flow_parallel(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        runtime = _services(context)["automation_runtime"]
        branches = [list(item or []) for item in list(config.get("branches") or [])][:20]

        async def run_branch(items: list[dict[str, Any]], index: int) -> Any:
            branch_context = {
                **context,
                "local": copy.deepcopy(context.get("local", {})),
            }
            branch_context["local"]["branch_index"] = index
            return await runtime.execute_inline(_action_specs(items), event, branch_context)

        return await asyncio.gather(
            *(run_branch(items, index) for index, items in enumerate(branches))
        )

    @registry.action(
        "flow.random_branch",
        title="Choisir une branche au hasard",
        category="Frontier · Flux",
        config_schema={"branches": "array"},
    )
    async def random_branch(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        branches = list(config.get("branches") or [])
        if not branches:
            return {"selected": None, "steps": []}
        weighted: list[tuple[float, dict[str, Any]]] = []
        for branch in branches[:100]:
            row = dict(branch or {})
            weighted.append((max(0.0, float(row.get("weight", 1))), row))
        total = sum(weight for weight, _ in weighted)
        if total <= 0:
            raise ValueError("Toutes les branches ont un poids nul")
        cursor = random.random() * total
        selected = weighted[-1][1]
        for weight, row in weighted:
            cursor -= weight
            if cursor <= 0:
                selected = row
                break
        runtime = _services(context)["automation_runtime"]
        steps = await runtime.execute_inline(
            _action_specs(list(selected.get("actions") or [])), event, context
        )
        return {"selected": selected.get("name"), "steps": steps}

    @registry.action(
        "flow.call_automation",
        title="Appeler une automatisation",
        category="Frontier · Flux",
        config_schema={"automation_id": "string", "payload": "object"},
    )
    async def call_automation(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        runtime = _services(context)["automation_runtime"]
        return await runtime.call_automation(
            str(config["automation_id"]),
            event,
            context,
            dict(config.get("payload") or {}),
        )

    @registry.action(
        "data.calculate",
        title="Calcul ou expression sûre",
        category="Frontier · Données",
        config_schema={"expression": "string", "variables": "object"},
    )
    async def calculate(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        variables = dict(config.get("variables") or {})
        variables.setdefault("event", event.payload)
        variables.setdefault("global_vars", context.get("global", {}))
        variables.setdefault("viewer", context.get("viewer", {}))
        variables.setdefault("local", context.get("local", {}))
        return _safe_expression(str(config.get("expression", "0")), variables)

    @registry.action(
        "data.path_get",
        title="Lire un chemin de données",
        category="Frontier · Données",
        config_schema={"source": "any", "path": "string", "default": "any"},
    )
    async def path_get(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return _path_get(config.get("source"), str(config.get("path", "")), config.get("default"))

    @registry.action(
        "data.merge",
        title="Fusionner des objets JSON",
        category="Frontier · Données",
        config_schema={"objects": "array", "deep": "boolean"},
    )
    async def data_merge(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        deep = bool(config.get("deep", True))

        def merge(target: dict[str, Any], source: dict[str, Any]) -> None:
            for key, value in source.items():
                if deep and isinstance(value, dict) and isinstance(target.get(key), dict):
                    merge(target[key], value)
                else:
                    target[key] = copy.deepcopy(value)

        result: dict[str, Any] = {}
        for item in config.get("objects", []):
            if isinstance(item, dict):
                merge(result, item)
        return result

    @registry.action(
        "file.read",
        title="Lire un fichier autorisé",
        category="Frontier · Système local",
        config_schema={"path": "string", "format": "text|json", "max_bytes": "number"},
        risk="safe",
    )
    async def file_read(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        root = Path(_services(context)["files_root"]).resolve()
        path = (root / str(config.get("path", ""))).resolve()
        if root != path and root not in path.parents:
            raise PermissionError("Le fichier demandé sort du dossier automation-files")
        max_bytes = max(1, min(int(config.get("max_bytes", 1_000_000)), 5_000_000))
        if path.stat().st_size > max_bytes:
            raise ValueError("Fichier trop volumineux")
        text = await asyncio.to_thread(path.read_text, encoding="utf-8")
        return json.loads(text) if config.get("format") == "json" else text

    @registry.action(
        "twitch.announcement",
        title="Annonce Twitch",
        category="Frontier · Twitch",
        config_schema={"message": "string", "color": "primary|blue|green|orange|purple"},
        risk="twitch-write",
        supports_simulation=False,
    )
    async def twitch_announcement(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await _services(context)["twitch"].send_announcement(
            str(config.get("message", "")), str(config.get("color", "primary"))
        )

    @registry.action(
        "twitch.shield_mode",
        title="Mode bouclier Twitch",
        category="Frontier · Sécurité",
        config_schema={"active": "boolean"},
        risk="moderation-high",
        supports_simulation=False,
    )
    async def twitch_shield(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await _services(context)["twitch"].set_shield_mode(bool(config.get("active", True)))

    @registry.action(
        "twitch.shoutout",
        title="Shoutout Twitch",
        category="Frontier · Twitch",
        config_schema={"broadcaster_user_id": "string"},
        risk="twitch-write",
        supports_simulation=False,
    )
    async def twitch_shoutout(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        await _services(context)["twitch"].send_shoutout(str(config["broadcaster_user_id"]))
        return {"sent": True}

    @registry.action(
        "twitch.warning",
        title="Avertissement Twitch",
        category="Frontier · Modération",
        config_schema={"user_id": "string", "reason": "string"},
        risk="moderation-high",
        supports_simulation=False,
    )
    async def twitch_warning(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        user_id = str(config.get("user_id") or event.payload.get("user_id") or "")
        if not user_id:
            raise ValueError("user_id requis")
        return await _services(context)["twitch"].warn_user(user_id, str(config.get("reason", "")))

    @registry.action(
        "twitch.suspicious_user",
        title="Statut utilisateur suspect",
        category="Frontier · Modération",
        config_schema={"user_id": "string", "status": "active_monitoring|restricted|none"},
        risk="moderation-high",
        supports_simulation=False,
    )
    async def suspicious_user(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        user_id = str(config.get("user_id") or event.payload.get("user_id") or "")
        return await _services(context)["twitch"].set_suspicious_user_status(
            user_id, str(config.get("status", "active_monitoring"))
        )

    @registry.action(
        "twitch.vip",
        title="Ajouter ou retirer un VIP",
        category="Frontier · Communauté",
        config_schema={"user_id": "string", "operation": "add|remove"},
        risk="twitch-write",
        supports_simulation=False,
    )
    async def twitch_vip(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        user_id = str(config.get("user_id") or event.payload.get("user_id") or "")
        operation = str(config.get("operation", "add"))
        twitch = _services(context)["twitch"]
        if operation == "add":
            await twitch.add_vip(user_id)
        elif operation == "remove":
            await twitch.remove_vip(user_id)
        else:
            raise ValueError("operation doit valoir add ou remove")
        return {"user_id": user_id, "operation": operation}

    @registry.action(
        "twitch.marker",
        title="Marqueur de stream",
        category="Frontier · Production",
        config_schema={"description": "string"},
        risk="twitch-write",
        supports_simulation=False,
    )
    async def twitch_marker(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await _services(context)["twitch"].create_stream_marker(
            str(config.get("description", "Aura Live"))
        )

    @registry.action(
        "obs.source.visible",
        title="Afficher ou masquer une source OBS",
        category="Frontier · OBS",
        config_schema={"scene": "string", "source": "string", "visible": "boolean"},
        risk="obs-control",
        supports_simulation=False,
    )
    async def obs_source_visible(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        obs = _services(context)["obs"]
        scene = str(config["scene"])
        source = str(config["source"])
        item = await obs.call("GetSceneItemId", {"sceneName": scene, "sourceName": source})
        await obs.call(
            "SetSceneItemEnabled",
            {
                "sceneName": scene,
                "sceneItemId": item["sceneItemId"],
                "sceneItemEnabled": bool(config.get("visible", True)),
            },
        )
        return {"scene": scene, "source": source, "visible": bool(config.get("visible", True))}

    @registry.action(
        "obs.filter.enabled",
        title="Activer un filtre OBS",
        category="Frontier · OBS",
        config_schema={"source": "string", "filter": "string", "enabled": "boolean"},
        risk="obs-control",
        supports_simulation=False,
    )
    async def obs_filter_enabled(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        await _services(context)["obs"].call(
            "SetSourceFilterEnabled",
            {
                "sourceName": str(config["source"]),
                "filterName": str(config["filter"]),
                "filterEnabled": bool(config.get("enabled", True)),
            },
        )
        return {"enabled": bool(config.get("enabled", True))}

    @registry.action(
        "obs.media.control",
        title="Piloter un média OBS",
        category="Frontier · OBS",
        config_schema={"input": "string", "action": "restart|play|pause|stop|next|previous"},
        risk="obs-control",
        supports_simulation=False,
    )
    async def obs_media_control(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        mapping = {
            "restart": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
            "play": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY",
            "pause": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE",
            "stop": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP",
            "next": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT",
            "previous": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS",
        }
        action = str(config.get("action", "restart"))
        await _services(context)["obs"].call(
            "TriggerMediaInputAction",
            {"inputName": str(config["input"]), "mediaAction": mapping[action]},
        )
        return {"action": action}

    @registry.action(
        "obs.broadcast.control",
        title="Contrôle critique du direct OBS",
        category="Frontier · OBS",
        config_schema={"operation": "start_stream|stop_stream|start_record|stop_record|save_replay"},
        risk="broadcast-critical",
        supports_simulation=False,
    )
    async def obs_broadcast_control(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        mapping = {
            "start_stream": "StartStream",
            "stop_stream": "StopStream",
            "start_record": "StartRecord",
            "stop_record": "StopRecord",
            "save_replay": "SaveReplayBuffer",
        }
        operation = str(config["operation"])
        return await _services(context)["obs"].call(mapping[operation], {})

    @registry.action(
        "mairaiy.respond",
        title="Réponse complète de Mairaiy",
        category="Frontier · Mairaiy",
        description="Conversation contextualisée, chat final uniquement, voix et avatar optionnels.",
        config_schema={
            "message": "string",
            "user_id": "string",
            "user_name": "string",
            "send_to_chat": "boolean",
            "speak": "boolean",
            "mention_user": "boolean",
            "max_characters": "number",
        },
        risk="ai-generation",
        supports_simulation=False,
    )
    async def mairaiy_respond(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        services = _services(context)
        ai = services["ai"]
        aura = services["aura"]
        user_id = str(config.get("user_id") or event.payload.get("user_id") or "automation")
        user_name = str(config.get("user_name") or event.payload.get("user_name") or "viewer")
        message = str(config.get("message") or event.payload.get("text") or "")
        answer = await ai.reply_to_chat(user_id, user_name, message, [])
        answer = _clean_ai_text(answer, max(80, int(config.get("max_characters", 420))))
        if config.get("send_to_chat", True):
            prefix = f"@{user_name} " if config.get("mention_user", True) and user_name else ""
            await aura.say(f"{prefix}{answer}".strip())
        if config.get("speak", False):
            await services["overlay"].emit(
                {"type": "aura_message", "text": answer, "message": answer, "speak": True}
            )
        return answer

    @registry.action(
        "mairaiy.decide",
        title="Décision bornée de Mairaiy",
        category="Frontier · Mairaiy",
        config_schema={"question": "string", "options": "array"},
        risk="ai-generation",
        supports_simulation=False,
    )
    async def mairaiy_decide(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        options = [str(item) for item in config.get("options", [])][:30]
        if not options:
            raise ValueError("Aucune option autorisée")
        answer = await _services(context)["ai"].generate(
            str(config.get("question", "")),
            "Choisis exactement une option de la liste suivante et réponds uniquement par cette option : "
            + json.dumps(options, ensure_ascii=False),
            40,
        )
        normalized = _clean_ai_text(answer, 120).casefold()
        for option in options:
            if option.casefold() == normalized:
                return option
        raise ValueError(f"Mairaiy a choisi une valeur non autorisée : {answer}")
