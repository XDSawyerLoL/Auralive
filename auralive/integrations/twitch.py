from __future__ import annotations

from typing import Any

from auralive.automation.models import Event
from auralive.automation.registry import AutomationRegistry

from .base import require_service


TWITCH_EVENT_CATALOG: list[dict[str, Any]] = [
    {"type": "twitch.chat.message", "eventsub": "channel.chat.message", "token": "bot"},
    {"type": "twitch.chat.notification", "eventsub": "channel.chat.notification", "token": "bot"},
    {"type": "twitch.follow", "eventsub": "channel.follow", "scope": "moderator:read:followers"},
    {"type": "twitch.subscribe", "eventsub": "channel.subscribe", "scope": "channel:read:subscriptions"},
    {"type": "twitch.subscription.end", "eventsub": "channel.subscription.end", "scope": "channel:read:subscriptions"},
    {"type": "twitch.subscription.gift", "eventsub": "channel.subscription.gift", "scope": "channel:read:subscriptions"},
    {"type": "twitch.subscription.message", "eventsub": "channel.subscription.message", "scope": "channel:read:subscriptions"},
    {"type": "twitch.cheer", "eventsub": "channel.cheer", "scope": "bits:read"},
    {"type": "twitch.raid.in", "eventsub": "channel.raid", "direction": "to_broadcaster"},
    {"type": "twitch.raid.out", "eventsub": "channel.raid", "direction": "from_broadcaster"},
    {"type": "twitch.reward.redemption", "eventsub": "channel.channel_points_custom_reward_redemption.add", "scope": "channel:read:redemptions"},
    {"type": "twitch.stream.online", "eventsub": "stream.online"},
    {"type": "twitch.stream.offline", "eventsub": "stream.offline"},
    {"type": "twitch.channel.update", "eventsub": "channel.update"},
    {"type": "twitch.poll.begin", "eventsub": "channel.poll.begin", "scope": "channel:read:polls"},
    {"type": "twitch.poll.progress", "eventsub": "channel.poll.progress", "scope": "channel:read:polls"},
    {"type": "twitch.poll.end", "eventsub": "channel.poll.end", "scope": "channel:read:polls"},
    {"type": "twitch.prediction.begin", "eventsub": "channel.prediction.begin", "scope": "channel:read:predictions"},
    {"type": "twitch.prediction.progress", "eventsub": "channel.prediction.progress", "scope": "channel:read:predictions"},
    {"type": "twitch.prediction.lock", "eventsub": "channel.prediction.lock", "scope": "channel:read:predictions"},
    {"type": "twitch.prediction.end", "eventsub": "channel.prediction.end", "scope": "channel:read:predictions"},
    {"type": "twitch.hype_train.begin", "eventsub": "channel.hype_train.begin", "scope": "channel:read:hype_train"},
    {"type": "twitch.hype_train.progress", "eventsub": "channel.hype_train.progress", "scope": "channel:read:hype_train"},
    {"type": "twitch.hype_train.end", "eventsub": "channel.hype_train.end", "scope": "channel:read:hype_train"},
    {"type": "twitch.ad.break", "eventsub": "channel.ad_break.begin", "scope": "channel:read:ads"},
    {"type": "twitch.shoutout.create", "eventsub": "channel.shoutout.create", "scope": "moderator:read:shoutouts"},
    {"type": "twitch.shoutout.receive", "eventsub": "channel.shoutout.receive", "scope": "moderator:read:shoutouts"},
    {"type": "twitch.charity.donation", "eventsub": "channel.charity_campaign.donate", "scope": "channel:read:charity"},
    {"type": "twitch.warning.send", "eventsub": "channel.warning.send", "scope": "moderator:read:warnings"},
    {"type": "twitch.suspicious.message", "eventsub": "channel.suspicious_user.message", "scope": "moderator:read:suspicious_users"},
]


