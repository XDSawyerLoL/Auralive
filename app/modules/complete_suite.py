from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import random
import re
import secrets

import aiohttp
from datetime import datetime, timedelta, timezone
from typing import Any

from app.database import Database, utcnow

logger = logging.getLogger(__name__)


def _json(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


class CompleteSuite:
    """Fonctions communautaires et de diffusion complémentaires.

    Le module reste local et déterministe. Les intégrations externes ne sont actives
    que lorsque les identifiants correspondants sont configurés.
    """

    GAME_COOLDOWNS = {
        "run": 45,
        "lootdrop": 60,
        "ticket": 5,
    }

    def __init__(self, db: Database, settings: Any):
        self.db = db
        self.settings = settings
        self.orchestrator: Any | None = None
        self.worker_task: asyncio.Task[None] | None = None
        self.audience_task: asyncio.Task[None] | None = None
        self.user_cooldowns: dict[tuple[str, str], float] = {}
        self.last_emotes: list[dict[str, Any]] = []
        self.game_lock = asyncio.Lock()
        self.background_tasks: set[asyncio.Task[Any]] = set()

    async def initialize(self) -> None:
        await self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS faq_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                keywords TEXT NOT NULL DEFAULT '[]',
                enabled INTEGER NOT NULL DEFAULT 1,
                usage_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS link_permits (
                user_id TEXT PRIMARY KEY,
                login TEXT NOT NULL DEFAULT '',
                display_name TEXT NOT NULL DEFAULT '',
                issued_by TEXT NOT NULL DEFAULT '',
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_restrictions (
                user_id TEXT PRIMARY KEY,
                login TEXT NOT NULL DEFAULT '',
                display_name TEXT NOT NULL DEFAULT '',
                reason TEXT NOT NULL DEFAULT '',
                block_chat INTEGER NOT NULL DEFAULT 0,
                block_commands INTEGER NOT NULL DEFAULT 1,
                block_tts INTEGER NOT NULL DEFAULT 1,
                expires_at TEXT,
                issued_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS game_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_type TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                state TEXT NOT NULL DEFAULT '{}',
                created_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                ends_at TEXT,
                ended_at TEXT
            );

            CREATE TABLE IF NOT EXISTS game_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                data TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                UNIQUE(session_id,user_id),
                FOREIGN KEY(session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS viewer_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                draw_key TEXT NOT NULL,
                user_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                ticket_number INTEGER NOT NULL,
                cost INTEGER NOT NULL DEFAULT 0,
                winner INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                UNIQUE(draw_key,user_id,ticket_number)
            );

            CREATE TABLE IF NOT EXISTS topwords_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                options TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'active',
                created_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                ends_at TEXT,
                ended_at TEXT
            );

            CREATE TABLE IF NOT EXISTS topwords_votes (
                session_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                option_value TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(session_id,user_id),
                FOREIGN KEY(session_id) REFERENCES topwords_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS audience_members (
                kind TEXT NOT NULL,
                user_id TEXT NOT NULL,
                login TEXT NOT NULL DEFAULT '',
                display_name TEXT NOT NULL DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                ended_at TEXT,
                metadata TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY(kind,user_id)
            );

            CREATE TABLE IF NOT EXISTS stream_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                title TEXT NOT NULL DEFAULT '',
                game_name TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT '',
                stats TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS streamer_pings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                priority TEXT NOT NULL DEFAULT 'normal',
                created_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                acknowledged_at TEXT
            );

            CREATE TABLE IF NOT EXISTS clip_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT UNIQUE NOT NULL,
                threshold INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 0,
                delay_seconds INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS external_connectors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                kind TEXT NOT NULL,
                config TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 0,
                last_status TEXT NOT NULL DEFAULT 'non testé',
                last_checked_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        await self._seed()

    async def _seed(self) -> None:
        defaults = {
            "ai.thinking_message_enabled": False,
            "ai.threaded_replies": False,
            "ai.reply_prefix_mention": True,
            "games.enabled": True,
            "games.run.reward_max": 45,
            "games.ticket.cost": 25,
            "games.ticket.reward": 500,
            "games.bingo.reward": 250,
            "games.decrypt.reward": 75,
            "games.bomb.penalty": 50,
            "overlay.emotes.enabled": True,
            "overlay.topwords.enabled": True,
            "overlay.credits.enabled": True,
            "overlay.ping.enabled": True,
            "audience.sync.enabled": True,
            "audience.sync.interval_minutes": 15,
            "clips.auto.bits_threshold": 1000,
            "clips.auto.raid_threshold": 30,
            "credits.auto_stop_stream": False,
            "credits.auto_recap": True,
            "site.public.enabled": True,
            "avatar.enabled": True,
            "avatar.voice": "",
            "avatar.rate": 1.0,
            "avatar.pitch": 1.0,
            "avatar.volume": 1.0,
            "avatar.subtitles": True,
            "avatar.subtitle_seconds": 12,
        }
        for key, value in defaults.items():
            # Les anciennes versions pouvaient conserver des réglages qui rendaient le chat
            # illisible. La migration 1.2 impose une réponse finale normale, sans attente,
            # sans formule d’attente et sans réponse imbriquée Twitch.
            if key in {"ai.thinking_message_enabled", "ai.threaded_replies"}:
                await self.db.set_setting(key, False)
            elif await self.db.get_setting(key) is None:
                await self.db.set_setting(key, value)

        faq_rows = [
            ("Quelles sont les commandes ?", "Tape !commandes pour afficher les commandes principales.", ["commandes", "aide", "help"]),
            ("Comment gagner des Écumes ?", "Tu gagnes des Écumes en participant au chat et pendant les événements du Spot.", ["écumes", "ecumes", "points", "monnaie"]),
            ("Comment jouer avec Sansa ?", "Tape !join suivi d'une courte note pour rejoindre la file Play with viewers.", ["jouer", "join", "file", "queue"]),
        ]
        for question, answer, keywords in faq_rows:
            await self.db.execute(
                """
                INSERT INTO faq_entries(question,answer,keywords,enabled,created_at,updated_at)
                SELECT ?,?,?,1,?,?
                WHERE NOT EXISTS (SELECT 1 FROM faq_entries WHERE question=?)
                """,
                (question, answer, json.dumps(keywords, ensure_ascii=False), utcnow(), utcnow(), question),
            )

        for event_type, threshold in (("channel.cheer", 1000), ("channel.raid", 30), ("channel.hype_train.end", 0)):
            await self.db.execute(
                """
                INSERT OR IGNORE INTO clip_rules(event_type,threshold,enabled,delay_seconds,created_at,updated_at)
                VALUES(?,?,0,0,?,?)
                """,
                (event_type, threshold, utcnow(), utcnow()),
            )

    async def start(self, orchestrator: Any) -> None:
        self.orchestrator = orchestrator
        self.worker_task = asyncio.create_task(self._worker_loop(), name="aura-complete-worker")
        self.audience_task = asyncio.create_task(self._audience_loop(), name="aura-audience-sync")

    async def close(self) -> None:
        for task in (self.worker_task, self.audience_task, *list(self.background_tasks)):
            if task:
                task.cancel()
        for task in (self.worker_task, self.audience_task, *list(self.background_tasks)):
            if task:
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                except Exception:
                    logger.exception("Tâche Complete Suite arrêtée en erreur")
        self.background_tasks.clear()
        self.worker_task = None
        self.audience_task = None

    def _spawn(self, coroutine: Any, name: str) -> None:
        task = asyncio.create_task(coroutine, name=name)
        self.background_tasks.add(task)

        def done(completed: asyncio.Task[Any]) -> None:
            self.background_tasks.discard(completed)
            if completed.cancelled():
                return
            try:
                completed.result()
            except Exception:
                logger.exception("Tâche Complete Suite en erreur: %s", name)

        task.add_done_callback(done)

    # ------------------------------------------------------------------
    # Chat and moderation helpers
    # ------------------------------------------------------------------
    async def has_link_permit(self, user_id: str) -> bool:
        row = await self.db.fetchone("SELECT expires_at FROM link_permits WHERE user_id=?", (user_id,))
        if not row:
            return False
        expires = _parse_dt(row.get("expires_at"))
        if not expires or expires <= _now():
            await self.db.execute("DELETE FROM link_permits WHERE user_id=?", (user_id,))
            return False
        return True

    async def restriction_for(self, user_id: str) -> dict[str, Any] | None:
        row = await self.db.fetchone("SELECT * FROM user_restrictions WHERE user_id=?", (user_id,))
        if not row:
            return None
        expires = _parse_dt(row.get("expires_at"))
        if expires and expires <= _now():
            await self.db.execute("DELETE FROM user_restrictions WHERE user_id=?", (user_id,))
            return None
        return row

    async def observe_chat(self, viewer: dict[str, Any], text: str, event: dict[str, Any]) -> bool:
        await self._emit_emotes(viewer, event)
        handled = await self._observe_topwords(viewer, text)
        if handled:
            return True
        handled = await self._observe_decrypt(viewer, text)
        return handled

    async def _emit_emotes(self, viewer: dict[str, Any], event: dict[str, Any]) -> None:
        if not bool(await self.db.get_setting("overlay.emotes.enabled", True)):
            return
        fragments = event.get("message", {}).get("fragments", [])
        emotes: list[dict[str, Any]] = []
        for fragment in fragments:
            emote = fragment.get("emote")
            if not emote:
                continue
            emote_id = str(emote.get("id", ""))
            if not emote_id:
                continue
            emotes.append({
                "id": emote_id,
                "text": fragment.get("text", ""),
                "url": f"https://static-cdn.jtvnw.net/emoticons/v2/{emote_id}/default/dark/3.0",
            })
        if emotes and self.orchestrator:
            await self.orchestrator.overlay.emit({
                "type": "emote_wall",
                "viewer": viewer.get("display_name", "Viewer"),
                "emotes": emotes[:12],
            })

    # ------------------------------------------------------------------
    # Built-in command router
    # ------------------------------------------------------------------
    async def handle_command(self, viewer: dict[str, Any], text: str, event: dict[str, Any]) -> bool:
        if not text.startswith("!"):
            return False
        command, _, argument = text.strip().partition(" ")
        command = command.lower()
        argument = argument.strip()
        mapping = {
            "!faq": self._cmd_faq,
            "!permit": self._cmd_permit,
            "!restrict": self._cmd_restrict,
            "!unrestrict": self._cmd_unrestrict,
            "!run": self._cmd_run,
            "!drop": self._cmd_drop,
            "!decrypt": self._cmd_decrypt,
            "!bomb": self._cmd_bomb,
            "!love": self._cmd_love,
            "!hate": self._cmd_hate,
            "!ticket": self._cmd_ticket,
            "!bingo": self._cmd_bingo,
            "!topwords": self._cmd_topwords,
            "!topvote": self._cmd_topvote,
            "!sublottery": self._cmd_sub_lottery,
            "!ping": self._cmd_ping,
            "!credits": self._cmd_credits,
            "!recap": self._cmd_recap,
            "!title": self._cmd_title,
            "!enhance": self._cmd_enhance,
            "!profile": self._cmd_profile,
            "!rank": self._cmd_profile,
        }
        handler = mapping.get(command)
        if not handler:
            return False
        restriction = await self.restriction_for(viewer["user_id"])
        if restriction and restriction.get("block_commands") and not self._allowed("mod", event):
            return True
        await handler(viewer, argument, event)
        return True

    async def _cmd_faq(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if argument.lower().startswith("add ") and self._allowed("mod", event):
            payload = argument[4:].strip().split("|", 1)
            if len(payload) != 2:
                await self.orchestrator.say("Usage : !faq add question | réponse")
                return
            await self.save_faq({"question": payload[0].strip(), "answer": payload[1].strip(), "keywords": [], "enabled": True})
            await self.orchestrator.say("FAQ ajoutée.")
            return
        if not argument:
            rows = await self.list_faq()
            await self.orchestrator.say("FAQ : " + " | ".join(f"{row['id']}. {row['question']}" for row in rows[:6]))
            return
        row = await self.search_faq(argument)
        await self.orchestrator.say(row["answer"] if row else "Je n'ai pas encore de réponse FAQ pour ça.")

    async def _cmd_permit(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if not self._allowed("mod", event):
            return
        parts = argument.split()
        if not parts:
            await self.orchestrator.say("Usage : !permit @pseudo [minutes]")
            return
        target = await self.db.get_viewer(login=parts[0].lstrip("@"))
        if not target:
            await self.orchestrator.say("Ce viewer doit avoir parlé au moins une fois.")
            return
        minutes = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 5
        await self.grant_permit(target, minutes, viewer["display_name"])
        await self.orchestrator.say(f"{target['display_name']} peut publier des liens pendant {minutes} minute(s).")

    async def _cmd_restrict(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if not self._allowed("mod", event):
            return
        parts = argument.split(maxsplit=2)
        if not parts:
            await self.orchestrator.say("Usage : !restrict @pseudo [minutes] [raison]")
            return
        target = await self.db.get_viewer(login=parts[0].lstrip("@"))
        if not target:
            await self.orchestrator.say("Viewer inconnu.")
            return
        minutes = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 10
        reason = parts[2] if len(parts) > 2 else "Restriction temporaire"
        await self.restrict_user(target, minutes, reason, viewer["display_name"])
        await self.orchestrator.say(f"{target['display_name']} est restreint pendant {minutes} minute(s).")

    async def _cmd_unrestrict(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if not self._allowed("mod", event):
            return
        target = await self.db.get_viewer(login=argument.lstrip("@")) if argument else None
        if not target:
            await self.orchestrator.say("Usage : !unrestrict @pseudo")
            return
        await self.db.execute("DELETE FROM user_restrictions WHERE user_id=?", (target["user_id"],))
        await self.orchestrator.say(f"Restriction retirée pour {target['display_name']}.")

    async def _cmd_run(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if self._cooldown(viewer["user_id"], "run", self.GAME_COOLDOWNS["run"]):
            return
        roll = secrets.randbelow(100)
        if roll < 18:
            loss = min(int(viewer.get("points", 0)), secrets.choice([5, 10, 15]))
            if loss:
                await self.db.adjust_points(viewer["user_id"], -loss, "mini-jeu run")
            await self.orchestrator.say(f"{viewer['display_name']} trébuche à deux mètres de l'arrivée et perd {loss} Écumes.")
        elif roll > 93:
            reward = secrets.choice([60, 75, 100])
            await self.db.adjust_points(viewer["user_id"], reward, "mini-jeu run jackpot")
            await self.orchestrator.say(f"Run parfait de {viewer['display_name']} : +{reward} Écumes.")
        else:
            reward = secrets.choice([8, 12, 18, 25, 35])
            await self.db.adjust_points(viewer["user_id"], reward, "mini-jeu run")
            await self.orchestrator.say(f"{viewer['display_name']} termine le run : +{reward} Écumes.")

    async def _cmd_drop(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if argument.lower().startswith("start") and self._allowed("mod", event):
            amount = next((int(x) for x in argument.split() if x.isdigit()), 100)
            await self.start_drop(amount, viewer["display_name"])
            await self.orchestrator.say(f"DROP ouvert : le premier à taper !drop gagne {amount} Écumes.")
            await self.orchestrator.overlay.emit({"type": "drop_open", "amount": amount})
            return
        async with self.game_lock:
            session = await self.active_game("drop")
            if not session:
                await self.orchestrator.say("Aucun drop n'est actif.")
                return
            state = _json(session.get("state"), {})
            if state.get("winner_id"):
                return
            amount = int(state.get("amount", 100))
            state["winner_id"] = viewer["user_id"]
            state["winner_name"] = viewer["display_name"]
            await self.db.execute(
                "UPDATE game_sessions SET state=?,status='ended',ended_at=? WHERE id=? AND status='active'",
                (json.dumps(state, ensure_ascii=False), utcnow(), session["id"]),
            )
            await self.db.adjust_points(viewer["user_id"], amount, "drop du Spot")
        await self.orchestrator.say(f"{viewer['display_name']} attrape le drop : +{amount} Écumes.")
        await self.orchestrator.overlay.emit({"type": "drop_winner", "viewer": viewer["display_name"], "amount": amount})

    async def _cmd_decrypt(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if argument.lower().startswith("start ") and self._allowed("mod", event):
            word = argument[6:].strip()
            if len(word) < 3:
                await self.orchestrator.say("Choisis un mot d'au moins 3 caractères.")
                return
            session = await self.start_decrypt(word, viewer["display_name"])
            state = _json(session["state"], {})
            await self.orchestrator.say(f"Décryptage : remets les lettres dans l'ordre — {state['scrambled']}")
            return
        if argument:
            won = await self._try_decrypt(viewer, argument)
            if won:
                return
        session = await self.active_game("decrypt")
        if not session:
            await self.orchestrator.say("Aucun décryptage actif. Un mod peut utiliser !decrypt start mot")
            return
        state = _json(session["state"], {})
        await self.orchestrator.say(f"Décryptage en cours : {state.get('scrambled', '?')}")

    async def _cmd_bomb(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        target_login = argument.split()[0].lstrip("@") if argument else ""
        session = await self.active_game("bomb")
        if not session:
            if not target_login:
                await self.orchestrator.say("Usage : !bomb @pseudo")
                return
            target = await self.db.get_viewer(login=target_login)
            if not target:
                await self.orchestrator.say("Cible inconnue.")
                return
            session = await self.start_bomb(target, viewer["display_name"])
            await self.orchestrator.say(f"💣 {target['display_name']} reçoit la bombe. Passe-la avec !bomb @pseudo.")
            return
        state = _json(session["state"], {})
        if state.get("holder_id") != viewer["user_id"] and not self._allowed("mod", event):
            await self.orchestrator.say(f"La bombe est chez {state.get('holder_name', 'quelqu’un')}.")
            return
        if not target_login:
            await self.orchestrator.say("Passe la bombe avec !bomb @pseudo.")
            return
        target = await self.db.get_viewer(login=target_login)
        if not target or target["user_id"] == viewer["user_id"]:
            await self.orchestrator.say("Choisis une autre cible connue.")
            return
        state.update({"holder_id": target["user_id"], "holder_name": target["display_name"], "last_pass": utcnow()})
        await self.db.execute("UPDATE game_sessions SET state=? WHERE id=?", (json.dumps(state, ensure_ascii=False), session["id"]))
        await self.orchestrator.say(f"💣 {viewer['display_name']} passe la bombe à {target['display_name']}.")

    async def _cmd_love(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        await self._compatibility(viewer, argument, "love")

    async def _cmd_hate(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        await self._compatibility(viewer, argument, "hate")

    async def _compatibility(self, viewer: dict[str, Any], argument: str, kind: str) -> None:
        target = argument.split()[0].lstrip("@") if argument else "Sansa"
        raw = f"{kind}:{viewer['login'].lower()}:{target.lower()}".encode("utf-8")
        score = int(hashlib.sha256(raw).hexdigest()[:8], 16) % 101
        label = "compatibilité" if kind == "love" else "niveau de rivalité"
        await self.orchestrator.say(f"{viewer['display_name']} × {target} : {score}% de {label}.")

    async def _cmd_ticket(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if argument.lower() == "draw" and self._allowed("mod", event):
            result = await self.draw_tickets()
            if not result:
                await self.orchestrator.say("Aucun ticket à tirer.")
                return
            await self.orchestrator.say(f"Ticket gagnant #{result['ticket_number']} : {result['display_name']} remporte {result['reward']} Écumes.")
            await self.orchestrator.overlay.emit({"type": "ticket_winner", **result})
            return
        message = await self.buy_ticket(viewer)
        await self.orchestrator.say(message)

    async def _cmd_bingo(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        sub = argument.lower().strip()
        if sub == "start" and self._allowed("mod", event):
            await self.start_bingo(viewer["display_name"])
            await self.orchestrator.say("Bingo ouvert. Les viewers rejoignent avec !bingo.")
            return
        if sub == "draw" and self._allowed("mod", event):
            number = await self.bingo_draw()
            await self.orchestrator.say(f"Bingo : numéro {number}." if number else "Tous les numéros sont sortis.")
            return
        if sub == "end" and self._allowed("mod", event):
            await self.end_game("bingo")
            await self.orchestrator.say("Bingo terminé.")
            return
        if sub == "claim":
            result = await self.bingo_claim(viewer)
            await self.orchestrator.say(result)
            return
        card = await self.bingo_join(viewer)
        await self.orchestrator.say(card)

    async def _cmd_topwords(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if argument.lower().startswith("start ") and self._allowed("mod", event):
            parts = [part.strip() for part in argument[6:].split("|") if part.strip()]
            if len(parts) < 3:
                await self.orchestrator.say("Usage : !topwords start titre | choix 1 | choix 2 [| choix 3]")
                return
            await self.start_topwords(parts[0], parts[1:], viewer["display_name"])
            await self.orchestrator.say(f"TopWords : {parts[0]} — vote en écrivant : {' / '.join(parts[1:])}")
            return
        if argument.lower() in {"stop", "end"} and self._allowed("mod", event):
            result = await self.close_topwords()
            await self.orchestrator.say(result)
            return
        data = await self.topwords_state()
        if not data:
            await self.orchestrator.say("Aucun TopWords actif.")
            return
        await self.orchestrator.say(f"{data['title']} — " + " | ".join(f"{row['option']}: {row['votes']}" for row in data["results"]))

    async def _cmd_topvote(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if not argument:
            await self.orchestrator.say("Usage : !topvote choix")
            return
        await self.orchestrator.say(await self.cast_topword_vote(viewer, argument))

    async def _cmd_sub_lottery(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if not self._allowed("mod", event):
            return
        rows = await self.db.fetchall("SELECT * FROM audience_members WHERE kind='subscriber' AND active=1")
        if not rows:
            await self.orchestrator.say("Aucun abonné synchronisé pour le tirage.")
            return
        winner = secrets.choice(rows)
        await self.orchestrator.say(f"Loterie abonnés : {winner['display_name']} est tiré au sort.")
        await self.orchestrator.overlay.emit({"type": "subscriber_lottery", "viewer": winner["display_name"]})

    async def _cmd_ping(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if not self._allowed("mod", event):
            return
        if not argument:
            await self.orchestrator.say("Usage : !ping message")
            return
        await self.create_ping("PING MODÉRATION", argument, "normal", viewer["display_name"])
        await self.orchestrator.say("Ping envoyé discrètement au streamer.")

    async def _cmd_credits(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if not self._allowed("mod", event):
            return
        payload = await self.credits_payload()
        await self.orchestrator.overlay.emit({"type": "credits_start", **payload})
        await self.orchestrator.say("Générique de fin lancé.")

    async def _cmd_recap(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if not self._allowed("mod", event):
            return
        summary = await self.generate_recap()
        await self.orchestrator.say(summary[:450])

    async def _cmd_title(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if not self._allowed("mod", event):
            return
        title = await self.generate_title(argument or "le live actuel")
        await self.orchestrator.say(f"Titre proposé : {title[:400]}")

    async def _cmd_enhance(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        if not self._allowed("mod", event):
            return
        if not argument:
            await self.orchestrator.say("Usage : !enhance texte")
            return
        text = await self.enhance_text(argument)
        await self.orchestrator.say(text[:450])

    async def _cmd_profile(self, viewer: dict[str, Any], argument: str, event: dict[str, Any]) -> None:
        target = await self.db.get_viewer(login=argument.lstrip("@")) if argument else viewer
        if not target:
            await self.orchestrator.say("Viewer inconnu.")
            return
        rank = await self.db.fetchone("SELECT COUNT(*)+1 AS rank FROM viewers WHERE points > ?", (target["points"],))
        await self.orchestrator.say(
            f"{target['display_name']} — rang #{rank['rank'] if rank else '?'} · niveau {target['level']} · "
            f"{target['points']} Écumes · {target['message_count']} messages."
        )

    # ------------------------------------------------------------------
    # FAQ, permissions and restrictions
    # ------------------------------------------------------------------
    async def list_faq(self) -> list[dict[str, Any]]:
        rows = await self.db.fetchall("SELECT * FROM faq_entries ORDER BY usage_count DESC,id")
        for row in rows:
            row["keywords"] = _json(row.get("keywords"), [])
            row["enabled"] = bool(row.get("enabled"))
        return rows

    async def save_faq(self, payload: dict[str, Any], faq_id: int | None = None) -> dict[str, Any]:
        keywords = [str(item).strip() for item in payload.get("keywords", []) if str(item).strip()]
        if faq_id:
            await self.db.execute(
                "UPDATE faq_entries SET question=?,answer=?,keywords=?,enabled=?,updated_at=? WHERE id=?",
                (payload["question"], payload["answer"], json.dumps(keywords, ensure_ascii=False), int(payload.get("enabled", True)), utcnow(), faq_id),
            )
        else:
            faq_id = await self.db.execute(
                "INSERT INTO faq_entries(question,answer,keywords,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                (payload["question"], payload["answer"], json.dumps(keywords, ensure_ascii=False), int(payload.get("enabled", True)), utcnow(), utcnow()),
            )
        return await self.db.fetchone("SELECT * FROM faq_entries WHERE id=?", (faq_id,)) or {}

    async def search_faq(self, query: str) -> dict[str, Any] | None:
        normalized = query.lower().strip()
        rows = await self.list_faq()
        best: tuple[int, dict[str, Any]] | None = None
        words = set(re.findall(r"[\wÀ-ÿ'-]+", normalized))
        for row in rows:
            if not row["enabled"]:
                continue
            haystack = f"{row['question']} {' '.join(row['keywords'])}".lower()
            score = sum(1 for word in words if word in haystack)
            if normalized in haystack:
                score += 5
            if score and (best is None or score > best[0]):
                best = (score, row)
        if best:
            await self.db.execute("UPDATE faq_entries SET usage_count=usage_count+1 WHERE id=?", (best[1]["id"],))
            return best[1]
        return None

    async def grant_permit(self, target: dict[str, Any], minutes: int, issued_by: str) -> None:
        expires = (_now() + timedelta(minutes=max(1, minutes))).isoformat()
        await self.db.execute(
            """
            INSERT INTO link_permits(user_id,login,display_name,issued_by,expires_at,created_at)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET login=excluded.login,display_name=excluded.display_name,
            issued_by=excluded.issued_by,expires_at=excluded.expires_at,created_at=excluded.created_at
            """,
            (target["user_id"], target["login"], target["display_name"], issued_by, expires, utcnow()),
        )

    async def restrict_user(self, target: dict[str, Any], minutes: int, reason: str, issued_by: str) -> None:
        expires = (_now() + timedelta(minutes=max(1, minutes))).isoformat()
        await self.db.execute(
            """
            INSERT INTO user_restrictions(user_id,login,display_name,reason,block_chat,block_commands,block_tts,expires_at,issued_by,created_at)
            VALUES(?,?,?,?,0,1,1,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,block_commands=1,block_tts=1,
            expires_at=excluded.expires_at,issued_by=excluded.issued_by
            """,
            (target["user_id"], target["login"], target["display_name"], reason, expires, issued_by, utcnow()),
        )

    # ------------------------------------------------------------------
    # Games
    # ------------------------------------------------------------------
    async def active_game(self, game_type: str) -> dict[str, Any] | None:
        row = await self.db.fetchone("SELECT * FROM game_sessions WHERE game_type=? AND status='active' ORDER BY id DESC LIMIT 1", (game_type,))
        if row:
            row["state"] = _json(row.get("state"), {})
        return row

    async def end_game(self, game_type: str) -> None:
        await self.db.execute("UPDATE game_sessions SET status='ended',ended_at=? WHERE game_type=? AND status='active'", (utcnow(), game_type))

    async def start_drop(self, amount: int, actor: str) -> dict[str, Any]:
        await self.end_game("drop")
        row_id = await self.db.execute(
            "INSERT INTO game_sessions(game_type,title,status,state,created_by,created_at,ends_at) VALUES('drop','Drop du Spot','active',?,?,?,?)",
            (json.dumps({"amount": max(1, amount)}, ensure_ascii=False), actor, utcnow(), (_now()+timedelta(minutes=2)).isoformat()),
        )
        return await self.db.fetchone("SELECT * FROM game_sessions WHERE id=?", (row_id,)) or {}

    async def start_decrypt(self, word: str, actor: str) -> dict[str, Any]:
        await self.end_game("decrypt")
        clean = " ".join(word.strip().split())
        chars = list(clean.replace(" ", ""))
        for _ in range(8):
            random.shuffle(chars)
        scrambled = " ".join(chars)
        row_id = await self.db.execute(
            "INSERT INTO game_sessions(game_type,title,status,state,created_by,created_at,ends_at) VALUES('decrypt','Décryptage','active',?,?,?,?)",
            (json.dumps({"answer": clean.lower(), "scrambled": scrambled}, ensure_ascii=False), actor, utcnow(), (_now()+timedelta(minutes=5)).isoformat()),
        )
        row = await self.db.fetchone("SELECT * FROM game_sessions WHERE id=?", (row_id,)) or {}
        row["state"] = _json(row.get("state"), {})
        return row

    async def _observe_decrypt(self, viewer: dict[str, Any], text: str) -> bool:
        session = await self.active_game("decrypt")
        if not session:
            return False
        return await self._try_decrypt(viewer, text)

    async def _try_decrypt(self, viewer: dict[str, Any], answer: str) -> bool:
        session = await self.active_game("decrypt")
        if not session:
            return False
        state = session["state"]
        normalized = " ".join(answer.lower().strip().split())
        if normalized != state.get("answer"):
            return False
        reward = int(await self.db.get_setting("games.decrypt.reward", 75))
        await self.db.execute("UPDATE game_sessions SET status='ended',ended_at=? WHERE id=?", (utcnow(), session["id"]))
        await self.db.adjust_points(viewer["user_id"], reward, "décryptage")
        await self.orchestrator.say(f"{viewer['display_name']} décrypte le mot : +{reward} Écumes.")
        await self.orchestrator.overlay.emit({"type": "decrypt_winner", "viewer": viewer["display_name"], "answer": state.get("answer")})
        return True

    async def start_bomb(self, target: dict[str, Any], actor: str) -> dict[str, Any]:
        await self.end_game("bomb")
        seconds = secrets.choice([25, 30, 35, 40])
        state = {"holder_id": target["user_id"], "holder_name": target["display_name"], "started_by": actor}
        row_id = await self.db.execute(
            "INSERT INTO game_sessions(game_type,title,status,state,created_by,created_at,ends_at) VALUES('bomb','Bombe','active',?,?,?,?)",
            (json.dumps(state, ensure_ascii=False), actor, utcnow(), (_now()+timedelta(seconds=seconds)).isoformat()),
        )
        return await self.db.fetchone("SELECT * FROM game_sessions WHERE id=?", (row_id,)) or {}

    async def buy_ticket(self, viewer: dict[str, Any]) -> str:
        draw_key = _now().strftime("%Y-%m-%d")
        cost = int(await self.db.get_setting("games.ticket.cost", 25))
        if int(viewer.get("points", 0)) < cost:
            return f"Il faut {cost} Écumes pour un ticket."
        owned = await self.db.fetchone("SELECT COUNT(*) AS n FROM viewer_tickets WHERE draw_key=? AND user_id=?", (draw_key, viewer["user_id"]))
        if owned and int(owned["n"]) >= 5:
            return "Limite de 5 tickets par tirage atteinte."
        number = secrets.randbelow(9000) + 1000
        await self.db.adjust_points(viewer["user_id"], -cost, "ticket loterie")
        await self.db.execute(
            "INSERT INTO viewer_tickets(draw_key,user_id,display_name,ticket_number,cost,created_at) VALUES(?,?,?,?,?,?)",
            (draw_key, viewer["user_id"], viewer["display_name"], number, cost, utcnow()),
        )
        return f"Ticket #{number} acheté pour {cost} Écumes."

    async def draw_tickets(self) -> dict[str, Any] | None:
        draw_key = _now().strftime("%Y-%m-%d")
        async with self.game_lock:
            existing = await self.db.fetchone(
                "SELECT * FROM viewer_tickets WHERE draw_key=? AND winner=1 LIMIT 1",
                (draw_key,),
            )
            if existing:
                return None
            rows = await self.db.fetchall("SELECT * FROM viewer_tickets WHERE draw_key=?", (draw_key,))
            if not rows:
                return None
            winner = secrets.choice(rows)
            reward = int(await self.db.get_setting("games.ticket.reward", 500))
            await self.db.execute(
                "UPDATE viewer_tickets SET winner=CASE WHEN id=? THEN 1 ELSE 0 END WHERE draw_key=?",
                (winner["id"], draw_key),
            )
            await self.db.adjust_points(winner["user_id"], reward, "loterie tickets")
        return {**winner, "reward": reward}

    async def start_bingo(self, actor: str) -> dict[str, Any]:
        await self.end_game("bingo")
        row_id = await self.db.execute(
            "INSERT INTO game_sessions(game_type,title,status,state,created_by,created_at) VALUES('bingo','Bingo du Spot','active',?,?,?)",
            (json.dumps({"drawn": []}), actor, utcnow()),
        )
        return await self.db.fetchone("SELECT * FROM game_sessions WHERE id=?", (row_id,)) or {}

    async def bingo_join(self, viewer: dict[str, Any]) -> str:
        session = await self.active_game("bingo")
        if not session:
            return "Aucun bingo actif."
        existing = await self.db.fetchone("SELECT * FROM game_entries WHERE session_id=? AND user_id=?", (session["id"], viewer["user_id"]))
        if existing:
            data = _json(existing.get("data"), {})
            return f"Carte de {viewer['display_name']} : " + " · ".join(map(str, data.get("card", [])))
        card = sorted(secrets.SystemRandom().sample(range(1, 31), 5))
        await self.db.execute(
            "INSERT INTO game_entries(session_id,user_id,display_name,data,created_at) VALUES(?,?,?,?,?)",
            (session["id"], viewer["user_id"], viewer["display_name"], json.dumps({"card": card}), utcnow()),
        )
        return f"Carte de {viewer['display_name']} : " + " · ".join(map(str, card))

    async def bingo_draw(self) -> int | None:
        session = await self.active_game("bingo")
        if not session:
            return None
        state = session["state"]
        drawn = list(state.get("drawn", []))
        remaining = [number for number in range(1, 31) if number not in drawn]
        if not remaining:
            return None
        number = secrets.choice(remaining)
        drawn.append(number)
        state["drawn"] = drawn
        await self.db.execute("UPDATE game_sessions SET state=? WHERE id=?", (json.dumps(state), session["id"]))
        if self.orchestrator:
            await self.orchestrator.overlay.emit({"type": "bingo_draw", "number": number, "drawn": drawn})
        return number

    async def bingo_claim(self, viewer: dict[str, Any]) -> str:
        async with self.game_lock:
            session = await self.active_game("bingo")
            if not session:
                return "Aucun bingo actif."
            entry = await self.db.fetchone(
                "SELECT * FROM game_entries WHERE session_id=? AND user_id=?",
                (session["id"], viewer["user_id"]),
            )
            if not entry:
                return "Tu n'as pas de carte. Tape !bingo."
            card = _json(entry.get("data"), {}).get("card", [])
            drawn = session["state"].get("drawn", [])
            if not card or not all(number in drawn for number in card):
                return "Pas encore de bingo valide."
            reward = int(await self.db.get_setting("games.bingo.reward", 250))
            await self.end_game("bingo")
            await self.db.adjust_points(viewer["user_id"], reward, "bingo")
        await self.orchestrator.overlay.emit({"type": "bingo_winner", "viewer": viewer["display_name"], "card": card})
        return f"BINGO ! {viewer['display_name']} gagne {reward} Écumes."

    # ------------------------------------------------------------------
    # TopWords
    # ------------------------------------------------------------------
    async def start_topwords(self, title: str, options: list[str], actor: str, minutes: int = 5) -> dict[str, Any]:
        await self.db.execute("UPDATE topwords_sessions SET status='ended',ended_at=? WHERE status='active'", (utcnow(),))
        normalized = list(dict.fromkeys(option.strip().lower() for option in options if option.strip()))[:8]
        row_id = await self.db.execute(
            "INSERT INTO topwords_sessions(title,options,status,created_by,created_at,ends_at) VALUES(?,?,'active',?,?,?)",
            (title, json.dumps(normalized, ensure_ascii=False), actor, utcnow(), (_now()+timedelta(minutes=minutes)).isoformat()),
        )
        return await self.db.fetchone("SELECT * FROM topwords_sessions WHERE id=?", (row_id,)) or {}

    async def topwords_state(self) -> dict[str, Any] | None:
        row = await self.db.fetchone("SELECT * FROM topwords_sessions WHERE status='active' ORDER BY id DESC LIMIT 1")
        if not row:
            return None
        options = _json(row.get("options"), [])
        votes = await self.db.fetchall("SELECT option_value,COUNT(*) AS votes FROM topwords_votes WHERE session_id=? GROUP BY option_value", (row["id"],))
        counts = {item["option_value"]: int(item["votes"]) for item in votes}
        return {**row, "options": options, "results": [{"option": option, "votes": counts.get(option, 0)} for option in options]}

    async def cast_topword_vote(self, viewer: dict[str, Any], choice: str) -> str:
        state = await self.topwords_state()
        if not state:
            return "Aucun TopWords actif."
        normalized = choice.lower().strip()
        match = next((option for option in state["options"] if normalized == option or normalized.startswith(option)), None)
        if not match:
            return "Choix invalide : " + " / ".join(state["options"])
        await self.db.execute(
            """
            INSERT INTO topwords_votes(session_id,user_id,display_name,option_value,created_at)
            VALUES(?,?,?,?,?)
            ON CONFLICT(session_id,user_id) DO UPDATE SET option_value=excluded.option_value,display_name=excluded.display_name,created_at=excluded.created_at
            """,
            (state["id"], viewer["user_id"], viewer["display_name"], match, utcnow()),
        )
        updated = await self.topwords_state()
        if self.orchestrator and updated:
            await self.orchestrator.overlay.emit({"type": "topwords_update", **updated})
        return f"Vote enregistré pour « {match} »."

    async def _observe_topwords(self, viewer: dict[str, Any], text: str) -> bool:
        state = await self.topwords_state()
        if not state:
            return False
        normalized = text.lower().strip()
        if normalized in state["options"]:
            await self.cast_topword_vote(viewer, normalized)
            return True
        return False

    async def close_topwords(self) -> str:
        state = await self.topwords_state()
        if not state:
            return "Aucun TopWords actif."
        await self.db.execute("UPDATE topwords_sessions SET status='ended',ended_at=? WHERE id=?", (utcnow(), state["id"]))
        winner = max(state["results"], key=lambda item: item["votes"], default=None)
        if self.orchestrator:
            await self.orchestrator.overlay.emit({"type": "topwords_end", **state, "winner": winner})
        return f"TopWords terminé : {winner['option']} gagne avec {winner['votes']} vote(s)." if winner else "TopWords terminé sans vote."

    # ------------------------------------------------------------------
    # Audience, events, clips and sessions
    # ------------------------------------------------------------------
    async def on_twitch_event(self, event_type: str, event: dict[str, Any]) -> None:
        if event_type == "channel.follow":
            await self.upsert_audience("follower", event.get("user_id", ""), event.get("user_login", ""), event.get("user_name", ""), event)
        elif event_type in {"channel.subscribe", "channel.subscription.message"}:
            await self.upsert_audience("subscriber", event.get("user_id", ""), event.get("user_login", ""), event.get("user_name", ""), event)
        elif event_type == "stream.online":
            await self.start_stream_session()
        elif event_type == "stream.offline":
            await self.end_stream_session()
        self._spawn(self._auto_clip(event_type, event), f"auto-clip-{event_type}")
        self._spawn(self.notify_connectors(event_type, event), f"connectors-{event_type}")

    async def upsert_audience(self, kind: str, user_id: str, login: str, display_name: str, metadata: dict[str, Any]) -> None:
        if not user_id:
            return
        await self.db.execute(
            """
            INSERT INTO audience_members(kind,user_id,login,display_name,active,first_seen,last_seen,metadata)
            VALUES(?,?,?,?,1,?,?,?)
            ON CONFLICT(kind,user_id) DO UPDATE SET login=excluded.login,display_name=excluded.display_name,
            active=1,last_seen=excluded.last_seen,ended_at=NULL,metadata=excluded.metadata
            """,
            (kind, user_id, login, display_name, utcnow(), utcnow(), json.dumps(metadata, ensure_ascii=False)),
        )

    async def sync_audience(self) -> dict[str, Any]:
        if not self.orchestrator:
            return {"followers": 0, "subscribers": 0}
        result = {"followers": 0, "subscribers": 0, "unfollowers": 0, "unsubscribers": 0}
        try:
            followers = await self.orchestrator.twitch.get_all_followers()
            result["followers"] = len(followers)
            result["unfollowers"] = await self._apply_snapshot("follower", followers)
        except Exception as exc:
            logger.info("Synchronisation followers indisponible: %s", exc)
        try:
            subscribers = await self.orchestrator.twitch.get_all_subscribers()
            result["subscribers"] = len(subscribers)
            result["unsubscribers"] = await self._apply_snapshot("subscriber", subscribers)
        except Exception as exc:
            logger.info("Synchronisation abonnés indisponible: %s", exc)
        return result

    async def _apply_snapshot(self, kind: str, rows: list[dict[str, Any]]) -> int:
        active_before = await self.db.fetchall("SELECT user_id FROM audience_members WHERE kind=? AND active=1", (kind,))
        old_ids = {row["user_id"] for row in active_before}
        new_ids: set[str] = set()
        for row in rows:
            user_id = str(row.get("user_id") or row.get("id") or "")
            if not user_id:
                continue
            new_ids.add(user_id)
            await self.upsert_audience(kind, user_id, str(row.get("user_login") or row.get("login") or ""), str(row.get("user_name") or row.get("display_name") or ""), row)
        gone = old_ids - new_ids
        for user_id in gone:
            await self.db.execute("UPDATE audience_members SET active=0,ended_at=?,last_seen=? WHERE kind=? AND user_id=?", (utcnow(), utcnow(), kind, user_id))
        return len(gone)

    async def start_stream_session(self) -> dict[str, Any]:
        current = await self.db.fetchone("SELECT * FROM stream_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1")
        if current:
            return current
        row_id = await self.db.execute("INSERT INTO stream_sessions(started_at,stats) VALUES(?,?)", (utcnow(), "{}"))
        return await self.db.fetchone("SELECT * FROM stream_sessions WHERE id=?", (row_id,)) or {}

    async def end_stream_session(self) -> None:
        session = await self.db.fetchone("SELECT * FROM stream_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1")
        if not session:
            return
        stats = await self.session_stats(session["started_at"])
        summary = ""
        if bool(await self.db.get_setting("credits.auto_recap", True)):
            summary = await self.generate_recap(stats)
        await self.db.execute("UPDATE stream_sessions SET ended_at=?,summary=?,stats=? WHERE id=?", (utcnow(), summary, json.dumps(stats, ensure_ascii=False), session["id"]))

    async def session_stats(self, started_at: str | None = None) -> dict[str, Any]:
        since = started_at or (_now()-timedelta(hours=12)).isoformat()
        event_rows = await self.db.fetchall("SELECT event_type,COUNT(*) AS n FROM event_log WHERE created_at>=? GROUP BY event_type", (since,))
        counts = {row["event_type"]: int(row["n"]) for row in event_rows}
        chat = counts.get("channel.chat.message", 0)
        followers = counts.get("channel.follow", 0)
        subs = counts.get("channel.subscribe", 0) + counts.get("channel.subscription.gift", 0)
        raids = counts.get("channel.raid", 0)
        bits_rows = await self.db.fetchall("SELECT payload FROM event_log WHERE event_type='channel.cheer' AND created_at>=?", (since,))
        bits = sum(int(_json(row["payload"], {}).get("bits", 0)) for row in bits_rows)
        return {"chat_messages": chat, "followers": followers, "subs": subs, "raids": raids, "bits": bits, "events": counts}

    async def credits_payload(self) -> dict[str, Any]:
        session = await self.db.fetchone("SELECT * FROM stream_sessions ORDER BY id DESC LIMIT 1")
        started_at = session.get("started_at") if session else None
        stats = await self.session_stats(started_at)
        top = await self.db.top_viewers(8)
        latest = await self.db.fetchall("SELECT event_type,payload,created_at FROM event_log WHERE created_at>=? ORDER BY id DESC LIMIT 50", (started_at or (_now()-timedelta(hours=12)).isoformat(),))
        supporters: list[str] = []
        raids: list[str] = []
        for row in latest:
            payload = _json(row["payload"], {})
            if row["event_type"] in {"channel.subscribe", "channel.subscription.gift", "channel.cheer"}:
                name = payload.get("user_name") or payload.get("user_login")
                if name and name not in supporters:
                    supporters.append(name)
            if row["event_type"] == "channel.raid":
                name = payload.get("from_broadcaster_user_name")
                if name and name not in raids:
                    raids.append(name)
        summary = session.get("summary", "") if session else ""
        return {"stats": stats, "top_viewers": top, "supporters": supporters[:12], "raids": raids[:8], "summary": summary}

    async def _auto_clip(self, event_type: str, event: dict[str, Any]) -> None:
        if not self.orchestrator:
            return
        rule = await self.db.fetchone("SELECT * FROM clip_rules WHERE event_type=? AND enabled=1", (event_type,))
        if not rule:
            return
        threshold = int(rule.get("threshold", 0))
        value = 0
        if event_type == "channel.cheer":
            value = int(event.get("bits", 0))
        elif event_type == "channel.raid":
            value = int(event.get("viewers", 0))
        if value < threshold:
            return
        delay = int(rule.get("delay_seconds", 0))
        if delay:
            await asyncio.sleep(min(delay, 30))
        try:
            await self.orchestrator.twitch.create_clip()
            await self.db.execute("INSERT INTO security_events(event_type,severity,actor,details,created_at) VALUES('auto_clip','info','Aura',?,?)", (json.dumps({"event_type": event_type, "value": value}), utcnow()))
        except Exception as exc:
            logger.warning("Clip automatique impossible: %s", exc)

    # ------------------------------------------------------------------
    # AI utilities
    # ------------------------------------------------------------------
    async def generate_title(self, context: str) -> str:
        if not self.orchestrator:
            return context
        prompt = (
            "Propose un seul titre Twitch français, dynamique mais pas racoleur, maximum 90 caractères. "
            f"Contexte : {context}. Réponds uniquement avec le titre."
        )
        return await self.orchestrator.ai.generate(prompt, "Tu aides Sansa à préparer son live.", 80)

    async def enhance_text(self, text: str) -> str:
        if not self.orchestrator:
            return text
        prompt = f"Améliore cette annonce Twitch en français, courte, précise et naturelle : {text}"
        return await self.orchestrator.ai.generate(prompt, "Tu écris pour la chaîne SANSAHD et l'identité Aura/Mairaiy.", 100)

    async def generate_recap(self, stats: dict[str, Any] | None = None) -> str:
        stats = stats or await self.session_stats()
        if not self.orchestrator or not self.orchestrator.ai.enabled:
            return (
                f"Live terminé : {stats['chat_messages']} messages, {stats['followers']} follows, "
                f"{stats['subs']} abonnements, {stats['raids']} raids et {stats['bits']} bits."
            )
        prompt = (
            "Résume le live en français en deux phrases chaleureuses mais sobres, sans inventer. "
            f"Statistiques : {json.dumps(stats, ensure_ascii=False)}"
        )
        return await self.orchestrator.ai.generate(prompt, "Tu rédiges le récapitulatif final du live SANSAHD.", 140)

    # ------------------------------------------------------------------
    # Pings and external connectors
    # ------------------------------------------------------------------
    async def create_ping(self, title: str, message: str, priority: str, actor: str) -> dict[str, Any]:
        row_id = await self.db.execute(
            "INSERT INTO streamer_pings(title,message,priority,created_by,created_at) VALUES(?,?,?,?,?)",
            (title, message, priority, actor, utcnow()),
        )
        row = await self.db.fetchone("SELECT * FROM streamer_pings WHERE id=?", (row_id,)) or {}
        if self.orchestrator:
            await self.orchestrator.overlay.emit({"type": "streamer_ping", **row})
        return row

    async def list_connectors(self) -> list[dict[str, Any]]:
        rows = await self.db.fetchall("SELECT * FROM external_connectors ORDER BY name")
        for row in rows:
            row["config"] = _json(row.get("config"), {})
            row["enabled"] = bool(row.get("enabled"))
        return rows

    async def save_connector(self, payload: dict[str, Any], connector_id: int | None = None) -> dict[str, Any]:
        encoded = json.dumps(payload.get("config", {}), ensure_ascii=False)
        if connector_id:
            await self.db.execute("UPDATE external_connectors SET name=?,kind=?,config=?,enabled=?,updated_at=? WHERE id=?", (payload["name"], payload["kind"], encoded, int(payload.get("enabled", False)), utcnow(), connector_id))
        else:
            connector_id = await self.db.execute("INSERT INTO external_connectors(name,kind,config,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?)", (payload["name"], payload["kind"], encoded, int(payload.get("enabled", False)), utcnow(), utcnow()))
        return await self.db.fetchone("SELECT * FROM external_connectors WHERE id=?", (connector_id,)) or {}

    async def test_connector(self, connector_id: int) -> dict[str, Any]:
        row = await self.db.fetchone("SELECT * FROM external_connectors WHERE id=?", (connector_id,))
        if not row:
            raise ValueError("Connecteur introuvable")
        kind = str(row.get("kind", ""))
        config = _json(row.get("config"), {})
        try:
            detail = await self._test_connector_kind(kind, config)
            status = f"OK — {detail}"[:300]
            ok = True
        except Exception as exc:
            status = f"Erreur — {exc}"[:300]
            ok = False
        await self.db.execute(
            "UPDATE external_connectors SET last_status=?,last_checked_at=?,updated_at=? WHERE id=?",
            (status, utcnow(), utcnow(), connector_id),
        )
        return {"ok": ok, "status": status, "kind": kind}

    async def _test_connector_kind(self, kind: str, config: dict[str, Any]) -> str:
        timeout = aiohttp.ClientTimeout(total=12)
        if kind in {"generic_webhook", "home_assistant", "n8n", "make"}:
            url = str(config.get("url", "")).strip()
            if not url:
                raise ValueError("URL manquante")
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json={"source": "AuraLive", "type": "connector_test"}) as response:
                    if response.status >= 400:
                        raise RuntimeError(f"HTTP {response.status}")
            return "webhook joignable"
        if kind == "discord_webhook":
            url = str(config.get("url", "")).strip()
            if not url:
                raise ValueError("URL de webhook manquante")
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json={"content": "Test Aura Live : connexion opérationnelle.", "username": "Mairaiy"}) as response:
                    if response.status >= 400:
                        raise RuntimeError(f"HTTP {response.status}")
            return "Discord joignable"
        if kind == "bluesky":
            handle = str(config.get("handle", "")).strip()
            if not handle:
                raise ValueError("handle manquant")
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile", params={"actor": handle}) as response:
                    if response.status >= 400:
                        raise RuntimeError(f"HTTP {response.status}")
            return f"profil {handle} accessible"
        if kind == "lastfm":
            user = str(config.get("user", "")).strip()
            key = str(config.get("api_key", "")).strip()
            if not user or not key:
                raise ValueError("user et api_key requis")
            params = {"method": "user.getinfo", "user": user, "api_key": key, "format": "json"}
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get("https://ws.audioscrobbler.com/2.0/", params=params) as response:
                    if response.status >= 400:
                        raise RuntimeError(f"HTTP {response.status}")
            return f"LastFM {user} accessible"
        if kind == "youtube":
            key = str(config.get("api_key", "")).strip()
            channel_id = str(config.get("channel_id", "")).strip()
            if not key or not channel_id:
                raise ValueError("api_key et channel_id requis")
            params = {"part": "snippet", "id": channel_id, "key": key}
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get("https://www.googleapis.com/youtube/v3/channels", params=params) as response:
                    if response.status >= 400:
                        raise RuntimeError(f"HTTP {response.status}")
                    data = await response.json()
                    if not data.get("items"):
                        raise RuntimeError("chaîne introuvable")
            return "chaîne YouTube accessible"
        if kind == "steam":
            key = str(config.get("api_key", "")).strip()
            steam_id = str(config.get("steam_id", "")).strip()
            if not key or not steam_id:
                raise ValueError("api_key et steam_id requis")
            params = {"key": key, "steamids": steam_id}
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/", params=params) as response:
                    if response.status >= 400:
                        raise RuntimeError(f"HTTP {response.status}")
            return "profil Steam accessible"
        if kind == "x":
            token = str(config.get("bearer_token", "")).strip()
            username = str(config.get("username", "")).strip().lstrip("@")
            if not token or not username:
                raise ValueError("bearer_token et username requis")
            headers = {"Authorization": f"Bearer {token}"}
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(f"https://api.x.com/2/users/by/username/{username}", headers=headers) as response:
                    if response.status >= 400:
                        raise RuntimeError(f"HTTP {response.status}")
            return f"compte @{username} accessible"
        if kind in {"telnet", "rcon"}:
            host = str(config.get("host", "")).strip()
            port = int(config.get("port", 0))
            if not host or not port:
                raise ValueError("host et port requis")
            reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=8)
            writer.close()
            await writer.wait_closed()
            return f"{host}:{port} joignable"
        if kind in {"streamdeck", "loupedeck"}:
            return "API locale prête sur /api/complete/deck/action"
        if kind == "igdb":
            if not config.get("client_id") or not config.get("access_token"):
                raise ValueError("client_id et access_token requis")
            return "identifiants IGDB présents"
        raise ValueError("type de connecteur non pris en charge")

    async def notify_connectors(self, event_type: str, event: dict[str, Any]) -> None:
        rows = await self.list_connectors()
        for row in rows:
            if not row.get("enabled"):
                continue
            config = row.get("config") or {}
            events = config.get("events", ["*"])
            if isinstance(events, str):
                events = [events]
            if "*" not in events and event_type not in events:
                continue
            kind = str(row.get("kind", ""))
            if kind not in {"generic_webhook", "discord_webhook", "home_assistant", "n8n", "make"}:
                continue
            try:
                await self._send_connector_event(int(row["id"]), kind, config, event_type, event)
            except Exception as exc:
                logger.warning("Connecteur %s indisponible: %s", row.get("name"), exc)
                await self.db.execute(
                    "UPDATE external_connectors SET last_status=?,last_checked_at=? WHERE id=?",
                    (f"Erreur — {exc}"[:300], utcnow(), row["id"]),
                )

    async def _send_connector_event(self, connector_id: int, kind: str, config: dict[str, Any], event_type: str, event: dict[str, Any]) -> None:
        url = str(config.get("url", "")).strip()
        if not url:
            raise ValueError("URL manquante")
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            if kind == "discord_webhook":
                name = event.get("user_name") or event.get("from_broadcaster_user_name") or "Twitch"
                payload = {"content": f"{event_type} — {name}", "username": "Mairaiy"}
            else:
                payload = {"source": "AuraLive", "event_type": event_type, "event": event}
            async with session.post(url, json=payload) as response:
                if response.status >= 400:
                    raise RuntimeError(f"HTTP {response.status}")
        await self.db.execute(
            "UPDATE external_connectors SET last_status='OK — dernier événement transmis',last_checked_at=? WHERE id=?",
            (utcnow(), connector_id),
        )

    # ------------------------------------------------------------------
    # Dashboard data
    # ------------------------------------------------------------------
    async def feature_matrix(self) -> list[dict[str, Any]]:
        # Explicit statuses prevent the panel from pretending an external service is ready.
        return [
            {"group": "Chat", "name": "Chat IA Mairaiy", "status": "ready", "detail": "Historique par interlocuteur, réponse finale uniquement et contexte isolé des bots tiers."},
            {"group": "Chat", "name": "Commandes avancées", "status": "ready", "detail": "Alias, regex, permissions, coûts et actions multiples."},
            {"group": "Sécurité", "name": "Anti-spam, liens, restrictions", "status": "ready", "detail": "Permis temporaires et restrictions par viewer."},
            {"group": "Communauté", "name": "Écumes, niveaux, boutique", "status": "ready", "detail": "Économie persistante et classement."},
            {"group": "Jeux", "name": "Mini-jeux complets", "status": "ready", "detail": "Run, drop, décryptage, bombe, bingo, tickets, love/hate."},
            {"group": "Jeux", "name": "Paris, roulette, inventaire", "status": "ready", "detail": "Paris locaux, loot, craft et enchères."},
            {"group": "Overlays", "name": "Alertes, chat, objectifs, emotes", "status": "ready", "detail": "Sources OBS séparées et personnalisables."},
            {"group": "Overlays", "name": "Avatar vocal Mairaiy", "status": "ready", "detail": "Deux poses, voix navigateur, sous-titres et animation synchronisée avec les réponses d'Aura."},
            {"group": "Overlays", "name": "TopWords, giveaway, générique", "status": "ready", "detail": "Widgets dédiés avec mise à jour temps réel."},
            {"group": "Twitch", "name": "Sondages, prédictions, récompenses", "status": "configured", "detail": "Nécessite chaîne éligible et scopes Twitch."},
            {"group": "Musique", "name": "Song Request", "status": "configured", "detail": "YouTube fonctionne; métadonnées complètes avec YOUTUBE_API_KEY."},
            {"group": "Intégrations", "name": "Discord / webhooks", "status": "configured", "detail": "Nécessite URL de webhook ou identifiants externes."},
            {"group": "Intégrations", "name": "X, Bluesky, LastFM, Steam", "status": "external", "detail": "Connecteurs prêts, identifiants obligatoires."},
            {"group": "Disponibilité", "name": "Fonctionnement 24/7", "status": "external", "detail": "Nécessite un serveur ou un hébergement Docker."},
        ]

    # ------------------------------------------------------------------
    # Background workers
    # ------------------------------------------------------------------
    async def _worker_loop(self) -> None:
        while True:
            await asyncio.sleep(2)
            await self._expire_games()
            await self._expire_permissions()

    async def _audience_loop(self) -> None:
        await asyncio.sleep(20)
        while True:
            if bool(await self.db.get_setting("audience.sync.enabled", True)):
                await self.sync_audience()
            minutes = max(5, int(await self.db.get_setting("audience.sync.interval_minutes", 15)))
            await asyncio.sleep(minutes * 60)

    async def _expire_games(self) -> None:
        rows = await self.db.fetchall("SELECT * FROM game_sessions WHERE status='active' AND ends_at IS NOT NULL")
        now = _now()
        for row in rows:
            expires = _parse_dt(row.get("ends_at"))
            if not expires or expires > now:
                continue
            state = _json(row.get("state"), {})
            if row["game_type"] == "bomb":
                penalty = int(await self.db.get_setting("games.bomb.penalty", 50))
                holder_id = state.get("holder_id")
                holder_name = state.get("holder_name", "quelqu'un")
                if holder_id:
                    viewer = await self.db.get_viewer(user_id=holder_id)
                    loss = min(penalty, int(viewer.get("points", 0))) if viewer else 0
                    if loss:
                        await self.db.adjust_points(holder_id, -loss, "explosion bombe")
                    if self.orchestrator:
                        await self.orchestrator.say(f"💥 La bombe explose chez {holder_name} : -{loss} Écumes.")
                        await self.orchestrator.overlay.emit({"type": "bomb_explode", "viewer": holder_name, "loss": loss})
            elif row["game_type"] == "drop" and self.orchestrator:
                await self.orchestrator.say("Le drop disparaît dans les profondeurs. Personne ne l'a pris.")
            await self.db.execute("UPDATE game_sessions SET status='ended',ended_at=? WHERE id=?", (utcnow(), row["id"]))

        topwords = await self.db.fetchall("SELECT * FROM topwords_sessions WHERE status='active' AND ends_at IS NOT NULL")
        for row in topwords:
            expires = _parse_dt(row.get("ends_at"))
            if expires and expires <= now:
                message = await self.close_topwords()
                if self.orchestrator:
                    await self.orchestrator.say(message)

    async def _expire_permissions(self) -> None:
        now = utcnow()
        await self.db.execute("DELETE FROM link_permits WHERE expires_at<=?", (now,))
        await self.db.execute("DELETE FROM user_restrictions WHERE expires_at IS NOT NULL AND expires_at<=?", (now,))

    def _cooldown(self, user_id: str, name: str, seconds: int) -> bool:
        loop = asyncio.get_running_loop()
        now = loop.time()
        key = (user_id, name)
        until = self.user_cooldowns.get(key, 0.0)
        if now < until:
            return True
        self.user_cooldowns[key] = now + seconds
        return False

    @staticmethod
    def _allowed(role: str, event: dict[str, Any]) -> bool:
        badges = {badge.get("set_id") for badge in event.get("badges", [])}
        if role == "everyone":
            return True
        if role == "subscriber":
            return bool(badges & {"subscriber", "founder", "moderator", "broadcaster"})
        if role in {"mod", "moderator"}:
            return bool(badges & {"moderator", "broadcaster"})
        return "broadcaster" in badges
