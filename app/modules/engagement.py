from __future__ import annotations

import random
from typing import Any

from app.database import Database, utcnow


class EngagementModule:
    def __init__(self, db: Database):
        self.db = db

    async def active_giveaway(self) -> dict[str, Any] | None:
        return await self.db.fetchone("SELECT * FROM giveaways WHERE status='open' ORDER BY id DESC LIMIT 1")

    async def create_giveaway(self, title: str, keyword: str = "!concours", cost: int = 0) -> dict[str, Any]:
        await self.db.execute("UPDATE giveaways SET status='closed', closed_at=? WHERE status='open'", (utcnow(),))
        giveaway_id = await self.db.execute(
            "INSERT INTO giveaways(title,keyword,cost,status,created_at) VALUES(?,?,?,'open',?)",
            (title.strip(), keyword.strip().lower(), max(0, cost), utcnow()),
        )
        return await self.db.fetchone("SELECT * FROM giveaways WHERE id=?", (giveaway_id,)) or {}

    async def enter_giveaway(self, viewer: dict[str, Any]) -> str:
        giveaway = await self.active_giveaway()
        if not giveaway:
            return "Aucun concours n'est ouvert pour le moment."
        existing = await self.db.fetchone(
            "SELECT 1 FROM giveaway_entries WHERE giveaway_id=? AND user_id=?",
            (giveaway["id"], viewer["user_id"]),
        )
        if existing:
            return f"{viewer['display_name']}, ta participation est déjà enregistrée."
        cost = int(giveaway["cost"])
        if int(viewer["points"]) < cost:
            return f"Il faut {cost} Écumes pour participer."
        if cost:
            await self.db.adjust_points(viewer["user_id"], -cost, "participation concours")
        await self.db.execute(
            "INSERT INTO giveaway_entries(giveaway_id,user_id,display_name,created_at) VALUES(?,?,?,?)",
            (giveaway["id"], viewer["user_id"], viewer["display_name"], utcnow()),
        )
        return f"{viewer['display_name']} rejoint le concours « {giveaway['title']} »."

    async def draw_giveaway(self) -> dict[str, Any] | None:
        giveaway = await self.active_giveaway()
        if not giveaway:
            return None
        entries = await self.db.fetchall(
            "SELECT * FROM giveaway_entries WHERE giveaway_id=?",
            (giveaway["id"],),
        )
        if not entries:
            return {"giveaway": giveaway, "winner": None, "entries": 0}
        winner = random.choice(entries)
        await self.db.execute(
            "UPDATE giveaways SET status='closed',winner_user_id=?,closed_at=? WHERE id=?",
            (winner["user_id"], utcnow(), giveaway["id"]),
        )
        return {"giveaway": giveaway, "winner": winner, "entries": len(entries)}

    async def giveaway_entries(self, giveaway_id: int) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            "SELECT * FROM giveaway_entries WHERE giveaway_id=? ORDER BY created_at",
            (giveaway_id,),
        )

    async def queue_join(self, viewer: dict[str, Any], note: str = "") -> str:
        enabled = bool(await self.db.get_setting("queue.enabled", True))
        if not enabled:
            return "La file de jeu est fermée."
        existing = await self.db.fetchone("SELECT * FROM queue_entries WHERE user_id=?", (viewer["user_id"],))
        if existing:
            return f"{viewer['display_name']}, tu es déjà dans la file en position {existing['position']}."
        row = await self.db.fetchone("SELECT COALESCE(MAX(position),0)+1 AS next_pos FROM queue_entries WHERE status='waiting'")
        position = int(row["next_pos"]) if row else 1
        await self.db.execute(
            "INSERT INTO queue_entries(user_id,display_name,note,status,position,joined_at) VALUES(?,?,?,'waiting',?,?)",
            (viewer["user_id"], viewer["display_name"], note[:120], position, utcnow()),
        )
        return f"{viewer['display_name']} rejoint la file en position {position}."

    async def queue_leave(self, viewer: dict[str, Any]) -> str:
        existing = await self.db.fetchone("SELECT * FROM queue_entries WHERE user_id=?", (viewer["user_id"],))
        if not existing:
            return f"{viewer['display_name']}, tu n'es pas dans la file."
        await self.db.execute("DELETE FROM queue_entries WHERE user_id=?", (viewer["user_id"],))
        await self._reorder_queue()
        return f"{viewer['display_name']} quitte la file."

    async def queue_list(self) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            "SELECT * FROM queue_entries WHERE status='waiting' ORDER BY position"
        )

    async def queue_next(self) -> dict[str, Any] | None:
        current = await self.db.fetchone(
            "SELECT * FROM queue_entries WHERE status='waiting' ORDER BY position LIMIT 1"
        )
        if not current:
            return None
        await self.db.execute("DELETE FROM queue_entries WHERE id=?", (current["id"],))
        await self._reorder_queue()
        return current

    async def queue_clear(self) -> None:
        await self.db.execute("DELETE FROM queue_entries")

    async def _reorder_queue(self) -> None:
        entries = await self.queue_list()
        for index, entry in enumerate(entries, start=1):
            if int(entry["position"]) != index:
                await self.db.execute("UPDATE queue_entries SET position=? WHERE id=?", (index, entry["id"]))

    async def create_poll(self, question: str, options: list[str]) -> dict[str, Any]:
        await self.db.execute("UPDATE polls SET status='closed',closed_at=? WHERE status='open'", (utcnow(),))
        poll_id = await self.db.execute(
            "INSERT INTO polls(question,status,created_at) VALUES(?,'open',?)",
            (question.strip(), utcnow()),
        )
        for index, option in enumerate(options, start=1):
            await self.db.execute(
                "INSERT INTO poll_options(poll_id,label,position) VALUES(?,?,?)",
                (poll_id, option.strip(), index),
            )
        return await self.poll_state(poll_id) or {}

    async def active_poll(self) -> dict[str, Any] | None:
        row = await self.db.fetchone("SELECT id FROM polls WHERE status='open' ORDER BY id DESC LIMIT 1")
        return await self.poll_state(int(row["id"])) if row else None

    async def poll_state(self, poll_id: int) -> dict[str, Any] | None:
        poll = await self.db.fetchone("SELECT * FROM polls WHERE id=?", (poll_id,))
        if not poll:
            return None
        options = await self.db.fetchall(
            """
            SELECT o.id,o.label,o.position,COUNT(v.user_id) AS votes
            FROM poll_options o
            LEFT JOIN poll_votes v ON v.option_id=o.id
            WHERE o.poll_id=?
            GROUP BY o.id,o.label,o.position
            ORDER BY o.position
            """,
            (poll_id,),
        )
        poll["options"] = options
        poll["total_votes"] = sum(int(option["votes"]) for option in options)
        return poll

    async def vote(self, viewer: dict[str, Any], option_position: int) -> str:
        poll = await self.active_poll()
        if not poll:
            return "Aucun sondage n'est ouvert."
        option = next((item for item in poll["options"] if int(item["position"]) == option_position), None)
        if not option:
            return "Ce choix n'existe pas."
        await self.db.execute(
            """
            INSERT INTO poll_votes(poll_id,option_id,user_id,created_at) VALUES(?,?,?,?)
            ON CONFLICT(poll_id,user_id) DO UPDATE SET option_id=excluded.option_id,created_at=excluded.created_at
            """,
            (poll["id"], option["id"], viewer["user_id"], utcnow()),
        )
        return f"Vote de {viewer['display_name']} enregistré pour « {option['label']} »."

    async def close_poll(self) -> dict[str, Any] | None:
        poll = await self.active_poll()
        if not poll:
            return None
        await self.db.execute("UPDATE polls SET status='closed',closed_at=? WHERE id=?", (utcnow(), poll["id"]))
        return await self.poll_state(int(poll["id"]))

    async def counters(self) -> list[dict[str, Any]]:
        return await self.db.fetchall("SELECT * FROM counters ORDER BY id")

    async def counter_change(self, slug: str, delta: int) -> dict[str, Any] | None:
        await self.db.execute(
            "UPDATE counters SET value=MAX(0,value+?),updated_at=? WHERE slug=?",
            (delta, utcnow(), slug),
        )
        return await self.db.fetchone("SELECT * FROM counters WHERE slug=?", (slug,))

    async def counter_set(self, slug: str, value: int) -> dict[str, Any] | None:
        await self.db.execute(
            "UPDATE counters SET value=?,updated_at=? WHERE slug=?",
            (max(0, value), utcnow(), slug),
        )
        return await self.db.fetchone("SELECT * FROM counters WHERE slug=?", (slug,))

    async def enqueue_tts(self, viewer: dict[str, Any], text: str) -> str:
        enabled = bool(await self.db.get_setting("tts.enabled", True))
        if not enabled:
            return "Le TTS est désactivé."
        cost = int(await self.db.get_setting("tts.cost", 50))
        max_length = int(await self.db.get_setting("tts.max_length", 180))
        if len(text.strip()) < 2:
            return "Usage : !tts ton message"
        if len(text) > max_length:
            return f"Le message TTS est limité à {max_length} caractères."
        if int(viewer["points"]) < cost:
            return f"Il faut {cost} Écumes pour utiliser le TTS."
        if cost:
            await self.db.adjust_points(viewer["user_id"], -cost, "message TTS")
        require_approval = bool(await self.db.get_setting("tts.require_approval", False))
        status = "pending" if require_approval else "approved"
        voice = str(await self.db.get_setting("tts.voice", ""))
        rate = float(await self.db.get_setting("tts.rate", 1.0))
        pitch = float(await self.db.get_setting("tts.pitch", 1.0))
        volume = float(await self.db.get_setting("tts.volume", 1.0))
        await self.db.execute(
            """INSERT INTO tts_queue(user_id,display_name,text,status,voice,rate,pitch,volume,created_at)
            VALUES(?,?,?,?,?,?,?,?,?)""",
            (viewer["user_id"], viewer["display_name"], text.strip(), status, voice, rate, pitch, volume, utcnow()),
        )
        if require_approval:
            return f"Message TTS de {viewer['display_name']} envoyé en modération."
        return f"Message TTS de {viewer['display_name']} ajouté à la file."

    async def pending_tts(self, limit: int = 50) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            "SELECT * FROM tts_queue WHERE status IN ('pending','approved') ORDER BY CASE status WHEN 'approved' THEN 0 ELSE 1 END,id LIMIT ?",
            (limit,),
        )

    async def next_tts(self) -> dict[str, Any] | None:
        row = await self.db.fetchone("SELECT * FROM tts_queue WHERE status='approved' ORDER BY id LIMIT 1")
        if not row:
            return None
        await self.db.execute(
            "UPDATE tts_queue SET status='played',played_at=? WHERE id=?",
            (utcnow(), row["id"]),
        )
        return row
