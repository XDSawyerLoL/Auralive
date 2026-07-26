from __future__ import annotations

import asyncio
import json
import os
import shlex
import socket
from pathlib import Path
from typing import Any

import websockets

from .models import Event
from .registry import AutomationRegistry


def _services(context: dict[str, Any]) -> dict[str, Any]:
    return context.get("services", {})


def install_native_nodes(registry: AutomationRegistry) -> None:
    @registry.condition(
        "aura.stream_online",
        title="Live en cours",
        category="Aura Live",
        config_schema={"expected": "boolean"},
    )
    async def stream_online(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        aura = _services(context)["aura"]
        return bool(aura.stream_online) is bool(config.get("expected", True))

    @registry.condition(
        "aura.setting_equals",
        title="Réglage Aura égal à",
        category="Aura Live",
        config_schema={"key": "string", "value": "any"},
    )
    async def setting_equals(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        db = _services(context)["db"]
        return await db.get_setting(str(config["key"])) == config.get("value")

    @registry.condition(
        "aura.viewer_points",
        title="Solde d’Écumes",
        category="Communauté",
        config_schema={"operator": "gte|lte|eq", "amount": "number"},
    )
    async def viewer_points(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        db = _services(context)["db"]
        user_id = str(event.payload.get("user_id") or event.payload.get("chatter_user_id") or "")
        viewer = await db.get_viewer(user_id=user_id) if user_id else None
        current = int(viewer.get("points", 0)) if viewer else 0
        amount = int(config.get("amount", 0))
        operator = str(config.get("operator", "gte"))
        return {"gte": current >= amount, "lte": current <= amount, "eq": current == amount}.get(operator, False)

    @registry.condition(
        "aura.viewer_level",
        title="Niveau du viewer",
        category="Communauté",
        config_schema={"minimum": "number"},
    )
    async def viewer_level(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        db = _services(context)["db"]
        user_id = str(event.payload.get("user_id") or event.payload.get("chatter_user_id") or "")
        viewer = await db.get_viewer(user_id=user_id) if user_id else None
        return int(viewer.get("level", 0)) >= int(config.get("minimum", 1)) if viewer else False

    @registry.condition(
        "aura.text_contains",
        title="Le texte contient",
        category="Chat",
        config_schema={"text": "string", "case_sensitive": "boolean"},
    )
    async def text_contains(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        message = event.payload.get("text")
        if message is None:
            message = (event.payload.get("message") or {}).get("text", "")
        expected = str(config.get("text", ""))
        if config.get("case_sensitive", False):
            return expected in str(message)
        return expected.casefold() in str(message).casefold()

    @registry.action(
        "aura.chat.send",
        title="Envoyer dans le chat Twitch",
        category="Twitch",
        config_schema={"message": "string"},
    )
    async def chat_send(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        aura = _services(context)["aura"]
        return await aura.say(str(config.get("message", "")))

    @registry.action(
        "aura.overlay.emit",
        title="Afficher dans un overlay",
        category="OBS et médias",
        config_schema={"payload": "object"},
    )
    async def overlay_emit(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        overlay = _services(context)["overlay"]
        payload = dict(config.get("payload") or {})
        await overlay.emit(payload)
        return payload

    @registry.action(
        "aura.tts.speak",
        title="Faire parler Mairaiy",
        category="Mairaiy",
        config_schema={"text": "string", "voice": "string", "rate": "number", "pitch": "number", "volume": "number"},
    )
    async def tts_speak(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        overlay = _services(context)["overlay"]
        payload = {
            "type": "tts",
            "text": str(config.get("text", "")),
            "message": str(config.get("text", "")),
            "voice": str(config.get("voice", "")),
            "rate": float(config.get("rate", 1.0)),
            "pitch": float(config.get("pitch", 1.0)),
            "volume": float(config.get("volume", 1.0)),
        }
        await overlay.emit(payload)
        return payload

    @registry.action(
        "aura.ai.generate",
        title="Demander à Mairaiy",
        category="Mairaiy",
        config_schema={"prompt": "string", "instruction": "string", "max_tokens": "number", "send_to_chat": "boolean", "speak": "boolean"},
    )
    async def ai_generate(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        services = _services(context)
        ai = services["ai"]
        aura = services["aura"]
        answer = await ai.generate(
            str(config.get("prompt", "")),
            str(config.get("instruction", "Réponds brièvement et uniquement avec le résultat utile.")),
            int(config.get("max_tokens", 120)),
        )
        if config.get("send_to_chat", False):
            await aura.say(answer)
        if config.get("speak", False):
            await services["overlay"].emit({"type": "aura_message", "text": answer, "message": answer, "speak": True})
        return answer

    @registry.action(
        "aura.points.adjust",
        title="Modifier les Écumes",
        category="Communauté",
        config_schema={"user_id": "string", "amount": "number", "reason": "string"},
    )
    async def points_adjust(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        db = _services(context)["db"]
        user_id = str(config.get("user_id") or event.payload.get("user_id") or event.payload.get("chatter_user_id") or "")
        if not user_id:
            raise ValueError("Aucun user_id disponible")
        balance = await db.adjust_points(user_id, int(config.get("amount", 0)), str(config.get("reason", "Automation Studio")))
        return {"user_id": user_id, "balance": balance}

    @registry.action(
        "aura.counter.change",
        title="Modifier un compteur",
        category="Aura Live",
        config_schema={"slug": "string", "delta": "number"},
    )
    async def counter_change(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        services = _services(context)
        row = await services["aura"].engagement.counter_change(str(config.get("slug", "fails")), int(config.get("delta", 1)))
        if row:
            await services["overlay"].emit({"type": "counter", "slug": row["slug"], "label": row["label"], "value": row["value"]})
        return row

    @registry.action(
        "aura.setting.set",
        title="Modifier un réglage Aura",
        category="Aura Live",
        config_schema={"key": "string", "value": "any"},
    )
    async def setting_set(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        db = _services(context)["db"]
        await db.set_setting(str(config["key"]), config.get("value"))
        return config.get("value")

    @registry.action(
        "aura.event.log",
        title="Journaliser un événement",
        category="Débogage",
        config_schema={"type": "string", "payload": "object"},
    )
    async def event_log(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        db = _services(context)["db"]
        payload = dict(config.get("payload") or {})
        await db.log_event(str(config.get("type", "automation.custom")), payload)
        return payload

    @registry.action(
        "obs.request",
        title="Requête OBS native",
        category="OBS et médias",
        config_schema={"request_type": "string", "request_data": "object"},
    )
    async def obs_request(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        obs = _services(context)["obs"]
        return await obs.call(str(config["request_type"]), dict(config.get("request_data") or {}))

    @registry.action(
        "obs.scene.set",
        title="Changer de scène OBS",
        category="OBS et médias",
        config_schema={"scene": "string"},
    )
    async def obs_scene_set(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        scene = str(config["scene"])
        await _services(context)["obs"].set_scene(scene)
        return {"scene": scene}

    @registry.action(
        "obs.input.mute_toggle",
        title="Basculer le son d’une source OBS",
        category="OBS et médias",
        config_schema={"input": "string"},
    )
    async def obs_input_mute_toggle(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await _services(context)["obs"].toggle_mute(str(config["input"]))

    @registry.action(
        "twitch.request",
        title="Requête Twitch Helix native",
        category="Twitch",
        config_schema={"method": "string", "path": "string", "role": "bot|broadcaster", "params": "object", "body": "object"},
        risk="twitch-write",
        supports_simulation=False,
    )
    async def twitch_request(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        twitch = _services(context)["twitch"]
        return await twitch.request(
            str(config.get("method", "GET")),
            str(config["path"]),
            role=str(config.get("role", "broadcaster")),
            params=dict(config.get("params") or {}),
            json_body=dict(config.get("body") or {}) or None,
        )

    @registry.action(
        "twitch.timeout",
        title="Timeout Twitch",
        category="Modération",
        config_schema={"user_id": "string", "duration": "number", "reason": "string"},
        risk="moderation",
        supports_simulation=False,
    )
    async def twitch_timeout(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        user_id = str(config.get("user_id") or event.payload.get("user_id") or event.payload.get("chatter_user_id") or "")
        if not user_id:
            raise ValueError("Aucun user_id disponible")
        await _services(context)["twitch"].timeout_user(user_id, int(config.get("duration", 30)), str(config.get("reason", "Automation Studio")))
        return {"user_id": user_id}

    @registry.action(
        "websocket.send",
        title="Envoyer sur un WebSocket",
        category="Réseau",
        config_schema={"url": "string", "message": "any"},
        risk="network",
        supports_simulation=False,
    )
    async def websocket_send(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        message = config.get("message", "")
        encoded = message if isinstance(message, str) else json.dumps(message, ensure_ascii=False)
        async with websockets.connect(str(config["url"]), open_timeout=5, close_timeout=2) as ws:
            await ws.send(encoded)
        return {"sent": True}

    @registry.action(
        "udp.send",
        title="Envoyer un paquet UDP",
        category="Réseau",
        config_schema={"host": "string", "port": "number", "message": "string"},
        risk="network",
        supports_simulation=False,
    )
    async def udp_send(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        payload = str(config.get("message", "")).encode("utf-8")
        def send() -> None:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
                client.sendto(payload, (str(config["host"]), int(config["port"])))
        await asyncio.to_thread(send)
        return {"bytes": len(payload)}

    @registry.action(
        "system.process.run",
        title="Lancer un programme autorisé",
        category="Système local",
        config_schema={"program": "string", "args": "array", "wait": "boolean", "timeout": "number"},
        risk="process",
        supports_simulation=False,
    )
    async def process_run(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        db = _services(context)["db"]
        program = str(config["program"])
        allowed = [os.path.normcase(str(item)) for item in await db.get_setting("automation.allowed_programs", [])]
        normalized = os.path.normcase(str(Path(program).resolve()))
        if normalized not in allowed:
            raise PermissionError("Programme absent de la liste automation.allowed_programs")
        args = [str(item) for item in config.get("args", [])]
        process = await asyncio.create_subprocess_exec(program, *args)
        if config.get("wait", False):
            return_code = await asyncio.wait_for(process.wait(), timeout=float(config.get("timeout", 30)))
            return {"pid": process.pid, "return_code": return_code}
        return {"pid": process.pid}
