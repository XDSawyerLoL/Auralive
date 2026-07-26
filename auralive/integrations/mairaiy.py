from __future__ import annotations

import re
from typing import Any

from auralive.automation.models import Event
from auralive.automation.registry import AutomationRegistry

from .base import require_service

_THINKING = re.compile(r"(?i)^\s*@?\w*\s*(?:je réfléchis|je reflechis|thinking)\s*[.…!]*\s*$")


def clean_live_reply(text: str, *, max_characters: int = 420) -> str:
    cleaned = " ".join(str(text).replace("\n", " ").split())
    if _THINKING.match(cleaned):
        raise ValueError("Réponse intermédiaire interdite")
    forbidden = ("je réfléchis", "je reflechis", "en tant qu'ia", "as an ai")
    lowered = cleaned.lower()
    if any(item in lowered for item in forbidden):
        cleaned = re.sub(r"(?i)\bje r[ée]fl[ée]chis[.…!]*", "", cleaned).strip()
    return cleaned[:max_characters].rstrip()


def install_mairaiy_actions(registry: AutomationRegistry) -> None:
    @registry.action(
        "mairaiy.ask",
        title="Demander à Mairaiy",
        category="Mairaiy · Intelligence",
        description="Génère une réponse cohérente, sans publier automatiquement dans le chat.",
        config_schema={
            "prompt": "string",
            "user_id": "string|null",
            "max_characters": "number",
            "channel_context": "array|null",
        },
        risk="ai-generation",
        supports_simulation=False,
    )
    async def ask(config: dict[str, Any], event: Event, context: dict[str, Any]) -> str:
        gateway = require_service(context.get("services", {}), "mairaiy")
        max_characters = int(config.get("max_characters", 420))
        response = await gateway.ask(
            str(config.get("prompt", "")),
            user_id=str(config.get("user_id") or event.payload.get("user_id") or "") or None,
            channel_context=config.get("channel_context"),
            max_characters=max_characters,
        )
        return clean_live_reply(response, max_characters=max_characters)

    @registry.action(
        "mairaiy.choose",
        title="Décision contrôlée de Mairaiy",
        category="Mairaiy · Intelligence",
        description="Mairaiy choisit uniquement parmi une liste d’options explicitement autorisées.",
        config_schema={"question": "string", "options": "array", "user_id": "string|null"},
        risk="ai-decision",
        supports_simulation=False,
    )
    async def choose(config: dict[str, Any], event: Event, context: dict[str, Any]) -> str:
        options = [str(item) for item in config.get("options", [])]
        if not options:
            raise ValueError("Aucune option autorisée")
        gateway = require_service(context.get("services", {}), "mairaiy")
        prompt = (
            f"{config.get('question', '')}\n"
            f"Choisis exactement une valeur parmi : {options}. "
            "Réponds uniquement avec la valeur choisie."
        )
        response = clean_live_reply(
            await gateway.ask(
                prompt,
                user_id=str(config.get("user_id") or event.payload.get("user_id") or "") or None,
                max_characters=120,
            ),
            max_characters=120,
        )
        for option in options:
            if response.casefold() == option.casefold():
                return option
        raise ValueError(f"Décision IA hors liste autorisée : {response}")

    @registry.action(
        "mairaiy.speak",
        title="Faire parler Mairaiy",
        category="Mairaiy · Voix",
        config_schema={"text": "string", "voice": "string|null"},
        risk="audio-output",
        supports_simulation=False,
    )
    async def speak(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        gateway = require_service(context.get("services", {}), "mairaiy")
        text = clean_live_reply(str(config.get("text", "")), max_characters=800)
        return await gateway.speak(text, voice=config.get("voice"))

    @registry.action(
        "mairaiy.remember",
        title="Mémoriser un fait viewer",
        category="Mairaiy · Mémoire",
        config_schema={"user_id": "string", "fact": "string"},
        risk="personal-data",
        supports_simulation=False,
    )
    async def remember(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        gateway = require_service(context.get("services", {}), "mairaiy")
        user_id = str(config.get("user_id") or event.payload.get("user_id") or "")
        if not user_id:
            raise ValueError("user_id requis")
        return await gateway.remember(user_id, str(config.get("fact", "")))

    @registry.action(
        "mairaiy.forget",
        title="Oublier une mémoire viewer",
        category="Mairaiy · Mémoire",
        config_schema={"user_id": "string", "query": "string|null"},
        risk="personal-data-delete",
        supports_simulation=False,
    )
    async def forget(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        gateway = require_service(context.get("services", {}), "mairaiy")
        user_id = str(config.get("user_id") or event.payload.get("user_id") or "")
        if not user_id:
            raise ValueError("user_id requis")
        return await gateway.forget(user_id, config.get("query"))

    @registry.action(
        "overlay.publish",
        title="Envoyer vers un overlay OBS",
        category="Mairaiy · Présence",
        config_schema={"channel": "string", "payload": "object"},
        risk="visual-output",
        supports_simulation=False,
    )
    async def overlay_publish(
        config: dict[str, Any], event: Event, context: dict[str, Any]
    ) -> Any:
        gateway = require_service(context.get("services", {}), "overlay")
        return await gateway.publish(str(config["channel"]), dict(config.get("payload", {})))
