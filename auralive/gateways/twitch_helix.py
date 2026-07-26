from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import httpx


def _clean_token(value: str) -> str:
    return value.removeprefix("oauth:").strip()


@dataclass(slots=True)
class TwitchHelixGateway:
    client_id: str
    broadcaster_id: str
    bot_user_id: str
    bot_token: str
    broadcaster_token: str
    moderator_id: str | None = None
    base_url: str = "https://api.twitch.tv/helix"
    timeout_seconds: float = 15.0
    _client: httpx.AsyncClient | None = field(default=None, init=False, repr=False)

    @classmethod
    def from_env(cls) -> "TwitchHelixGateway":
        required = {
            "TWITCH_CLIENT_ID": os.getenv("TWITCH_CLIENT_ID", ""),
            "TWITCH_BROADCASTER_ID": os.getenv("TWITCH_BROADCASTER_ID", ""),
            "TWITCH_BOT_USER_ID": os.getenv("TWITCH_BOT_USER_ID", ""),
            "TWITCH_BOT_ACCESS_TOKEN": os.getenv("TWITCH_BOT_ACCESS_TOKEN", ""),
            "TWITCH_BROADCASTER_ACCESS_TOKEN": os.getenv(
                "TWITCH_BROADCASTER_ACCESS_TOKEN", ""
            ),
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise RuntimeError(f"Configuration Twitch incomplète : {', '.join(missing)}")
        return cls(
            client_id=required["TWITCH_CLIENT_ID"],
            broadcaster_id=required["TWITCH_BROADCASTER_ID"],
            bot_user_id=required["TWITCH_BOT_USER_ID"],
            bot_token=_clean_token(required["TWITCH_BOT_ACCESS_TOKEN"]),
            broadcaster_token=_clean_token(required["TWITCH_BROADCASTER_ACCESS_TOKEN"]),
            moderator_id=os.getenv("TWITCH_MODERATOR_ID") or required["TWITCH_BOT_USER_ID"],
        )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def call(self, operation: str, payload: dict[str, Any]) -> Any:
        data = dict(payload)
        handlers = {
            "chat.send": self._chat_send,
            "chat.announcement": self._chat_announcement,
            "chat.delete": self._chat_delete,
            "moderation.timeout": self._moderation_timeout,
            "moderation.ban": self._moderation_ban,
            "moderation.unban": self._moderation_unban,
            "channel.update": self._channel_update,
            "clip.create": self._clip_create,
            "marker.create": self._marker_create,
            "shoutout.send": self._shoutout_send,
            "poll.create": self._poll_create,
            "poll.end": self._poll_end,
            "prediction.create": self._prediction_create,
            "prediction.resolve": self._prediction_resolve,
            "reward.update": self._reward_update,
            "reward.fulfill": self._reward_fulfill,
            "reward.refund": self._reward_refund,
            "shield_mode.set": self._shield_mode_set,
            "vip.add": self._vip_add,
            "vip.remove": self._vip_remove,
        }
        handler = handlers.get(operation)
        if handler is None:
            raise ValueError(f"Opération Twitch inconnue : {operation}")
        return await handler(data)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        token_role: str = "broadcaster",
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout_seconds)
        token = self.bot_token if token_role == "bot" else self.broadcaster_token
        response = await self._client.request(
            method,
            f"{self.base_url}{path}",
            params={key: value for key, value in (params or {}).items() if value is not None},
            json=json_body,
            headers={
                "Authorization": f"Bearer {token}",
                "Client-Id": self.client_id,
                "Content-Type": "application/json",
            },
        )
        if response.status_code >= 400:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            raise RuntimeError(f"Twitch {response.status_code}: {detail}")
        if not response.content:
            return {"ok": True, "status": response.status_code}
        return response.json()

    async def _chat_send(self, data: dict[str, Any]) -> Any:
        body = {
            "broadcaster_id": self.broadcaster_id,
            "sender_id": self.bot_user_id,
            "message": str(data["message"])[:500],
        }
        if data.get("reply_to"):
            body["reply_parent_message_id"] = str(data["reply_to"])
        return await self._request("POST", "/chat/messages", token_role="bot", json_body=body)

    async def _chat_announcement(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "POST",
            "/chat/announcements",
            token_role="bot",
            params={
                "broadcaster_id": self.broadcaster_id,
                "moderator_id": self.moderator_id or self.bot_user_id,
            },
            json_body={
                "message": str(data["message"])[:500],
                "color": str(data.get("color", "primary")),
            },
        )

    async def _chat_delete(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "DELETE",
            "/moderation/chat",
            token_role="bot",
            params={
                "broadcaster_id": self.broadcaster_id,
                "moderator_id": self.moderator_id or self.bot_user_id,
                "message_id": data.get("message_id"),
            },
        )

    async def _moderation_timeout(self, data: dict[str, Any]) -> Any:
        body = {
            "data": {
                "user_id": str(data["user_id"]),
                "duration": max(1, min(int(data.get("duration", 600)), 1_209_600)),
                "reason": str(data.get("reason", "Aura Live"))[:500],
            }
        }
        return await self._request(
            "POST",
            "/moderation/bans",
            token_role="bot",
            params={
                "broadcaster_id": self.broadcaster_id,
                "moderator_id": self.moderator_id or self.bot_user_id,
            },
            json_body=body,
        )

    async def _moderation_ban(self, data: dict[str, Any]) -> Any:
        body = {
            "data": {
                "user_id": str(data["user_id"]),
                "reason": str(data.get("reason", "Aura Live"))[:500],
            }
        }
        return await self._request(
            "POST",
            "/moderation/bans",
            token_role="bot",
            params={
                "broadcaster_id": self.broadcaster_id,
                "moderator_id": self.moderator_id or self.bot_user_id,
            },
            json_body=body,
        )

    async def _moderation_unban(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "DELETE",
            "/moderation/bans",
            token_role="bot",
            params={
                "broadcaster_id": self.broadcaster_id,
                "moderator_id": self.moderator_id or self.bot_user_id,
                "user_id": str(data["user_id"]),
            },
        )

    async def _channel_update(self, data: dict[str, Any]) -> Any:
        body: dict[str, Any] = {}
        if data.get("title") is not None:
            body["title"] = str(data["title"])[:140]
        if data.get("game_id") is not None:
            body["game_id"] = str(data["game_id"])
        if data.get("tags") is not None:
            body["tags"] = list(data["tags"])[:10]
        return await self._request(
            "PATCH",
            "/channels",
            params={"broadcaster_id": self.broadcaster_id},
            json_body=body,
        )

    async def _clip_create(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "POST",
            "/clips",
            params={
                "broadcaster_id": self.broadcaster_id,
                "has_delay": str(bool(data.get("has_delay", False))).lower(),
            },
        )

    async def _marker_create(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "POST",
            "/streams/markers",
            json_body={
                "user_id": self.broadcaster_id,
                "description": str(data.get("description", "Aura Live"))[:140],
            },
        )

    async def _shoutout_send(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "POST",
            "/chat/shoutouts",
            token_role="bot",
            params={
                "from_broadcaster_id": self.broadcaster_id,
                "to_broadcaster_id": str(data["to_broadcaster_id"]),
                "moderator_id": self.moderator_id or self.bot_user_id,
            },
        )

    async def _poll_create(self, data: dict[str, Any]) -> Any:
        choices = [
            {"title": str(item.get("title", item))[:25]}
            for item in list(data.get("choices", []))[:5]
        ]
        return await self._request(
            "POST",
            "/polls",
            json_body={
                "broadcaster_id": self.broadcaster_id,
                "title": str(data["title"])[:60],
                "choices": choices,
                "duration": max(15, min(int(data.get("duration", 60)), 1800)),
            },
        )

    async def _poll_end(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "PATCH",
            "/polls",
            json_body={
                "broadcaster_id": self.broadcaster_id,
                "id": str(data["poll_id"]),
                "status": str(data.get("status", "TERMINATED")),
            },
        )

    async def _prediction_create(self, data: dict[str, Any]) -> Any:
        outcomes = [
            {"title": str(item.get("title", item))[:25]}
            for item in list(data.get("outcomes", []))[:10]
        ]
        return await self._request(
            "POST",
            "/predictions",
            json_body={
                "broadcaster_id": self.broadcaster_id,
                "title": str(data["title"])[:45],
                "outcomes": outcomes,
                "prediction_window": max(30, min(int(data.get("window", 120)), 1800)),
            },
        )

    async def _prediction_resolve(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "PATCH",
            "/predictions",
            json_body={
                "broadcaster_id": self.broadcaster_id,
                "id": str(data["prediction_id"]),
                "status": "RESOLVED",
                "winning_outcome_id": str(data["winning_outcome_id"]),
            },
        )

    async def _reward_update(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "PATCH",
            "/channel_points/custom_rewards",
            params={"broadcaster_id": self.broadcaster_id, "id": str(data["reward_id"])},
            json_body=dict(data.get("changes", {})),
        )

    async def _redemption_status(self, data: dict[str, Any], status: str) -> Any:
        return await self._request(
            "PATCH",
            "/channel_points/custom_rewards/redemptions",
            params={
                "broadcaster_id": self.broadcaster_id,
                "reward_id": str(data["reward_id"]),
                "id": str(data["redemption_id"]),
            },
            json_body={"status": status},
        )

    async def _reward_fulfill(self, data: dict[str, Any]) -> Any:
        return await self._redemption_status(data, "FULFILLED")

    async def _reward_refund(self, data: dict[str, Any]) -> Any:
        return await self._redemption_status(data, "CANCELED")

    async def _shield_mode_set(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "PUT",
            "/moderation/shield_mode",
            token_role="bot",
            params={
                "broadcaster_id": self.broadcaster_id,
                "moderator_id": self.moderator_id or self.bot_user_id,
            },
            json_body={"is_active": bool(data.get("active", True))},
        )

    async def _vip_add(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "POST",
            "/channels/vips",
            params={"broadcaster_id": self.broadcaster_id, "user_id": str(data["user_id"])},
        )

    async def _vip_remove(self, data: dict[str, Any]) -> Any:
        return await self._request(
            "DELETE",
            "/channels/vips",
            params={"broadcaster_id": self.broadcaster_id, "user_id": str(data["user_id"])},
        )
