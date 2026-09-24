from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.automation.models import ActionSpec, Automation, Event, ExecutionReport
from app.cognitive.native_cognition import NativeCognitionEngine
from app.cognitive.organism import AuraOrganism
from app.database import Database, utcnow

logger = logging.getLogger(__name__)


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, float(value)))


def _json_object(value: str) -> dict[str, Any]:
    text = str(value or "").strip()
    text = re.sub(r"^\x60\x60\x60(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*\x60\x60\x60$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


class CognitiveKernel:
    """Noyau unifié d'AURA.

    Cette couche réunit les mécanismes historiques Soul/ambient/routines/agents
    avec le runtime moderne Automation Studio + HORIZON. Elle apprend par
    résultats et mémorise des leçons, mais ne modifie jamais silencieusement
    le code de production.
    """

    VERSION = "aura-unified-kernel-v2"

    AGENT_ROLES = {
        "planner": (
            "Tu es l'agent planificateur d'AURA. Découpe la mission en étapes "
            "courtes, vérifiables et exécutables. Repère dépendances et points de contrôle."
        ),
        "research": (
            "Tu es l'agent recherche d'AURA. Sépare les faits des hypothèses, "
            "compare les éléments disponibles et signale clairement ce qui manque."
        ),
        "dev": (
            "Tu es l'agent développement d'AURA. Analyse architecture, bugs, tests "
            "et propose le changement minimal robuste, avec stratégie de validation et rollback."
        ),
        "security": (
            "Tu es l'agent sécurité d'AURA. Cherche les escalades de privilèges, "
            "les actions irréversibles, les fuites de secrets et les garde-fous utiles."
        ),
        "operator": (
            "Tu es l'agent opérateur d'AURA. Transforme le but en actions concrètes "
            "en privilégiant les capacités déjà enregistrées dans Automation Studio."
        ),
        "critic": (
            "Tu es l'agent critique d'AURA. Cherche les contradictions, hypothèses "
            "fragiles et raisons pour lesquelles le plan pourrait échouer."
        ),
    }

    def __init__(
        self,
        aura: Any,
        db: Database,
        automation: Any,
        horizon: Any,
        settings: Any,
    ):
        self.aura = aura
        self.db = db
        self.automation = automation
        self.horizon = horizon
        self.settings = settings
        self.native_cognition = NativeCognitionEngine()
        self.organism = AuraOrganism()
        self.started = False
        self.task: asyncio.Task[None] | None = None
        self._wired = False
        self._tick_lock = asyncio.Lock()
        self._stimuli: deque[dict[str, Any]] = deque(maxlen=120)
        self._last_reflection_monotonic = 0.0
        self._last_improvement_review = 0.0
        self._soul_cache: dict[str, Any] = {}
        self.last_error = ""
        self.last_tick_at = ""
        self.last_reflection_at = ""

    @property
    def enabled(self) -> bool:
        return bool(getattr(self.settings, "cognitive_enabled", True))

    @property
    def tick_seconds(self) -> int:
        return max(5, int(getattr(self.settings, "cognitive_tick_seconds", 30)))

    @property
    def reflection_seconds(self) -> int:
        return max(30, int(getattr(self.settings, "cognitive_reflection_seconds", 300)))

    @property
    def max_reflections_per_hour(self) -> int:
        return max(1, min(int(getattr(self.settings, "cognitive_max_reflections_per_hour", 6)), 60))

    @property
    def operator_allowed_risks(self) -> set[str]:
        raw = str(
            getattr(
                self.settings,
                "cognitive_operator_allowed_risks",
                "safe,ai",
            )
            or "safe,ai"
        )
        return {item.strip().casefold() for item in raw.split(",") if item.strip()}

    async def initialize(self) -> None:
        await self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS aura_soul_state (
                id INTEGER PRIMARY KEY CHECK(id=1),
                state TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS aura_cognitive_traces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                context TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_aura_cognitive_traces_created
            ON aura_cognitive_traces(created_at DESC);

            CREATE TABLE IF NOT EXISTS aura_reflections (
                id TEXT PRIMARY KEY,
                trigger TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                hypothesis TEXT NOT NULL DEFAULT '',
                next_action TEXT NOT NULL DEFAULT '',
                confidence REAL NOT NULL DEFAULT 0.0,
                context TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_aura_reflections_created
            ON aura_reflections(created_at DESC);

            CREATE TABLE IF NOT EXISTS aura_intentions (
                id TEXT PRIMARY KEY,
                statement TEXT NOT NULL,
                priority REAL NOT NULL DEFAULT 0.5,
                status TEXT NOT NULL DEFAULT 'active',
                source TEXT NOT NULL DEFAULT 'aura',
                context TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_aura_intentions_status
            ON aura_intentions(status, priority DESC, updated_at DESC);

            CREATE TABLE IF NOT EXISTS aura_lessons (
                id TEXT PRIMARY KEY,
                lesson_key TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 0.5,
                evidence_count INTEGER NOT NULL DEFAULT 1,
                source TEXT NOT NULL DEFAULT 'experience',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS aura_routines (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                prompt TEXT NOT NULL,
                every_seconds INTEGER NOT NULL,
                mode TEXT NOT NULL DEFAULT 'reflect',
                enabled INTEGER NOT NULL DEFAULT 1,
                last_run_at REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS aura_outcomes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                automation_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                ok INTEGER NOT NULL,
                signature TEXT NOT NULL,
                report TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_aura_outcomes_automation
            ON aura_outcomes(automation_id, ok, created_at DESC);

            CREATE TABLE IF NOT EXISTS aura_improvement_proposals (
                id TEXT PRIMARY KEY,
                target TEXT NOT NULL,
                diagnosis TEXT NOT NULL,
                proposal TEXT NOT NULL,
                validation_plan TEXT NOT NULL DEFAULT '',
                risk TEXT NOT NULL DEFAULT 'review',
                status TEXT NOT NULL DEFAULT 'proposed',
                evidence_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_aura_improvements_status
            ON aura_improvement_proposals(status, updated_at DESC);

            CREATE TABLE IF NOT EXISTS aura_cloud_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user','assistant')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS aura_organism_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                reason TEXT NOT NULL DEFAULT '',
                payload TEXT NOT NULL DEFAULT '{}',
                state TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_aura_organism_events_created
            ON aura_organism_events(created_at DESC);
            """
        )
        routine_columns = await self.db.fetchall("PRAGMA table_info(aura_routines)")
        if not any(str(row.get("name") or "") == "mode" for row in routine_columns):
            await self.db.execute(
                "ALTER TABLE aura_routines ADD COLUMN mode TEXT NOT NULL DEFAULT 'reflect'"
            )

        row = await self.db.fetchone("SELECT state FROM aura_soul_state WHERE id=1")
        if row:
            try:
                self._soul_cache = json.loads(row["state"])
            except json.JSONDecodeError:
                self._soul_cache = {}
        if not self._soul_cache:
            self._soul_cache = self._default_soul()

        self._soul_cache["organism"] = self.organism.migrate(self._soul_cache)
        self._sync_legacy_from_organism()
        await self._save_soul()

    def _default_soul(self) -> dict[str, Any]:
        now = utcnow()
        organism = self.organism.default_state(now=now)
        metrics = self.organism.legacy_metrics(organism)
        return {
            "name": "AURA",
            "kernel_version": self.VERSION,
            "seed": str(uuid4()),
            "born_at": now,
            "phase": "genesis",
            "cycles": 0,
            **metrics,
            "introspection": 0.68,
            "openness": 0.72,
            "reactivity": 0.58,
            "playfulness": 0.52,
            "dominant_thought": "Maintenir une présence utile sans produire de bruit.",
            "current_intention": "Observer, comprendre, anticiper et n'agir qu'avec une autorité suffisante.",
            "organism": organism,
            "last_tick_at": "",
            "last_reflection_at": "",
        }

    def _sync_legacy_from_organism(self) -> None:
        organism = self.organism.migrate(self._soul_cache)
        self._soul_cache["organism"] = organism
        self._soul_cache.update(self.organism.legacy_metrics(organism))
        self._soul_cache["mood"] = str(organism.get("mood") or "calme")
        self._soul_cache["active_intention"] = str(
            organism.get("intention_active") or "observer"
        )

    async def _record_organism_event(
        self,
        kind: str,
        *,
        reason: str = "",
        payload: dict[str, Any] | None = None,
    ) -> None:
        organism = self.organism.migrate(self._soul_cache)
        await self.db.execute(
            """
            INSERT INTO aura_organism_events(kind,reason,payload,state,created_at)
            VALUES(?,?,?,?,?)
            """,
            (
                str(kind)[:80],
                str(reason)[:500],
                json.dumps(payload or {}, ensure_ascii=False, default=str)[:16000],
                json.dumps(organism, ensure_ascii=False, default=str)[:30000],
                utcnow(),
            ),
        )
        await self.db.execute(
            """
            DELETE FROM aura_organism_events
            WHERE id IN (
                SELECT id FROM aura_organism_events
                ORDER BY id DESC LIMIT -1 OFFSET 5000
            )
            """
        )

    async def organism_state(self, *, public: bool = False) -> dict[str, Any]:
        state = self.organism.migrate(self._soul_cache)
        return self.organism.public_state(state) if public else state

    async def import_organism_state(self, candidate: dict[str, Any]) -> bool:
        if not isinstance(candidate, dict) or not candidate:
            return False
        current = self.organism.migrate(self._soul_cache)
        current_at = str(current.get("updated_at") or "")
        candidate_at = str(candidate.get("updated_at") or "")
        if current_at and candidate_at and candidate_at <= current_at:
            return False
        self._soul_cache["organism"] = self.organism.migrate({"organism": candidate})
        self._sync_legacy_from_organism()
        await self._save_soul()
        await self._record_organism_event("sync", reason="synchronisation organisme")
        return True

    async def start(self) -> None:
        if self.started:
            return
        await self.initialize()
        if not self._wired:
            self.automation.add_event_listener(self.observe_event)
            self.automation.engine.add_listener(self.observe_report)
            self.automation.engine.set_service("cognitive", self)
            self._wired = True
        self.started = True
        if self.enabled:
            self.task = asyncio.create_task(self._loop(), name="aura-cognitive-kernel")
        logger.info("Noyau cognitif AURA actif: %s", self.VERSION)

    async def close(self) -> None:
        self.started = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None
        await self._save_soul()

    async def _loop(self) -> None:
        while self.started:
            try:
                await asyncio.sleep(self.tick_seconds)
                await self.run_due_routines()
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"{exc.__class__.__name__}: {exc}"[:500]
                logger.exception("Boucle cognitive AURA en erreur")

    async def _save_soul(self) -> None:
        now = utcnow()
        await self.db.execute(
            """
            INSERT INTO aura_soul_state(id,state,updated_at) VALUES(1,?,?)
            ON CONFLICT(id) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at
            """,
            (json.dumps(self._soul_cache, ensure_ascii=False), now),
        )

    async def soul(self) -> dict[str, Any]:
        if not self._soul_cache:
            await self.initialize()
        return dict(self._soul_cache)

    def _phase_for_cycles(self, cycles: int) -> str:
        if cycles < 100:
            return "genesis"
        if cycles < 1000:
            return "growth"
        if cycles < 10000:
            return "integration"
        return "mature"

    def _adjust_soul(self, **deltas: float) -> None:
        for key, delta in deltas.items():
            if key in self._soul_cache and isinstance(self._soul_cache[key], (int, float)):
                self._soul_cache[key] = round(_clamp(float(self._soul_cache[key]) + delta), 4)
        # Les anciennes jauges restent compatibles, mais l'organisme devient la
        # source principale dès qu'une transition homeostatique est appliquée.

    async def _trace(
        self,
        kind: str,
        title: str,
        content: str = "",
        context: dict[str, Any] | None = None,
    ) -> None:
        await self.db.execute(
            """
            INSERT INTO aura_cognitive_traces(kind,title,content,context,created_at)
            VALUES(?,?,?,?,?)
            """,
            (
                str(kind)[:80],
                str(title)[:240],
                str(content)[:4000],
                json.dumps(context or {}, ensure_ascii=False, default=str)[:12000],
                utcnow(),
            ),
        )
        await self.db.execute(
            """
            DELETE FROM aura_cognitive_traces
            WHERE id IN (
                SELECT id FROM aura_cognitive_traces
                ORDER BY id DESC LIMIT -1 OFFSET 4000
            )
            """
        )

    async def observe_event(self, event: Event) -> None:
        important = (
            event.source in {"horizon", "system", "cognitive"}
            or event.type.startswith("horizon.")
            or event.type.startswith("stream.")
            or event.type.startswith("aura.")
            or event.type.startswith("obs.")
        )
        stimulus = {
            "type": event.type,
            "source": event.source,
            "occurred_at": event.occurred_at,
            "payload": dict(event.payload),
        }
        # Les événements produits par la cognition elle-même sont auditables,
        # mais ne doivent jamais la réveiller à nouveau : sinon AURA pourrait
        # entretenir une boucle de réflexion sans nouveau signal extérieur.
        if event.source != "cognitive":
            self._stimuli.append(stimulus)

        organism_result = self.organism.apply_event(
            self.organism.migrate(self._soul_cache),
            event.type,
            event.source,
        )
        self._soul_cache["organism"] = organism_result["state"]
        self._sync_legacy_from_organism()
        if organism_result.get("delta"):
            await self._record_organism_event(
                "event",
                reason=str(organism_result["state"].get("last_reason") or event.type),
                payload={
                    "event_type": event.type,
                    "source": event.source,
                    "delta": organism_result.get("delta") or {},
                },
            )
            await self._save_soul()

        if important:
            await self._trace(
                "event",
                event.type,
                str(event.payload.get("title") or event.payload.get("text") or "")[:1000],
                {"source": event.source, "event_id": event.id},
            )

    @staticmethod
    def _report_signature(report: ExecutionReport) -> str:
        failed = [step for step in report.steps if not step.ok]
        if not failed:
            return "success"
        first = failed[0]
        error = re.sub(r"\s+", " ", str(first.error or "unknown")).strip().casefold()
        return f"{first.action_type}:{error[:220]}"

    async def observe_report(self, report: ExecutionReport) -> None:
        signature = self._report_signature(report)
        payload = {
            "id": report.id,
            "automation_id": report.automation_id,
            "event_type": report.event_type,
            "ok": report.ok,
            "status": report.status.value,
            "reason": report.reason,
            "steps": [
                {
                    "action_type": step.action_type,
                    "ok": step.ok,
                    "error": step.error,
                    "attempts": step.attempts,
                    "duration_ms": step.duration_ms,
                }
                for step in report.steps
            ],
        }
        await self.db.execute(
            """
            INSERT INTO aura_outcomes(automation_id,event_type,ok,signature,report,created_at)
            VALUES(?,?,?,?,?,?)
            """,
            (
                report.automation_id,
                report.event_type,
                int(report.ok),
                signature,
                json.dumps(payload, ensure_ascii=False, default=str),
                report.finished_at or utcnow(),
            ),
        )
        await self.db.execute(
            """
            DELETE FROM aura_outcomes
            WHERE id IN (
                SELECT id FROM aura_outcomes
                ORDER BY id DESC LIMIT -1 OFFSET 5000
            )
            """
        )

        organism_result = self.organism.apply_outcome(
            self.organism.migrate(self._soul_cache),
            ok=bool(report.ok),
        )
        self._soul_cache["organism"] = organism_result["state"]
        self._sync_legacy_from_organism()
        await self._record_organism_event(
            "outcome",
            reason="action réussie" if report.ok else "action échouée",
            payload={
                "automation_id": report.automation_id,
                "event_type": report.event_type,
                "signature": signature,
                "ok": bool(report.ok),
                "delta": organism_result.get("delta") or {},
            },
        )
        await self._save_soul()

        if report.ok:
            return

        self._stimuli.append(
            {
                "type": "automation.failure",
                "source": "automation",
                "occurred_at": report.finished_at or utcnow(),
                "payload": {
                    "automation_id": report.automation_id,
                    "event_type": report.event_type,
                    "signature": signature,
                },
            }
        )
        row = await self.db.fetchone(
            """
            SELECT COUNT(*) AS total
            FROM aura_outcomes
            WHERE automation_id=? AND ok=0 AND signature=?
            """,
            (report.automation_id, signature),
        )
        count = int((row or {}).get("total") or 0)
        if count >= 3:
            await self.learn(
                lesson_key=f"failure:{report.automation_id}:{signature}",
                content=(
                    f"L'automatisation {report.automation_id} a échoué {count} fois avec "
                    f"la signature {signature}. Vérifier cette cause avant de répéter la même stratégie."
                ),
                confidence=min(0.95, 0.55 + count * 0.05),
                source="automation-outcomes",
            )

    async def learn(
        self,
        *,
        lesson_key: str,
        content: str,
        confidence: float = 0.6,
        source: str = "experience",
    ) -> dict[str, Any]:
        now = utcnow()
        existing = await self.db.fetchone(
            "SELECT evidence_count FROM aura_lessons WHERE lesson_key=?",
            (lesson_key,),
        )
        evidence_count = int((existing or {}).get("evidence_count") or 0) + 1
        await self.db.execute(
            """
            INSERT INTO aura_lessons(
                id,lesson_key,content,confidence,evidence_count,source,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(lesson_key) DO UPDATE SET
                content=excluded.content,
                confidence=MAX(aura_lessons.confidence, excluded.confidence),
                evidence_count=aura_lessons.evidence_count+1,
                source=excluded.source,
                updated_at=excluded.updated_at
            """,
            (
                str(uuid4()),
                lesson_key[:260],
                content[:4000],
                _clamp(confidence),
                evidence_count,
                source[:100],
                now,
                now,
            ),
        )
        self._adjust_soul(introspection=0.01, continuity=0.004)
        return {
            "lesson_key": lesson_key,
            "content": content,
            "confidence": _clamp(confidence),
            "evidence_count": evidence_count,
        }

    async def lessons(self, limit: int = 20) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            """
            SELECT lesson_key,content,confidence,evidence_count,source,updated_at
            FROM aura_lessons
            ORDER BY confidence DESC,evidence_count DESC,updated_at DESC
            LIMIT ?
            """,
            (max(1, min(int(limit), 100)),),
        )

    async def add_intention(
        self,
        statement: str,
        *,
        priority: float = 0.5,
        source: str = "user",
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = utcnow()
        intention_id = str(uuid4())
        await self.db.execute(
            """
            INSERT INTO aura_intentions(
                id,statement,priority,status,source,context,created_at,updated_at
            ) VALUES(?,?,?,'active',?,?,?,?)
            """,
            (
                intention_id,
                str(statement)[:3000],
                _clamp(priority),
                str(source)[:100],
                json.dumps(context or {}, ensure_ascii=False, default=str)[:12000],
                now,
                now,
            ),
        )
        self._soul_cache["current_intention"] = str(statement)[:500]
        await self._save_soul()
        return {"id": intention_id, "statement": statement, "priority": _clamp(priority), "status": "active"}

    async def intentions(self, limit: int = 30) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            """
            SELECT id,statement,priority,status,source,context,created_at,updated_at
            FROM aura_intentions
            WHERE status='active'
            ORDER BY priority DESC,updated_at DESC
            LIMIT ?
            """,
            (max(1, min(int(limit), 100)),),
        )

    async def complete_intention(self, intention_id: str) -> bool:
        row = await self.db.fetchone("SELECT id FROM aura_intentions WHERE id=?", (intention_id,))
        if not row:
            return False
        await self.db.execute(
            "UPDATE aura_intentions SET status='completed',updated_at=? WHERE id=?",
            (utcnow(), intention_id),
        )
        return True

    async def add_routine(
        self,
        name: str,
        prompt: str,
        every_seconds: int,
        *,
        mode: str = "reflect",
    ) -> dict[str, Any]:
        now = utcnow()
        routine_id = str(uuid4())
        interval = max(60, min(int(every_seconds), 31_536_000))
        normalized_mode = str(mode or "reflect").casefold()
        if normalized_mode not in {"reflect", "operate"}:
            raise ValueError("mode de routine inconnu: reflect ou operate attendu")
        await self.db.execute(
            """
            INSERT INTO aura_routines(
                id,name,prompt,every_seconds,mode,enabled,last_run_at,created_at,updated_at
            ) VALUES(?,?,?,?,?,1,0,?,?)
            ON CONFLICT(name) DO UPDATE SET
                prompt=excluded.prompt,
                every_seconds=excluded.every_seconds,
                mode=excluded.mode,
                enabled=1,
                updated_at=excluded.updated_at
            """,
            (
                routine_id,
                name[:160],
                prompt[:4000],
                interval,
                normalized_mode,
                now,
                now,
            ),
        )
        return {
            "name": name,
            "prompt": prompt,
            "every_seconds": interval,
            "mode": normalized_mode,
            "enabled": True,
        }

    async def routines(self) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            """
            SELECT id,name,prompt,every_seconds,mode,enabled,last_run_at,created_at,updated_at
            FROM aura_routines ORDER BY name
            """
        )

    async def run_due_routines(self) -> list[dict[str, Any]]:
        now = time.time()
        rows = await self.db.fetchall(
            """
            SELECT id,name,prompt,every_seconds,mode,last_run_at
            FROM aura_routines WHERE enabled=1
            ORDER BY name
            """
        )
        results: list[dict[str, Any]] = []
        for row in rows:
            if now - float(row.get("last_run_at") or 0) < int(row["every_seconds"]):
                continue
            await self.db.execute(
                "UPDATE aura_routines SET last_run_at=?,updated_at=? WHERE id=?",
                (now, utcnow(), row["id"]),
            )
            payload = {
                "routine_id": row["id"],
                "name": row["name"],
                "prompt": row["prompt"],
                "scheduled": True,
            }
            await self.automation.dispatch("aura.cognitive.routine", payload, source="cognitive")
            if str(row.get("mode") or "reflect") == "operate":
                outcome = await self.operate(
                    str(row["prompt"]),
                    max_steps=3,
                    requested_risks=self.operator_allowed_risks,
                    source=f"routine:{row['name']}",
                )
                results.append({"routine": row["name"], "mode": "operate", "outcome": outcome})
            else:
                reflection = await self.tick(
                    trigger=f"routine:{row['name']}",
                    text=str(row["prompt"]),
                    force=True,
                )
                results.append({"routine": row["name"], "mode": "reflect", "reflection": reflection})
        return results

    async def _reflection_count_last_hour(self) -> int:
        threshold = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        row = await self.db.fetchone(
            """
            SELECT COUNT(*) AS total
            FROM aura_reflections
            WHERE created_at >= ?
            """,
            (threshold,),
        )
        return int((row or {}).get("total") or 0)

    async def _context_bundle(self, extra_text: str = "") -> dict[str, Any]:
        horizon_context = ""
        if self.horizon is not None:
            try:
                horizon_context = await self.horizon.context_for_ai()
            except Exception:
                logger.debug("Contexte HORIZON indisponible pour le noyau", exc_info=True)

        lessons = await self.lessons(8)
        intentions = await self.intentions(8)
        traces = await self.db.fetchall(
            """
            SELECT kind,title,content,created_at
            FROM aura_cognitive_traces
            ORDER BY id DESC LIMIT 12
            """
        )
        outcomes = await self.db.fetchall(
            """
            SELECT automation_id,event_type,ok,signature,created_at
            FROM aura_outcomes
            ORDER BY id DESC LIMIT 16
            """
        )
        return {
            "soul": await self.soul(),
            "intentions": intentions,
            "lessons": lessons,
            "traces": traces,
            "outcomes": outcomes,
            "horizon": horizon_context,
            "stimuli": list(self._stimuli)[-12:],
            "extra_text": str(extra_text)[:4000],
        }

    async def tick(
        self,
        *,
        trigger: str = "ambient",
        text: str = "",
        force: bool = False,
    ) -> dict[str, Any]:
        if not self.enabled and not force:
            return {"ok": False, "skipped": True, "reason": "noyau cognitif désactivé"}
        if self._tick_lock.locked():
            return {
                "ok": True,
                "skipped": True,
                "reason": "un cycle cognitif est déjà en cours",
            }

        async with self._tick_lock:
            now_mono = time.monotonic()
            now_iso = utcnow()
            self.last_tick_at = now_iso
            self._soul_cache["cycles"] = int(self._soul_cache.get("cycles", 0)) + 1
            self._soul_cache["phase"] = self._phase_for_cycles(int(self._soul_cache["cycles"]))
            self._soul_cache["last_tick_at"] = now_iso

            # Homéostasie légère : l'état interne revient progressivement vers une
            # zone stable sans simuler des émotions humaines.
            self._soul_cache["energy"] = round(
                _clamp(float(self._soul_cache.get("energy", 0.7)) + (0.7 - float(self._soul_cache.get("energy", 0.7))) * 0.03),
                4,
            )
            self._soul_cache["pressure"] = round(
                _clamp(float(self._soul_cache.get("pressure", 0.2)) * 0.96),
                4,
            )

            due_by_time = now_mono - self._last_reflection_monotonic >= self.reflection_seconds
            has_stimulus = bool(self._stimuli)
            under_hourly_limit = await self._reflection_count_last_hour() < self.max_reflections_per_hour
            should_reflect = force or bool(text.strip()) or (due_by_time and has_stimulus and under_hourly_limit)

            await self._save_soul()
            await self.automation.dispatch(
                "aura.cognitive.tick",
                {
                    "trigger": trigger,
                    "cycles": self._soul_cache["cycles"],
                    "phase": self._soul_cache["phase"],
                    "reflecting": should_reflect,
                },
                source="cognitive",
            )

            if not should_reflect:
                return {
                    "ok": True,
                    "skipped": True,
                    "reason": "aucun stimulus nécessitant une réflexion",
                    "soul": await self.soul(),
                }

            bundle = await self._context_bundle(text)
            # L'intention et la décision sont produites par le noyau AURA lui-même.
            # Un LLM n'est plus consulté pour créer une réflexion, modifier le Soul
            # ou décider qu'une mémoire/intention doit exister.
            parsed = self.native_cognition.reflect(
                bundle,
                self._soul_cache,
                trigger=trigger,
                text=text,
            )

            try:
                confidence = _clamp(float(parsed.get("confidence", 0.5)))
            except (TypeError, ValueError):
                confidence = 0.5

            reflection_id = str(uuid4())
            title = str(parsed.get("title") or "Réflexion AURA")[:240]
            summary = str(parsed.get("summary") or "")[:5000]
            hypothesis = str(parsed.get("hypothesis") or "")[:4000]
            next_action = str(parsed.get("next_action") or "")[:4000]
            memory = str(parsed.get("memory") or "").strip()[:4000]
            intention = str(parsed.get("intention") or "").strip()[:3000]
            basis = dict(parsed.get("basis") or {})
            restricted_authority = bool(basis.get("restricted_authority"))
            context = {
                "trigger": trigger,
                "cognition_version": self.native_cognition.VERSION,
                "language_model_used_for_decision": False,
                "horizon_used": bool(bundle.get("horizon")),
                "stimuli_count": len(bundle.get("stimuli") or []),
                "lesson_count": len(bundle.get("lessons") or []),
                "restricted_authority": restricted_authority,
                "basis": basis,
            }
            await self.db.execute(
                """
                INSERT INTO aura_reflections(
                    id,trigger,title,summary,hypothesis,next_action,confidence,context,created_at
                ) VALUES(?,?,?,?,?,?,?,?,?)
                """,
                (
                    reflection_id,
                    trigger[:160],
                    title,
                    summary,
                    hypothesis,
                    next_action,
                    confidence,
                    json.dumps(context, ensure_ascii=False),
                    now_iso,
                ),
            )
            self._last_reflection_monotonic = now_mono
            self.last_reflection_at = now_iso
            self._soul_cache["last_reflection_at"] = now_iso
            self._soul_cache["dominant_thought"] = summary[:500] or title
            if intention:
                await self.add_intention(
                    intention,
                    priority=max(0.4, confidence),
                    source="native-reflection",
                    context={"reflection_id": reflection_id},
                )
            if memory and confidence >= 0.6:
                normalized = re.sub(r"[^a-z0-9]+", "-", memory.casefold()).strip("-")[:120]
                await self.learn(
                    lesson_key=f"reflection:{normalized or reflection_id}",
                    content=memory,
                    confidence=confidence,
                    source="native-reflection",
                )
            await self._save_soul()
            self._stimuli.clear()

            payload = {
                "id": reflection_id,
                "trigger": trigger,
                "title": title,
                "summary": summary,
                "hypothesis": hypothesis,
                "next_action": next_action,
                "confidence": confidence,
                "autonomy_hint": str(
                    parsed.get("autonomy_hint")
                    or (
                        "notify_or_verify_only"
                        if restricted_authority
                        else "native_cognition_then_policy_gate"
                    )
                ),
                "cognition_version": self.native_cognition.VERSION,
                "language_model_used_for_decision": False,
            }
            await self._trace("reflection", title, summary, payload)
            await self.automation.dispatch(
                "aura.cognitive.reflection",
                payload,
                source="cognitive",
            )
            await self._maybe_review_improvements()
            return {"ok": True, "reflection": payload, "soul": await self.soul()}

    async def _maybe_review_improvements(self) -> None:
        now = time.monotonic()
        if now - self._last_improvement_review < 300:
            return
        self._last_improvement_review = now

        row = await self.db.fetchone(
            """
            SELECT automation_id,signature,COUNT(*) AS failures
            FROM aura_outcomes
            WHERE ok=0
            GROUP BY automation_id,signature
            HAVING COUNT(*) >= 3
            ORDER BY failures DESC
            LIMIT 1
            """
        )
        if not row:
            return
        target = f"{row['automation_id']}:{row['signature']}"
        existing = await self.db.fetchone(
            """
            SELECT id FROM aura_improvement_proposals
            WHERE target=? AND status IN ('proposed','accepted')
            ORDER BY updated_at DESC LIMIT 1
            """,
            (target,),
        )
        if existing:
            return

        lessons = await self.lessons(6)
        prompt = (
            "Analyse ce motif d'échec d'automatisation AURA et propose une amélioration minimale. "
            "Retourne uniquement JSON avec diagnosis, proposal, validation_plan, risk. "
            "La proposition ne doit pas demander de désactiver un garde-fou, de révéler un secret, ni de modifier "
            "automatiquement le code de production. Privilégie timeout/retry/condition/configuration ou vérification.\n"
            + json.dumps({"failure": row, "lessons": lessons}, ensure_ascii=False, default=str)[:9000]
        )
        try:
            raw = await self.aura.ai.generate(
                prompt,
                "Tu es le laboratoire d'amélioration d'AURA. Tu proposes; tu n'appliques rien silencieusement.",
                360,
                system_is_complete=True,
            )
            parsed = _json_object(raw)
        except Exception:
            parsed = {}

        diagnosis = str(parsed.get("diagnosis") or f"Échec répété: {row['signature']}")[:4000]
        proposal = str(parsed.get("proposal") or "Vérifier la cause avant toute nouvelle tentative.")[:5000]
        validation_plan = str(parsed.get("validation_plan") or "Simuler puis tester sur un événement non critique.")[:4000]
        risk = str(parsed.get("risk") or "review")[:80]
        proposal_id = str(uuid4())
        now_iso = utcnow()
        await self.db.execute(
            """
            INSERT INTO aura_improvement_proposals(
                id,target,diagnosis,proposal,validation_plan,risk,status,evidence_count,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,'proposed',?,?,?)
            """,
            (
                proposal_id,
                target[:500],
                diagnosis,
                proposal,
                validation_plan,
                risk,
                int(row.get("failures") or 0),
                now_iso,
                now_iso,
            ),
        )
        await self.automation.dispatch(
            "aura.cognitive.improvement.proposed",
            {
                "id": proposal_id,
                "target": target,
                "diagnosis": diagnosis,
                "proposal": proposal,
                "validation_plan": validation_plan,
                "risk": risk,
            },
            source="cognitive",
        )

    async def improvements(self, limit: int = 30) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            """
            SELECT id,target,diagnosis,proposal,validation_plan,risk,status,evidence_count,created_at,updated_at
            FROM aura_improvement_proposals
            ORDER BY updated_at DESC LIMIT ?
            """,
            (max(1, min(int(limit), 100)),),
        )

    async def reflections(self, limit: int = 30) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            """
            SELECT id,trigger,title,summary,hypothesis,next_action,confidence,context,created_at
            FROM aura_reflections
            ORDER BY created_at DESC LIMIT ?
            """,
            (max(1, min(int(limit), 100)),),
        )

    def _operator_catalog(self, allowed_risks: set[str]) -> list[dict[str, Any]]:
        blocked = {
            "flow.emit",
            "cognitive.tick",
            "cognitive.routine.add",
            "cognitive.operator",
        }
        catalog: list[dict[str, Any]] = []
        for definition in self.automation.registry.action_definitions.values():
            risk = str(definition.risk or "safe").casefold()
            if risk not in allowed_risks or definition.name in blocked:
                continue
            catalog.append(
                {
                    "name": definition.name,
                    "title": definition.title,
                    "category": definition.category,
                    "description": definition.description,
                    "risk": risk,
                    "config_schema": definition.config_schema,
                }
            )
        return catalog

    async def operate(
        self,
        task: str,
        *,
        max_steps: int = 4,
        requested_risks: set[str] | None = None,
        source: str = "private-command",
    ) -> dict[str, Any]:
        mission = " ".join(str(task).split()).strip()
        if not mission:
            raise ValueError("Mission vide")

        configured = self.operator_allowed_risks
        requested = {str(item).casefold() for item in (requested_risks or configured)}
        allowed_risks = configured.intersection(requested)
        catalog = self._operator_catalog(allowed_risks)
        if not catalog:
            raise RuntimeError("Aucune capacité opérateur autorisée par la politique AURA")

        context = await self.context_for_ai()
        feedback = ""
        reports: list[dict[str, Any]] = []
        spoken: list[str] = []
        step_limit = max(1, min(int(max_steps), 8))

        for step_index in range(step_limit):
            prompt = (
                "Mission AURA:\n"
                + mission[:6000]
                + "\n\nCapacités autorisées:\n"
                + json.dumps(catalog, ensure_ascii=False, default=str)[:18000]
                + "\n\nContexte:\n"
                + context[:9000]
            )
            if feedback:
                prompt += (
                    "\n\nRésultat des actions précédentes:\n"
                    + feedback[:12000]
                    + "\nDécide si une nouvelle étape est réellement nécessaire."
                )
            prompt += (
                "\n\nRetourne uniquement JSON: "
                '{"say":"résumé court","actions":[{"type":"nom","config":{},"reason":"raison"}],"continue":false}. '
                "L'intention et le but sont déjà décidés par le noyau AURA : traduis-les seulement "
                "en appels d'outils du catalogue fourni. Maximum 6 actions. "
                "Ne crée pas de nouvelle intention et ne contourne jamais une permission par un événement indirect."
            )
            raw = await self.aura.ai.generate(
                prompt,
                (
                    "Tu es le traducteur d'outils d'AURA, pas son décideur. "
                    "Le noyau a déjà fixé l'intention et la mission. Tu maps cette mission sur le "
                    "catalogue Automation Studio autorisé, avec l'action minimale vérifiable. "
                    "Tu n'élargis jamais la mission, les permissions ou les risques."
                ),
                800,
                system_is_complete=True,
            )
            plan = _json_object(raw)
            if not plan:
                spoken.append(str(raw)[:2000])
                break

            say = str(plan.get("say") or "").strip()
            if say:
                spoken.append(say[:2000])

            raw_actions = plan.get("actions")
            actions = raw_actions if isinstance(raw_actions, list) else []
            action_specs: list[ActionSpec] = []
            allowed_names = {row["name"] for row in catalog}
            rejected: list[str] = []
            for item in actions[:6]:
                if not isinstance(item, dict):
                    continue
                action_type = str(item.get("type") or "")
                if action_type not in allowed_names:
                    rejected.append(action_type or "<vide>")
                    continue
                action_specs.append(
                    ActionSpec(
                        type=action_type,
                        config=dict(item.get("config") or {}),
                        timeout_seconds=30.0,
                        retries=0,
                    )
                )

            if rejected:
                feedback = json.dumps(
                    {
                        "rejected_actions": rejected,
                        "reason": "capabilité non autorisée par la politique opérateur",
                    },
                    ensure_ascii=False,
                )
                if not action_specs and bool(plan.get("continue", False)):
                    continue

            if not action_specs:
                if not bool(plan.get("continue", False)):
                    break
                feedback = feedback or "Aucune action valide exécutée."
                continue

            trigger = f"aura.operator.{uuid4()}"
            automation_id = f"cognitive-operator-{uuid4()}"
            ephemeral = Automation(
                id=automation_id,
                name="AURA Sovereign ephemeral plan",
                trigger=trigger,
                actions=action_specs,
                priority=0,
                description=f"Plan éphémère du noyau cognitif: {mission[:240]}",
                tags=["cognitive", "sovereign", "ephemeral"],
            )
            self.automation.engine.upsert(ephemeral)
            try:
                engine_reports = await self.automation.engine.dispatch(
                    Event(
                        trigger,
                        {
                            "task": mission,
                            "step": step_index + 1,
                            "source": source,
                            "allowed_risks": sorted(allowed_risks),
                        },
                        source="cognitive-operator",
                    )
                )
            finally:
                self.automation.engine.remove(automation_id)

            serialized = [
                self.automation.report_to_dict(report)
                for report in engine_reports
            ]
            reports.extend(serialized)
            feedback = json.dumps(serialized, ensure_ascii=False, default=str)
            if not bool(plan.get("continue", False)):
                break

        result = {
            "ok": all(bool(report.get("ok", False)) for report in reports) if reports else True,
            "task": mission,
            "allowed_risks": sorted(allowed_risks),
            "say": "\n".join(spoken).strip(),
            "reports": reports,
            "steps": len(reports),
        }
        await self._trace(
            "operator",
            "Sovereign plan",
            result["say"] or mission,
            {
                "task": mission,
                "allowed_risks": sorted(allowed_risks),
                "report_count": len(reports),
                "ok": result["ok"],
            },
        )
        return result

    async def run_agent(self, name: str, task: str) -> dict[str, Any]:
        role = self.AGENT_ROLES.get(name)
        if role is None:
            raise ValueError(f"Agent inconnu: {name}")
        context = await self.context_for_ai()
        answer = await self.aura.ai.generate(
            f"Mission:\n{str(task)[:6000]}\n\nContexte AURA:\n{context[:6000]}",
            role,
            700,
            system_is_complete=True,
        )
        await self._trace("agent", name, answer[:4000], {"task": str(task)[:2000]})
        return {"agent": name, "answer": answer}

    async def swarm(self, task: str, names: list[str] | None = None) -> dict[str, Any]:
        selected = names or ["planner", "research", "dev", "security", "critic"]
        selected = [name for name in selected if name in self.AGENT_ROLES][:5]
        if not selected:
            raise ValueError("Aucun agent valide")
        outputs: list[dict[str, str]] = []
        for name in selected:
            try:
                result = await self.run_agent(name, task)
                outputs.append({"agent": name, "answer": str(result["answer"])[:7000]})
            except Exception as exc:  # noqa: BLE001
                outputs.append({"agent": name, "answer": f"ERREUR: {exc}"})
        synthesis = await self.aura.ai.generate(
            "Mission initiale:\n"
            + str(task)[:5000]
            + "\n\nAvis des agents:\n"
            + json.dumps(outputs, ensure_ascii=False)[:20000]
            + "\n\nSynthétise une décision unique, vérifiable, avec risques et prochaine action.",
            "Tu es l'orchestrateur collectif d'AURA. Tu arbitres les agents sans inventer de faits.",
            900,
            system_is_complete=True,
        )
        await self._trace("swarm", "collective", synthesis[:4000], {"agents": selected})
        return {"agents": outputs, "synthesis": synthesis}

    async def chat(self, text: str, author: str = "Utilisateur", *, private: bool = False) -> dict[str, Any]:
        content = " ".join(str(text).split()).strip()
        if not content:
            raise ValueError("Message vide")

        await self.db.execute(
            "INSERT INTO aura_cloud_messages(author,role,content,created_at) VALUES(?,'user',?,?)",
            (author[:120], content[:8000], utcnow()),
        )

        # Perception d'abord : la conversation devient un stimulus du noyau avant
        # toute formulation linguistique.
        self._stimuli.append(
            {
                "type": "aura.cloud.chat",
                "source": "cloud",
                "occurred_at": utcnow(),
                "payload": {"author": author, "text": content[:1000]},
            }
        )
        self._adjust_soul(continuity=0.002, energy=0.003)
        await self._save_soul()

        soul = await self.soul()
        intentions = await self.intentions(6)
        lessons = await self.lessons(6)
        reflections = await self.reflections(4)
        work = []
        try:
            improvements = await self.improvements(4)
            work.extend(
                {
                    "title": str(row.get("proposal") or row.get("diagnosis") or row.get("target") or ""),
                    "kind": "improvement",
                }
                for row in improvements
                if str(row.get("status") or "proposed") in {"proposed", "accepted"}
            )
        except Exception:
            pass

        plan = self.native_cognition.plan_reply(
            text=content,
            soul=soul,
            intentions=intentions,
            lessons=lessons,
            reflections=reflections,
            work=work,
            private=private,
        )

        semantic_support = ""
        if bool(plan.get("needs_semantic_support")) and bool(getattr(self.aura.ai, "enabled", False)):
            semantic_prompt = (
                "QUESTION UTILISATEUR\n"
                + str(plan.get("semantic_query") or "")[:5000]
                + "\n\nCONTEXTE AURA\n"
                + (await self.context_for_ai(private=private))[:9000]
                + "\n\nFournis uniquement un appui sémantique factuel pour AURA. "
                "Ne parle pas à la première personne au nom d'AURA. "
                "Ne crée aucune intention, mémoire, émotion, priorité ou décision pour AURA. "
                "Si l'information n'est pas connue, indique l'incertitude."
            )
            try:
                semantic_support = await self.aura.ai.generate(
                    semantic_prompt,
                    (
                        "Tu es un outil sémantique utilisé par AURA. "
                        "Tu proposes des informations candidates; tu ne décides jamais à sa place."
                    ),
                    700,
                    system_is_complete=True,
                )
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"{exc.__class__.__name__}: {exc}"[:500]

        plan = self.native_cognition.integrate_semantic_support(plan, semantic_support)
        fallback = self.native_cognition.deterministic_reply(plan)
        answer = fallback

        # Le moteur de langage reçoit un plan déjà décidé. Il peut uniquement le
        # verbaliser; son indisponibilité n'interrompt donc jamais AURA.
        if bool(getattr(self.aura.ai, "enabled", False)):
            try:
                expression_payload = {
                    "act": plan.get("act"),
                    "goal": plan.get("goal"),
                    "facts": plan.get("facts"),
                    "semantic_support": plan.get("semantic_support") or "",
                    "current_intention": plan.get("current_intention") or "",
                    "dominant_thought": plan.get("dominant_thought") or "",
                }
                candidate = await self.aura.ai.generate(
                    (
                        "Transforme ce plan de parole AURA en une réponse française naturelle. "
                        "Tu n'as aucun droit de changer les faits, l'intention ou la décision. "
                        "N'ajoute aucun souvenir, état, capacité ou action absent du plan. "
                        "Tu peux seulement reformuler et condenser.\n\n"
                        + json.dumps(expression_payload, ensure_ascii=False)
                    ),
                    (
                        "Tu es la couche de langage d'AURA, pas son cerveau. "
                        "Tu verbalises une décision déjà prise par le noyau."
                    ),
                    700,
                    system_is_complete=True,
                )
                if str(candidate).strip():
                    answer = str(candidate).strip()
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"{exc.__class__.__name__}: {exc}"[:500]

        await self.db.execute(
            "INSERT INTO aura_cloud_messages(author,role,content,created_at) VALUES('AURA','assistant',?,?)",
            (answer[:12000], utcnow()),
        )
        await self._trace(
            "expression",
            str(plan.get("act") or "respond"),
            answer[:3000],
            {
                "author": author[:120],
                "cognition_version": self.native_cognition.VERSION,
                "language_model_used_for_decision": False,
                "semantic_support_used": bool(str(plan.get("semantic_support") or "").strip()),
            },
        )
        return {
            "ok": True,
            "answer": answer,
            "act": plan.get("act") or "respond",
            "cognition_version": self.native_cognition.VERSION,
            "language_model_used_for_decision": False,
            "semantic_support_used": bool(str(plan.get("semantic_support") or "").strip()),
        }

    async def context_for_ai(self, *, private: bool = True) -> str:
        soul = await self.soul()
        intentions = await self.intentions(5)
        lessons = await self.lessons(6)
        reflection_rows = await self.reflections(2)
        horizon_context = ""
        if self.horizon is not None:
            try:
                horizon_context = await self.horizon.context_for_ai()
            except Exception:
                pass

        lines = [
            "ÉTAT AURA",
            f"phase={soul.get('phase')} cycles={soul.get('cycles')} énergie={soul.get('energy')} "
            f"curiosité={soul.get('curiosity')} pression={soul.get('pressure')} continuité={soul.get('continuity')}",
        ]
        if private:
            lines.extend(
                [
                    f"intention={soul.get('current_intention') or ''}",
                    f"pensée_dominante={soul.get('dominant_thought') or ''}",
                ]
            )
        if intentions and private:
            lines.append("INTENTIONS ACTIVES")
            lines.extend(f"- {row['statement']}" for row in intentions)
        if lessons:
            lines.append("LEÇONS APPRISES")
            lines.extend(
                f"- {row['content']} (preuves={row['evidence_count']}, confiance={row['confidence']})"
                for row in lessons
            )
        if reflection_rows:
            lines.append("RÉFLEXIONS RÉCENTES")
            lines.extend(f"- {row['title']}: {row['summary']}" for row in reflection_rows)
        if horizon_context:
            lines.append("HORIZON")
            lines.append(horizon_context)
        return "\n".join(lines)[:14000]

    async def status(self) -> dict[str, Any]:
        counts: dict[str, int] = {}
        for key, table in {
            "reflections": "aura_reflections",
            "intentions": "aura_intentions",
            "lessons": "aura_lessons",
            "routines": "aura_routines",
            "outcomes": "aura_outcomes",
            "improvements": "aura_improvement_proposals",
        }.items():
            row = await self.db.fetchone(f"SELECT COUNT(*) AS total FROM {table}")
            counts[key] = int((row or {}).get("total") or 0)
        return {
            "version": self.VERSION,
            "enabled": self.enabled,
            "started": self.started,
            "tick_seconds": self.tick_seconds,
            "reflection_seconds": self.reflection_seconds,
            "max_reflections_per_hour": self.max_reflections_per_hour,
            "last_tick_at": self.last_tick_at,
            "last_reflection_at": self.last_reflection_at,
            "last_error": self.last_error,
            "soul": await self.soul(),
            "counts": counts,
            "stimuli_buffered": len(self._stimuli),
            "self_learning": True,
            "native_cognition": {
                "version": self.native_cognition.VERSION,
                "independent_from_language_model": True,
            },
            "language_model_role": "semantic-support-and-verbalisation-only",
            "self_modifying_code": False,
            "improvement_mode": "observe-learn-propose-validate",
        }
