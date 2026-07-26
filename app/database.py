from __future__ import annotations

import asyncio
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    """Couche SQLite asynchrone légère pour Aura Live."""

    def __init__(self, path: Path):
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=20)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    async def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(self._initialize_sync)
        await self._seed()

    def _initialize_sync(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                PRAGMA journal_mode=WAL;

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS oauth_tokens (
                    role TEXT PRIMARY KEY,
                    access_token TEXT NOT NULL,
                    refresh_token TEXT,
                    expires_at INTEGER NOT NULL DEFAULT 0,
                    scopes TEXT NOT NULL DEFAULT '[]',
                    user_id TEXT,
                    login TEXT,
                    display_name TEXT,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS oauth_states (
                    state TEXT PRIMARY KEY,
                    role TEXT NOT NULL,
                    scopes TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS commands (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    response TEXT NOT NULL,
                    cooldown_seconds INTEGER NOT NULL DEFAULT 10,
                    min_role TEXT NOT NULL DEFAULT 'everyone',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS viewers (
                    user_id TEXT PRIMARY KEY,
                    login TEXT UNIQUE NOT NULL,
                    display_name TEXT NOT NULL,
                    points INTEGER NOT NULL DEFAULT 0,
                    xp INTEGER NOT NULL DEFAULT 0,
                    level INTEGER NOT NULL DEFAULT 1,
                    message_count INTEGER NOT NULL DEFAULT 0,
                    warnings INTEGER NOT NULL DEFAULT 0,
                    memory_opt_in INTEGER NOT NULL DEFAULT 1,
                    first_seen TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    last_point_at TEXT
                );

                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES viewers(user_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS ai_conversation_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES viewers(user_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_ai_conversation_user_id
                ON ai_conversation_messages(user_id, id DESC);

                CREATE TABLE IF NOT EXISTS quotes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT NOT NULL,
                    author TEXT NOT NULL,
                    added_by TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS shop_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT NOT NULL,
                    cost INTEGER NOT NULL,
                    action_type TEXT NOT NULL,
                    action_payload TEXT NOT NULL DEFAULT '{}',
                    enabled INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES viewers(user_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS event_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS giveaways (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    keyword TEXT NOT NULL DEFAULT '!concours',
                    cost INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'open',
                    winner_user_id TEXT,
                    created_at TEXT NOT NULL,
                    closed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS giveaway_entries (
                    giveaway_id INTEGER NOT NULL,
                    user_id TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY(giveaway_id, user_id),
                    FOREIGN KEY(giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS queue_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT UNIQUE NOT NULL,
                    display_name TEXT NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'waiting',
                    position INTEGER NOT NULL,
                    joined_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS polls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'open',
                    created_at TEXT NOT NULL,
                    closed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS poll_options (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    poll_id INTEGER NOT NULL,
                    label TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    FOREIGN KEY(poll_id) REFERENCES polls(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS poll_votes (
                    poll_id INTEGER NOT NULL,
                    option_id INTEGER NOT NULL,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY(poll_id, user_id),
                    FOREIGN KEY(poll_id) REFERENCES polls(id) ON DELETE CASCADE,
                    FOREIGN KEY(option_id) REFERENCES poll_options(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS counters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    slug TEXT UNIQUE NOT NULL,
                    label TEXT NOT NULL,
                    value INTEGER NOT NULL DEFAULT 0,
                    visible INTEGER NOT NULL DEFAULT 1,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tts_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    text TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT NOT NULL,
                    played_at TEXT
                );

                CREATE TABLE IF NOT EXISTS announcements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    interval_minutes INTEGER NOT NULL DEFAULT 20,
                    min_messages INTEGER NOT NULL DEFAULT 0,
                    only_live INTEGER NOT NULL DEFAULT 1,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    last_sent_at TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS alert_templates (
                    event_type TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    message_template TEXT NOT NULL,
                    accent TEXT NOT NULL DEFAULT 'aqua',
                    duration_seconds INTEGER NOT NULL DEFAULT 7,
                    sound_path TEXT NOT NULL DEFAULT '',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    goal_type TEXT NOT NULL DEFAULT 'custom',
                    current_value INTEGER NOT NULL DEFAULT 0,
                    target_value INTEGER NOT NULL DEFAULT 100,
                    unit TEXT NOT NULL DEFAULT '',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS reward_actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reward_title TEXT UNIQUE NOT NULL,
                    action_type TEXT NOT NULL DEFAULT 'overlay',
                    action_payload TEXT NOT NULL DEFAULT '{}',
                    response_message TEXT NOT NULL DEFAULT '',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS moderation_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    action TEXT NOT NULL,
                    message TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );

                """
            )
            db.commit()

    async def _seed(self) -> None:
        defaults = {
            "loyalty.points_per_message": 5,
            "loyalty.xp_per_message": 8,
            "loyalty.cooldown_seconds": 60,
            "moderation.links": True,
            "moderation.caps_ratio": 0.78,
            "moderation.max_warnings": 3,
            "moderation.banned_words": [],
            "moderation.allowed_domains": ["twitch.tv", "youtube.com", "youtu.be", "discord.gg"],
            "moderation.emergency_mode": False,
            "moderation.timeout_seconds": 30,
            "bot.active": True,
            "bot.silent": False,
            "announcements.enabled": True,
            "announcements.interval_minutes": 20,
            "announcements.messages": [
                "Bienvenue sur le Spot. Ici, Aura surveille le chat et Sansa essaie de survivre au jeu.",
                "Tape !commandes pour découvrir ce qu'Aura sait déjà faire.",
                "Les Écumes se gagnent en participant au chat. Tape !ecume pour consulter ton solde.",
            ],
            "tts.enabled": True,
            "tts.cost": 50,
            "tts.max_length": 180,
            "queue.enabled": True,
            "giveaway.enabled": True,
            "poll.enabled": True,
            "alerts.follow.enabled": True,
            "alerts.subscribe.enabled": True,
            "alerts.raid.enabled": True,
            "alerts.bits.enabled": True,
            "alerts.redemption.enabled": True,
            "overlay.chat.enabled": True,
            "overlay.goal.enabled": True,
            "ai.personality_locked": True,
            "ai.spontaneous": False,
            "ai.reply_enabled": True,
            "ai.direct_cooldown_seconds": 4,
            "ai.thinking_message_enabled": False,
            "ai.threaded_replies": False,
            "ai.trigger_names": ["aura", "mairaiy"],
        }
        for key, value in defaults.items():
            if await self.get_setting(key) is None:
                await self.set_setting(key, value)

        commands = [
            ("!discord", "Le Discord du Spot arrive bientôt. Aura garde la porte en attendant.", 30, "everyone"),
            ("!reseaux", "Les réseaux de Sansa seront centralisés ici dès leur configuration.", 30, "everyone"),
            ("!regles", "Respect, pas de spam, pas de liens sauvages. Le reste se règle avec un peu de bon sens.", 30, "everyone"),
            ("!commandes", "Commandes : !aura, !ecume, !niveau, !top, !peche, !duel, !boutique, !join, !concours, !tts, !sr, !pari, !inventaire, !run, !drop, !decrypt, !bomb, !bingo, !ticket, !faq, !profile.", 15, "everyone"),
        ]
        for name, response, cooldown, role in commands:
            await self.execute(
                """
                INSERT OR IGNORE INTO commands(name,response,cooldown_seconds,min_role,enabled,created_at)
                VALUES(?,?,?,?,1,?)
                """,
                (name, response, cooldown, role, utcnow()),
            )

        items = [
            ("Vague du Spot", "Déclenche une animation de vague dans l'overlay.", 150, "overlay", '{"kind":"wave"}'),
            ("Alerte Aura", "Fait apparaître Aura avec un message spécial.", 300, "overlay", '{"kind":"aura"}'),
            ("Choix du prochain défi", "Donne une proposition prioritaire pour le prochain défi du live.", 750, "manual", '{}'),
        ]
        for row in items:
            await self.execute(
                """
                INSERT OR IGNORE INTO shop_items(name,description,cost,action_type,action_payload,enabled)
                VALUES(?,?,?,?,?,1)
                """,
                row,
            )

        counters = [
            ("wins", "Victoires", 0),
            ("deaths", "Morts", 0),
            ("fails", "Fails", 0),
        ]
        for slug, label, value in counters:
            await self.execute(
                """
                INSERT OR IGNORE INTO counters(slug,label,value,visible,updated_at)
                VALUES(?,?,?,1,?)
                """,
                (slug, label, value, utcnow()),
            )


        announcement_rows = [
            ("Bienvenue", "Bienvenue sur le Spot. Tape !commandes pour découvrir les interactions disponibles.", 25, 8, 1),
            ("Écumes", "Les Écumes récompensent l'activité. Tape !ecume pour connaître ton solde.", 35, 12, 1),
        ]
        for title, message, interval, min_messages, only_live in announcement_rows:
            await self.execute(
                """
                INSERT INTO announcements(title,message,interval_minutes,min_messages,only_live,enabled,created_at)
                SELECT ?,?,?,?,?,1,?
                WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE title=?)
                """,
                (title, message, interval, min_messages, only_live, utcnow(), title),
            )

        alert_rows = [
            ("follow", "Nouveau follow", "{viewer} rejoint le Spot.", "aqua", 7),
            ("subscribe", "Abonnement", "{viewer} rejoint l'équipage premium.", "violet", 8),
            ("raid", "Marée montante", "{viewer} débarque avec {count} personnes.", "orange", 10),
            ("bits", "Bits", "{viewer} envoie {amount} bits.", "yellow", 7),
            ("redemption", "Récompense", "{viewer} utilise {reward}.", "pink", 7),
            ("hype_train", "Hype Train", "Le Hype Train atteint le niveau {level}.", "violet", 9),
            ("shoutout", "Shoutout", "{viewer} reçoit un shoutout.", "blue", 8),
        ]
        for event_type, label, template, accent, duration in alert_rows:
            await self.execute(
                """
                INSERT OR IGNORE INTO alert_templates(
                    event_type,label,message_template,accent,duration_seconds,sound_path,enabled,updated_at
                ) VALUES(?,?,?,?,?,'',1,?)
                """,
                (event_type, label, template, accent, duration, utcnow()),
            )

        await self.execute(
            """
            INSERT INTO goals(title,goal_type,current_value,target_value,unit,enabled,updated_at)
            SELECT 'Objectif followers','followers',0,1200,'followers',1,?
            WHERE NOT EXISTS (SELECT 1 FROM goals)
            """,
            (utcnow(),),
        )

    async def executescript(self, script: str) -> None:
        await asyncio.to_thread(self._executescript_sync, script)

    def _executescript_sync(self, script: str) -> None:
        with self._connect() as db:
            db.executescript(script)
            db.commit()

    async def execute(self, query: str, params: tuple[Any, ...] = ()) -> int:
        return await asyncio.to_thread(self._execute_sync, query, params)

    def _execute_sync(self, query: str, params: tuple[Any, ...]) -> int:
        with self._connect() as db:
            cursor = db.execute(query, params)
            db.commit()
            return int(cursor.lastrowid or 0)

    async def fetchone(self, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._fetchone_sync, query, params)

    def _fetchone_sync(self, query: str, params: tuple[Any, ...]) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute(query, params).fetchone()
            return dict(row) if row else None

    async def fetchall(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._fetchall_sync, query, params)

    def _fetchall_sync(self, query: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
        with self._connect() as db:
            return [dict(row) for row in db.execute(query, params).fetchall()]

    async def get_setting(self, key: str, default: Any = None) -> Any:
        row = await self.fetchone("SELECT value FROM settings WHERE key=?", (key,))
        if not row:
            return default
        try:
            return json.loads(row["value"])
        except json.JSONDecodeError:
            return row["value"]

    async def set_setting(self, key: str, value: Any) -> None:
        encoded = json.dumps(value, ensure_ascii=False)
        await self.execute(
            """
            INSERT INTO settings(key,value) VALUES(?,?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value
            """,
            (key, encoded),
        )

    async def all_settings(self) -> dict[str, Any]:
        rows = await self.fetchall("SELECT key,value FROM settings ORDER BY key")
        result: dict[str, Any] = {}
        for row in rows:
            try:
                result[row["key"]] = json.loads(row["value"])
            except json.JSONDecodeError:
                result[row["key"]] = row["value"]
        return result

    async def save_oauth_state(self, state: str, role: str, scopes: list[str]) -> None:
        await self.execute(
            "INSERT INTO oauth_states(state,role,scopes,created_at) VALUES(?,?,?,?)",
            (state, role, json.dumps(scopes), utcnow()),
        )

    async def consume_oauth_state(self, state: str) -> dict[str, Any] | None:
        row = await self.fetchone("SELECT * FROM oauth_states WHERE state=?", (state,))
        if row:
            await self.execute("DELETE FROM oauth_states WHERE state=?", (state,))
            row["scopes"] = json.loads(row["scopes"])
        return row

    async def save_token(
        self,
        role: str,
        access_token: str,
        refresh_token: str,
        expires_at: int,
        scopes: list[str],
        user_id: str,
        login: str,
        display_name: str,
    ) -> None:
        await self.execute(
            """
            INSERT INTO oauth_tokens(
                role,access_token,refresh_token,expires_at,scopes,user_id,login,display_name,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?)
            ON CONFLICT(role) DO UPDATE SET
                access_token=excluded.access_token,
                refresh_token=excluded.refresh_token,
                expires_at=excluded.expires_at,
                scopes=excluded.scopes,
                user_id=excluded.user_id,
                login=excluded.login,
                display_name=excluded.display_name,
                updated_at=excluded.updated_at
            """,
            (
                role,
                access_token,
                refresh_token,
                expires_at,
                json.dumps(scopes),
                user_id,
                login,
                display_name,
                utcnow(),
            ),
        )

    async def get_token(self, role: str) -> dict[str, Any] | None:
        row = await self.fetchone("SELECT * FROM oauth_tokens WHERE role=?", (role,))
        if row:
            row["scopes"] = json.loads(row["scopes"])
        return row

    async def upsert_viewer(self, user_id: str, login: str, display_name: str) -> dict[str, Any]:
        now = utcnow()
        await self.execute(
            """
            INSERT INTO viewers(user_id,login,display_name,first_seen,last_seen,message_count)
            VALUES(?,?,?,?,?,1)
            ON CONFLICT(user_id) DO UPDATE SET
                login=excluded.login,
                display_name=excluded.display_name,
                last_seen=excluded.last_seen,
                message_count=viewers.message_count+1
            """,
            (user_id, login.lower(), display_name, now, now),
        )
        return await self.get_viewer(user_id=user_id) or {}

    async def get_viewer(self, *, user_id: str | None = None, login: str | None = None) -> dict[str, Any] | None:
        if user_id:
            return await self.fetchone("SELECT * FROM viewers WHERE user_id=?", (user_id,))
        if login:
            return await self.fetchone("SELECT * FROM viewers WHERE login=?", (login.lower(),))
        return None

    async def adjust_points(self, user_id: str, amount: int, reason: str) -> int:
        await self.execute("UPDATE viewers SET points=MAX(0,points+?) WHERE user_id=?", (amount, user_id))
        await self.execute(
            "INSERT INTO transactions(user_id,amount,reason,created_at) VALUES(?,?,?,?)",
            (user_id, amount, reason, utcnow()),
        )
        row = await self.get_viewer(user_id=user_id)
        return int(row["points"]) if row else 0

    async def award_activity(self, user_id: str, points: int, xp: int, last_point_at: str) -> dict[str, Any]:
        viewer = await self.get_viewer(user_id=user_id)
        if not viewer:
            return {}
        new_xp = int(viewer["xp"]) + xp
        new_level = max(1, int((new_xp / 100) ** 0.5) + 1)
        await self.execute(
            "UPDATE viewers SET points=points+?, xp=?, level=?, last_point_at=? WHERE user_id=?",
            (points, new_xp, new_level, last_point_at, user_id),
        )
        return await self.get_viewer(user_id=user_id) or {}

    async def top_viewers(self, limit: int = 10) -> list[dict[str, Any]]:
        return await self.fetchall(
            """
            SELECT user_id,login,display_name,points,xp,level,message_count,last_seen
            FROM viewers ORDER BY points DESC, xp DESC LIMIT ?
            """,
            (limit,),
        )

    async def add_memory(self, user_id: str, kind: str, content: str) -> None:
        viewer = await self.get_viewer(user_id=user_id)
        if not viewer or not viewer["memory_opt_in"]:
            return
        await self.execute(
            "INSERT INTO memories(user_id,kind,content,created_at) VALUES(?,?,?,?)",
            (user_id, kind, content[:500], utcnow()),
        )

    async def memories_for(self, user_id: str, limit: int = 8) -> list[dict[str, Any]]:
        return await self.fetchall(
            "SELECT kind,content,created_at FROM memories WHERE user_id=? ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        )

    async def clear_viewer_memory(self, user_id: str) -> None:
        await self.execute("DELETE FROM memories WHERE user_id=?", (user_id,))

    async def add_conversation_message(self, user_id: str, role: str, content: str) -> None:
        if role not in {"user", "assistant"}:
            raise ValueError("Rôle de conversation invalide")
        clean = " ".join(str(content).strip().split())[:900]
        if not clean:
            return
        await self.execute(
            "INSERT INTO ai_conversation_messages(user_id,role,content,created_at) VALUES(?,?,?,?)",
            (user_id, role, clean, utcnow()),
        )
        # Garde une mémoire courte et lisible : les 24 derniers tours maximum.
        await self.execute(
            """
            DELETE FROM ai_conversation_messages
            WHERE user_id=? AND id NOT IN (
                SELECT id FROM ai_conversation_messages
                WHERE user_id=? ORDER BY id DESC LIMIT 24
            )
            """,
            (user_id, user_id),
        )

    async def conversation_for(self, user_id: str, limit: int = 12) -> list[dict[str, Any]]:
        rows = await self.fetchall(
            "SELECT role,content,created_at FROM ai_conversation_messages WHERE user_id=? ORDER BY id DESC LIMIT ?",
            (user_id, max(1, min(int(limit), 24))),
        )
        rows.reverse()
        return rows

    async def clear_conversation(self, user_id: str) -> None:
        await self.execute("DELETE FROM ai_conversation_messages WHERE user_id=?", (user_id,))

    async def log_event(self, event_type: str, payload: dict[str, Any]) -> None:
        await self.execute(
            "INSERT INTO event_log(event_type,payload,created_at) VALUES(?,?,?)",
            (event_type, json.dumps(payload, ensure_ascii=False), utcnow()),
        )

    async def overview(self) -> dict[str, int]:
        queries = {
            "viewers": "SELECT COUNT(*) AS count FROM viewers",
            "commands": "SELECT COUNT(*) AS count FROM commands WHERE enabled=1",
            "shop_items": "SELECT COUNT(*) AS count FROM shop_items WHERE enabled=1",
            "queue": "SELECT COUNT(*) AS count FROM queue_entries WHERE status='waiting'",
            "events": "SELECT COUNT(*) AS count FROM event_log",
            "tts_pending": "SELECT COUNT(*) AS count FROM tts_queue WHERE status='pending'",
            "announcements": "SELECT COUNT(*) AS count FROM announcements WHERE enabled=1",
            "alerts": "SELECT COUNT(*) AS count FROM alert_templates WHERE enabled=1",
            "goals": "SELECT COUNT(*) AS count FROM goals WHERE enabled=1",
            "reward_actions": "SELECT COUNT(*) AS count FROM reward_actions WHERE enabled=1",
        }
        result: dict[str, int] = {}
        for key, query in queries.items():
            row = await self.fetchone(query)
            result[key] = int(row["count"]) if row else 0
        return result
