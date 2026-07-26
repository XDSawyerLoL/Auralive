from __future__ import annotations

from typing import Any

from .models import Event
from .registry import AutomationRegistry


def install_resilience_nodes(registry: AutomationRegistry) -> None:
    @registry.action(
        "moderation.domain.block",
        title="Bloquer un domaine",
        category="Sécurité Pro",
        description="Ajoute un domaine à la protection anti-promotion commerciale.",
        config_schema={"domain": "string"},
        risk="moderation",
        supports_simulation=False,
    )
    async def block_domain(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        db = context["services"]["db"]
        domain = str(config.get("domain", "")).casefold().strip()
        if domain.startswith("www."):
            domain = domain[4:]
        if not domain or "." not in domain:
            raise ValueError("Domaine invalide")
        domains = list(
            await db.get_setting(
                "moderation.commercial_spam.blocked_domains",
                ["streamboo.com"],
            )
        )
        normalized = {str(item).casefold().strip() for item in domains}
        normalized.add(domain)
        result = sorted(item for item in normalized if item)
        await db.set_setting("moderation.commercial_spam.blocked_domains", result)
        return {"blocked_domains": result}

    @registry.action(
        "moderation.domain.unblock",
        title="Débloquer un domaine",
        category="Sécurité Pro",
        config_schema={"domain": "string"},
        risk="moderation",
        supports_simulation=False,
    )
    async def unblock_domain(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        db = context["services"]["db"]
        domain = str(config.get("domain", "")).casefold().strip()
        if domain.startswith("www."):
            domain = domain[4:]
        domains = list(
            await db.get_setting(
                "moderation.commercial_spam.blocked_domains",
                ["streamboo.com"],
            )
        )
        result = sorted(
            {
                str(item).casefold().strip()
                for item in domains
                if str(item).casefold().strip() != domain
            }
        )
        await db.set_setting("moderation.commercial_spam.blocked_domains", result)
        return {"blocked_domains": result}

    @registry.action(
        "moderation.commercial_spam.configure",
        title="Configurer l’anti-faux-viewers",
        category="Sécurité Pro",
        config_schema={"enabled": "boolean", "timeout_seconds": "number"},
        risk="moderation",
        supports_simulation=False,
    )
    async def configure_commercial_spam(
        config: dict[str, Any], event: Event, context: dict[str, Any]
    ) -> Any:
        db = context["services"]["db"]
        enabled = bool(config.get("enabled", True))
        timeout = max(60, min(int(config.get("timeout_seconds", 1_209_600)), 1_209_600))
        await db.set_setting("moderation.commercial_spam.enabled", enabled)
        await db.set_setting("moderation.commercial_spam.timeout_seconds", timeout)
        return {"enabled": enabled, "timeout_seconds": timeout}

    @registry.action(
        "twitch.user.ban",
        title="Bannir définitivement un compte Twitch",
        category="Twitch Sécurité",
        config_schema={"user_id": "string", "reason": "string"},
        risk="moderation",
        supports_simulation=False,
    )
    async def twitch_user_ban(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        twitch = context["services"]["twitch"]
        user_id = str(
            config.get("user_id")
            or event.payload.get("user_id")
            or event.payload.get("chatter_user_id")
            or ""
        )
        if not user_id:
            raise ValueError("Aucun user_id disponible")
        await twitch.request(
            "POST",
            "/moderation/bans",
            role="bot",
            params={
                "broadcaster_id": twitch.broadcaster_user_id,
                "moderator_id": twitch.bot_user_id,
            },
            json_body={
                "data": {
                    "user_id": user_id,
                    "reason": str(config.get("reason", "Aura Live — spam ou abus"))[:500],
                }
            },
        )
        return {"user_id": user_id, "banned": True}

    @registry.action(
        "twitch.user.unban",
        title="Débannir un compte Twitch",
        category="Twitch Sécurité",
        config_schema={"user_id": "string"},
        risk="moderation",
        supports_simulation=False,
    )
    async def twitch_user_unban(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        twitch = context["services"]["twitch"]
        user_id = str(config.get("user_id") or event.payload.get("user_id") or "")
        if not user_id:
            raise ValueError("Aucun user_id disponible")
        await twitch.request(
            "DELETE",
            "/moderation/bans",
            role="bot",
            params={
                "broadcaster_id": twitch.broadcaster_user_id,
                "moderator_id": twitch.bot_user_id,
                "user_id": user_id,
            },
        )
        return {"user_id": user_id, "banned": False}

    @registry.action(
        "twitch.chat.clear",
        title="Vider le chat Twitch",
        category="Twitch Sécurité",
        config_schema={},
        risk="moderation",
        supports_simulation=False,
    )
    async def twitch_chat_clear(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        twitch = context["services"]["twitch"]
        await twitch.request(
            "DELETE",
            "/moderation/chat",
            role="bot",
            params={
                "broadcaster_id": twitch.broadcaster_user_id,
                "moderator_id": twitch.bot_user_id,
            },
        )
        return {"cleared": True}

    @registry.action(
        "aura.ai.recover",
        title="Relancer le moteur IA local",
        category="Mairaiy Résilience",
        config_schema={},
        risk="local-control",
        supports_simulation=False,
    )
    async def ai_recover(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await context["services"]["ai"].recover()

    @registry.action(
        "aura.ai.model.set",
        title="Choisir le modèle IA actif",
        category="Mairaiy Résilience",
        config_schema={"model": "string"},
        risk="local-control",
        supports_simulation=False,
    )
    async def ai_model_set(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        ai = context["services"]["ai"]
        model = str(config.get("model", "")).strip()
        if not model:
            raise ValueError("Nom de modèle obligatoire")
        ai.runtime_model = model
        ai.consecutive_failures = 0
        ai.degraded_until = 0.0
        return ai.diagnostic()

    @registry.action(
        "obs.recording.start",
        title="Démarrer l’enregistrement OBS",
        category="OBS Production",
        config_schema={},
        risk="obs-write",
        supports_simulation=False,
    )
    async def obs_recording_start(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await context["services"]["obs"].call("StartRecord")

    @registry.action(
        "obs.recording.stop",
        title="Arrêter l’enregistrement OBS",
        category="OBS Production",
        config_schema={},
        risk="obs-write",
        supports_simulation=False,
    )
    async def obs_recording_stop(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
        return await context["services"]["obs"].call("StopRecord")

    @registry.action(
        "obs.replay_buffer.save",
        title="Sauvegarder le Replay Buffer OBS",
        category="OBS Production",
        config_schema={},
        risk="obs-write",
        supports_simulation=False,
    )
    async def obs_replay_buffer_save(
        config: dict[str, Any], event: Event, context: dict[str, Any]
    ) -> Any:
        return await context["services"]["obs"].call("SaveReplayBuffer")

    @registry.action(
        "obs.virtual_camera.toggle",
        title="Basculer la caméra virtuelle OBS",
        category="OBS Production",
        config_schema={"enabled": "boolean"},
        risk="obs-write",
        supports_simulation=False,
    )
    async def obs_virtual_camera_toggle(
        config: dict[str, Any], event: Event, context: dict[str, Any]
    ) -> Any:
        request_type = "StartVirtualCam" if bool(config.get("enabled", True)) else "StopVirtualCam"
        await context["services"]["obs"].call(request_type)
        return {"enabled": bool(config.get("enabled", True))}
