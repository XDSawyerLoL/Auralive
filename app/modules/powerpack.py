from __future__ import annotations

import asyncio
from collections import deque
import json
import logging
import random
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from time import monotonic
from typing import Any
from urllib.parse import parse_qs, urlparse

import aiohttp

from app.database import Database, utcnow

logger = logging.getLogger(__name__)


class SafeFormat(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


@dataclass(slots=True)
class CommandMatch:
    row: dict[str, Any]
    argument: str


class PowerPack:
    """Suite avancée Aura Live : automatisations, musique, économie, craft et intégrations."""

    def __init__(self, db: Database, settings: Any):
        self.db = db
        self.settings = settings
        self.orchestrator: Any | None = None
        self.http: aiohttp.ClientSession | None = None
        self.scheduler_task: asyncio.Task[None] | None = None
        self.command_user_cooldowns: dict[tuple[int, str], float] = {}
        self.command_global_cooldowns: dict[int, float] = {}
        self.follow_window: deque[tuple[float, str]] = deque(maxlen=250)

    async def initialize(self) -> None:
        await self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS advanced_commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                aliases TEXT NOT NULL DEFAULT '[]',
                trigger_type TEXT NOT NULL DEFAULT 'exact',
                trigger_value TEXT NOT NULL,
                responses TEXT NOT NULL DEFAULT '[]',
                actions TEXT NOT NULL DEFAULT '[]',
                cooldown_user INTEGER NOT NULL DEFAULT 10,
                cooldown_global INTEGER NOT NULL DEFAULT 2,
                min_role TEXT NOT NULL DEFAULT 'everyone',
                min_level INTEGER NOT NULL DEFAULT 1,
                min_points INTEGER NOT NULL DEFAULT 0,
                cost INTEGER NOT NULL DEFAULT 0,
                only_live INTEGER NOT NULL DEFAULT 0,
                game_contains TEXT NOT NULL DEFAULT '',
                enabled INTEGER NOT NULL DEFAULT 1,
                usage_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS song_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                url TEXT NOT NULL,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                duration_seconds INTEGER,
                status TEXT NOT NULL DEFAULT 'queued',
                cost INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                played_at TEXT
            );

            CREATE TABLE IF NOT EXISTS song_blacklist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                value TEXT UNIQUE NOT NULL,
                kind TEXT NOT NULL DEFAULT 'video',
                reason TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                min_stake INTEGER NOT NULL DEFAULT 10,
                max_stake INTEGER NOT NULL DEFAULT 10000,
                closes_at TEXT,
                resolved_option_id INTEGER,
                created_at TEXT NOT NULL,
                closed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS bet_options (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bet_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                position INTEGER NOT NULL,
                FOREIGN KEY(bet_id) REFERENCES bets(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS bet_entries (
                bet_id INTEGER NOT NULL,
                option_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                stake INTEGER NOT NULL,
                payout INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                PRIMARY KEY(bet_id,user_id),
                FOREIGN KEY(bet_id) REFERENCES bets(id) ON DELETE CASCADE,
                FOREIGN KEY(option_id) REFERENCES bet_options(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS inventory_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                rarity TEXT NOT NULL DEFAULT 'common',
                tradable INTEGER NOT NULL DEFAULT 1,
                max_stack INTEGER NOT NULL DEFAULT 99,
                icon TEXT NOT NULL DEFAULT '✦'
            );

            CREATE TABLE IF NOT EXISTS viewer_inventory (
                user_id TEXT NOT NULL,
                item_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(user_id,item_id),
                FOREIGN KEY(item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                output_item_id INTEGER NOT NULL,
                output_quantity INTEGER NOT NULL DEFAULT 1,
                ingredients TEXT NOT NULL DEFAULT '{}',
                cost_points INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY(output_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS auctions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seller_user_id TEXT NOT NULL,
                seller_name TEXT NOT NULL,
                item_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                start_price INTEGER NOT NULL,
                highest_bid INTEGER NOT NULL DEFAULT 0,
                highest_bidder_id TEXT,
                highest_bidder_name TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                ends_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS streamathons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                end_at TEXT NOT NULL,
                seconds_per_follow INTEGER NOT NULL DEFAULT 60,
                seconds_per_sub INTEGER NOT NULL DEFAULT 300,
                seconds_per_gift INTEGER NOT NULL DEFAULT 300,
                seconds_per_100_bits INTEGER NOT NULL DEFAULT 60,
                created_at TEXT NOT NULL,
                ended_at TEXT
            );

            CREATE TABLE IF NOT EXISTS streamathon_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                streamathon_id INTEGER NOT NULL,
                delta_seconds INTEGER NOT NULL,
                reason TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(streamathon_id) REFERENCES streamathons(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                interval_minutes INTEGER NOT NULL DEFAULT 60,
                action_type TEXT NOT NULL DEFAULT 'chat',
                action_payload TEXT NOT NULL DEFAULT '{}',
                only_live INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                last_run_at TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS integrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                kind TEXT NOT NULL,
                config TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS media_assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                stored_name TEXT UNIQUE NOT NULL,
                kind TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                public_path TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS command_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command_id INTEGER,
                command_name TEXT NOT NULL,
                user_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS security_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'info',
                actor TEXT NOT NULL DEFAULT '',
                details TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );
            """
        )
        await self._migrate_columns()
        await self._seed()

    async def _migrate_columns(self) -> None:
        migrations = {
            "tts_queue": {
                "voice": "TEXT NOT NULL DEFAULT ''",
                "rate": "REAL NOT NULL DEFAULT 1.0",
                "pitch": "REAL NOT NULL DEFAULT 1.0",
                "volume": "REAL NOT NULL DEFAULT 1.0",
                "moderation_note": "TEXT NOT NULL DEFAULT ''",
            },
            "alert_templates": {
                "media_path": "TEXT NOT NULL DEFAULT ''",
                "animation_in": "TEXT NOT NULL DEFAULT 'pop'",
                "animation_out": "TEXT NOT NULL DEFAULT 'fade'",
                "volume": "REAL NOT NULL DEFAULT 0.8",
                "layout": "TEXT NOT NULL DEFAULT 'card'",
                "variants": "TEXT NOT NULL DEFAULT '[]'",
            },
        }
        for table, columns in migrations.items():
            existing = await self.db.fetchall(f"PRAGMA table_info({table})")
            names = {row["name"] for row in existing}
            for name, definition in columns.items():
                if name not in names:
                    await self.db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")

    async def _seed(self) -> None:
        defaults = {
            "songs.enabled": True,
            "songs.cost": 25,
            "songs.max_queue_per_user": 2,
            "songs.max_duration_seconds": 600,
            "songs.allow_youtube": True,
            "games.roulette.enabled": True,
            "games.roulette.min_stake": 10,
            "games.roulette.max_stake": 500,
            "inventory.loot_cost": 100,
            "integrations.discord.events": ["stream.online", "channel.raid", "channel.subscribe"],
            "tts.require_approval": False,
            "tts.voice": "",
            "tts.rate": 1.0,
            "tts.pitch": 1.0,
            "tts.volume": 1.0,
            "scheduler.enabled": True,
            "security.follow_guard.enabled": True,
            "security.follow_guard.threshold": 8,
            "security.follow_guard.window_seconds": 15,
            "security.follow_guard.emergency": True,
            "security.auto_clip.on_hype_train": False,
        }
        for key, value in defaults.items():
            if await self.db.get_setting(key) is None:
                await self.db.set_setting(key, value)

        items = [
            ("coquillage", "Coquillage du Spot", "Une petite monnaie de collection.", "common", 1, 99, "🐚"),
            ("perle", "Perle irisée", "Rare et utile pour les crafts.", "rare", 1, 25, "🔮"),
            ("ticket", "Ticket de loterie", "Augmente tes chances lors de certains concours.", "uncommon", 1, 20, "🎟️"),
            ("totem", "Totem de Mairaiy", "Objet légendaire de la communauté.", "legendary", 0, 1, "🌀"),
        ]
        for row in items:
            await self.db.execute(
                "INSERT OR IGNORE INTO inventory_items(slug,name,description,rarity,tradable,max_stack,icon) VALUES(?,?,?,?,?,?,?)",
                row,
            )
        item_rows = await self.db.fetchall("SELECT id,slug FROM inventory_items")
        ids = {row["slug"]: row["id"] for row in item_rows}
        if {"coquillage", "perle", "ticket"} <= ids.keys():
            await self.db.execute(
                """
                INSERT OR IGNORE INTO recipes(name,output_item_id,output_quantity,ingredients,cost_points,enabled)
                VALUES(?,?,?,?,?,1)
                """,
                ("Ticket de marée", ids["ticket"], 1, json.dumps({str(ids["coquillage"]): 5, str(ids["perle"]): 1}), 50),
            )

        await self.db.execute(
            """
            INSERT INTO integrations(name,kind,config,enabled,updated_at)
            SELECT 'Discord principal','discord_webhook','{}',0,?
            WHERE NOT EXISTS (SELECT 1 FROM integrations WHERE name='Discord principal')
            """,
            (utcnow(),),
        )

    async def start(self, orchestrator: Any) -> None:
        self.orchestrator = orchestrator
        if not self.http:
            self.http = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20))
        if not self.scheduler_task or self.scheduler_task.done():
            self.scheduler_task = asyncio.create_task(self._scheduler_loop(), name="aura-power-scheduler")

    async def close(self) -> None:
        if self.scheduler_task:
            self.scheduler_task.cancel()
            try:
                await self.scheduler_task
            except asyncio.CancelledError:
                pass
        if self.http:
            await self.http.close()
            self.http = None

    # ------------------------------------------------------------------
    # Moteur de commandes avancé
    # ------------------------------------------------------------------
    async def list_commands(self) -> list[dict[str, Any]]:
        rows = await self.db.fetchall("SELECT * FROM advanced_commands ORDER BY enabled DESC,name")
        return [self._decode_command(row) for row in rows]

    def _decode_command(self, row: dict[str, Any]) -> dict[str, Any]:
        for key in ("aliases", "responses", "actions"):
            try:
                row[key] = json.loads(row.get(key) or "[]")
            except Exception:
                row[key] = []
        return row

    async def save_command(self, payload: dict[str, Any], command_id: int | None = None) -> dict[str, Any]:
        name = str(payload.get("name", "")).strip().lower()
        if not name:
            raise ValueError("Le nom de commande est obligatoire.")
        if not name.startswith("!") and payload.get("trigger_type", "exact") in {"exact", "starts"}:
            name = "!" + name
        aliases = [str(v).strip().lower() for v in payload.get("aliases", []) if str(v).strip()]
        responses = [str(v).strip() for v in payload.get("responses", []) if str(v).strip()]
        actions = payload.get("actions", []) if isinstance(payload.get("actions", []), list) else []
        trigger_value = str(payload.get("trigger_value") or name).strip()
        values = (
            name,
            json.dumps(aliases, ensure_ascii=False),
            str(payload.get("trigger_type", "exact")),
            trigger_value,
            json.dumps(responses, ensure_ascii=False),
            json.dumps(actions, ensure_ascii=False),
            max(0, int(payload.get("cooldown_user", 10))),
            max(0, int(payload.get("cooldown_global", 2))),
            str(payload.get("min_role", "everyone")),
            max(1, int(payload.get("min_level", 1))),
            max(0, int(payload.get("min_points", 0))),
            max(0, int(payload.get("cost", 0))),
            int(bool(payload.get("only_live", False))),
            str(payload.get("game_contains", "")).strip(),
            int(bool(payload.get("enabled", True))),
            utcnow(),
        )
        if command_id:
            await self.db.execute(
                """
                UPDATE advanced_commands SET name=?,aliases=?,trigger_type=?,trigger_value=?,responses=?,actions=?,
                cooldown_user=?,cooldown_global=?,min_role=?,min_level=?,min_points=?,cost=?,only_live=?,game_contains=?,
                enabled=?,updated_at=? WHERE id=?
                """,
                values + (command_id,),
            )
            row_id = command_id
        else:
            row_id = await self.db.execute(
                """
                INSERT INTO advanced_commands(name,aliases,trigger_type,trigger_value,responses,actions,cooldown_user,
                cooldown_global,min_role,min_level,min_points,cost,only_live,game_contains,enabled,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                values[:-1] + (utcnow(), values[-1]),
            )
        row = await self.db.fetchone("SELECT * FROM advanced_commands WHERE id=?", (row_id,))
        return self._decode_command(row or {})

    async def delete_command(self, command_id: int) -> None:
        await self.db.execute("DELETE FROM advanced_commands WHERE id=?", (command_id,))

    async def handle_command(self, viewer: dict[str, Any], text: str, event: dict[str, Any]) -> bool:
        commands = await self.list_commands()
        for row in commands:
            if not row.get("enabled"):
                continue
            match = self._match_command(row, text)
            if not match:
                continue
            if not self._allowed(row.get("min_role", "everyone"), event):
                return True
            if int(viewer.get("level", 1)) < int(row.get("min_level", 1)):
                await self.orchestrator.say(f"{viewer['display_name']}, niveau {row['min_level']} requis.")
                return True
            if int(viewer.get("points", 0)) < int(row.get("min_points", 0)):
                await self.orchestrator.say(f"{viewer['display_name']}, il te faut au moins {row['min_points']} Écumes.")
                return True
            if row.get("only_live") and not self.orchestrator.stream_online:
                await self.orchestrator.say("Cette commande est disponible uniquement pendant le live.")
                return True
            now = monotonic()
            user_key = (int(row["id"]), viewer["user_id"])
            if now < self.command_user_cooldowns.get(user_key, 0) or now < self.command_global_cooldowns.get(int(row["id"]), 0):
                return True
            self.command_user_cooldowns[user_key] = now + int(row.get("cooldown_user", 0))
            self.command_global_cooldowns[int(row["id"])] = now + int(row.get("cooldown_global", 0))
            cost = int(row.get("cost", 0))
            if int(viewer.get("points", 0)) < cost:
                await self.orchestrator.say(f"Cette commande coûte {cost} Écumes.")
                return True
            if cost:
                viewer["points"] = await self.db.adjust_points(viewer["user_id"], -cost, f"commande {row['name']}")
            variables = {
                "user": viewer["display_name"],
                "login": viewer["login"],
                "points": viewer.get("points", 0),
                "level": viewer.get("level", 1),
                "arg": match.argument,
                "command": row["name"],
            }
            responses = row.get("responses", [])
            if responses:
                await self.orchestrator.say(random.choice(responses).format_map(SafeFormat(variables)))
            for action in row.get("actions", []):
                await self._execute_action(action, variables, viewer, event)
            await self.db.execute("UPDATE advanced_commands SET usage_count=usage_count+1 WHERE id=?", (row["id"],))
            await self.db.execute(
                "INSERT INTO command_usage(command_id,command_name,user_id,display_name,created_at) VALUES(?,?,?,?,?)",
                (row["id"], row["name"], viewer["user_id"], viewer["display_name"], utcnow()),
            )
            return True
        return False

    def _match_command(self, row: dict[str, Any], text: str) -> CommandMatch | None:
        raw = text.strip()
        lowered = raw.lower()
        trigger = str(row.get("trigger_value") or row.get("name", "")).lower()
        aliases = [str(v).lower() for v in row.get("aliases", [])]
        candidates = [trigger, str(row.get("name", "")).lower(), *aliases]
        kind = row.get("trigger_type", "exact")
        for candidate in candidates:
            if not candidate:
                continue
            if kind == "exact" and (lowered == candidate or lowered.startswith(candidate + " ")):
                return CommandMatch(row, raw[len(candidate):].strip())
            if kind == "starts" and lowered.startswith(candidate):
                return CommandMatch(row, raw[len(candidate):].strip())
            if kind == "contains" and candidate in lowered:
                return CommandMatch(row, raw)
            if kind == "regex":
                try:
                    match = re.search(candidate, raw, re.I)
                except re.error:
                    continue
                if match:
                    argument = match.group(1) if match.groups() else raw
                    return CommandMatch(row, argument.strip())
        return None

    async def _execute_action(self, action: dict[str, Any], variables: dict[str, Any], viewer: dict[str, Any], event: dict[str, Any]) -> None:
        kind = str(action.get("type", "chat"))
        value = action.get("value", action.get("message", ""))
        if isinstance(value, str):
            value = value.format_map(SafeFormat(variables))
        if kind == "chat" and value:
            await self.orchestrator.say(str(value))
        elif kind == "overlay":
            payload = dict(action.get("payload", {}))
            payload.setdefault("type", "custom")
            payload.setdefault("viewer", viewer["display_name"])
            payload.setdefault("message", value or payload.get("message", ""))
            await self.orchestrator.overlay.emit(payload)
        elif kind == "tts" and value:
            await self.orchestrator.overlay.emit({"type": "tts", "viewer": viewer["display_name"], "text": str(value), "message": str(value)})
        elif kind == "points":
            amount = int(action.get("amount", 0))
            await self.db.adjust_points(viewer["user_id"], amount, f"action commande {variables['command']}")
        elif kind == "counter":
            await self.orchestrator.engagement.counter_change(str(action.get("slug", "fails")), int(action.get("delta", 1)))
        elif kind == "obs_scene":
            await self.orchestrator.obs.set_scene(str(value))
        elif kind == "sound":
            await self.orchestrator.overlay.emit({"type": "sound", "sound_path": str(value), "volume": float(action.get("volume", 0.8))})
        elif kind == "timeout" and self._allowed("mod", event):
            await self.orchestrator.twitch.timeout_user(viewer["user_id"], int(action.get("seconds", 30)), str(action.get("reason", "Commande automatisée")))
        elif kind == "item":
            await self.grant_item(viewer["user_id"], str(action.get("slug", "coquillage")), int(action.get("quantity", 1)))
        elif kind == "clip":
            url = await self.orchestrator.twitch.create_clip()
            if url and bool(action.get("announce", True)):
                await self.orchestrator.say(f"Clip créé : {url}")
        elif kind == "webhook":
            await self._send_generic_webhook(str(action.get("url", "")), {"event":"advanced_command","viewer":viewer["display_name"],"variables":variables,"payload":action.get("payload", {})})

    @staticmethod
    def _allowed(role: str, event: dict[str, Any]) -> bool:
        if role == "everyone":
            return True
        badges = {badge.get("set_id") for badge in event.get("badges", [])}
        if role == "subscriber":
            return bool(badges & {"subscriber", "founder", "moderator", "broadcaster"})
        if role in {"mod", "moderator"}:
            return bool(badges & {"moderator", "broadcaster"})
        return "broadcaster" in badges

    # ------------------------------------------------------------------
    # Song Request
    # ------------------------------------------------------------------
    @staticmethod
    def youtube_id(value: str) -> str | None:
        value = value.strip()
        if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
            return value
        try:
            parsed = urlparse(value)
        except Exception:
            return None
        host = parsed.netloc.lower().replace("www.", "")
        if host == "youtu.be":
            return parsed.path.strip("/").split("/")[0] or None
        if host.endswith("youtube.com"):
            if parsed.path == "/watch":
                return parse_qs(parsed.query).get("v", [None])[0]
            if parsed.path.startswith("/shorts/") or parsed.path.startswith("/embed/"):
                return parsed.path.split("/")[2]
        return None

    async def song_queue(self) -> list[dict[str, Any]]:
        return await self.db.fetchall("SELECT * FROM song_requests WHERE status IN ('playing','queued') ORDER BY CASE status WHEN 'playing' THEN 0 ELSE 1 END,id")

    async def add_song(self, viewer: dict[str, Any], value: str, title: str = "") -> str:
        if not bool(await self.db.get_setting("songs.enabled", True)):
            return "Le Song Request est fermé."
        video_id = self.youtube_id(value)
        if not video_id:
            return "Envoie un lien YouTube valide avec !sr lien."
        blocked = await self.db.fetchone("SELECT * FROM song_blacklist WHERE lower(value)=lower(?)", (video_id,))
        if blocked:
            return "Ce morceau est dans la liste noire."
        max_per_user = int(await self.db.get_setting("songs.max_queue_per_user", 2))
        count = await self.db.fetchone("SELECT COUNT(*) AS c FROM song_requests WHERE user_id=? AND status IN ('queued','playing')", (viewer["user_id"],))
        if count and int(count["c"]) >= max_per_user:
            return f"Limite atteinte : {max_per_user} morceau(x) dans la file."
        duplicate = await self.db.fetchone("SELECT 1 FROM song_requests WHERE video_id=? AND status IN ('queued','playing')", (video_id,))
        if duplicate:
            return "Ce morceau est déjà dans la file."
        cost = int(await self.db.get_setting("songs.cost", 25))
        if int(viewer.get("points", 0)) < cost:
            return f"Il faut {cost} Écumes pour demander un morceau."
        metadata = await self._youtube_metadata(video_id)
        max_duration = int(await self.db.get_setting("songs.max_duration_seconds", 600))
        duration = int(metadata.get("duration") or 0)
        if duration and duration > max_duration:
            minutes = max_duration // 60
            return f"Ce morceau dépasse la durée maximale de {minutes} minutes."
        final_title = title.strip() or metadata.get("title") or f"YouTube {video_id}"
        if cost:
            await self.db.adjust_points(viewer["user_id"], -cost, "song request")
        await self.db.execute(
            "INSERT INTO song_requests(user_id,display_name,url,video_id,title,duration_seconds,status,cost,created_at) VALUES(?,?,?,?,?,?,'queued',?,?)",
            (viewer["user_id"], viewer["display_name"], f"https://www.youtube.com/watch?v={video_id}", video_id, final_title[:180], metadata.get("duration"), cost, utcnow()),
        )
        return f"« {final_title} » rejoint la file musicale."

    async def _youtube_metadata(self, video_id: str) -> dict[str, Any]:
        if not self.http:
            return {}
        api_key = str(getattr(self.settings, "youtube_api_key", "") or "").strip()
        if api_key:
            try:
                async with self.http.get(
                    "https://www.googleapis.com/youtube/v3/videos",
                    params={"part": "snippet,contentDetails", "id": video_id, "key": api_key},
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        items = data.get("items", [])
                        if items:
                            item = items[0]
                            snippet = item.get("snippet", {})
                            duration = self._iso_duration_seconds(item.get("contentDetails", {}).get("duration", ""))
                            return {"title": snippet.get("title", ""), "author": snippet.get("channelTitle", ""), "duration": duration}
            except Exception:
                logger.debug("API YouTube indisponible", exc_info=True)
        try:
            async with self.http.get("https://www.youtube.com/oembed", params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"}) as response:
                if response.status == 200:
                    data = await response.json()
                    return {"title": data.get("title", ""), "author": data.get("author_name", "")}
        except Exception:
            logger.debug("Métadonnées YouTube indisponibles", exc_info=True)
        return {}

    @staticmethod
    def _iso_duration_seconds(value: str) -> int:
        match = re.fullmatch(r"P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value or "")
        if not match:
            return 0
        days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
        return days * 86400 + hours * 3600 + minutes * 60 + seconds

    async def next_song(self) -> dict[str, Any] | None:
        current = await self.db.fetchone("SELECT * FROM song_requests WHERE status='playing' ORDER BY id LIMIT 1")
        if current:
            await self.db.execute("UPDATE song_requests SET status='played',played_at=? WHERE id=?", (utcnow(), current["id"]))
        row = await self.db.fetchone("SELECT * FROM song_requests WHERE status='queued' ORDER BY id LIMIT 1")
        if not row:
            await self.orchestrator.overlay.emit({"type": "song_stop"})
            return None
        await self.db.execute("UPDATE song_requests SET status='playing',played_at=? WHERE id=?", (utcnow(), row["id"]))
        row["status"] = "playing"
        await self.orchestrator.overlay.emit({"type": "song_play", **row})
        return row

    async def remove_song(self, song_id: int, refund: bool = False) -> None:
        row = await self.db.fetchone("SELECT * FROM song_requests WHERE id=?", (song_id,))
        if not row:
            return
        await self.db.execute("UPDATE song_requests SET status='removed' WHERE id=?", (song_id,))
        if refund and int(row.get("cost", 0)):
            await self.db.adjust_points(row["user_id"], int(row["cost"]), "remboursement song request")

    async def clear_songs(self) -> None:
        await self.db.execute("UPDATE song_requests SET status='removed' WHERE status IN ('queued','playing')")
        await self.orchestrator.overlay.emit({"type": "song_stop"})

    async def blacklist_song(self, value: str, reason: str = "") -> None:
        video_id = self.youtube_id(value) or value.strip()
        await self.db.execute("INSERT OR REPLACE INTO song_blacklist(value,kind,reason,created_at) VALUES(?,'video',?,?)", (video_id, reason, utcnow()))

    # ------------------------------------------------------------------
    # Paris et roulette
    # ------------------------------------------------------------------
    async def active_bet(self) -> dict[str, Any] | None:
        bet = await self.db.fetchone("SELECT * FROM bets WHERE status='open' ORDER BY id DESC LIMIT 1")
        if not bet:
            return None
        bet["options"] = await self.db.fetchall(
            """SELECT o.*,COALESCE(SUM(e.stake),0) AS pool,COUNT(e.user_id) AS players FROM bet_options o LEFT JOIN bet_entries e ON e.option_id=o.id WHERE o.bet_id=? GROUP BY o.id ORDER BY o.position""",
            (bet["id"],),
        )
        return bet

    async def create_bet(self, title: str, options: list[str], min_stake: int = 10, max_stake: int = 10000, duration_minutes: int = 10) -> dict[str, Any]:
        await self.db.execute("UPDATE bets SET status='canceled',closed_at=? WHERE status='open'", (utcnow(),))
        closes = (datetime.now(timezone.utc) + timedelta(minutes=max(1, duration_minutes))).isoformat()
        bet_id = await self.db.execute(
            "INSERT INTO bets(title,status,min_stake,max_stake,closes_at,created_at) VALUES(?,'open',?,?,?,?)",
            (title.strip(), max(1, min_stake), max(min_stake, max_stake), closes, utcnow()),
        )
        for index, option in enumerate(options[:6], start=1):
            await self.db.execute("INSERT INTO bet_options(bet_id,label,position) VALUES(?,?,?)", (bet_id, option.strip(), index))
        return await self.active_bet() or {}

    async def place_bet(self, viewer: dict[str, Any], option_position: int, stake: int) -> str:
        bet = await self.active_bet()
        if not bet:
            return "Aucun pari n'est ouvert."
        if datetime.fromisoformat(bet["closes_at"]) <= datetime.now(timezone.utc):
            await self.db.execute("UPDATE bets SET status='closed',closed_at=? WHERE id=?", (utcnow(), bet["id"]))
            return "Les mises sont fermées."
        stake = int(stake)
        if stake < int(bet["min_stake"]) or stake > int(bet["max_stake"]):
            return f"Mise autorisée : {bet['min_stake']} à {bet['max_stake']} Écumes."
        option = next((row for row in bet["options"] if int(row["position"]) == option_position), None)
        if not option:
            return "Cette option n'existe pas."
        if int(viewer.get("points", 0)) < stake:
            return "Tu n'as pas assez d'Écumes."
        previous = await self.db.fetchone("SELECT * FROM bet_entries WHERE bet_id=? AND user_id=?", (bet["id"], viewer["user_id"]))
        if previous:
            await self.db.adjust_points(viewer["user_id"], int(previous["stake"]), "remplacement de pari")
        await self.db.adjust_points(viewer["user_id"], -stake, f"pari: {bet['title']}")
        await self.db.execute(
            """INSERT INTO bet_entries(bet_id,option_id,user_id,display_name,stake,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(bet_id,user_id) DO UPDATE SET option_id=excluded.option_id,stake=excluded.stake,created_at=excluded.created_at""",
            (bet["id"], option["id"], viewer["user_id"], viewer["display_name"], stake, utcnow()),
        )
        return f"{viewer['display_name']} mise {stake} Écumes sur « {option['label']} »."

    async def resolve_bet(self, option_id: int) -> dict[str, Any]:
        bet = await self.active_bet()
        if not bet:
            raise ValueError("Aucun pari ouvert.")
        option = next((row for row in bet["options"] if int(row["id"]) == int(option_id)), None)
        if not option:
            raise ValueError("Option invalide.")
        entries = await self.db.fetchall("SELECT * FROM bet_entries WHERE bet_id=?", (bet["id"],))
        total_pool = sum(int(row["stake"]) for row in entries)
        winners = [row for row in entries if int(row["option_id"]) == int(option_id)]
        winner_pool = sum(int(row["stake"]) for row in winners)
        payouts = []
        if winner_pool:
            for row in winners:
                payout = max(1, round(total_pool * int(row["stake"]) / winner_pool))
                await self.db.adjust_points(row["user_id"], payout, f"gain pari: {bet['title']}")
                await self.db.execute("UPDATE bet_entries SET payout=? WHERE bet_id=? AND user_id=?", (payout, bet["id"], row["user_id"]))
                payouts.append({"user": row["display_name"], "payout": payout})
        await self.db.execute("UPDATE bets SET status='resolved',resolved_option_id=?,closed_at=? WHERE id=?", (option_id, utcnow(), bet["id"]))
        return {"bet": bet, "option": option, "pool": total_pool, "payouts": payouts}

    async def roulette(self, viewer: dict[str, Any], stake: int) -> str:
        if not bool(await self.db.get_setting("games.roulette.enabled", True)):
            return "La roulette est fermée."
        minimum = int(await self.db.get_setting("games.roulette.min_stake", 10))
        maximum = int(await self.db.get_setting("games.roulette.max_stake", 500))
        stake = max(minimum, min(maximum, int(stake)))
        if int(viewer.get("points", 0)) < stake:
            return "Tu n'as pas assez d'Écumes."
        await self.db.adjust_points(viewer["user_id"], -stake, "roulette")
        roll = secrets.randbelow(1000)
        if roll < 8:
            multiplier = 10
        elif roll < 60:
            multiplier = 3
        elif roll < 240:
            multiplier = 2
        elif roll < 500:
            multiplier = 1
        else:
            multiplier = 0
        winnings = stake * multiplier
        if winnings:
            balance = await self.db.adjust_points(viewer["user_id"], winnings, "gain roulette")
            return f"Roulette : x{multiplier}. {viewer['display_name']} récupère {winnings} Écumes. Solde {balance}."
        return f"Roulette : la vague emporte {stake} Écumes."

    # ------------------------------------------------------------------
    # Inventaire, craft, loot et enchères
    # ------------------------------------------------------------------
    async def inventory(self, user_id: str) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            """SELECT i.*,COALESCE(v.quantity,0) AS quantity FROM inventory_items i JOIN viewer_inventory v ON v.item_id=i.id WHERE v.user_id=? AND v.quantity>0 ORDER BY CASE i.rarity WHEN 'legendary' THEN 1 WHEN 'epic' THEN 2 WHEN 'rare' THEN 3 WHEN 'uncommon' THEN 4 ELSE 5 END,i.name""",
            (user_id,),
        )

    async def grant_item(self, user_id: str, slug: str, quantity: int = 1) -> None:
        item = await self.db.fetchone("SELECT * FROM inventory_items WHERE slug=?", (slug,))
        if not item:
            raise ValueError("Objet inconnu.")
        await self.db.execute(
            """INSERT INTO viewer_inventory(user_id,item_id,quantity,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=MIN(?,viewer_inventory.quantity+excluded.quantity),updated_at=excluded.updated_at""",
            (user_id, item["id"], max(0, quantity), utcnow(), int(item["max_stack"])),
        )

    async def remove_item(self, user_id: str, item_id: int, quantity: int) -> bool:
        row = await self.db.fetchone("SELECT quantity FROM viewer_inventory WHERE user_id=? AND item_id=?", (user_id, item_id))
        if not row or int(row["quantity"]) < quantity:
            return False
        await self.db.execute("UPDATE viewer_inventory SET quantity=quantity-?,updated_at=? WHERE user_id=? AND item_id=?", (quantity, utcnow(), user_id, item_id))
        return True

    async def loot(self, viewer: dict[str, Any]) -> str:
        cost = int(await self.db.get_setting("inventory.loot_cost", 100))
        if int(viewer.get("points", 0)) < cost:
            return f"Une caisse coûte {cost} Écumes."
        await self.db.adjust_points(viewer["user_id"], -cost, "caisse de loot")
        roll = secrets.randbelow(1000)
        slug = "totem" if roll < 5 else "perle" if roll < 140 else "ticket" if roll < 300 else "coquillage"
        quantity = 1 if slug != "coquillage" else random.randint(1, 4)
        await self.grant_item(viewer["user_id"], slug, quantity)
        item = await self.db.fetchone("SELECT * FROM inventory_items WHERE slug=?", (slug,))
        return f"{viewer['display_name']} ouvre une caisse : {item['icon']} {item['name']} x{quantity}."

    async def recipes(self) -> list[dict[str, Any]]:
        rows = await self.db.fetchall("SELECT r.*,i.name AS output_name,i.icon AS output_icon FROM recipes r JOIN inventory_items i ON i.id=r.output_item_id WHERE r.enabled=1 ORDER BY r.id")
        for row in rows:
            row["ingredients"] = json.loads(row["ingredients"])
        return rows

    async def craft(self, viewer: dict[str, Any], recipe_id: int) -> str:
        recipe = await self.db.fetchone("SELECT * FROM recipes WHERE id=? AND enabled=1", (recipe_id,))
        if not recipe:
            return "Recette inconnue."
        ingredients = json.loads(recipe["ingredients"])
        for item_id, quantity in ingredients.items():
            row = await self.db.fetchone("SELECT quantity FROM viewer_inventory WHERE user_id=? AND item_id=?", (viewer["user_id"], int(item_id)))
            if not row or int(row["quantity"]) < int(quantity):
                return "Tu n'as pas tous les composants."
        cost = int(recipe["cost_points"])
        fresh = await self.db.get_viewer(user_id=viewer["user_id"])
        if not fresh or int(fresh["points"]) < cost:
            return f"Il faut aussi {cost} Écumes."
        for item_id, quantity in ingredients.items():
            await self.remove_item(viewer["user_id"], int(item_id), int(quantity))
        if cost:
            await self.db.adjust_points(viewer["user_id"], -cost, "craft")
        output = await self.db.fetchone("SELECT * FROM inventory_items WHERE id=?", (recipe["output_item_id"],))
        await self.grant_item(viewer["user_id"], output["slug"], int(recipe["output_quantity"]))
        return f"Craft réussi : {output['icon']} {output['name']} x{recipe['output_quantity']}."

    async def auctions(self) -> list[dict[str, Any]]:
        await self._close_expired_auctions()
        return await self.db.fetchall("SELECT a.*,i.name AS item_name,i.icon FROM auctions a JOIN inventory_items i ON i.id=a.item_id WHERE a.status='open' ORDER BY a.ends_at")

    async def create_auction(self, viewer: dict[str, Any], item_id: int, quantity: int, start_price: int, minutes: int = 10) -> dict[str, Any]:
        if not await self.remove_item(viewer["user_id"], item_id, quantity):
            raise ValueError("Quantité insuffisante.")
        ends = (datetime.now(timezone.utc) + timedelta(minutes=max(1, minutes))).isoformat()
        auction_id = await self.db.execute(
            "INSERT INTO auctions(seller_user_id,seller_name,item_id,quantity,start_price,ends_at,created_at) VALUES(?,?,?,?,?,?,?)",
            (viewer["user_id"], viewer["display_name"], item_id, max(1, quantity), max(1, start_price), ends, utcnow()),
        )
        return await self.db.fetchone("SELECT * FROM auctions WHERE id=?", (auction_id,)) or {}

    async def bid(self, viewer: dict[str, Any], auction_id: int, amount: int) -> str:
        await self._close_expired_auctions()
        auction = await self.db.fetchone("SELECT * FROM auctions WHERE id=? AND status='open'", (auction_id,))
        if not auction:
            return "Enchère terminée ou inconnue."
        minimum = max(int(auction["start_price"]), int(auction["highest_bid"]) + 1)
        if amount < minimum:
            return f"Mise minimale : {minimum} Écumes."
        fresh = await self.db.get_viewer(user_id=viewer["user_id"])
        if not fresh or int(fresh["points"]) < amount:
            return "Solde insuffisant."
        if auction.get("highest_bidder_id"):
            await self.db.adjust_points(auction["highest_bidder_id"], int(auction["highest_bid"]), "remboursement enchère surenchérie")
        await self.db.adjust_points(viewer["user_id"], -amount, "mise enchère")
        await self.db.execute("UPDATE auctions SET highest_bid=?,highest_bidder_id=?,highest_bidder_name=? WHERE id=?", (amount, viewer["user_id"], viewer["display_name"], auction_id))
        return f"{viewer['display_name']} prend la tête à {amount} Écumes."

    async def _close_expired_auctions(self) -> None:
        rows = await self.db.fetchall("SELECT * FROM auctions WHERE status='open' AND ends_at<=?", (utcnow(),))
        for row in rows:
            item = await self.db.fetchone("SELECT slug FROM inventory_items WHERE id=?", (row["item_id"],))
            if row.get("highest_bidder_id"):
                await self.grant_item(row["highest_bidder_id"], item["slug"], int(row["quantity"]))
                await self.db.adjust_points(row["seller_user_id"], int(row["highest_bid"]), "vente aux enchères")
                status = "sold"
            else:
                await self.grant_item(row["seller_user_id"], item["slug"], int(row["quantity"]))
                status = "expired"
            await self.db.execute("UPDATE auctions SET status=? WHERE id=?", (status, row["id"]))

    # ------------------------------------------------------------------
    # Streamathon, calendrier et intégrations
    # ------------------------------------------------------------------
    async def active_streamathon(self) -> dict[str, Any] | None:
        row = await self.db.fetchone("SELECT * FROM streamathons WHERE status='active' ORDER BY id DESC LIMIT 1")
        if row and datetime.fromisoformat(row["end_at"]) <= datetime.now(timezone.utc):
            await self.db.execute("UPDATE streamathons SET status='ended',ended_at=? WHERE id=?", (utcnow(), row["id"]))
            return None
        if row:
            row["remaining_seconds"] = max(0, int((datetime.fromisoformat(row["end_at"]) - datetime.now(timezone.utc)).total_seconds()))
        return row

    async def start_streamathon(self, title: str, initial_minutes: int, rules: dict[str, int]) -> dict[str, Any]:
        await self.db.execute("UPDATE streamathons SET status='ended',ended_at=? WHERE status='active'", (utcnow(),))
        end_at = (datetime.now(timezone.utc) + timedelta(minutes=max(1, initial_minutes))).isoformat()
        row_id = await self.db.execute(
            """INSERT INTO streamathons(title,status,end_at,seconds_per_follow,seconds_per_sub,seconds_per_gift,seconds_per_100_bits,created_at) VALUES(?,'active',?,?,?,?,?,?)""",
            (title.strip(), end_at, int(rules.get("follow", 60)), int(rules.get("sub", 300)), int(rules.get("gift", 300)), int(rules.get("bits100", 60)), utcnow()),
        )
        row = await self.active_streamathon() or {}
        await self.orchestrator.overlay.emit({"type": "streamathon_update", **row})
        return row

    async def add_streamathon_time(self, seconds: int, reason: str, actor: str = "") -> dict[str, Any] | None:
        row = await self.active_streamathon()
        if not row:
            return None
        new_end = datetime.fromisoformat(row["end_at"]) + timedelta(seconds=int(seconds))
        await self.db.execute("UPDATE streamathons SET end_at=? WHERE id=?", (new_end.isoformat(), row["id"]))
        await self.db.execute("INSERT INTO streamathon_log(streamathon_id,delta_seconds,reason,actor,created_at) VALUES(?,?,?,?,?)", (row["id"], seconds, reason, actor, utcnow()))
        updated = await self.active_streamathon()
        if updated:
            await self.orchestrator.overlay.emit({"type": "streamathon_update", **updated, "reason": reason, "actor": actor})
        return updated

    async def on_twitch_event(self, event_type: str, event: dict[str, Any]) -> None:
        if event_type == "channel.follow":
            await self._follow_guard(event)
        streamathon = await self.active_streamathon()
        if streamathon:
            seconds = 0
            actor = event.get("user_name") or event.get("from_broadcaster_user_name") or ""
            if event_type == "channel.follow":
                seconds = int(streamathon["seconds_per_follow"])
            elif event_type == "channel.subscribe":
                seconds = int(streamathon["seconds_per_sub"])
            elif event_type == "channel.subscription.gift":
                seconds = int(streamathon["seconds_per_gift"]) * int(event.get("total", 1))
            elif event_type == "channel.cheer":
                seconds = int(streamathon["seconds_per_100_bits"]) * (int(event.get("bits", 0)) // 100)
            if seconds:
                await self.add_streamathon_time(seconds, event_type, actor)
        await self.notify_integrations(event_type, event)

    async def _follow_guard(self, event: dict[str, Any]) -> None:
        if not bool(await self.db.get_setting("security.follow_guard.enabled", True)):
            return
        now = monotonic()
        window = max(3, int(await self.db.get_setting("security.follow_guard.window_seconds", 15)))
        threshold = max(3, int(await self.db.get_setting("security.follow_guard.threshold", 8)))
        actor = str(event.get("user_name") or event.get("user_login") or "inconnu")
        self.follow_window.append((now, actor))
        while self.follow_window and now - self.follow_window[0][0] > window:
            self.follow_window.popleft()
        if len(self.follow_window) < threshold:
            return
        previous = await self.db.fetchone("SELECT created_at FROM security_events WHERE event_type='follow_burst' ORDER BY id DESC LIMIT 1")
        if previous:
            try:
                if (datetime.now(timezone.utc) - datetime.fromisoformat(previous["created_at"])).total_seconds() < window * 2:
                    return
            except (TypeError, ValueError):
                pass
        actors = [name for _, name in self.follow_window]
        await self.db.execute("INSERT INTO security_events(event_type,severity,actor,details,created_at) VALUES(?,?,?,?,?)", ("follow_burst", "critical", actor, json.dumps({"count":len(actors),"window_seconds":window,"accounts":actors[-25:]}, ensure_ascii=False), utcnow()))
        if bool(await self.db.get_setting("security.follow_guard.emergency", True)):
            await self.db.set_setting("moderation.emergency_mode", True)
        if self.orchestrator:
            await self.orchestrator.overlay.emit({"type":"security_alert","viewer":"Follow Guard","message":f"Pic de {len(actors)} follows en {window}s détecté."})
            await self.orchestrator.say("Alerte sécurité : activité de follows anormale détectée. Le mode urgence est activé.")

    async def security_events(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = await self.db.fetchall("SELECT * FROM security_events ORDER BY id DESC LIMIT ?", (max(1, min(limit, 500)),))
        for row in rows:
            try:
                row["details"] = json.loads(row.get("details") or "{}")
            except json.JSONDecodeError:
                row["details"] = {}
        return rows

    async def test_follow_guard(self, count: int = 10) -> list[dict[str, Any]]:
        for index in range(max(1, min(count, 50))):
            await self._follow_guard({"user_name": f"test_follow_{index+1}"})
        return await self.security_events(10)

    async def schedules(self) -> list[dict[str, Any]]:
        rows = await self.db.fetchall("SELECT * FROM schedules ORDER BY enabled DESC,id DESC")
        for row in rows:
            row["action_payload"] = json.loads(row["action_payload"])
        return rows

    async def save_schedule(self, payload: dict[str, Any], schedule_id: int | None = None) -> dict[str, Any]:
        values = (
            str(payload.get("name", "Automatisation")).strip(),
            max(1, int(payload.get("interval_minutes", 60))),
            str(payload.get("action_type", "chat")),
            json.dumps(payload.get("action_payload", {}), ensure_ascii=False),
            int(bool(payload.get("only_live", False))),
            int(bool(payload.get("enabled", True))),
        )
        if schedule_id:
            await self.db.execute("UPDATE schedules SET name=?,interval_minutes=?,action_type=?,action_payload=?,only_live=?,enabled=? WHERE id=?", values + (schedule_id,))
            row_id = schedule_id
        else:
            row_id = await self.db.execute("INSERT INTO schedules(name,interval_minutes,action_type,action_payload,only_live,enabled,created_at) VALUES(?,?,?,?,?,?,?)", values + (utcnow(),))
        row = await self.db.fetchone("SELECT * FROM schedules WHERE id=?", (row_id,)) or {}
        row["action_payload"] = json.loads(row.get("action_payload", "{}"))
        return row

    async def _scheduler_loop(self) -> None:
        while True:
            await asyncio.sleep(30)
            if not bool(await self.db.get_setting("scheduler.enabled", True)) or not self.orchestrator:
                continue
            now = datetime.now(timezone.utc)
            rows = await self.db.fetchall("SELECT * FROM schedules WHERE enabled=1")
            for row in rows:
                if row.get("only_live") and not self.orchestrator.stream_online:
                    continue
                last = datetime.fromisoformat(row["last_run_at"]) if row.get("last_run_at") else None
                if last and (now - last).total_seconds() < int(row["interval_minutes"]) * 60:
                    continue
                payload = json.loads(row["action_payload"])
                try:
                    await self._run_scheduled_action(row["action_type"], payload)
                    await self.db.execute("UPDATE schedules SET last_run_at=? WHERE id=?", (utcnow(), row["id"]))
                except Exception:
                    logger.exception("Échec automatisation %s", row["name"])
            await self._close_expired_auctions()

    async def _run_scheduled_action(self, kind: str, payload: dict[str, Any]) -> None:
        if kind == "chat":
            await self.orchestrator.say(str(payload.get("message", "")))
        elif kind == "overlay":
            await self.orchestrator.overlay.emit(payload)
        elif kind == "obs_scene":
            await self.orchestrator.obs.set_scene(str(payload.get("scene", "")))
        elif kind == "counter":
            await self.orchestrator.engagement.counter_change(str(payload.get("slug", "fails")), int(payload.get("delta", 1)))
        elif kind == "clip":
            await self.orchestrator.twitch.create_clip()
        elif kind == "webhook":
            await self._send_generic_webhook(str(payload.get("url", "")), {"source":"Aura Live","event_type":"scheduled","payload":payload,"sent_at":utcnow()})

    async def integrations(self) -> list[dict[str, Any]]:
        rows = await self.db.fetchall("SELECT * FROM integrations ORDER BY name")
        for row in rows:
            row["config"] = json.loads(row["config"])
        return rows

    async def save_integration(self, name: str, kind: str, config: dict[str, Any], enabled: bool) -> dict[str, Any]:
        await self.db.execute(
            """INSERT INTO integrations(name,kind,config,enabled,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET kind=excluded.kind,config=excluded.config,enabled=excluded.enabled,updated_at=excluded.updated_at""",
            (name.strip(), kind, json.dumps(config, ensure_ascii=False), int(enabled), utcnow()),
        )
        row = await self.db.fetchone("SELECT * FROM integrations WHERE name=?", (name.strip(),)) or {}
        row["config"] = json.loads(row.get("config", "{}"))
        return row

    async def notify_integrations(self, event_type: str, event: dict[str, Any]) -> None:
        rows = await self.integrations()
        for row in rows:
            if not row.get("enabled"):
                continue
            config = row.get("config", {})
            watched = config.get("events") or await self.db.get_setting("integrations.discord.events", [])
            if event_type not in watched:
                continue
            url = str(config.get("url", "")).strip()
            if not url:
                continue
            try:
                if row.get("kind") == "discord_webhook":
                    await self._send_discord(url, self._discord_message(event_type, event), config.get("username", "Mairaiy"))
                elif row.get("kind") == "generic_webhook":
                    await self._send_generic_webhook(url, {"source":"Aura Live","event_type":event_type,"event":event,"sent_at":utcnow()})
            except Exception:
                logger.exception("Échec intégration %s", row.get("name"))

    async def test_integration(self, name: str) -> None:
        row = await self.db.fetchone("SELECT * FROM integrations WHERE name=?", (name,))
        if not row:
            raise ValueError("Intégration inconnue.")
        config = json.loads(row["config"])
        if row["kind"] == "discord_webhook":
            await self._send_discord(str(config.get("url", "")), "Mairaiy est connectée. Test Aura Live réussi.", config.get("username", "Mairaiy"))
        elif row["kind"] == "generic_webhook":
            await self._send_generic_webhook(str(config.get("url", "")), {"source":"Aura Live","event_type":"test","message":"Test réussi","sent_at":utcnow()})

    async def _send_generic_webhook(self, url: str, payload: dict[str, Any]) -> None:
        if not self.http or not url:
            raise ValueError("URL du webhook absente.")
        async with self.http.post(url, json=payload) as response:
            if response.status >= 300:
                raise RuntimeError(f"Webhook a répondu {response.status}")

    async def _send_discord(self, url: str, content: str, username: str) -> None:
        if not self.http or not url:
            raise ValueError("Webhook Discord absent.")
        async with self.http.post(url, json={"content": content[:1900], "username": username[:80]}) as response:
            if response.status >= 300:
                raise RuntimeError(f"Discord a répondu {response.status}")

    @staticmethod
    def _discord_message(event_type: str, event: dict[str, Any]) -> str:
        if event_type == "stream.online":
            return "🔴 SANSAHD est en direct. Le Spot est ouvert."
        if event_type == "channel.raid":
            return f"🌊 Raid de {event.get('from_broadcaster_user_name','une chaîne')} avec {event.get('viewers',0)} viewers."
        if event_type == "channel.subscribe":
            return f"⭐ {event.get('user_name','Un viewer')} vient de s'abonner."
        return f"Événement Twitch : {event_type}"

    # ------------------------------------------------------------------
    # TTS et analytics
    # ------------------------------------------------------------------
    async def tts_action(self, row_id: int, action: str, note: str = "") -> dict[str, Any] | None:
        row = await self.db.fetchone("SELECT * FROM tts_queue WHERE id=?", (row_id,))
        if not row:
            return None
        if action == "approve":
            await self.db.execute("UPDATE tts_queue SET status='approved',moderation_note=? WHERE id=?", (note, row_id))
        elif action == "reject":
            await self.db.execute("UPDATE tts_queue SET status='rejected',moderation_note=? WHERE id=?", (note, row_id))
        elif action == "play":
            await self.db.execute("UPDATE tts_queue SET status='played',played_at=? WHERE id=?", (utcnow(), row_id))
            await self.orchestrator.overlay.emit({"type": "tts", "viewer": row["display_name"], "text": row["text"], "message": row["text"], "voice": row.get("voice", ""), "rate": row.get("rate", 1), "pitch": row.get("pitch", 1), "volume": row.get("volume", 1)})
        return await self.db.fetchone("SELECT * FROM tts_queue WHERE id=?", (row_id,))

    async def analytics(self, days: int = 30) -> dict[str, Any]:
        since = (datetime.now(timezone.utc) - timedelta(days=max(1, days))).isoformat()
        events = await self.db.fetchall("SELECT event_type,COUNT(*) AS count FROM event_log WHERE created_at>=? GROUP BY event_type ORDER BY count DESC", (since,))
        transactions = await self.db.fetchall("SELECT reason,SUM(amount) AS net,COUNT(*) AS count FROM transactions WHERE created_at>=? GROUP BY reason ORDER BY count DESC LIMIT 20", (since,))
        commands = await self.db.fetchall("SELECT command_name,COUNT(*) AS count FROM command_usage WHERE created_at>=? GROUP BY command_name ORDER BY count DESC LIMIT 20", (since,))
        daily = await self.db.fetchall("SELECT substr(created_at,1,10) AS day,COUNT(*) AS events FROM event_log WHERE created_at>=? GROUP BY day ORDER BY day", (since,))
        totals = {
            "events": sum(int(row["count"]) for row in events),
            "commands": sum(int(row["count"]) for row in commands),
            "economy_net": sum(int(row["net"] or 0) for row in transactions),
        }
        return {"days": days, "totals": totals, "events": events, "transactions": transactions, "commands": commands, "daily": daily}
