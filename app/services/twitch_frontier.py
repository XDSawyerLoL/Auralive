from __future__ import annotations

import logging
from typing import Any

from app.services.twitch import TwitchClient

logger = logging.getLogger(__name__)


class FrontierTwitchClient(TwitchClient):
    """Extension native Twitch pour Aura Live 2.

    Elle conserve les deux connexions EventSub séparées de la V1.2 :
    - le jeton de Mairaiy pour le chat et les outils de modération ;
    - le jeton du diffuseur pour les événements propres à SANSAHD.
    """

    BOT_SCOPES = sorted(
        set(TwitchClient.BOT_SCOPES)
        | {
            "moderator:manage:announcements",
            "moderator:manage:shield_mode",
            "moderator:manage:shoutouts",
            "moderator:manage:warnings",
            "moderator:read:suspicious_users",
            "moderator:read:chat_settings",
            "moderator:read:chatters",
        }
    )
    BROADCASTER_SCOPES = sorted(
        set(TwitchClient.BROADCASTER_SCOPES)
        | {
            "channel:read:ads",
            "channel:read:charity",
            "channel:read:goals",
            "channel:manage:vips",
            "moderator:read:shield_mode",
        }
    )

    async def _subscribe_for_role(self, session_id: str, role: str) -> None:
        if not self.bot_user_id or not self.broadcaster_user_id:
            raise RuntimeError("IDs Twitch manquants")

        broadcaster = self.broadcaster_user_id
        bot = self.bot_user_id
        if role == "bot":
            subscriptions = [
                ("channel.chat.message", "1", {
                    "broadcaster_user_id": broadcaster,
                    "user_id": bot,
                }),
                ("channel.chat.notification", "1", {
                    "broadcaster_user_id": broadcaster,
                    "user_id": bot,
                }),
                ("channel.chat.clear", "1", {
                    "broadcaster_user_id": broadcaster,
                    "user_id": bot,
                }),
                ("channel.chat.clear_user_messages", "1", {
                    "broadcaster_user_id": broadcaster,
                    "user_id": bot,
                }),
                ("channel.chat.message_delete", "1", {
                    "broadcaster_user_id": broadcaster,
                    "user_id": bot,
                }),
                ("channel.chat_settings.update", "1", {
                    "broadcaster_user_id": broadcaster,
                    "user_id": bot,
                }),
                ("channel.suspicious_user.message", "1", {
                    "broadcaster_user_id": broadcaster,
                    "moderator_user_id": bot,
                }),
                ("channel.suspicious_user.update", "1", {
                    "broadcaster_user_id": broadcaster,
                    "moderator_user_id": bot,
                }),
                ("channel.warning.send", "1", {
                    "broadcaster_user_id": broadcaster,
                    "moderator_user_id": bot,
                }),
                ("channel.warning.acknowledge", "1", {
                    "broadcaster_user_id": broadcaster,
                    "moderator_user_id": bot,
                }),
                ("channel.shield_mode.begin", "1", {
                    "broadcaster_user_id": broadcaster,
                    "moderator_user_id": bot,
                }),
                ("channel.shield_mode.end", "1", {
                    "broadcaster_user_id": broadcaster,
                    "moderator_user_id": bot,
                }),
            ]
        elif role == "broadcaster":
            common = {"broadcaster_user_id": broadcaster}
            subscriptions = [
                ("channel.follow", "2", {
                    "broadcaster_user_id": broadcaster,
                    "moderator_user_id": broadcaster,
                }),
                ("channel.subscribe", "1", common),
                ("channel.subscription.end", "1", common),
                ("channel.subscription.gift", "1", common),
                ("channel.subscription.message", "1", common),
                ("channel.cheer", "1", common),
                ("channel.raid", "1", {"to_broadcaster_user_id": broadcaster}),
                ("channel.raid", "1", {"from_broadcaster_user_id": broadcaster}),
                ("channel.channel_points_custom_reward_redemption.add", "1", common),
                ("channel.channel_points_custom_reward_redemption.update", "1", common),
                ("channel.update", "2", common),
                ("channel.poll.begin", "1", common),
                ("channel.poll.progress", "1", common),
                ("channel.poll.end", "1", common),
                ("channel.prediction.begin", "1", common),
                ("channel.prediction.progress", "1", common),
                ("channel.prediction.lock", "1", common),
                ("channel.prediction.end", "1", common),
                ("channel.hype_train.begin", "2", common),
                ("channel.hype_train.progress", "2", common),
                ("channel.hype_train.end", "2", common),
                ("channel.ad_break.begin", "1", common),
                ("channel.goal.begin", "1", common),
                ("channel.goal.progress", "1", common),
                ("channel.goal.end", "1", common),
                ("channel.charity_campaign.start", "1", common),
                ("channel.charity_campaign.progress", "1", common),
                ("channel.charity_campaign.stop", "1", common),
                ("channel.charity_campaign.donate", "1", common),
                ("channel.shoutout.create", "1", {
                    "broadcaster_user_id": broadcaster,
                    "moderator_user_id": broadcaster,
                }),
                ("channel.shoutout.receive", "1", {
                    "broadcaster_user_id": broadcaster,
                    "moderator_user_id": broadcaster,
                }),
                ("channel.vip.add", "1", common),
                ("channel.vip.remove", "1", common),
                ("stream.online", "1", common),
                ("stream.offline", "1", common),
            ]
        else:
            raise ValueError(f"Rôle EventSub inconnu: {role}")

        for sub_type, version, condition in subscriptions:
            try:
                await self.request(
                    "POST",
                    "/eventsub/subscriptions",
                    role=role,
                    json_body={
                        "type": sub_type,
                        "version": version,
                        "condition": dict(condition),
                        "transport": {"method": "websocket", "session_id": session_id},
                    },
                )
                logger.info("Abonnement EventSub Frontier actif (%s): %s v%s", role, sub_type, version)
            except Exception as exc:
                logger.warning("Abonnement EventSub Frontier refusé (%s) %s: %s", role, sub_type, exc)

    async def send_announcement(self, message: str, color: str = "primary") -> dict[str, Any]:
        if not self.broadcaster_user_id or not self.bot_user_id:
            raise RuntimeError("Comptes Twitch incomplets")
        payload = await self.request(
            "POST",
            "/chat/announcements",
            role="bot",
            params={
                "broadcaster_id": self.broadcaster_user_id,
                "moderator_id": self.bot_user_id,
            },
            json_body={"message": message[:500], "color": color},
        )
        return payload

    async def set_shield_mode(self, active: bool) -> dict[str, Any]:
        if not self.broadcaster_user_id or not self.bot_user_id:
            raise RuntimeError("Comptes Twitch incomplets")
        payload = await self.request(
            "PUT",
            "/moderation/shield_mode",
            role="bot",
            params={
                "broadcaster_id": self.broadcaster_user_id,
                "moderator_id": self.bot_user_id,
            },
            json_body={"is_active": bool(active)},
        )
        rows = payload.get("data", [])
        return rows[0] if rows else {"is_active": bool(active)}

    async def send_shoutout(self, broadcaster_user_id: str) -> None:
        if not self.broadcaster_user_id or not self.bot_user_id:
            raise RuntimeError("Comptes Twitch incomplets")
        await self.request(
            "POST",
            "/chat/shoutouts",
            role="bot",
            params={
                "from_broadcaster_id": self.broadcaster_user_id,
                "to_broadcaster_id": broadcaster_user_id,
                "moderator_id": self.bot_user_id,
            },
        )

    async def warn_user(self, user_id: str, reason: str) -> dict[str, Any]:
        if not self.broadcaster_user_id or not self.bot_user_id:
            raise RuntimeError("Comptes Twitch incomplets")
        payload = await self.request(
            "POST",
            "/moderation/warnings",
            role="bot",
            params={
                "broadcaster_id": self.broadcaster_user_id,
                "moderator_id": self.bot_user_id,
            },
            json_body={"data": {"user_id": user_id, "reason": reason[:500]}},
        )
        rows = payload.get("data", [])
        return rows[0] if rows else {"user_id": user_id, "reason": reason[:500]}

    async def set_suspicious_user_status(self, user_id: str, status: str) -> dict[str, Any]:
        if not self.broadcaster_user_id or not self.bot_user_id:
            raise RuntimeError("Comptes Twitch incomplets")
        payload = await self.request(
            "POST",
            "/moderation/suspicious_users",
            role="bot",
            params={
                "broadcaster_id": self.broadcaster_user_id,
                "moderator_id": self.bot_user_id,
            },
            json_body={"user_id": user_id, "status": status},
        )
        return payload

    async def add_vip(self, user_id: str) -> None:
        if not self.broadcaster_user_id:
            raise RuntimeError("Compte SANSAHD non connecté")
        await self.request(
            "POST",
            "/channels/vips",
            role="broadcaster",
            params={"broadcaster_id": self.broadcaster_user_id, "user_id": user_id},
        )

    async def remove_vip(self, user_id: str) -> None:
        if not self.broadcaster_user_id:
            raise RuntimeError("Compte SANSAHD non connecté")
        await self.request(
            "DELETE",
            "/channels/vips",
            role="broadcaster",
            params={"broadcaster_id": self.broadcaster_user_id, "user_id": user_id},
        )

    async def create_stream_marker(self, description: str = "Aura Live") -> dict[str, Any]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Compte SANSAHD non connecté")
        payload = await self.request(
            "POST",
            "/streams/markers",
            role="broadcaster",
            json_body={
                "user_id": self.broadcaster_user_id,
                "description": description[:140],
            },
        )
        rows = payload.get("data", [])
        return rows[0] if rows else {}
