from __future__ import annotations

from app.database import Database


class MemoryModule:
    def __init__(self, db: Database):
        self.db = db

    async def context(self, viewer: dict) -> str:
        memories = await self.db.memories_for(viewer["user_id"], limit=6)
        parts = [
            f"niveau {viewer.get('level', 1)}",
            f"{viewer.get('message_count', 0)} messages",
            f"{viewer.get('points', 0)} Écumes",
        ]
        if memories:
            parts.append("faits mémorisés : " + "; ".join(item["content"] for item in memories))
        return ", ".join(parts)

    async def conversation(self, user_id: str, limit: int = 12) -> list[dict[str, str]]:
        rows = await self.db.conversation_for(user_id, limit=limit)
        return [{"role": str(row["role"]), "content": str(row["content"])} for row in rows]

    async def remember_turn(self, user_id: str, role: str, content: str) -> None:
        await self.db.add_conversation_message(user_id, role, content)

    async def reset_conversation(self, user_id: str) -> None:
        await self.db.clear_conversation(user_id)

    async def set_opt_in(self, user_id: str, enabled: bool) -> None:
        await self.db.execute(
            "UPDATE viewers SET memory_opt_in=? WHERE user_id=?",
            (1 if enabled else 0, user_id),
        )
        if not enabled:
            await self.db.clear_viewer_memory(user_id)
            await self.db.clear_conversation(user_id)
