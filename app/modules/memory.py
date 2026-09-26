from __future__ import annotations

from typing import Any

from app.database import Database


class MemoryModule:
    def __init__(self, db: Database, vector_memory: Any | None = None):
        self.db = db
        self.vector_memory = vector_memory

    async def context(self, viewer: dict, *, query: str = "") -> str:
        memories = await self.db.memories_for(viewer["user_id"], limit=6)
        parts = [
            f"niveau {viewer.get('level', 1)}",
            f"{viewer.get('message_count', 0)} messages",
            f"{viewer.get('points', 0)} Écumes",
        ]
        if memories:
            parts.append("faits mémorisés : " + "; ".join(item["content"] for item in memories))

        if query and self.vector_memory is not None and self.vector_memory.enabled:
            user_rows = await self.vector_memory.search(
                query,
                namespaces=["viewer-memory", "conversation"],
                owner=str(viewer["user_id"]),
                limit=4,
            )
            cognitive_rows = await self.vector_memory.search(
                query,
                namespaces=["lesson", "reflection", "intention"],
                owner="",
                limit=4,
            )
            seen: set[str] = set()
            recalled: list[str] = []
            for row in [*user_rows, *cognitive_rows]:
                content = " ".join(str(row.get("content") or "").split())
                if not content or content.casefold() in seen:
                    continue
                seen.add(content.casefold())
                recalled.append(content[:500])
            if recalled:
                parts.append(
                    "rappels sémantiques pertinents : "
                    + " ; ".join(recalled[:6])
                )
        return ", ".join(parts)

    async def conversation(self, user_id: str, limit: int = 12) -> list[dict[str, str]]:
        rows = await self.db.conversation_for(user_id, limit=limit)
        return [{"role": str(row["role"]), "content": str(row["content"])} for row in rows]

    async def remember_turn(self, user_id: str, role: str, content: str) -> None:
        message_id = await self.db.add_conversation_message(user_id, role, content)
        if (
            message_id
            and self.vector_memory is not None
            and self.vector_memory.enabled
        ):
            await self.vector_memory.upsert(
                f"conversation:{message_id}",
                "conversation",
                content,
                owner=user_id,
                metadata={"role": role},
                importance=0.48 if role == "user" else 0.42,
            )

    async def reset_conversation(self, user_id: str) -> None:
        await self.db.clear_conversation(user_id)
        if self.vector_memory is not None:
            await self.vector_memory.delete_owner(user_id)

    async def set_opt_in(self, user_id: str, enabled: bool) -> None:
        await self.db.execute(
            "UPDATE viewers SET memory_opt_in=? WHERE user_id=?",
            (1 if enabled else 0, user_id),
        )
        if not enabled:
            await self.db.clear_viewer_memory(user_id)
            await self.db.clear_conversation(user_id)
            if self.vector_memory is not None:
                await self.vector_memory.delete_owner(user_id)
