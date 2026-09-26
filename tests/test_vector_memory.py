from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.database import Database
from app.services.vector_memory import VectorMemory


class FakeEmbeddingAI:
    async def embed(self, inputs, *, model="", dimensions=None):
        rows = []
        for text in list(inputs if isinstance(inputs, list) else [inputs]):
            vector = [0.0] * int(dimensions or 64)
            lowered = str(text).casefold()
            if "pirate" in lowered or "équipage" in lowered:
                vector[1] = 1.0
            elif "galax" in lowered or "astronom" in lowered:
                vector[2] = 1.0
            else:
                vector[3] = 1.0
            rows.append(vector)
        return rows


def settings(tmp_path):
    return SimpleNamespace(
        vector_memory_path=tmp_path / "vector.db",
        vector_dimensions=64,
        vector_memory_enabled=True,
        vector_sync_seconds=3600,
        vector_top_k=5,
        vector_embedding_model="fake-embedding",
    )


@pytest.mark.asyncio
async def test_vector_memory_finds_semantic_owner_context(tmp_path):
    db = Database(tmp_path / "primary.db")
    await db.initialize()
    memory = VectorMemory(db, FakeEmbeddingAI(), settings(tmp_path))
    await memory.start()
    try:
        await memory.upsert(
            "conversation:1",
            "conversation",
            "Le code pirate protège l'équipage.",
            owner="viewer-1",
        )
        await memory.upsert(
            "conversation:2",
            "conversation",
            "Les galaxies lointaines sont observées au télescope.",
            owner="viewer-1",
        )
        await memory.upsert(
            "conversation:3",
            "conversation",
            "Un autre équipage parle de pirates.",
            owner="viewer-2",
        )

        rows = await memory.search(
            "parle-moi du pirate",
            namespaces=["conversation"],
            owner="viewer-1",
            limit=2,
        )
        assert rows
        assert rows[0]["source_key"] == "conversation:1"
        assert all(row["owner"] == "viewer-1" for row in rows)
    finally:
        await memory.close()


@pytest.mark.asyncio
async def test_conversation_deletion_can_be_scoped_without_erasing_long_term_memory(tmp_path):
    db = Database(tmp_path / "primary.db")
    await db.initialize()
    memory = VectorMemory(db, FakeEmbeddingAI(), settings(tmp_path))
    await memory.start()
    try:
        await memory.upsert("conversation:1", "conversation", "souvenir court pirate", owner="viewer-1")
        await memory.upsert("viewer-memory:1", "viewer-memory", "souvenir long pirate", owner="viewer-1")

        await memory.delete_owner("viewer-1", namespaces=["conversation"])

        conversation = await memory.search(
            "pirate", namespaces=["conversation"], owner="viewer-1", limit=5
        )
        long_term = await memory.search(
            "pirate", namespaces=["viewer-memory"], owner="viewer-1", limit=5
        )
        assert conversation == []
        assert len(long_term) == 1
    finally:
        await memory.close()
