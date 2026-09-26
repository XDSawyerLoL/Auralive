from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import re
import sqlite3
import struct
from pathlib import Path
from typing import Any

from app.database import Database, utcnow

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[\wÀ-ÿ'-]{2,}", re.UNICODE)


class VectorMemory:
    """Mémoire sémantique locale avec sqlite-vec optionnel et fallback exact Python."""

    VERSION = "aura-vector-memory-v0.3"

    def __init__(self, db: Database, ai: Any, settings: Any):
        self.db = db
        self.ai = ai
        self.settings = settings
        self.path = Path(getattr(settings, "vector_memory_path", "data/aura_vector.db"))
        self.dimensions = max(64, min(int(getattr(settings, "vector_dimensions", 768) or 768), 4096))
        self.task: asyncio.Task[None] | None = None
        self.started = False
        self.sqlite_vec_available = False
        self.sqlite_vec_version = ""
        self.last_embedding_backend = ""
        self.last_sync_at = ""
        self.last_search_at = ""
        self.last_error = ""
        self.items_indexed = 0

    @property
    def enabled(self) -> bool:
        return bool(getattr(self.settings, "vector_memory_enabled", True))

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=20)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        try:
            import sqlite_vec  # type: ignore

            connection.enable_load_extension(True)
            sqlite_vec.load(connection)
            connection.enable_load_extension(False)
            self.sqlite_vec_available = True
            row = connection.execute("SELECT vec_version() AS version").fetchone()
            self.sqlite_vec_version = str(row["version"] if row else "")
        except Exception as exc:  # noqa: BLE001
            self.sqlite_vec_available = False
            self.sqlite_vec_version = ""
            logger.debug("sqlite-vec indisponible, fallback Python: %s", exc)
        return connection

    def _initialize_sync(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS aura_vector_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_key TEXT NOT NULL UNIQUE,
                    namespace TEXT NOT NULL,
                    owner TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    embedding BLOB NOT NULL,
                    dimensions INTEGER NOT NULL,
                    importance REAL NOT NULL DEFAULT 0.5,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_aura_vector_namespace_owner
                ON aura_vector_items(namespace, owner, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_aura_vector_source
                ON aura_vector_items(source_key);
                """
            )
            if self.sqlite_vec_available:
                conn.execute(
                    f"""CREATE VIRTUAL TABLE IF NOT EXISTS aura_vector_index USING vec0(
                        embedding float[{self.dimensions}] distance_metric=cosine
                    )"""
                )

    async def start(self) -> None:
        if self.started or not self.enabled:
            return
        self.started = True
        await asyncio.to_thread(self._initialize_sync)
        self.task = asyncio.create_task(self._sync_loop(), name="aura-vector-memory-sync")

    async def close(self) -> None:
        self.started = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None

    async def _sync_loop(self) -> None:
        interval = max(15, min(int(getattr(self.settings, "vector_sync_seconds", 45) or 45), 3600))
        while self.started:
            try:
                await self.sync_sources()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"{exc.__class__.__name__}: {exc}"[:800]
            await asyncio.sleep(interval)

    def _hashed_embedding(self, text: str) -> list[float]:
        """Fallback local sans modèle : feature hashing lexical borné et déterministe."""
        vector = [0.0] * self.dimensions
        tokens = _TOKEN_RE.findall(str(text or "").casefold())
        for token in tokens[:4096]:
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=16).digest()
            index = int.from_bytes(digest[:8], "little") % self.dimensions
            sign = -1.0 if digest[8] & 1 else 1.0
            vector[index] += sign * (1.0 + min(len(token), 24) / 24.0)
        norm = math.sqrt(sum(value * value for value in vector))
        return [value / norm for value in vector] if norm else vector

    def _normalize_embedding(self, values: list[float]) -> list[float]:
        row = [float(value) for value in values[: self.dimensions]]
        if len(row) < self.dimensions:
            row.extend([0.0] * (self.dimensions - len(row)))
        if any(not math.isfinite(value) for value in row):
            raise ValueError("Embedding non fini")
        return row

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        clean = [" ".join(str(text or "").split())[:12000] for text in texts]
        try:
            rows = await self.ai.embed(
                clean,
                model=str(getattr(self.settings, "vector_embedding_model", "embeddinggemma") or "embeddinggemma"),
                dimensions=self.dimensions,
            )
            if len(rows) != len(clean):
                raise RuntimeError("Nombre d'embeddings incohérent")
            self.last_embedding_backend = "ollama"
            self.last_error = ""
            return [self._normalize_embedding(row) for row in rows]
        except Exception as exc:  # noqa: BLE001
            self.last_embedding_backend = "feature-hash-fallback"
            self.last_error = f"{exc.__class__.__name__}: {exc}"[:800]
            return [self._hashed_embedding(text) for text in clean]

    @staticmethod
    def _blob(vector: list[float]) -> bytes:
        return struct.pack(f"<{len(vector)}f", *vector)

    @staticmethod
    def _unblob(blob: bytes) -> tuple[float, ...]:
        if not blob:
            return ()
        return struct.unpack(f"<{len(blob) // 4}f", blob)

    def _upsert_sync(
        self,
        source_key: str,
        namespace: str,
        owner: str,
        content: str,
        metadata: dict[str, Any],
        embedding: list[float],
        importance: float,
    ) -> int:
        stamp = utcnow()
        blob = self._blob(embedding)
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id,created_at FROM aura_vector_items WHERE source_key=?",
                (source_key,),
            ).fetchone()
            created_at = str(existing["created_at"]) if existing else stamp
            conn.execute(
                """
                INSERT INTO aura_vector_items(
                    source_key,namespace,owner,content,metadata,embedding,dimensions,
                    importance,created_at,updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(source_key) DO UPDATE SET
                    namespace=excluded.namespace,
                    owner=excluded.owner,
                    content=excluded.content,
                    metadata=excluded.metadata,
                    embedding=excluded.embedding,
                    dimensions=excluded.dimensions,
                    importance=excluded.importance,
                    updated_at=excluded.updated_at
                """,
                (
                    source_key[:240],
                    namespace[:80],
                    owner[:160],
                    content[:12000],
                    json.dumps(metadata or {}, ensure_ascii=False)[:24000],
                    blob,
                    self.dimensions,
                    max(0.0, min(float(importance), 1.0)),
                    created_at,
                    stamp,
                ),
            )
            row = conn.execute(
                "SELECT id FROM aura_vector_items WHERE source_key=?",
                (source_key[:240],),
            ).fetchone()
            rowid = int(row["id"])
            if self.sqlite_vec_available:
                conn.execute("DELETE FROM aura_vector_index WHERE rowid=?", (rowid,))
                conn.execute(
                    "INSERT INTO aura_vector_index(rowid,embedding) VALUES(?,?)",
                    (rowid, blob),
                )
            return rowid

    async def upsert(
        self,
        source_key: str,
        namespace: str,
        content: str,
        *,
        owner: str = "",
        metadata: dict[str, Any] | None = None,
        importance: float = 0.5,
    ) -> int:
        text = " ".join(str(content or "").split())
        if not text:
            raise ValueError("Contenu vectoriel vide")
        embedding = (await self._embed([text]))[0]
        rowid = await asyncio.to_thread(
            self._upsert_sync,
            str(source_key),
            str(namespace),
            str(owner),
            text,
            dict(metadata or {}),
            embedding,
            importance,
        )
        self.items_indexed += 1
        return rowid

    def _search_sync(
        self,
        query_embedding: list[float],
        namespaces: list[str],
        owner: str | None,
        limit: int,
    ) -> list[dict[str, Any]]:
        blob = self._blob(query_embedding)
        clauses = ["dimensions=?"]
        params: list[Any] = [self.dimensions]
        if namespaces:
            placeholders = ",".join("?" for _ in namespaces)
            clauses.append(f"namespace IN ({placeholders})")
            params.extend(namespaces)
        if owner is not None:
            clauses.append("owner=?")
            params.append(owner)
        where = " AND ".join(clauses)
        with self._connect() as conn:
            if self.sqlite_vec_available:
                rows = conn.execute(
                    f"""
                    SELECT id,source_key,namespace,owner,content,metadata,importance,
                           vec_distance_cosine(embedding, ?) AS distance
                    FROM aura_vector_items
                    WHERE {where}
                    ORDER BY distance ASC, importance DESC
                    LIMIT ?
                    """,
                    (blob, *params, limit),
                ).fetchall()
                return [
                    {
                        **dict(row),
                        "metadata": json.loads(row["metadata"] or "{}"),
                        "similarity": round(1.0 - max(0.0, min(float(row["distance"] or 0), 2.0)), 6),
                    }
                    for row in rows
                ]

            candidates = conn.execute(
                f"""SELECT id,source_key,namespace,owner,content,metadata,importance,embedding
                    FROM aura_vector_items WHERE {where}
                    ORDER BY importance DESC,updated_at DESC LIMIT 4000""",
                tuple(params),
            ).fetchall()
        qnorm = math.sqrt(sum(value * value for value in query_embedding)) or 1.0
        scored: list[dict[str, Any]] = []
        for row in candidates:
            vector = self._unblob(row["embedding"])
            dot = sum(a * b for a, b in zip(query_embedding, vector))
            vnorm = math.sqrt(sum(value * value for value in vector)) or 1.0
            similarity = dot / (qnorm * vnorm)
            scored.append(
                {
                    "id": row["id"],
                    "source_key": row["source_key"],
                    "namespace": row["namespace"],
                    "owner": row["owner"],
                    "content": row["content"],
                    "metadata": json.loads(row["metadata"] or "{}"),
                    "importance": row["importance"],
                    "similarity": round(similarity, 6),
                }
            )
        scored.sort(key=lambda item: (item["similarity"], item["importance"]), reverse=True)
        return scored[:limit]

    async def search(
        self,
        query: str,
        *,
        namespaces: list[str] | None = None,
        owner: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        text = " ".join(str(query or "").split())
        if not text or not self.enabled:
            return []
        embedding = (await self._embed([text]))[0]
        rows = await asyncio.to_thread(
            self._search_sync,
            embedding,
            list(namespaces or []),
            owner,
            max(1, min(int(limit or getattr(self.settings, "vector_top_k", 6)), 20)),
        )
        self.last_search_at = utcnow()
        return rows

    async def delete_owner(
        self,
        owner: str,
        *,
        namespaces: list[str] | None = None,
    ) -> None:
        wanted = str(owner or "")
        if not wanted:
            return
        scoped = [str(item) for item in (namespaces or []) if str(item).strip()]

        def _delete() -> None:
            clauses = ["owner=?"]
            params: list[Any] = [wanted]
            if scoped:
                placeholders = ",".join("?" for _ in scoped)
                clauses.append(f"namespace IN ({placeholders})")
                params.extend(scoped)
            where = " AND ".join(clauses)
            with self._connect() as conn:
                ids = [
                    int(row["id"])
                    for row in conn.execute(
                        f"SELECT id FROM aura_vector_items WHERE {where}",
                        tuple(params),
                    ).fetchall()
                ]
                if self.sqlite_vec_available:
                    for rowid in ids:
                        conn.execute("DELETE FROM aura_vector_index WHERE rowid=?", (rowid,))
                conn.execute(
                    f"DELETE FROM aura_vector_items WHERE {where}",
                    tuple(params),
                )

        await asyncio.to_thread(_delete)

    async def _safe_rows(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        try:
            return await self.db.fetchall(query, params)
        except Exception:
            return []

    async def sync_sources(self) -> dict[str, int]:
        if not self.enabled:
            return {}
        sources: list[tuple[str, str, str, str, dict[str, Any], float]] = []

        for row in await self._safe_rows(
            "SELECT id,user_id,kind,content,created_at FROM memories ORDER BY id DESC LIMIT 1000"
        ):
            sources.append((
                f"viewer-memory:{row['id']}",
                "viewer-memory",
                str(row["user_id"]),
                str(row["content"]),
                {"kind": row["kind"], "created_at": row["created_at"]},
                0.8,
            ))

        for row in await self._safe_rows(
            """SELECT id,user_id,role,content,created_at FROM ai_conversation_messages
               ORDER BY id DESC LIMIT 1600"""
        ):
            sources.append((
                f"conversation:{row['id']}",
                "conversation",
                str(row["user_id"]),
                str(row["content"]),
                {"role": row["role"], "created_at": row["created_at"]},
                0.48 if row["role"] == "user" else 0.42,
            ))

        for row in await self._safe_rows(
            "SELECT id,lesson_key,content,confidence,source,updated_at FROM aura_lessons ORDER BY updated_at DESC LIMIT 1000"
        ):
            sources.append((
                f"lesson:{row['id']}",
                "lesson",
                "",
                str(row["content"]),
                {
                    "lesson_key": row["lesson_key"],
                    "confidence": row["confidence"],
                    "source": row["source"],
                    "updated_at": row["updated_at"],
                },
                max(0.5, min(float(row["confidence"] or 0.5), 1.0)),
            ))

        for row in await self._safe_rows(
            """SELECT id,title,summary,hypothesis,next_action,confidence,created_at
               FROM aura_reflections ORDER BY created_at DESC LIMIT 600"""
        ):
            content = " | ".join(
                str(row.get(key) or "")
                for key in ("title", "summary", "hypothesis", "next_action")
                if str(row.get(key) or "").strip()
            )
            sources.append((
                f"reflection:{row['id']}",
                "reflection",
                "",
                content,
                {"confidence": row["confidence"], "created_at": row["created_at"]},
                max(0.4, min(float(row["confidence"] or 0.5), 1.0)),
            ))

        for row in await self._safe_rows(
            """SELECT id,statement,priority,status,source,updated_at FROM aura_intentions
               WHERE status='active' ORDER BY priority DESC,updated_at DESC LIMIT 300"""
        ):
            sources.append((
                f"intention:{row['id']}",
                "intention",
                "",
                str(row["statement"]),
                {"priority": row["priority"], "source": row["source"], "updated_at": row["updated_at"]},
                max(0.5, min(float(row["priority"] or 0.5), 1.0)),
            ))

        unique: dict[str, tuple[str, str, str, str, dict[str, Any], float]] = {
            row[0]: row for row in sources if row[3].strip()
        }
        batch = list(unique.values())
        batch_size = 32
        for offset in range(0, len(batch), batch_size):
            part = batch[offset: offset + batch_size]
            embeddings = await self._embed([row[3] for row in part])
            for source, embedding in zip(part, embeddings):
                await asyncio.to_thread(
                    self._upsert_sync,
                    source[0],
                    source[1],
                    source[2],
                    source[3],
                    source[4],
                    embedding,
                    source[5],
                )
        self.items_indexed = len(batch)
        self.last_sync_at = utcnow()
        return {
            "indexed": len(batch),
            "viewer": sum(1 for row in batch if row[2]),
            "cognitive": sum(1 for row in batch if not row[2]),
        }

    async def status(self) -> dict[str, Any]:
        def _count() -> int:
            if not self.path.exists():
                return 0
            with self._connect() as conn:
                row = conn.execute("SELECT COUNT(*) AS count FROM aura_vector_items").fetchone()
                return int(row["count"] if row else 0)

        count = await asyncio.to_thread(_count)
        return {
            "version": self.VERSION,
            "enabled": self.enabled,
            "started": self.started,
            "path": str(self.path),
            "dimensions": self.dimensions,
            "embedding_model": str(getattr(self.settings, "vector_embedding_model", "")),
            "embedding_backend": self.last_embedding_backend,
            "sqlite_vec": self.sqlite_vec_available,
            "sqlite_vec_version": self.sqlite_vec_version,
            "items": count,
            "last_sync_at": self.last_sync_at,
            "last_search_at": self.last_search_at,
            "last_error": self.last_error,
        }