def install_twitch_actions(registry: AutomationRegistry) -> None:
    async def call(operation: str, config: dict[str, Any], context: dict[str, Any]) -> Any:
        gateway = require_service(context.get("services", {}), "twitch")
        return await gateway.call(operation, config)

    def register(
        name: str,
        operation: str,
        title: str,
        category: str,
        schema: dict[str, Any],
        *,
        risk: str = "platform-write",
    ) -> None:
        @registry.action(
            name,
            title=title,
            category=category,
            config_schema=schema,
            risk=risk,
            supports_simulation=False,
        )
        async def handler(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
            return await call(operation, config, context)

    register(
        "twitch.chat.send",
        "chat.send",
        "Envoyer un message Twitch",
        "Twitch · Chat",
        {"message": "string", "reply_to": "string|null"},
    )
    register(
        "twitch.chat.announcement",
        "chat.announcement",
        "Envoyer une annonce",
        "Twitch · Chat",
        {"message": "string", "color": "blue|green|orange|purple|primary"},
    )
    register(
        "twitch.chat.delete",
        "chat.delete",
        "Supprimer un message",
        "Twitch · Modération",
        {"message_id": "string"},
        risk="moderation",
    )
    register(
        "twitch.moderation.timeout",
        "moderation.timeout",
        "Exclure temporairement",
        "Twitch · Modération",
        {"user_id": "string", "duration": "number", "reason": "string"},
        risk="moderation",
    )
    register(
        "twitch.moderation.ban",
        "moderation.ban",
        "Bannir un utilisateur",
        "Twitch · Modération",
        {"user_id": "string", "reason": "string"},
        risk="moderation-high",
    )
    register(
        "twitch.moderation.unban",
        "moderation.unban",
        "Débannir un utilisateur",
        "Twitch · Modération",
        {"user_id": "string"},
        risk="moderation",
    )
    register(
        "twitch.channel.update",
        "channel.update",
        "Modifier le titre ou la catégorie",
        "Twitch · Chaîne",
        {"title": "string|null", "game_id": "string|null", "tags": "array|null"},
    )
    register(
        "twitch.clip.create",
        "clip.create",
        "Créer un clip",
        "Twitch · Contenu",
        {"has_delay": "boolean"},
    )
    register(
        "twitch.marker.create",
        "marker.create",
        "Créer un marqueur",
        "Twitch · Contenu",
        {"description": "string"},
    )
    register(
        "twitch.shoutout.send",
        "shoutout.send",
        "Envoyer un shoutout",
        "Twitch · Communauté",
        {"to_broadcaster_id": "string"},
    )
    register(
        "twitch.poll.create",
        "poll.create",
        "Créer un sondage Twitch",
        "Twitch · Interaction",
        {"title": "string", "choices": "array", "duration": "number"},
    )
    register(
        "twitch.poll.end",
        "poll.end",
        "Terminer un sondage",
        "Twitch · Interaction",
        {"poll_id": "string", "status": "TERMINATED|ARCHIVED"},
    )
    register(
        "twitch.prediction.create",
        "prediction.create",
        "Créer une prédiction",
        "Twitch · Interaction",
        {"title": "string", "outcomes": "array", "window": "number"},
    )
    register(
        "twitch.prediction.resolve",
        "prediction.resolve",
        "Résoudre une prédiction",
        "Twitch · Interaction",
        {"prediction_id": "string", "winning_outcome_id": "string"},
    )
    register(
        "twitch.reward.update",
        "reward.update",
        "Modifier une récompense",
        "Twitch · Récompenses",
        {"reward_id": "string", "changes": "object"},
    )
    register(
        "twitch.reward.fulfill",
        "reward.fulfill",
        "Valider une récompense",
        "Twitch · Récompenses",
        {"reward_id": "string", "redemption_id": "string"},
    )
    register(
        "twitch.reward.refund",
        "reward.refund",
        "Rembourser une récompense",
        "Twitch · Récompenses",
        {"reward_id": "string", "redemption_id": "string"},
    )
    register(
        "twitch.shield_mode.set",
        "shield_mode.set",
        "Activer le mode bouclier",
        "Twitch · Sécurité",
        {"active": "boolean"},
        risk="moderation-high",
    )
    register(
        "twitch.vip.add",
        "vip.add",
        "Ajouter un VIP",
        "Twitch · Communauté",
        {"user_id": "string"},
    )
    register(
        "twitch.vip.remove",
        "vip.remove",
        "Retirer un VIP",
        "Twitch · Communauté",
        {"user_id": "string"},
    )

    @registry.condition(
        "twitch.stream.live",
        title="Le stream est en direct",
        category="Twitch",
        config_schema={"expected": "boolean"},
    )
    async def stream_live(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        expected = bool(config.get("expected", True))
        return bool(context.get("services", {}).get("stream_live", False)) is expected
