from __future__ import annotations

import asyncio
import logging
import random
import re
from collections import deque
from time import monotonic
from typing import Any

from app.config import Settings
from app.core.event_bus import OverlayBus
from app.core.identity import AuraIdentity
from app.database import Database, utcnow
from app.modules.commands import CommandModule
from app.modules.complete_suite import CompleteSuite
from app.modules.engagement import EngagementModule
from app.modules.games import GamesModule
from app.modules.loyalty import LoyaltyModule
from app.modules.memory import MemoryModule
from app.modules.moderation import ModerationModule
from app.modules.powerpack import PowerPack
from app.modules.shop import ShopModule
from app.modules.studio import StudioModule
from app.services.ai import AuraAI
from app.services.obs import OBSClient
from app.services.twitch import TwitchClient

logger = logging.getLogger(__name__)


class AuraOrchestrator:
    def __init__(self, settings: Settings, db: Database):
        self.settings = settings
        self.db = db
        self.identity = AuraIdentity(settings.identity_path)
        self.identity.load()
        self.overlay = OverlayBus()
        self.ai = AuraAI(settings, self.identity)
        self.obs = OBSClient(settings)
        self.twitch = TwitchClient(settings, db, self.handle_twitch_event)

        self.loyalty = LoyaltyModule(db)
        self.moderation = ModerationModule(db)
        self.memory = MemoryModule(db)
        self.games = GamesModule(db)
        self.shop = ShopModule(db)
        self.engagement = EngagementModule(db)
        self.studio = StudioModule(db)
        self.power = PowerPack(db, settings)
        self.complete = CompleteSuite(db, settings)
        self.commands = CommandModule(self)

        self.recent_chat: deque[str] = deque(maxlen=30)
        self.last_ai_at = 0.0
        self.ai_lock = asyncio.Lock()
        self.ai_user_cooldowns: dict[str, float] = {}
        self.ai_tasks: set[asyncio.Task[Any]] = set()
        self.stream_online = False
        self.messages_since_announcement = 0
        self.announcement_task: asyncio.Task[None] | None = None
        self.started = False

    async def start(self) -> None:
        await self.power.initialize()
        await self.complete.initialize()
        await self.ai.start()
        await self.twitch.start()
        await self.power.start(self)
        await self.complete.start(self)
        self.announcement_task = asyncio.create_task(
            self._announcement_loop(), name="aura-announcements"
        )
        self.started = True

    async def close(self) -> None:
        if self.announcement_task:
            self.announcement_task.cancel()
            try:
                await self.announcement_task
            except asyncio.CancelledError:
                pass
        await self.complete.close()
        await self.power.close()
        await self.twitch.close()
        await self.ai.close()
        self.started = False

    async def handle_twitch_event(self, event_type: str, event: dict[str, Any]) -> None:
        await self.db.log_event(event_type, event)
        if event_type != "channel.chat.message":
            await self.power.on_twitch_event(event_type, event)
            await self.complete.on_twitch_event(event_type, event)
        if event_type == "channel.chat.message":
            await self._handle_chat(event)
        elif event_type == "channel.follow":
            name = event.get("user_name", "quelqu'un")
            await self.say(f"{name} vient de suivre la marée. Bienvenue sur le Spot.")
            await self._alert("follow", {"type": "follow", "viewer": name})
        elif event_type == "channel.subscribe":
            name = event.get("user_name", "un abonné")
            await self.say(f"{name} s’abonne à la chaîne. Merci pour le soutien.")
            await self._alert("subscribe", {"type": "subscribe", "viewer": name})
        elif event_type == "channel.subscription.gift":
            name = event.get("user_name") or "Un mystérieux bienfaiteur"
            total = event.get("total", 1)
            await self.say(f"{name} lâche {total} abonnement(s) sur le Spot. Marée généreuse.")
            await self._alert("subscribe", {"type": "gift", "viewer": name, "count": total})
        elif event_type == "channel.cheer":
            name = event.get("user_name") or "Anonyme"
            bits = event.get("bits", 0)
            await self.say(f"{name} envoie {bits} bits. Aura a entendu les pièces tomber.")
            await self._alert("bits", {"type": "bits", "viewer": name, "amount": bits})
        elif event_type == "channel.raid":
            name = event.get("from_broadcaster_user_name", "une chaîne")
            viewers = event.get("viewers", 0)
            await self.say(f"Marée montante : {name} débarque avec {viewers} personnes. Bienvenue.")
            await self._alert("raid", {"type": "raid", "viewer": name, "count": viewers})
        elif event_type == "channel.channel_points_custom_reward_redemption.add":
            name = event.get("user_name", "un viewer")
            reward = event.get("reward", {}).get("title", "une récompense")
            await self._alert("redemption", {"type": "redemption", "viewer": name, "reward": reward})
            await self._execute_reward_action(name, reward, event)
        elif event_type in {"channel.hype_train.begin", "channel.hype_train.progress", "channel.hype_train.end"}:
            level = event.get("level", 1)
            total = event.get("total", 0)
            await self._alert("hype_train", {"type": "hype_train", "level": level, "amount": total, "message": f"Hype Train niveau {level}"})
            if event_type == "channel.hype_train.end":
                await self.say(f"Hype Train terminé au niveau {level}. Le Spot a chauffé.")
        elif event_type == "channel.shoutout.receive":
            name = event.get("from_broadcaster_user_name", "une chaîne")
            viewers = event.get("viewer_count", 0)
            await self._alert("shoutout", {"type": "shoutout", "viewer": name, "count": viewers})
        elif event_type == "stream.online":
            self.stream_online = True
            await self.overlay.emit({"type": "stream_online"})
        elif event_type == "stream.offline":
            self.stream_online = False
            await self.overlay.emit({"type": "stream_offline"})

    async def _alert(self, name: str, payload: dict[str, Any]) -> None:
        enabled = bool(await self.db.get_setting(f"alerts.{name}.enabled", True))
        rendered = await self.studio.render_alert(name, payload)
        if enabled and rendered.get("enabled", True):
            await self.overlay.emit(rendered)

    async def _handle_chat(self, event: dict[str, Any]) -> None:
        user_id = event.get("chatter_user_id", "")
        login = event.get("chatter_user_login", "").lower()
        display_name = event.get("chatter_user_name", login)
        text = event.get("message", {}).get("text", "").strip()
        if not user_id or not text:
            return
        if self.twitch.bot_user_id and user_id == self.twitch.bot_user_id:
            return

        viewer = await self.db.upsert_viewer(user_id, login, display_name)
        self.messages_since_announcement += 1
        await self.overlay.emit({
            "type": "chat_message",
            "viewer": display_name,
            "message": text,
            "badges": [badge.get("set_id") for badge in event.get("badges", [])],
        })
        if not bool(await self.db.get_setting("bot.active", True)):
            return
        badges = event.get("badges", [])
        is_broadcaster = any(badge.get("set_id") == "broadcaster" for badge in badges)

        restriction = await self.complete.restriction_for(user_id)
        if restriction and restriction.get("block_chat") and not is_broadcaster:
            try:
                await self.twitch.delete_message(event.get("message_id", ""))
            except Exception:
                logger.exception("Suppression d'un message restreint impossible")
            return
        link_permitted = await self.complete.has_link_permit(user_id)
        decision = await self.moderation.evaluate(user_id, text, badges, is_broadcaster, link_permitted=link_permitted)
        if decision.blocked:
            try:
                await self.twitch.delete_message(event.get("message_id", ""))
                if decision.timeout_seconds:
                    await self.twitch.timeout_user(user_id, decision.timeout_seconds, decision.reason)
            except Exception:
                logger.exception("Action de modération Twitch impossible")
            await self.studio.log_moderation(user_id, display_name, decision.reason, "timeout", text)
            await self.say(f"{display_name}, message retiré : {decision.reason}. Le Spot reste respirable.")
            await self.overlay.emit({"type": "moderation", "viewer": display_name, "reason": decision.reason})
            return

        viewer = await self.loyalty.on_message(viewer)
        known_bot_logins = {"streamelements", "nightbot", "wizebot", "moobot", self.settings.twitch_bot_login}
        if login not in known_bot_logins:
            self.recent_chat.append(f"{display_name}: {text}")

        handled = await self.commands.handle(viewer, text, event)
        if handled:
            return
        handled = await self.power.handle_command(viewer, text, event)
        if handled:
            return
        handled = await self.complete.handle_command(viewer, text, event)
        if handled:
            return
        handled = await self.complete.observe_chat(viewer, text, event)
        if handled:
            return

        called = await self._is_direct_ai_call(text, event)
        spontaneous = (
            bool(await self.db.get_setting("ai.spontaneous", self.settings.ai_spontaneous_enabled))
            and random.random() < self.settings.ai_spontaneous_chance
            and monotonic() - self.last_ai_at > self.settings.ai_cooldown_seconds
        )
        if called or spontaneous:
            prompt = await self._clean_ai_invocation(text) if called else text
            task = asyncio.create_task(
                self.answer_ai(
                    viewer,
                    prompt or "Dis-moi quelque chose.",
                    event.get("message_id"),
                    direct=called,
                ),
                name=f"mairaiy-reply-{viewer['user_id']}",
            )
            self.ai_tasks.add(task)
            task.add_done_callback(self.ai_tasks.discard)

    async def _is_direct_ai_call(self, text: str, event: dict[str, Any]) -> bool:
        triggers = await self.db.get_setting("ai.trigger_names", ["aura", "mairaiy"])
        names = {str(name).strip().lower().lstrip("@") for name in triggers if str(name).strip()}
        names.add(self.settings.twitch_bot_login.lower().lstrip("@"))
        lowered = text.casefold()
        if any(re.search(rf"(?<![\w])@?{re.escape(name)}(?![\w])", lowered) for name in names):
            return True
        fragments = event.get("message", {}).get("fragments", [])
        for fragment in fragments:
            mention = fragment.get("mention") or {}
            login = str(mention.get("user_login") or mention.get("user_name") or "").lower()
            if login.lstrip("@") in names:
                return True
        return False

    async def _clean_ai_invocation(self, text: str) -> str:
        triggers = await self.db.get_setting("ai.trigger_names", ["aura", "mairaiy"])
        names = {str(name).strip().lower().lstrip("@") for name in triggers if str(name).strip()}
        names.add(self.settings.twitch_bot_login.lower().lstrip("@"))
        cleaned = text.strip()
        for name in sorted(names, key=len, reverse=True):
            cleaned = re.sub(rf"(?i)(?<![\w])@?{re.escape(name)}(?![\w])[:,]?", " ", cleaned)
        return " ".join(cleaned.split())

    async def answer_ai(
        self,
        viewer: dict[str, Any],
        message: str,
        reply_message_id: str | None = None,
        *,
        direct: bool = False,
    ) -> bool:
        reset_phrases = {
            "reset", "reset conversation", "réinitialise la conversation",
            "reinitialise la conversation", "oublie cette conversation",
            "repars à zéro", "repars a zero",
        }
        normalized_request = " ".join(str(message).casefold().strip().split())
        if direct and normalized_request in reset_phrases:
            await self.memory.reset_conversation(viewer["user_id"])
            await self.say(f"@{viewer['display_name']} conversation remise à zéro.", None)
            return True

        if not bool(await self.db.get_setting("ai.reply_enabled", True)):
            logger.info("Réponse IA ignorée : module désactivé")
            return False
        if not bool(await self.db.get_setting("bot.active", True)):
            logger.info("Réponse IA ignorée : bot désactivé")
            return False
        if bool(await self.db.get_setting("bot.silent", False)):
            logger.info("Réponse IA ignorée : mode silence actif")
            return False

        now = monotonic()
        if direct:
            cooldown = max(0, int(await self.db.get_setting("ai.direct_cooldown_seconds", 4)))
            previous = self.ai_user_cooldowns.get(viewer["user_id"], 0.0)
            if now - previous < cooldown:
                logger.info("Appel direct IA ignoré : cooldown viewer %.1fs", cooldown - (now - previous))
                return False
            self.ai_user_cooldowns[viewer["user_id"]] = now
        elif now - self.last_ai_at < self.settings.ai_cooldown_seconds:
            return False

        logger.info(
            "Appel IA détecté dans le chat: viewer=%s direct=%s message=%s",
            viewer["display_name"], direct, message[:160],
        )
        self.last_ai_at = now

        # Aucun message intermédiaire n'est envoyé. Le chat ne reçoit que la réponse finale.
        async with self.ai_lock:
            try:
                context = await self.memory.context(viewer)
                history = await self.memory.conversation(viewer["user_id"], limit=12)
                answer = await self.ai.reply(
                    viewer["display_name"],
                    message,
                    context,
                    [] if direct else list(self.recent_chat),
                    history,
                )
            except Exception:
                logger.exception("Réponse IA impossible")
                answer = f"@{viewer['display_name']} mon cerveau local a eu un raté. Réessaie dans quelques secondes."

            # La conversation Twitch reste lisible : aucune réponse imbriquée et aucune
            # formule d'attente. Le compte mairaiy publie uniquement la réponse finale.
            if direct and bool(await self.db.get_setting("ai.reply_prefix_mention", True)):
                mention = f"@{viewer['display_name']}"
                if not answer.casefold().startswith(mention.casefold()):
                    answer = f"{mention} {answer}"
            answer = answer[:490]
            await self.memory.remember_turn(viewer["user_id"], "user", message)
            history_answer = re.sub(
                rf"^@?{re.escape(viewer['display_name'])}\s*", "", answer, flags=re.I
            ).strip()
            await self.memory.remember_turn(viewer["user_id"], "assistant", history_answer or answer)
            result = await self.say(answer, None)
            if result is None:
                logger.warning("Réponse IA générée mais non envoyée dans Twitch")
                return False
            self.recent_chat.append(f"Mairaiy: {answer}")
            await self.overlay.emit({
                "type": "aura_message",
                "viewer": viewer["display_name"],
                "message": answer,
                "text": answer,
                "speak": True,
            })
            return True

    async def say(self, message: str, reply_message_id: str | None = None) -> dict[str, Any] | None:
        normalized = " ".join(str(message).casefold().split())
        if normalized in {"je réfléchis…", "je réfléchis...", "@sansahd je réfléchis…", "@sansahd je réfléchis..."}:
            logger.warning("Message d'attente bloqué avant envoi Twitch")
            return None
        logger.info("Aura: %s", message)
        if bool(await self.db.get_setting("bot.silent", False)):
            logger.info("Mode silence actif : message non envoyé")
            return None
        try:
            return await self.twitch.send_chat(message, reply_message_id)
        except Exception as exc:
            logger.warning("Chat Twitch indisponible: %s", exc)
            return None

    async def push_next_tts(self) -> dict[str, Any] | None:
        row = await self.engagement.next_tts()
        if row:
            await self.overlay.emit({
                "type": "tts",
                "viewer": row["display_name"],
                "message": row["text"],
                "text": row["text"],
                "voice": row.get("voice", ""),
                "rate": row.get("rate", 1.0),
                "pitch": row.get("pitch", 1.0),
                "volume": row.get("volume", 1.0),
            })
        return row

    async def _announcement_loop(self) -> None:
        elapsed: dict[int, int] = {}
        while True:
            await asyncio.sleep(60)
            if not bool(await self.db.get_setting("announcements.enabled", True)):
                continue
            if not self.twitch.chat_connected or bool(await self.db.get_setting("bot.silent", False)):
                continue
            announcements = await self.studio.announcements()
            for row in announcements:
                if not row.get("enabled"):
                    continue
                if row.get("only_live") and not self.stream_online:
                    continue
                if self.messages_since_announcement < int(row.get("min_messages", 0)):
                    continue
                row_id = int(row["id"])
                elapsed[row_id] = elapsed.get(row_id, 0) + 1
                if elapsed[row_id] < max(1, int(row.get("interval_minutes", 20))):
                    continue
                elapsed[row_id] = 0
                await self.say(str(row["message"]))
                self.messages_since_announcement = 0
                await self.db.execute("UPDATE announcements SET last_sent_at=? WHERE id=?", (utcnow(), row_id))

    async def _execute_reward_action(self, viewer_name: str, reward_title: str, event: dict[str, Any]) -> None:
        action = await self.studio.matching_reward_action(reward_title)
        if not action:
            return
        action_type = str(action.get("action_type", "overlay"))
        payload = dict(action.get("action_payload") or {})
        if action_type == "overlay":
            await self.overlay.emit({
                "type": payload.get("type", "reward_action"),
                "viewer": viewer_name,
                "message": payload.get("message", reward_title),
                **payload,
            })
        elif action_type == "tts":
            await self.overlay.emit({"type": "tts", "viewer": viewer_name, "text": payload.get("text", reward_title)})
        elif action_type == "chat":
            text = str(payload.get("message", "")).strip()
            if text:
                await self.say(text.format(viewer=viewer_name, reward=reward_title))
        elif action_type == "counter":
            slug = str(payload.get("slug", "fails"))
            delta = int(payload.get("delta", 1))
            counter = await self.engagement.counter_change(slug, delta)
            if counter:
                await self.overlay.emit({"type": "counter", "slug": slug, "label": counter["label"], "value": counter["value"]})
        response = str(action.get("response_message") or "").strip()
        if response:
            await self.say(response.format(viewer=viewer_name, reward=reward_title))

    async def status(self) -> dict[str, Any]:
        accounts = await self.twitch.account_status()
        bot = accounts["bot"]
        broadcaster = accounts["broadcaster"]
        return {
            "started": self.started,
            "twitch_configured": self.settings.twitch_configured,
            "bot_authorized": bool(bot["connected"] and bot["matches_expected"]),
            "broadcaster_authorized": bool(broadcaster["connected"] and broadcaster["matches_expected"]),
            "accounts": accounts,
            "eventsub_connected": self.twitch.connected,
            "eventsub_chat_connected": self.twitch.eventsub_connected["bot"],
            "eventsub_channel_connected": self.twitch.eventsub_connected["broadcaster"],
            "eventsub_errors": dict(self.twitch.eventsub_errors),
            "twitch_error": self.twitch.last_error,
            "ai_mode": self.settings.ai_mode,
            "ai_enabled": self.ai.enabled,
            "ai_model": self.settings.ai_fast_model or self.settings.ai_model,
            "ai_warming_up": bool(self.ai.warmup_task and not self.ai.warmup_task.done()),
            "obs_enabled": self.settings.obs_enabled,
            "overlay_clients": len(self.overlay.clients),
            "bot_active": bool(await self.db.get_setting("bot.active", True)),
            "bot_silent": bool(await self.db.get_setting("bot.silent", False)),
            "emergency_mode": bool(await self.db.get_setting("moderation.emergency_mode", False)),
            "stream_online": self.stream_online,
            "version": "1.2.0",
        }
