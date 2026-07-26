from __future__ import annotations

import logging
from types import MethodType
from typing import Any

logger = logging.getLogger(__name__)


_REQUIRED_SCOPE_GROUPS: dict[str, tuple[tuple[str, ...], ...]] = {
    "channel.follow": (("moderator:read:followers", "moderator:manage:followers"),),
    "channel.subscribe": (("channel:read:subscriptions",),),
    "channel.subscription.gift": (("channel:read:subscriptions",),),
    "channel.subscription.message": (("channel:read:subscriptions",),),
    "channel.cheer": (("bits:read",),),
    "channel.channel_points_custom_reward_redemption.add": (
        ("channel:read:redemptions", "channel:manage:redemptions"),
    ),
    "channel.hype_train.begin": (("channel:read:hype_train",),),
    "channel.hype_train.progress": (("channel:read:hype_train",),),
    "channel.hype_train.end": (("channel:read:hype_train",),),
    "channel.shoutout.receive": (
        ("moderator:read:shoutouts", "moderator:manage:shoutouts"),
    ),
}


def subscription_specs(client: Any, role: str) -> list[tuple[str, str, dict[str, str]]]:
    """Retourne les abonnements EventSub officiels utilisés par Aura Live."""
    if role == "bot":
        return [
            (
                "channel.chat.message",
                "1",
                {
                    "broadcaster_user_id": client.broadcaster_user_id,
                    "user_id": client.bot_user_id,
                },
            )
        ]
    if role != "broadcaster":
        raise ValueError(f"Rôle EventSub inconnu: {role}")

    broadcaster_id = client.broadcaster_user_id
    return [
        (
            "channel.follow",
            "2",
            {
                "broadcaster_user_id": broadcaster_id,
                "moderator_user_id": broadcaster_id,
            },
        ),
        ("channel.subscribe", "1", {"broadcaster_user_id": broadcaster_id}),
        (
            "channel.subscription.gift",
            "1",
            {"broadcaster_user_id": broadcaster_id},
        ),
        (
            "channel.subscription.message",
            "1",
            {"broadcaster_user_id": broadcaster_id},
        ),
        ("channel.cheer", "1", {"broadcaster_user_id": broadcaster_id}),
        ("channel.raid", "1", {"to_broadcaster_user_id": broadcaster_id}),
        (
            "channel.channel_points_custom_reward_redemption.add",
            "1",
            {"broadcaster_user_id": broadcaster_id},
        ),
        # Twitch a remplacé la version 1 par la version 2 pour les trois événements.
        ("channel.hype_train.begin", "2", {"broadcaster_user_id": broadcaster_id}),
        (
            "channel.hype_train.progress",
            "2",
            {"broadcaster_user_id": broadcaster_id},
        ),
        ("channel.hype_train.end", "2", {"broadcaster_user_id": broadcaster_id}),
        (
            "channel.shoutout.receive",
            "1",
            {
                "broadcaster_user_id": broadcaster_id,
                "moderator_user_id": broadcaster_id,
            },
        ),
        ("stream.online", "1", {"broadcaster_user_id": broadcaster_id}),
        ("stream.offline", "1", {"broadcaster_user_id": broadcaster_id}),
    ]


def missing_scope_group(subscription_type: str, granted_scopes: set[str]) -> tuple[str, ...] | None:
    """Renvoie le premier groupe de scopes non satisfait, ou None."""
    for alternatives in _REQUIRED_SCOPE_GROUPS.get(subscription_type, ()):
        if not any(scope in granted_scopes for scope in alternatives):
            return alternatives
    return None


async def _subscribe_for_role(self: Any, session_id: str, role: str) -> None:
    if not self.bot_user_id or not self.broadcaster_user_id:
        raise RuntimeError("IDs Twitch manquants")

    token = await self.db.get_token(role)
    granted_scopes = {str(scope) for scope in (token or {}).get("scopes", [])}
    self.eventsub_capabilities = getattr(self, "eventsub_capabilities", {})

    for sub_type, version, condition in subscription_specs(self, role):
        missing = missing_scope_group(sub_type, granted_scopes)
        if missing:
            self.eventsub_capabilities[sub_type] = {
                "status": "missing_scope",
                "version": version,
                "required_any_of": list(missing),
            }
            logger.info(
                "Abonnement EventSub en attente (%s): %s — reconnecte le compte %s pour accorder %s",
                role,
                sub_type,
                "SANSAHD" if role == "broadcaster" else "mairaiy",
                " ou ".join(missing),
            )
            continue

        try:
            await self.request(
                "POST",
                "/eventsub/subscriptions",
                role=role,
                json_body={
                    "type": sub_type,
                    "version": version,
                    "condition": condition,
                    "transport": {"method": "websocket", "session_id": session_id},
                },
            )
            self.eventsub_capabilities[sub_type] = {
                "status": "active",
                "version": version,
            }
            logger.info(
                "Abonnement EventSub actif (%s): %s v%s", role, sub_type, version
            )
        except Exception as exc:  # noqa: BLE001
            self.eventsub_capabilities[sub_type] = {
                "status": "error",
                "version": version,
                "error": str(exc) or exc.__class__.__name__,
            }
            logger.warning(
                "Abonnement EventSub refusé (%s) %s v%s: %s",
                role,
                sub_type,
                version,
                exc,
            )


async def _eventsub_diagnostic(self: Any) -> dict[str, Any]:
    bot = await self.db.get_token("bot")
    broadcaster = await self.db.get_token("broadcaster")
    capabilities = dict(getattr(self, "eventsub_capabilities", {}))
    missing = [
        name
        for name, item in capabilities.items()
        if item.get("status") == "missing_scope"
    ]
    errors = [
        name for name, item in capabilities.items() if item.get("status") == "error"
    ]
    return {
        "connected": self.connected,
        "connections": dict(self.eventsub_connected),
        "bot_scopes": list((bot or {}).get("scopes", [])),
        "broadcaster_scopes": list((broadcaster or {}).get("scopes", [])),
        "capabilities": capabilities,
        "reauthorization_required": missing,
        "errors": errors,
    }


def install_eventsub_compat(client: Any) -> None:
    """Installe les versions EventSub actuelles sans modifier le noyau historique."""
    if getattr(client, "_aura_eventsub_compat_installed", False):
        return
    client.eventsub_capabilities = {}
    client._subscribe_for_role = MethodType(_subscribe_for_role, client)
    client.eventsub_diagnostic = MethodType(_eventsub_diagnostic, client)
    client._aura_eventsub_compat_installed = True
