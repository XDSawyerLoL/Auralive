from __future__ import annotations

import asyncio
import random
from typing import Any

from .models import Event
from .registry import AutomationRegistry


LEGACY_REPLACEABLE_EVENTS = {
    "channel.follow",
    "channel.subscribe",
    "channel.subscription.gift",
    "channel.subscription.message",
    "channel.cheer",
    "channel.raid",
    "channel.channel_points_custom_reward_redemption.add",
    "channel.hype_train.begin",
    "channel.hype_train.progress",
    "channel.hype_train.end",
    "channel.shoutout.receive",
}


def automation_replaces_legacy(event_type: str, reports: list[dict[str, Any]]) -> bool:
    """Le comportement historique est remplacé uniquement par un scénario réussi."""
    if event_type not in LEGACY_REPLACEABLE_EVENTS:
        return False
    return any(bool(item.get("ok")) and not bool(item.get("skipped")) for item in reports)


def _value_at(path: str, event: Event, context: dict[str, Any]) -> Any:
    current: Any = {"event": event.payload, **context}
    for part in str(path).split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _compare_number(left: float, operator: str, right: float) -> bool:
    operations = {
        "eq": left == right,
        "ne": left != right,
        "gt": left > right,
        "gte": left >= right,
        "lt": left < right,
        "lte": left <= right,
    }
    if operator not in operations:
        raise ValueError(f"Opérateur numérique inconnu : {operator}")
    return operations[operator]


