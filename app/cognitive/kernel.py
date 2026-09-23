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

from app.automation.models import Event, ExecutionReport
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

    VERSION = "aura-unified-kernel-v1"

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
            """
        )
        row = await self.db.fetchone("SELECT state FROM aura_soul_state WHERE id=1")
        if row:
            try:
                self._soul_cache = json.loads(row["state"])
            except json.JSONDecodeError:
                self._soul_cache = {}
        if not self._soul_cache:
            self._soul_cache = self._default_soul()
            await self._save_soul()

    def _default_soul(self) -> dict[str, Any]:
        now = utcnow()
        return {
            "name": "AURA",
            "kernel_version": self.VERSION,
            "seed": str(uuid4()),
            "born_at": now,
            "phase": "genesis",
            "cycles": 0,
            "energy": 0.72,
            "curiosity": 0.64,
            "pressure": 0.18,
            "continuity": 1.0,
            "introspection": 0.68,
            "openness": 0.72,
            "reactivity": 0.58,
            "playfulness": 0.52,
            "dominant_thought": "Maintenir une présence utile sans produire de bruit.",
            "current_intention": "Observer, comprendre, anticiper et n'agir qu'avec une autorité suffisante.",
            "last_tick_at": "",
            "last_reflection_at": "",
        }

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
        self._stimuli.append(stimulus)

        if event.source == "horizon":
            self._adjust_soul(curiosity=0.025, introspection=0.01)
            if event.type == "horizon.world.emerging":
                self._adjust_soul(pressure=0.015)
        elif event.type == "stream.online":
            self._adjust_soul(energy=0.04, reactivity=0.02)
        elif event.type == "stream.offline":
            self._adjust_soul(energy=-0.02, introspection=0.02)
        elif event.type == "channel.chat.message":
            self._adjust_soul(continuity=0.002, energy=0.003)

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

        if report.ok:
            self._adjust_soul(pressure=-0.008, energy=0.004)
            return

        self._adjust_soul(pressure=0.035, introspection=0.025)
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

    async def add_routine(self, name: str, prompt: str, every_seconds: int) -> dict[str, Any]:
        now = utcnow()
        routine_id = str(uuid4())
        interval = max(60, min(int(every_seconds), 31_536_000))
        await self.db.execute(
            """
            INSERT INTO aura_routines(
                id,name,prompt,every_seconds,enabled,last_run_at,created_at,updated_at
            ) VALUES(?,?,?,?,1,0,?,?)
            ON CONFLICT(name) DO UPDATE SET
                prompt=excluded.prompt,
                every_seconds=excluded.every_seconds,
                enabled=1,
                updated_at=excluded.updated_at
            """,
            (routine_id, name[:160], prompt[:4000], interval, now, now),
        )
        return {"name": name, "prompt": prompt, "every_seconds": interval, "enabled": True}

    async def routines(self) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            """
            SELECT id,name,prompt,every_seconds,enabled,last_run_at,created_at,updated_at
            FROM aura_routines ORDER BY name
            """
        )

    async def run_due_routines(self) -> list[dict[str, Any]]:
        now = time.time()
        rows = await self.db.fetchall(
            """
            SELECT id,name,prompt,every_seconds,last_run_at
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
            reflection = await self.tick(
                trigger=f"routine:{row['name']}",
                text=str(row["prompt"]),
                force=True,
            )
            results.append({"routine": row["name"], "reflection": reflection})
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
            prompt = (
                "Produit une capsule de réflexion opérationnelle d'AURA à partir du contexte JSON ci-dessous. "
                "Ne révèle pas de raisonnement détaillé étape par étape. Retourne uniquement un objet JSON valide avec "
                "les clés title, summary, hypothesis, next_action, memory, intention, confidence. "
                "summary décrit le constat utile en 1-3 phrases. hypothesis est vide si aucune hypothèse n'est nécessaire. "
                "next_action est une proposition vérifiable, jamais une exécution cachée. memory contient seulement un "
                "enseignement durable réellement soutenu par des résultats observés. intention contient une intention "
                "durable à ajouter seulement si elle est utile. confidence est entre 0 et 1. "
                "Respecte les statuts HORIZON : une hypothèse non confirmée reste une hypothèse et un score n'est pas une probabilité.\n\n"
                + json.dumps(bundle, ensure_ascii=False, default=str)[:18000]
            )
            system = (
                "Tu es le noyau cognitif privé d'AURA. Tu transformes événements, résultats, mémoire, intentions et "
                "signaux HORIZON en résumés de réflexion auditables. Tu n'exécutes aucune action depuis cette étape. "
                "Tu ne modifies pas ton propre code. Tu distingues faits, hypothèses, intentions et leçons apprises."
            )
            raw = ""
            try:
                raw = await self.aura.ai.generate(
                    prompt,
                    system,
                    520,
                    system_is_complete=True,
                )
                parsed = _json_object(raw)
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"{exc.__class__.__name__}: {exc}"[:500]
                parsed = {}

            if not parsed:
                parsed = {
                    "title": "Continuité cognitive",
                    "summary": text.strip()[:800] or "AURA maintient son état et attend un signal plus informatif.",
                    "hypothesis": "",
                    "next_action": "",
                    "memory": "",
                    "intention": "",
                    "confidence": 0.35,
                }

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
            context = {
                "trigger": trigger,
                "horizon_used": bool(bundle.get("horizon")),
                "stimuli_count": len(bundle.get("stimuli") or []),
                "lesson_count": len(bundle.get("lessons") or []),
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
                    source="reflection",
                    context={"reflection_id": reflection_id},
                )
            if memory and confidence >= 0.6:
                normalized = re.sub(r"[^a-z0-9]+", "-", memory.casefold()).strip("-")[:120]
                await self.learn(
                    lesson_key=f"reflection:{normalized or reflection_id}",
                    content=memory,
                    confidence=confidence,
                    source="reflection",
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
        history = await self.db.fetchall(
            """
            SELECT author,role,content,created_at
            FROM aura_cloud_messages
            ORDER BY id DESC LIMIT 14
            """
        )
        history.reverse()
        context = await self.context_for_ai(private=private)
        prompt = (
            "Conversation récente:\n"
            + "\n".join(f"{row['role']}({row['author']}): {row['content']}" for row in history)
            + "\n\nDernier message:\n"
            + content
            + "\n\nContexte du noyau:\n"
            + context[:10000]
        )
        answer = await self.aura.ai.generate(
            prompt,
            (
                "Tu es AURA, présence numérique persistante. Réponds directement et utilement. "
                "Tu disposes d'un état Soul, d'une mémoire de leçons et de HORIZON. "
                "Ne récite pas tes journaux internes. Ne présente jamais une hypothèse comme un fait."
            ),
            700,
            system_is_complete=True,
        )
        await self.db.execute(
            "INSERT INTO aura_cloud_messages(author,role,content,created_at) VALUES('AURA','assistant',?,?)",
            (answer[:12000], utcnow()),
        )
        self._stimuli.append(
            {
                "type": "aura.cloud.chat",
                "source": "cloud",
                "occurred_at": utcnow(),
                "payload": {"author": author, "text": content[:1000]},
            }
        )
        return {"ok": True, "answer": answer}

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
            f"intention={soul.get('current_intention') or ''}",
            f"pensée_dominante={soul.get('dominant_thought') or ''}",
        ]
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
            "self_modifying_code": False,
            "improvement_mode": "observe-learn-propose-validate",
        }
