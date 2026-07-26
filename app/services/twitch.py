from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlencode

import aiohttp

from app.config import Settings
from app.database import Database

logger = logging.getLogger(__name__)

EventHandler = Callable[[str, dict[str, Any]], Awaitable[None]]

BOT_SCOPES = [
    "user:read:chat",
    "user:write:chat",
    "user:bot",
    "moderator:manage:chat_messages",
    "moderator:manage:banned_users",
]

BROADCASTER_SCOPES = [
    "channel:bot",
    "moderator:read:followers",
    "channel:read:subscriptions",
    "bits:read",
    "channel:read:redemptions",
    "channel:manage:redemptions",
    "clips:edit",
    "channel:manage:polls",
    "channel:manage:predictions",
    "channel:manage:broadcast",
    "channel:read:hype_train",
    "moderator:read:shoutouts",
]


class TwitchClient:
    API = "https://api.twitch.tv/helix"
    ID_API = "https://id.twitch.tv/oauth2"
    EVENTSUB_WS = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30"

    def __init__(self, settings: Settings, db: Database, handler: EventHandler):
        self.settings = settings
        self.db = db
        self.handler = handler
        self.session: aiohttp.ClientSession | None = None
        self.eventsub_tasks: dict[str, asyncio.Task[None]] = {}
        self.running = False
        self.eventsub_connected: dict[str, bool] = {"bot": False, "broadcaster": False}
        self.eventsub_errors: dict[str, str | None] = {"bot": None, "broadcaster": None}
        self.bot_user_id: str | None = None
        self.broadcaster_user_id: str | None = None
        self._seen_message_ids: set[str] = set()

    async def start(self) -> None:
        if not self.session:
            self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30))
        self.running = True
        await self._load_ids()
        if await self.db.get_token("bot") and await self.db.get_token("broadcaster"):
            self._start_eventsub_tasks()

    async def close(self) -> None:
        self.running = False
        await self._stop_eventsub()
        if self.session:
            await self.session.close()
            self.session = None

    @property
    def chat_connected(self) -> bool:
        return bool(self.eventsub_connected["bot"])

    @property
    def connected(self) -> bool:
        return bool(self.eventsub_connected["bot"] and self.eventsub_connected["broadcaster"])

    @property
    def last_error(self) -> str | None:
        errors = [f"{role}: {error}" for role, error in self.eventsub_errors.items() if error]
        return " | ".join(errors) or None

    def _start_eventsub_tasks(self) -> None:
        for role in ("bot", "broadcaster"):
            if role in self.eventsub_tasks and not self.eventsub_tasks[role].done():
                continue
            self.eventsub_tasks[role] = asyncio.create_task(
                self._eventsub_loop(role), name=f"twitch-eventsub-{role}"
            )

    async def _stop_eventsub(self) -> None:
        tasks = list(self.eventsub_tasks.values())
        self.eventsub_tasks.clear()
        for task in tasks:
            task.cancel()
        for task in tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        self.eventsub_connected = {"bot": False, "broadcaster": False}

    async def restart_eventsub(self) -> None:
        await self._stop_eventsub()
        await self._load_ids()
        if self.running and await self.db.get_token("bot") and await self.db.get_token("broadcaster"):
            self._start_eventsub_tasks()

    async def disconnect(self, role: str) -> None:
        if role not in {"bot", "broadcaster"}:
            raise ValueError("Rôle OAuth inconnu")
        await self.db.execute("DELETE FROM oauth_tokens WHERE role=?", (role,))
        await self.restart_eventsub()

    async def build_auth_url(self, role: str) -> str:
        if role not in {"bot", "broadcaster"}:
            raise ValueError("Rôle OAuth inconnu")
        scopes = BOT_SCOPES if role == "bot" else BROADCASTER_SCOPES
        state = secrets.token_urlsafe(28)
        await self.db.save_oauth_state(state, role, scopes)
        query = urlencode(
            {
                "client_id": self.settings.twitch_client_id,
                "redirect_uri": self.settings.twitch_redirect_uri,
                "response_type": "code",
                "scope": " ".join(scopes),
                "state": state,
                "force_verify": "true",
            }
        )
        return f"{self.ID_API}/authorize?{query}"

    async def handle_oauth_callback(self, code: str, state: str) -> str:
        state_row = await self.db.consume_oauth_state(state)
        if not state_row:
            raise RuntimeError("État OAuth invalide ou expiré")
        assert self.session
        async with self.session.post(
            f"{self.ID_API}/token",
            data={
                "client_id": self.settings.twitch_client_id,
                "client_secret": self.settings.twitch_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.settings.twitch_redirect_uri,
            },
        ) as response:
            payload = await response.json()
            if response.status >= 400:
                raise RuntimeError(payload.get("message", "Échec OAuth Twitch"))

        access_token = payload["access_token"]
        user = await self._get_current_user(access_token)
        role = state_row["role"]
        expected_login = (
            self.settings.twitch_bot_login if role == "bot" else self.settings.twitch_broadcaster_login
        ).lower()
        actual_login = str(user.get("login", "")).lower()
        if expected_login and actual_login != expected_login:
            label = "Aura" if role == "bot" else "SANSAHD"
            raise RuntimeError(
                f"Mauvais compte connecté pour {label}. "
                f"Compte reçu : {user.get('display_name') or actual_login}. "
                f"Compte attendu : {expected_login}. Déconnecte-toi de Twitch puis recommence."
            )

        expires_at = int(time.time()) + int(payload.get("expires_in", 0))
        await self.db.save_token(
            role,
            access_token,
            payload.get("refresh_token", ""),
            expires_at,
            payload.get("scope", state_row["scopes"]),
            user["id"],
            user["login"],
            user["display_name"],
        )
        await self._load_ids()
        if await self.db.get_token("bot") and await self.db.get_token("broadcaster"):
            await self.restart_eventsub()
        return role

    async def _get_current_user(self, access_token: str) -> dict[str, Any]:
        assert self.session
        async with self.session.get(
            f"{self.API}/users",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Client-Id": self.settings.twitch_client_id,
            },
        ) as response:
            payload = await response.json()
            if response.status >= 400 or not payload.get("data"):
                raise RuntimeError(payload.get("message", "Compte Twitch introuvable"))
            return payload["data"][0]

    async def _load_ids(self) -> None:
        bot = await self.db.get_token("bot")
        broadcaster = await self.db.get_token("broadcaster")
        self.bot_user_id = bot.get("user_id") if bot else None
        self.broadcaster_user_id = broadcaster.get("user_id") if broadcaster else None

    async def account_status(self) -> dict[str, Any]:
        bot = await self.db.get_token("bot")
        broadcaster = await self.db.get_token("broadcaster")

        def public_account(token: dict[str, Any] | None, expected: str) -> dict[str, Any]:
            login = str(token.get("login", "")) if token else ""
            return {
                "connected": bool(token),
                "login": login,
                "display_name": str(token.get("display_name", "")) if token else "",
                "expected_login": expected,
                "matches_expected": bool(token) and login.lower() == expected.lower(),
                "scopes": list(token.get("scopes", [])) if token else [],
            }

        return {
            "bot": public_account(bot, self.settings.twitch_bot_login),
            "broadcaster": public_account(broadcaster, self.settings.twitch_broadcaster_login),
        }

    async def _valid_token(self, role: str) -> str:
        token = await self.db.get_token(role)
        if not token:
            raise RuntimeError(f"Compte Twitch {role} non autorisé")
        if int(token["expires_at"]) > int(time.time()) + 120:
            return token["access_token"]
        if not token.get("refresh_token"):
            raise RuntimeError(f"Le jeton Twitch {role} a expiré")
        return await self._refresh_token(role, token["refresh_token"])

    async def _refresh_token(self, role: str, refresh_token: str) -> str:
        assert self.session
        async with self.session.post(
            f"{self.ID_API}/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": self.settings.twitch_client_id,
                "client_secret": self.settings.twitch_client_secret,
            },
        ) as response:
            payload = await response.json()
            if response.status >= 400:
                raise RuntimeError(payload.get("message", f"Impossible de rafraîchir {role}"))
        old = await self.db.get_token(role)
        assert old
        access = payload["access_token"]
        await self.db.save_token(
            role,
            access,
            payload.get("refresh_token", refresh_token),
            int(time.time()) + int(payload.get("expires_in", 0)),
            payload.get("scope", old["scopes"]),
            old.get("user_id", ""),
            old.get("login", ""),
            old.get("display_name", ""),
        )
        return access

    async def request(
        self,
        method: str,
        path: str,
        *,
        role: str = "bot",
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        assert self.session
        token = await self._valid_token(role)
        async with self.session.request(
            method,
            f"{self.API}{path}",
            params=params,
            json=json_body,
            headers={
                "Authorization": f"Bearer {token}",
                "Client-Id": self.settings.twitch_client_id,
                "Content-Type": "application/json",
            },
        ) as response:
            if response.status == 204:
                return {}
            payload = await response.json()
            if response.status >= 400:
                detail = payload.get("message", f"Erreur Twitch {response.status}")
                raise RuntimeError(detail)
            return payload

    async def send_chat(self, message: str, reply_parent_message_id: str | None = None) -> dict[str, Any]:
        normalized = " ".join(str(message).casefold().split())
        if "je réfléchis" in normalized or "analyse en cours" in normalized:
            raise RuntimeError("Message d'attente interdit : seule la réponse finale peut être publiée")
        if not self.bot_user_id or not self.broadcaster_user_id:
            raise RuntimeError("Les comptes Aura et SANSAHD doivent être connectés")
        data: dict[str, Any] = {
            "broadcaster_id": self.broadcaster_user_id,
            "sender_id": self.bot_user_id,
            "message": message[:500],
        }
        if reply_parent_message_id:
            data["reply_parent_message_id"] = reply_parent_message_id
        payload = await self.request("POST", "/chat/messages", role="bot", json_body=data)
        rows = payload.get("data", [])
        if not rows:
            raise RuntimeError("Twitch n'a renvoyé aucune confirmation d'envoi")
        result = rows[0]
        if not result.get("is_sent", False):
            reason = result.get("drop_reason") or {}
            raise RuntimeError(reason.get("message") or reason.get("code") or "Le message a été refusé par Twitch")
        return result

    async def delete_message(self, message_id: str) -> None:
        await self.request(
            "DELETE",
            "/moderation/chat",
            role="bot",
            params={
                "broadcaster_id": self.broadcaster_user_id,
                "moderator_id": self.bot_user_id,
                "message_id": message_id,
            },
        )

    async def timeout_user(self, user_id: str, duration: int, reason: str) -> None:
        await self.request(
            "POST",
            "/moderation/bans",
            role="bot",
            params={
                "broadcaster_id": self.broadcaster_user_id,
                "moderator_id": self.bot_user_id,
            },
            json_body={"data": {"user_id": user_id, "duration": duration, "reason": reason[:500]}},
        )

    async def create_clip(self) -> str | None:
        payload = await self.request(
            "POST",
            "/clips",
            role="broadcaster",
            params={"broadcaster_id": self.broadcaster_user_id, "has_delay": "false"},
        )
        clips = payload.get("data", [])
        return clips[0].get("edit_url") if clips else None

    async def create_poll(self, title: str, choices: list[str], duration: int) -> dict[str, Any]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        payload = await self.request(
            "POST",
            "/polls",
            role="broadcaster",
            json_body={
                "broadcaster_id": self.broadcaster_user_id,
                "title": title,
                "choices": [{"title": choice} for choice in choices],
                "duration": duration,
            },
        )
        rows = payload.get("data", [])
        if not rows:
            raise RuntimeError("Twitch n'a pas créé le sondage")
        return rows[0]

    async def get_polls(self, first: int = 20) -> list[dict[str, Any]]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        payload = await self.request(
            "GET",
            "/polls",
            role="broadcaster",
            params={"broadcaster_id": self.broadcaster_user_id, "first": min(max(first, 1), 20)},
        )
        return list(payload.get("data", []))

    async def active_poll(self) -> dict[str, Any] | None:
        polls = await self.get_polls(first=20)
        return next((poll for poll in polls if poll.get("status") == "ACTIVE"), None)

    async def end_poll(self, poll_id: str, status: str = "TERMINATED") -> dict[str, Any]:
        if status not in {"TERMINATED", "ARCHIVED"}:
            raise ValueError("Statut de fin de sondage invalide")
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        payload = await self.request(
            "PATCH",
            "/polls",
            role="broadcaster",
            json_body={
                "broadcaster_id": self.broadcaster_user_id,
                "id": poll_id,
                "status": status,
            },
        )
        rows = payload.get("data", [])
        if not rows:
            raise RuntimeError("Twitch n'a pas confirmé la clôture du sondage")
        return rows[0]

    async def create_prediction(self, title: str, outcomes: list[str], window: int) -> dict[str, Any]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        payload = await self.request(
            "POST",
            "/predictions",
            role="broadcaster",
            json_body={
                "broadcaster_id": self.broadcaster_user_id,
                "title": title,
                "outcomes": [{"title": item} for item in outcomes],
                "prediction_window": window,
            },
        )
        rows = payload.get("data", [])
        if not rows:
            raise RuntimeError("Twitch n'a pas créé la prédiction")
        return rows[0]

    async def get_predictions(self, first: int = 20) -> list[dict[str, Any]]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        payload = await self.request(
            "GET",
            "/predictions",
            role="broadcaster",
            params={"broadcaster_id": self.broadcaster_user_id, "first": min(max(first, 1), 20)},
        )
        return list(payload.get("data", []))

    async def active_prediction(self) -> dict[str, Any] | None:
        rows = await self.get_predictions(20)
        return next((row for row in rows if row.get("status") in {"ACTIVE", "LOCKED"}), None)

    async def end_prediction(
        self, prediction_id: str, status: str, winning_outcome_id: str | None = None
    ) -> dict[str, Any]:
        if status not in {"LOCKED", "RESOLVED", "CANCELED"}:
            raise ValueError("Statut de prédiction invalide")
        body: dict[str, Any] = {
            "broadcaster_id": self.broadcaster_user_id,
            "id": prediction_id,
            "status": status,
        }
        if status == "RESOLVED":
            if not winning_outcome_id:
                raise ValueError("Le résultat gagnant est obligatoire")
            body["winning_outcome_id"] = winning_outcome_id
        payload = await self.request("PATCH", "/predictions", role="broadcaster", json_body=body)
        rows = payload.get("data", [])
        if not rows:
            raise RuntimeError("Twitch n'a pas confirmé la prédiction")
        return rows[0]

    async def get_custom_rewards(self, only_manageable: bool = False) -> list[dict[str, Any]]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        payload = await self.request(
            "GET",
            "/channel_points/custom_rewards",
            role="broadcaster",
            params={
                "broadcaster_id": self.broadcaster_user_id,
                "only_manageable_rewards": str(bool(only_manageable)).lower(),
            },
        )
        return list(payload.get("data", []))

    async def create_custom_reward(self, data: dict[str, Any]) -> dict[str, Any]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        cooldown = int(data.pop("global_cooldown_seconds", 0) or 0)
        if cooldown:
            data["is_global_cooldown_enabled"] = True
            data["global_cooldown_seconds"] = cooldown
        payload = await self.request(
            "POST",
            "/channel_points/custom_rewards",
            role="broadcaster",
            params={"broadcaster_id": self.broadcaster_user_id},
            json_body=data,
        )
        rows = payload.get("data", [])
        if not rows:
            raise RuntimeError("Twitch n'a pas créé la récompense")
        return rows[0]

    async def update_custom_reward(self, reward_id: str, data: dict[str, Any]) -> dict[str, Any]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        payload = await self.request(
            "PATCH",
            "/channel_points/custom_rewards",
            role="broadcaster",
            params={"broadcaster_id": self.broadcaster_user_id, "id": reward_id},
            json_body=data,
        )
        rows = payload.get("data", [])
        if not rows:
            raise RuntimeError("Twitch n'a pas confirmé la modification")
        return rows[0]

    async def delete_custom_reward(self, reward_id: str) -> None:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        await self.request(
            "DELETE",
            "/channel_points/custom_rewards",
            role="broadcaster",
            params={"broadcaster_id": self.broadcaster_user_id, "id": reward_id},
        )

    async def get_reward_redemptions(self, reward_id: str, status: str = "UNFULFILLED") -> list[dict[str, Any]]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        payload = await self.request(
            "GET",
            "/channel_points/custom_rewards/redemptions",
            role="broadcaster",
            params={"broadcaster_id": self.broadcaster_user_id, "reward_id": reward_id, "status": status, "first": 50},
        )
        return list(payload.get("data", []))

    async def update_redemption_status(self, reward_id: str, redemption_id: str, status: str) -> dict[str, Any]:
        if status not in {"FULFILLED", "CANCELED"}:
            raise ValueError("Statut de récompense invalide")
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        payload = await self.request(
            "PATCH",
            "/channel_points/custom_rewards/redemptions",
            role="broadcaster",
            params={
                "broadcaster_id": self.broadcaster_user_id,
                "reward_id": reward_id,
                "id": redemption_id,
            },
            json_body={"status": status},
        )
        rows = payload.get("data", [])
        if not rows:
            raise RuntimeError("Twitch n'a pas confirmé le statut")
        return rows[0]

    async def get_all_followers(self, max_pages: int = 40) -> list[dict[str, Any]]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        rows: list[dict[str, Any]] = []
        cursor: str | None = None
        for _ in range(max_pages):
            params: dict[str, Any] = {
                "broadcaster_id": self.broadcaster_user_id,
                "first": 100,
            }
            if cursor:
                params["after"] = cursor
            payload = await self.request("GET", "/channels/followers", role="broadcaster", params=params)
            rows.extend(payload.get("data", []))
            cursor = payload.get("pagination", {}).get("cursor")
            if not cursor:
                break
        return rows

    async def get_all_subscribers(self, max_pages: int = 40) -> list[dict[str, Any]]:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        rows: list[dict[str, Any]] = []
        cursor: str | None = None
        for _ in range(max_pages):
            params: dict[str, Any] = {"broadcaster_id": self.broadcaster_user_id, "first": 100}
            if cursor:
                params["after"] = cursor
            payload = await self.request("GET", "/subscriptions", role="broadcaster", params=params)
            rows.extend(payload.get("data", []))
            cursor = payload.get("pagination", {}).get("cursor")
            if not cursor:
                break
        return rows

    async def update_channel(self, *, title: str | None = None, game_id: str | None = None, language: str | None = None) -> None:
        if not self.broadcaster_user_id:
            raise RuntimeError("Le compte SANSAHD n'est pas connecté")
        body: dict[str, Any] = {}
        if title is not None:
            body["title"] = title[:140]
        if game_id is not None:
            body["game_id"] = game_id
        if language is not None:
            body["broadcaster_language"] = language
        if body:
            await self.request(
                "PATCH", "/channels", role="broadcaster",
                params={"broadcaster_id": self.broadcaster_user_id}, json_body=body,
            )

    async def _eventsub_loop(self, role: str) -> None:
        reconnect_url = self.EVENTSUB_WS
        subscribe_on_welcome = True
        while self.running:
            try:
                assert self.session
                async with self.session.ws_connect(reconnect_url, heartbeat=20) as ws:
                    self.eventsub_connected[role] = True
                    self.eventsub_errors[role] = None
                    logger.info("WebSocket EventSub connecté: %s", role)
                    async for message in ws:
                        if message.type != aiohttp.WSMsgType.TEXT:
                            continue
                        payload = json.loads(message.data)
                        metadata = payload.get("metadata", {})
                        message_id = metadata.get("message_id")
                        if message_id:
                            if message_id in self._seen_message_ids:
                                continue
                            self._seen_message_ids.add(message_id)
                            if len(self._seen_message_ids) > 5000:
                                self._seen_message_ids.clear()

                        msg_type = metadata.get("message_type")
                        if msg_type == "session_welcome":
                            session_id = payload["payload"]["session"]["id"]
                            if subscribe_on_welcome:
                                await self._subscribe_for_role(session_id, role)
                        elif msg_type == "notification":
                            sub_type = metadata.get("subscription_type", "unknown")
                            event = payload.get("payload", {}).get("event", {})
                            await self.handler(sub_type, event)
                        elif msg_type == "session_reconnect":
                            reconnect_url = payload["payload"]["session"]["reconnect_url"]
                            subscribe_on_welcome = False
                            break
                        elif msg_type == "revocation":
                            logger.warning("Abonnement EventSub révoqué (%s): %s", role, payload)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.eventsub_connected[role] = False
                self.eventsub_errors[role] = str(exc)
                reconnect_url = self.EVENTSUB_WS
                subscribe_on_welcome = True
                logger.exception("EventSub %s déconnecté: %s", role, exc)
                await asyncio.sleep(5)
            finally:
                self.eventsub_connected[role] = False

    async def _subscribe_for_role(self, session_id: str, role: str) -> None:
        if not self.bot_user_id or not self.broadcaster_user_id:
            raise RuntimeError("IDs Twitch manquants")

        if role == "bot":
            subscriptions = [
                ("channel.chat.message", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                    "user_id": self.bot_user_id,
                }),
            ]
        elif role == "broadcaster":
            subscriptions = [
                ("channel.follow", "2", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                    "moderator_user_id": self.broadcaster_user_id,
                }),
                ("channel.subscribe", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                }),
                ("channel.subscription.gift", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                }),
                ("channel.subscription.message", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                }),
                ("channel.cheer", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                }),
                ("channel.raid", "1", {
                    "to_broadcaster_user_id": self.broadcaster_user_id,
                }),
                ("channel.channel_points_custom_reward_redemption.add", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                }),
                ("channel.hype_train.begin", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                }),
                ("channel.hype_train.progress", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                }),
                ("channel.hype_train.end", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                }),
                ("channel.shoutout.receive", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                    "moderator_user_id": self.broadcaster_user_id,
                }),
                ("stream.online", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                }),
                ("stream.offline", "1", {
                    "broadcaster_user_id": self.broadcaster_user_id,
                }),
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
                        "condition": condition,
                        "transport": {"method": "websocket", "session_id": session_id},
                    },
                )
                logger.info("Abonnement EventSub actif (%s): %s", role, sub_type)
            except Exception as exc:
                logger.warning("Abonnement EventSub refusé (%s) %s: %s", role, sub_type, exc)

