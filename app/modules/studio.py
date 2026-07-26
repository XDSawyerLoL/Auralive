from __future__ import annotations

import json
import random
from typing import Any

from app.database import Database, utcnow


class StudioModule:
    """Fonctions de configuration avancée du panneau Aura Live."""

    def __init__(self, db: Database):
        self.db = db

    async def announcements(self) -> list[dict[str, Any]]:
        return await self.db.fetchall("SELECT * FROM announcements ORDER BY enabled DESC,id DESC")

    async def create_announcement(
        self,
        title: str,
        message: str,
        interval_minutes: int,
        min_messages: int,
        only_live: bool,
        enabled: bool,
    ) -> dict[str, Any]:
        row_id = await self.db.execute(
            """
            INSERT INTO announcements(title,message,interval_minutes,min_messages,only_live,enabled,created_at)
            VALUES(?,?,?,?,?,?,?)
            """,
            (
                title.strip(),
                message.strip(),
                max(1, interval_minutes),
                max(0, min_messages),
                int(only_live),
                int(enabled),
                utcnow(),
            ),
        )
        return await self.db.fetchone("SELECT * FROM announcements WHERE id=?", (row_id,)) or {}

    async def update_announcement(self, announcement_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
        current = await self.db.fetchone("SELECT * FROM announcements WHERE id=?", (announcement_id,))
        if not current:
            return None
        await self.db.execute(
            """
            UPDATE announcements SET title=?,message=?,interval_minutes=?,min_messages=?,only_live=?,enabled=?
            WHERE id=?
            """,
            (
                str(payload.get("title", current["title"])).strip(),
                str(payload.get("message", current["message"])).strip(),
                max(1, int(payload.get("interval_minutes", current["interval_minutes"]))),
                max(0, int(payload.get("min_messages", current["min_messages"]))),
                int(bool(payload.get("only_live", current["only_live"]))),
                int(bool(payload.get("enabled", current["enabled"]))),
                announcement_id,
            ),
        )
        return await self.db.fetchone("SELECT * FROM announcements WHERE id=?", (announcement_id,))

    async def alert_templates(self) -> list[dict[str, Any]]:
        return await self.db.fetchall("SELECT * FROM alert_templates ORDER BY event_type")

    async def save_alert_template(self, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        current = await self.db.fetchone("SELECT * FROM alert_templates WHERE event_type=?", (event_type,)) or {}
        label = str(payload.get("label", current.get("label", event_type))).strip()
        message = str(payload.get("message_template", current.get("message_template", "{viewer}"))).strip()
        accent = str(payload.get("accent", current.get("accent", "aqua"))).strip()
        duration = max(2, min(30, int(payload.get("duration_seconds", current.get("duration_seconds", 7)))))
        sound_path = str(payload.get("sound_path", current.get("sound_path", ""))).strip()
        media_path = str(payload.get("media_path", current.get("media_path", ""))).strip()
        animation_in = str(payload.get("animation_in", current.get("animation_in", "pop"))).strip()
        animation_out = str(payload.get("animation_out", current.get("animation_out", "fade"))).strip()
        volume = max(0.0, min(1.0, float(payload.get("volume", current.get("volume", 0.8)))))
        layout = str(payload.get("layout", current.get("layout", "card"))).strip()
        variants = payload.get("variants", current.get("variants", []))
        if isinstance(variants, str):
            try:
                variants = json.loads(variants)
            except Exception:
                variants = []
        enabled = int(bool(payload.get("enabled", current.get("enabled", 1))))
        await self.db.execute(
            """
            INSERT INTO alert_templates(event_type,label,message_template,accent,duration_seconds,sound_path,enabled,updated_at,
                media_path,animation_in,animation_out,volume,layout,variants)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(event_type) DO UPDATE SET
                label=excluded.label,
                message_template=excluded.message_template,
                accent=excluded.accent,
                duration_seconds=excluded.duration_seconds,
                sound_path=excluded.sound_path,
                enabled=excluded.enabled,
                updated_at=excluded.updated_at,
                media_path=excluded.media_path,
                animation_in=excluded.animation_in,
                animation_out=excluded.animation_out,
                volume=excluded.volume,
                layout=excluded.layout,
                variants=excluded.variants
            """,
            (event_type, label, message, accent, duration, sound_path, enabled, utcnow(), media_path,
             animation_in, animation_out, volume, layout, json.dumps(variants, ensure_ascii=False)),
        )
        return await self.db.fetchone("SELECT * FROM alert_templates WHERE event_type=?", (event_type,)) or {}

    async def render_alert(self, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        template = await self.db.fetchone("SELECT * FROM alert_templates WHERE event_type=?", (event_type,))
        if not template:
            return payload
        safe = {key: str(value) for key, value in payload.items() if value is not None}
        try:
            message = str(template["message_template"]).format_map(_SafeFormat(safe))
        except Exception:
            message = str(template["message_template"])
        variants = []
        try:
            variants = json.loads(template.get("variants") or "[]")
        except Exception:
            variants = []
        if variants:
            variant = random.choice(variants)
            if isinstance(variant, dict):
                message = str(variant.get("message", message)).format_map(_SafeFormat(safe))
        return {
            **payload,
            "type": event_type,
            "label": template["label"],
            "message": message,
            "accent": template["accent"],
            "duration": int(template["duration_seconds"]),
            "sound_path": template["sound_path"],
            "media_path": template.get("media_path", ""),
            "animation_in": template.get("animation_in", "pop"),
            "animation_out": template.get("animation_out", "fade"),
            "volume": float(template.get("volume", 0.8)),
            "layout": template.get("layout", "card"),
            "enabled": bool(template["enabled"]),
        }

    async def goals(self) -> list[dict[str, Any]]:
        return await self.db.fetchall("SELECT * FROM goals ORDER BY enabled DESC,id DESC")

    async def create_goal(
        self,
        title: str,
        goal_type: str,
        current_value: int,
        target_value: int,
        unit: str,
        enabled: bool,
    ) -> dict[str, Any]:
        row_id = await self.db.execute(
            """
            INSERT INTO goals(title,goal_type,current_value,target_value,unit,enabled,updated_at)
            VALUES(?,?,?,?,?,?,?)
            """,
            (
                title.strip(),
                goal_type.strip(),
                max(0, current_value),
                max(1, target_value),
                unit.strip(),
                int(enabled),
                utcnow(),
            ),
        )
        return await self.db.fetchone("SELECT * FROM goals WHERE id=?", (row_id,)) or {}

    async def update_goal(self, goal_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
        current = await self.db.fetchone("SELECT * FROM goals WHERE id=?", (goal_id,))
        if not current:
            return None
        await self.db.execute(
            """
            UPDATE goals SET title=?,goal_type=?,current_value=?,target_value=?,unit=?,enabled=?,updated_at=?
            WHERE id=?
            """,
            (
                str(payload.get("title", current["title"])).strip(),
                str(payload.get("goal_type", current["goal_type"])).strip(),
                max(0, int(payload.get("current_value", current["current_value"]))),
                max(1, int(payload.get("target_value", current["target_value"]))),
                str(payload.get("unit", current["unit"])).strip(),
                int(bool(payload.get("enabled", current["enabled"]))),
                utcnow(),
                goal_id,
            ),
        )
        return await self.db.fetchone("SELECT * FROM goals WHERE id=?", (goal_id,))

    async def active_goal(self) -> dict[str, Any] | None:
        return await self.db.fetchone("SELECT * FROM goals WHERE enabled=1 ORDER BY id DESC LIMIT 1")

    async def reward_actions(self) -> list[dict[str, Any]]:
        rows = await self.db.fetchall("SELECT * FROM reward_actions ORDER BY enabled DESC,reward_title")
        for row in rows:
            try:
                row["action_payload"] = json.loads(row["action_payload"])
            except Exception:
                row["action_payload"] = {}
        return rows

    async def create_reward_action(
        self,
        reward_title: str,
        action_type: str,
        action_payload: dict[str, Any],
        response_message: str,
        enabled: bool,
    ) -> dict[str, Any]:
        row_id = await self.db.execute(
            """
            INSERT INTO reward_actions(reward_title,action_type,action_payload,response_message,enabled,created_at)
            VALUES(?,?,?,?,?,?)
            """,
            (
                reward_title.strip(),
                action_type.strip(),
                json.dumps(action_payload, ensure_ascii=False),
                response_message.strip(),
                int(enabled),
                utcnow(),
            ),
        )
        row = await self.db.fetchone("SELECT * FROM reward_actions WHERE id=?", (row_id,)) or {}
        if row:
            try:
                row["action_payload"] = json.loads(row["action_payload"])
            except Exception:
                row["action_payload"] = {}
        return row

    async def matching_reward_action(self, reward_title: str) -> dict[str, Any] | None:
        row = await self.db.fetchone(
            "SELECT * FROM reward_actions WHERE lower(reward_title)=lower(?) AND enabled=1",
            (reward_title.strip(),),
        )
        if row:
            try:
                row["action_payload"] = json.loads(row["action_payload"])
            except Exception:
                row["action_payload"] = {}
        return row

    async def log_moderation(
        self,
        user_id: str,
        display_name: str,
        reason: str,
        action: str,
        message: str,
    ) -> None:
        await self.db.execute(
            """
            INSERT INTO moderation_log(user_id,display_name,reason,action,message,created_at)
            VALUES(?,?,?,?,?,?)
            """,
            (user_id, display_name, reason, action, message[:500], utcnow()),
        )


class _SafeFormat(dict[str, str]):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"