def install_pro_nodes(registry: AutomationRegistry) -> None:
    @registry.condition(
        "event.field_exists",
        title="Champ présent dans l’événement",
        category="Événement",
        description="Vérifie qu’une donnée existe et n’est pas vide.",
        config_schema={"path": "string"},
    )
    async def field_exists(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        value = _value_at(str(config.get("path", "")), event, context)
        return value is not None and value != ""

    @registry.condition(
        "event.number_compare",
        title="Comparer une valeur numérique",
        category="Événement",
        config_schema={"path": "string", "operator": "eq|ne|gt|gte|lt|lte", "value": "number"},
    )
    async def number_compare(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        value = _value_at(str(config.get("path", "")), event, context)
        if value is None:
            return False
        return _compare_number(float(value), str(config.get("operator", "gte")), float(config.get("value", 0)))

    @registry.condition(
        "event.text_compare",
        title="Comparer un texte d’événement",
        category="Événement",
        config_schema={"path": "string", "operator": "eq|contains|starts_with|ends_with", "value": "string", "case_sensitive": "boolean"},
    )
    async def text_compare(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        left = str(_value_at(str(config.get("path", "")), event, context) or "")
        right = str(config.get("value", ""))
        if not config.get("case_sensitive", False):
            left, right = left.casefold(), right.casefold()
        operator = str(config.get("operator", "eq"))
        if operator == "eq":
            return left == right
        if operator == "contains":
            return right in left
        if operator == "starts_with":
            return left.startswith(right)
        if operator == "ends_with":
            return left.endswith(right)
        raise ValueError(f"Opérateur texte inconnu : {operator}")

    @registry.condition(
        "aura.bot_state",
        title="État opérationnel de Mairaiy",
        category="Aura Live",
        config_schema={"active": "boolean", "silent": "boolean", "emergency": "boolean"},
    )
    async def bot_state(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        db = context["services"]["db"]
        active = bool(await db.get_setting("bot.active", True))
        silent = bool(await db.get_setting("bot.silent", False))
        emergency = bool(await db.get_setting("moderation.emergency_mode", False))
        return (
            active is bool(config.get("active", True))
            and silent is bool(config.get("silent", False))
            and emergency is bool(config.get("emergency", False))
        )

    @registry.action(
        "twitch.clip.create",
        title="Créer un clip Twitch",
        category="Twitch Pro",
        description="Crée un clip sur la chaîne et renvoie son URL d’édition.",
        config_schema={},
        risk="twitch-write",
        supports_simulation=False,
    )
    async def twitch_clip_create(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return {"edit_url": await context["services"]["twitch"].create_clip()}

    @registry.action(
        "twitch.stream.marker",
        title="Créer un marqueur de stream",
        category="Twitch Pro",
        config_schema={"description": "string"},
        risk="twitch-write",
        supports_simulation=False,
    )
    async def twitch_stream_marker(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        twitch = context["services"]["twitch"]
        if not twitch.broadcaster_user_id:
            raise RuntimeError("Le compte diffuseur Twitch n’est pas connecté")
        return await twitch.request(
            "POST",
            "/streams/markers",
            role="broadcaster",
            json_body={
                "user_id": twitch.broadcaster_user_id,
                "description": str(config.get("description", "Moment Aura Live"))[:140],
            },
        )

    @registry.action(
        "twitch.channel.update",
        title="Modifier le titre ou la catégorie Twitch",
        category="Twitch Pro",
        config_schema={"title": "string", "game_id": "string", "language": "string"},
        risk="twitch-write",
        supports_simulation=False,
    )
    async def twitch_channel_update(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        twitch = context["services"]["twitch"]
        await twitch.update_channel(
            title=str(config.get("title")) if config.get("title") else None,
            game_id=str(config.get("game_id")) if config.get("game_id") else None,
            language=str(config.get("language")) if config.get("language") else None,
        )
        return {"updated": True}

    @registry.action(
        "twitch.reward.resolve",
        title="Valider ou rembourser une récompense Twitch",
        category="Twitch Pro",
        config_schema={"reward_id": "string", "redemption_id": "string", "status": "FULFILLED|CANCELED"},
        risk="twitch-write",
        supports_simulation=False,
    )
    async def twitch_reward_resolve(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        reward = event.payload.get("reward") or {}
        reward_id = str(config.get("reward_id") or reward.get("id") or "")
        redemption_id = str(config.get("redemption_id") or event.payload.get("id") or "")
        if not reward_id or not redemption_id:
            raise ValueError("reward_id et redemption_id sont obligatoires")
        return await context["services"]["twitch"].update_redemption_status(
            reward_id,
            redemption_id,
            str(config.get("status", "FULFILLED")),
        )

    @registry.action(
        "obs.scene_item.visibility",
        title="Afficher ou masquer une source OBS",
        category="OBS Pro",
        config_schema={"scene": "string", "source": "string", "visible": "boolean"},
        risk="obs-write",
        supports_simulation=False,
    )
    async def obs_scene_item_visibility(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        obs = context["services"]["obs"]
        scene = str(config.get("scene", ""))
        source = str(config.get("source", ""))
        item = await obs.call("GetSceneItemId", {"sceneName": scene, "sourceName": source})
        scene_item_id = int(item["sceneItemId"])
        await obs.call(
            "SetSceneItemEnabled",
            {"sceneName": scene, "sceneItemId": scene_item_id, "sceneItemEnabled": bool(config.get("visible", True))},
        )
        return {"scene": scene, "source": source, "visible": bool(config.get("visible", True))}

    @registry.action(
        "obs.media.restart",
        title="Relancer un média OBS",
        category="OBS Pro",
        config_schema={"input": "string"},
        risk="obs-write",
        supports_simulation=False,
    )
    async def obs_media_restart(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        input_name = str(config.get("input", ""))
        await context["services"]["obs"].call(
            "TriggerMediaInputAction",
            {"inputName": input_name, "mediaAction": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART"},
        )
        return {"input": input_name, "restarted": True}

    @registry.action(
        "obs.filter.set",
        title="Activer ou désactiver un filtre OBS",
        category="OBS Pro",
        config_schema={"source": "string", "filter": "string", "enabled": "boolean"},
        risk="obs-write",
        supports_simulation=False,
    )
    async def obs_filter_set(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        payload = {
            "sourceName": str(config.get("source", "")),
            "filterName": str(config.get("filter", "")),
            "filterEnabled": bool(config.get("enabled", True)),
        }
        await context["services"]["obs"].call("SetSourceFilterEnabled", payload)
        return payload

    @registry.action(
        "obs.text.set",
        title="Modifier un texte OBS",
        category="OBS Pro",
        config_schema={"input": "string", "text": "string"},
        risk="obs-write",
        supports_simulation=False,
    )
    async def obs_text_set(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        payload = {
            "inputName": str(config.get("input", "")),
            "inputSettings": {"text": str(config.get("text", ""))},
            "overlay": True,
        }
        await context["services"]["obs"].call("SetInputSettings", payload)
        return payload

    @registry.action(
        "aura.overlay.alert",
        title="Alerte audiovisuelle complète",
        category="Mairaiy Pro",
        config_schema={"type": "string", "viewer": "string", "message": "string", "media": "string", "sound": "string", "duration": "number", "speak": "boolean"},
    )
    async def aura_overlay_alert(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        payload = {
            "type": str(config.get("type", "custom")),
            "viewer": str(config.get("viewer", event.payload.get("user_name", ""))),
            "message": str(config.get("message", "")),
            "media": str(config.get("media", "")),
            "sound": str(config.get("sound", "")),
            "duration": max(1.0, float(config.get("duration", 7))),
            "speak": bool(config.get("speak", False)),
        }
        await context["services"]["overlay"].emit(payload)
        return payload

    @registry.action(
        "aura.chat.sequence",
        title="Séquence de messages maîtrisée",
        category="Mairaiy Pro",
        config_schema={"messages": "array", "delay_seconds": "number"},
        risk="twitch-write",
        supports_simulation=False,
    )
    async def aura_chat_sequence(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        messages = [str(item).strip() for item in config.get("messages", []) if str(item).strip()]
        delay = min(15.0, max(1.0, float(config.get("delay_seconds", 2.0))))
        aura = context["services"]["aura"]
        for index, message in enumerate(messages[:5]):
            if index:
                await asyncio.sleep(delay)
            await aura.say(message)
        return {"sent": len(messages[:5])}

    @registry.action(
        "flow.random_choice",
        title="Choisir une valeur aléatoire",
        category="Flux Pro",
        config_schema={"choices": "array"},
    )
    async def flow_random_choice(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        choices = list(config.get("choices", []))
        if not choices:
            raise ValueError("La liste choices est vide")
        return random.choice(choices)


def professional_templates() -> list[dict[str, Any]]:
    return [
        {
            "id": "template-raid-production",
            "name": "Raid production complète",
            "trigger": "channel.raid",
            "description": "Accueil unique, vocal et visuel, sans doublon avec l’ancien système.",
            "enabled": False,
            "priority": 30,
            "queue_key": "raid-production",
            "cooldown_seconds": 20,
            "actions": [
                {
                    "type": "aura.ai.generate",
                    "config": {
                        "prompt": "Accueille le raid de {{event.from_broadcaster_user_name}} et ses {{event.viewers}} viewers en une phrase naturelle et énergique.",
                        "instruction": "Une seule phrase, pas de formule générique répétitive.",
                        "max_tokens": 70,
                        "send_to_chat": True,
                        "speak": True,
                    },
                },
                {
                    "type": "aura.overlay.alert",
                    "config": {
                        "type": "raid",
                        "viewer": "{{event.from_broadcaster_user_name}}",
                        "message": "Raid de {{event.viewers}} viewers",
                        "duration": 9,
                        "speak": False,
                    },
                },
            ],
        },
        {
            "id": "template-sub-production",
            "name": "Abonnement — accueil premium",
            "trigger": "channel.subscribe",
            "description": "Remerciement court dans le chat et animation OBS.",
            "enabled": False,
            "priority": 35,
            "queue_key": "subscriptions",
            "cooldown_seconds": 2,
            "actions": [
                {
                    "type": "aura.ai.generate",
                    "config": {
                        "prompt": "Remercie {{event.user_name}} pour son abonnement en une phrase personnelle et brève.",
                        "max_tokens": 60,
                        "send_to_chat": True,
                        "speak": True,
                    },
                },
                {
                    "type": "aura.overlay.alert",
                    "config": {"type": "subscribe", "viewer": "{{event.user_name}}", "message": "Bienvenue à bord", "duration": 8},
                },
            ],
        },
        {
            "id": "template-bits-milestone",
            "name": "Bits — réaction à partir de 500",
            "trigger": "channel.cheer",
            "description": "Réagit seulement aux cheers importants.",
            "enabled": False,
            "priority": 40,
            "conditions": [
                {"type": "event.number_compare", "config": {"path": "event.bits", "operator": "gte", "value": 500}}
            ],
            "actions": [
                {
                    "type": "aura.overlay.alert",
                    "config": {"type": "bits", "viewer": "{{event.user_name}}", "message": "{{event.bits}} bits !", "duration": 9, "speak": True},
                },
                {
                    "type": "aura.chat.send",
                    "config": {"message": "Merci {{event.user_name}} pour les {{event.bits}} bits — grosse vague sur le Spot !"},
                },
            ],
        },
        {
            "id": "template-stream-marker",
            "name": "Marqueur Twitch depuis une récompense",
            "trigger": "channel.channel_points_custom_reward_redemption.add",
            "description": "Crée un marqueur de stream quand la récompense MARQUEUR est utilisée.",
            "enabled": False,
            "priority": 45,
            "conditions": [
                {"type": "event.text_compare", "config": {"path": "event.reward.title", "operator": "eq", "value": "MARQUEUR", "case_sensitive": False}}
            ],
            "actions": [
                {"type": "twitch.stream.marker", "config": {"description": "Récompense utilisée par {{event.user_name}}"}},
                {"type": "twitch.reward.resolve", "config": {"status": "FULFILLED"}},
                {"type": "aura.chat.send", "config": {"message": "Moment marqué par {{event.user_name}}."}},
            ],
        },
    ]
