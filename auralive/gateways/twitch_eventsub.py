from __future__ import annotations

import asyncio
import inspect
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

import httpx
import websockets

from .twitch_helix import TwitchHelixGateway

EventCallback = Callable[[str, dict[str, Any]], Awaitable[None] | None]


@dataclass(frozen=True, slots=True)
class SubscriptionSpec:
    event_type: str
    version: str
    aura_type: str
    role: str
    condition: dict[str, str]


@dataclass(slots=True)
class TwitchEventSubGateway:
    twitch: TwitchHelixGateway
    event_callback: EventCallback
    websocket_url: str = "wss://eventsub.wss.twitch.tv/ws"
    _tasks: dict[str, asyncio.Task[None]] = field(default_factory=dict, init=False, repr=False)
    _sockets: dict[str, Any] = field(default_factory=dict, init=False, repr=False)
    connected: dict[str, bool] = field(
        default_factory=lambda: {"bot": False, "broadcaster": False},
        init=False,
    )
    errors: dict[str, list[str]] = field(
        default_factory=lambda: {"bot": [], "broadcaster": []},
        init=False,
    )
    active_subscriptions: dict[str, set[str]] = field(
        default_factory=lambda: {"bot": set(), "broadcaster": set()},
        init=False,
    )
    _stopping: bool = field(default=False, init=False, repr=False)

    async def start(self) -> None:
        if self._tasks:
            return
        self._stopping = False
        for role in ("bot", "broadcaster"):
            self._tasks[role] = asyncio.create_task(
                self._connection_supervisor(role),
                name=f"aura-eventsub-{role}",
            )

    async def close(self) -> None:
        self._stopping = True
        tasks = list(self._tasks.values())
        self._tasks.clear()
        for task in tasks:
            task.cancel()
        for socket in tuple(self._sockets.values()):
            try:
                await socket.close()
            except Exception:  # noqa: BLE001
                pass
        self._sockets.clear()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.connected = {"bot": False, "broadcaster": False}

    def status(self) -> dict[str, Any]:
        return {
            "chat_connected": self.connected["bot"],
            "channel_connected": self.connected["broadcaster"],
            "errors": {key: list(value[-10:]) for key, value in self.errors.items()},
            "subscriptions": {
                key: sorted(value) for key, value in self.active_subscriptions.items()
            },
        }

    async def _connection_supervisor(self, role: str) -> None:
        reconnect_url: str | None = None
        delay = 1.0
        while not self._stopping:
            try:
                reconnect_url = await self._run_connection(role, reconnect_url)
                delay = 1.0
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                self.connected[role] = False
                self._record_error(role, f"Connexion EventSub : {exc}")
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30.0)
                reconnect_url = None

    async def _run_connection(self, role: str, reconnect_url: str | None) -> str | None:
        url = reconnect_url or self.websocket_url
        async with websockets.connect(
            url,
            open_timeout=15,
            close_timeout=5,
            ping_interval=None,
            max_size=8 * 1024 * 1024,
        ) as socket:
            self._sockets[role] = socket
            welcome = json.loads(await asyncio.wait_for(socket.recv(), timeout=20))
            message_type = welcome.get("metadata", {}).get("message_type")
            if message_type != "session_welcome":
                raise RuntimeError(f"Message d’accueil Twitch invalide : {message_type}")
            session = welcome.get("payload", {}).get("session", {})
            session_id = str(session.get("id", ""))
            if not session_id:
                raise RuntimeError("Session EventSub sans identifiant")

            self.connected[role] = True
            self.errors[role].clear()
            if reconnect_url is None:
                await self._subscribe_role(role, session_id)

            keepalive = float(session.get("keepalive_timeout_seconds") or 10)
            while not self._stopping:
                try:
                    raw = await asyncio.wait_for(socket.recv(), timeout=keepalive + 12)
                except TimeoutError as exc:
                    raise RuntimeError("Twitch n’a pas envoyé de keepalive") from exc
                message = json.loads(raw)
                metadata = message.get("metadata", {})
                kind = metadata.get("message_type")
                if kind == "notification":
                    await self._handle_notification(message)
                elif kind == "session_reconnect":
                    return message.get("payload", {}).get("session", {}).get("reconnect_url")
                elif kind == "revocation":
                    subscription = message.get("payload", {}).get("subscription", {})
                    label = f"{subscription.get('type')} ({subscription.get('status')})"
                    self._record_error(role, f"Abonnement révoqué : {label}")
                elif kind in {"session_keepalive", "session_welcome"}:
                    continue
            return None
        
    async def _subscribe_role(self, role: str, session_id: str) -> None:
        specs = [item for item in self._subscription_specs() if item.role == role]
        self.active_subscriptions[role].clear()
        for spec in specs:
            try:
                await self._create_subscription(spec, session_id)
                self.active_subscriptions[role].add(spec.event_type)
            except Exception as exc:  # noqa: BLE001
                self._record_error(role, f"{spec.event_type} : {exc}")

    async def _create_subscription(self, spec: SubscriptionSpec, session_id: str) -> None:
        token = self.twitch.bot_token if spec.role == "bot" else self.twitch.broadcaster_token
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{self.twitch.base_url}/eventsub/subscriptions",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Client-Id": self.twitch.client_id,
                    "Content-Type": "application/json",
                },
                json={
                    "type": spec.event_type,
                    "version": spec.version,
                    "condition": spec.condition,
                    "transport": {"method": "websocket", "session_id": session_id},
                },
            )
        if response.status_code in {202, 409}:
            return
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        raise RuntimeError(f"Twitch {response.status_code}: {detail}")

    async def _handle_notification(self, message: dict[str, Any]) -> None:
        subscription = message.get("payload", {}).get("subscription", {})
        event = dict(message.get("payload", {}).get("event", {}))
        event_type = str(subscription.get("type", ""))
        aura_type = self._aura_type(event_type, event)
        event["_eventsub"] = {
            "subscription_id": subscription.get("id"),
            "type": event_type,
            "version": subscription.get("version"),
            "message_id": message.get("metadata", {}).get("message_id"),
            "message_timestamp": message.get("metadata", {}).get("message_timestamp"),
        }
        if event_type == "channel.chat.message":
            event["message_id"] = event.get("message_id")
            event["message_text"] = event.get("message", {}).get("text", "")
            event["roles"] = self._chat_roles(event)
            event["is_bot"] = bool(event.get("chatter_user_login", "").endswith("bot"))
            event["user_id"] = event.get("chatter_user_id")
            event["user_name"] = event.get("chatter_user_name")
        result = self.event_callback(aura_type, event)
        if inspect.isawaitable(result):
            await result

    def _subscription_specs(self) -> list[SubscriptionSpec]:
        broadcaster = self.twitch.broadcaster_id
        bot = self.twitch.bot_user_id
        moderator = self.twitch.moderator_id or broadcaster
        common = {"broadcaster_user_id": broadcaster}
        return [
            SubscriptionSpec(
                "channel.chat.message",
                "1",
                "twitch.chat.message",
                "bot",
                {"broadcaster_user_id": broadcaster, "user_id": bot},
            ),
            SubscriptionSpec(
                "channel.chat.notification",
                "1",
                "twitch.chat.notification",
                "bot",
                {"broadcaster_user_id": broadcaster, "user_id": bot},
            ),
            SubscriptionSpec(
                "channel.follow",
                "2",
                "twitch.follow",
                "broadcaster",
                {"broadcaster_user_id": broadcaster, "moderator_user_id": broadcaster},
            ),
            SubscriptionSpec("channel.subscribe", "1", "twitch.subscribe", "broadcaster", common),
            SubscriptionSpec(
                "channel.subscription.end",
                "1",
                "twitch.subscription.end",
                "broadcaster",
                common,
            ),
            SubscriptionSpec(
                "channel.subscription.gift",
                "1",
                "twitch.subscription.gift",
                "broadcaster",
                common,
            ),
            SubscriptionSpec(
                "channel.subscription.message",
                "1",
                "twitch.subscription.message",
                "broadcaster",
                common,
            ),
            SubscriptionSpec("channel.cheer", "1", "twitch.cheer", "broadcaster", common),
            SubscriptionSpec(
                "channel.raid",
                "1",
                "twitch.raid.in",
                "broadcaster",
                {"to_broadcaster_user_id": broadcaster},
            ),
            SubscriptionSpec(
                "channel.raid",
                "1",
                "twitch.raid.out",
                "broadcaster",
                {"from_broadcaster_user_id": broadcaster},
            ),
            SubscriptionSpec(
                "channel.channel_points_custom_reward_redemption.add",
                "1",
                "twitch.reward.redemption",
                "broadcaster",
                common,
            ),
            SubscriptionSpec("stream.online", "1", "twitch.stream.online", "broadcaster", common),
            SubscriptionSpec("stream.offline", "1", "twitch.stream.offline", "broadcaster", common),
            SubscriptionSpec("channel.update", "2", "twitch.channel.update", "broadcaster", common),
            SubscriptionSpec("channel.poll.begin", "1", "twitch.poll.begin", "broadcaster", common),
            SubscriptionSpec(
                "channel.poll.progress", "1", "twitch.poll.progress", "broadcaster", common
            ),
            SubscriptionSpec("channel.poll.end", "1", "twitch.poll.end", "broadcaster", common),
            SubscriptionSpec(
                "channel.prediction.begin", "1", "twitch.prediction.begin", "broadcaster", common
            ),
            SubscriptionSpec(
                "channel.prediction.progress",
                "1",
                "twitch.prediction.progress",
                "broadcaster",
                common,
            ),
            SubscriptionSpec(
                "channel.prediction.lock", "1", "twitch.prediction.lock", "broadcaster", common
            ),
            SubscriptionSpec(
                "channel.prediction.end", "1", "twitch.prediction.end", "broadcaster", common
            ),
            SubscriptionSpec(
                "channel.hype_train.begin", "2", "twitch.hype_train.begin", "broadcaster", common
            ),
            SubscriptionSpec(
                "channel.hype_train.progress",
                "2",
                "twitch.hype_train.progress",
                "broadcaster",
                common,
            ),
            SubscriptionSpec(
                "channel.hype_train.end", "2", "twitch.hype_train.end", "broadcaster", common
            ),
            SubscriptionSpec("channel.ad_break.begin", "1", "twitch.ad.break", "broadcaster", common),
            SubscriptionSpec(
                "channel.shoutout.create",
                "1",
                "twitch.shoutout.create",
                "broadcaster",
                {"broadcaster_user_id": broadcaster, "moderator_user_id": moderator},
            ),
            SubscriptionSpec(
                "channel.shoutout.receive",
                "1",
                "twitch.shoutout.receive",
                "broadcaster",
                {"broadcaster_user_id": broadcaster, "moderator_user_id": moderator},
            ),
            SubscriptionSpec(
                "channel.charity_campaign.donate",
                "1",
                "twitch.charity.donation",
                "broadcaster",
                common,
            ),
        ]

    def _aura_type(self, event_type: str, event: dict[str, Any]) -> str:
        if event_type == "channel.raid":
            if str(event.get("to_broadcaster_user_id")) == self.twitch.broadcaster_id:
                return "twitch.raid.in"
            return "twitch.raid.out"
        mapping = {
            item.event_type: item.aura_type
            for item in self._subscription_specs()
            if item.event_type != "channel.raid"
        }
        return mapping.get(event_type, f"twitch.raw.{event_type}")

    @staticmethod
    def _chat_roles(event: dict[str, Any]) -> list[str]:
        badges = event.get("badges") or []
        roles = [str(item.get("set_id")) for item in badges if item.get("set_id")]
        if str(event.get("chatter_user_id")) == str(event.get("broadcaster_user_id")):
            roles.append("broadcaster")
        return sorted(set(roles))

    def _record_error(self, role: str, message: str) -> None:
        self.errors[role].append(str(message))
        self.errors[role] = self.errors[role][-25:]
