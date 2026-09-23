from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable
from urllib.parse import quote

import aiohttp

from app.database import Database

logger = logging.getLogger(__name__)

DispatchFn = Callable[..., Awaitable[list[dict[str, Any]]]]


class HorizonBridge:
    """Bidirectional cognitive bridge between AURA and HORIZON.

    HORIZON remains the source of world-state epistemics. AURA consumes the
    versioned feed, preserves its truth labels, adds local context, and decides
    what automation (if any) should run.
    """

    EXPECTED_BRIDGE = "horizon-aura-bridge-v1"
    MAX_SEEN_SIGNALS = 5000

    def __init__(self, settings: Any, db: Database):
        self.settings = settings
        self.db = db
        self.session: aiohttp.ClientSession | None = None
        self.dispatcher: DispatchFn | None = None
        self.task: asyncio.Task[None] | None = None
        self.started = False
        self.last_sync_at = ""
        self.last_success_at = ""
        self.last_error = ""
        self.last_feed: dict[str, Any] = {}
        self.last_new_signals = 0
        self.total_dispatched = 0

    @property
    def enabled(self) -> bool:
        return bool(
            getattr(self.settings, "horizon_enabled", False)
            and str(getattr(self.settings, "horizon_base_url", "") or "").strip()
        )

    @property
    def base_url(self) -> str:
        return str(getattr(self.settings, "horizon_base_url", "") or "").rstrip("/")

    @property
    def external_id(self) -> str:
        return str(getattr(self.settings, "horizon_external_id", "aura-local") or "aura-local")

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json", "User-Agent": "AURA-HORIZON-Bridge/1"}
        api_key = str(getattr(self.settings, "horizon_api_key", "") or "")
        if api_key:
            headers["X-API-Key"] = api_key
        return headers

    async def _initialize_storage(self) -> None:
        await self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS horizon_bridge_seen (
                signal_id TEXT PRIMARY KEY,
                entity_key TEXT NOT NULL,
                aura_event TEXT NOT NULL,
                observed_at TEXT NOT NULL,
                first_seen_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_horizon_bridge_seen_first
            ON horizon_bridge_seen(first_seen_at DESC);
            """
        )

    async def start(self, dispatcher: DispatchFn) -> None:
        self.dispatcher = dispatcher
        await self._initialize_storage()
        self.started = True
        if not self.enabled:
            logger.info("Pont HORIZON inactif: HORIZON_ENABLED/HORIZON_BASE_URL non configurés")
            return

        if self.session is None:
            timeout = max(2, int(getattr(self.settings, "horizon_request_timeout_seconds", 8)))
            self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout))

        try:
            await self.sync_once()
        except Exception as exc:  # noqa: BLE001
            self._remember_error(exc)
            logger.warning("Synchronisation HORIZON initiale indisponible: %s", self.last_error)

        if self.task is None:
            self.task = asyncio.create_task(self._poll_loop(), name="aura-horizon-bridge")

    async def close(self) -> None:
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None
        if self.session:
            await self.session.close()
            self.session = None
        self.started = False

    async def _poll_loop(self) -> None:
        interval = max(15, int(getattr(self.settings, "horizon_poll_seconds", 60)))
        while True:
            try:
                await asyncio.sleep(interval)
                await self.sync_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                self._remember_error(exc)
                logger.warning("Pont HORIZON temporairement indisponible: %s", self.last_error)

    def _remember_error(self, exc: Exception) -> None:
        self.last_error = f"{exc.__class__.__name__}: {str(exc).strip()}"[:500]

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.enabled:
            raise RuntimeError("Le pont HORIZON n'est pas configuré")
        if self.session is None:
            timeout = max(2, int(getattr(self.settings, "horizon_request_timeout_seconds", 8)))
            self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout))
        assert self.session is not None

        async with self.session.request(
            method.upper(),
            f"{self.base_url}{path}",
            params=params,
            json=body,
            headers=self._headers(),
        ) as response:
            text = await response.text()
            if response.status >= 400:
                raise RuntimeError(f"HORIZON HTTP {response.status}: {text[:300]}")
            if not text:
                return {}
            try:
                payload = json.loads(text)
            except json.JSONDecodeError as exc:
                raise RuntimeError("HORIZON a renvoyé une réponse non JSON") from exc
            if not isinstance(payload, dict):
                raise RuntimeError("Contrat HORIZON invalide: objet JSON attendu")
            return payload

    async def sync_once(self) -> dict[str, Any]:
        self.last_sync_at = datetime.now(timezone.utc).isoformat()
        feed = await self._request_json(
            "GET",
            "/v1/horizon/aura/feed",
            params={
                "external_id": self.external_id,
                "event_limit": max(1, min(int(getattr(self.settings, "horizon_event_limit", 100)), 200)),
                "candidate_limit": max(1, min(int(getattr(self.settings, "horizon_candidate_limit", 100)), 200)),
                "forecast_limit": max(1, min(int(getattr(self.settings, "horizon_forecast_limit", 100)), 200)),
            },
        )
        if feed.get("bridge") != self.EXPECTED_BRIDGE:
            raise RuntimeError(
                f"Version du pont HORIZON incompatible: {feed.get('bridge')!r}"
            )

        if feed.get("user_found") is False:
            await self._create_user()
            feed["user_found"] = True

        result = await self.ingest_feed(feed)
        self.last_feed = feed
        self.last_new_signals = result["new_signals"]
        self.last_success_at = datetime.now(timezone.utc).isoformat()
        self.last_error = ""

        if result["new_signals"] and self.dispatcher:
            await self.dispatcher(
                "horizon.bridge.synced",
                {
                    "bridge": self.EXPECTED_BRIDGE,
                    "new_signals": result["new_signals"],
                    "total_signals": len(feed.get("signals") or []),
                    "generated_at": feed.get("generated_at"),
                    "summary": feed.get("summary") or {},
                },
                source="horizon",
            )
        return result

    async def _create_user(self) -> dict[str, Any]:
        return await self._request_json(
            "PUT",
            f"/v1/horizon/context/users/{quote(self.external_id, safe='')}",
            body={
                "external_id": self.external_id,
                "country": str(getattr(self.settings, "horizon_country", "FR") or "FR"),
                "currency": str(getattr(self.settings, "horizon_currency", "EUR") or "EUR"),
                "timezone": str(
                    getattr(self.settings, "horizon_timezone", "Europe/Paris")
                    or "Europe/Paris"
                ),
                "preferences": {"created_by": "aura-horizon-bridge"},
            },
        )

    async def _seen(self, signal_id: str) -> bool:
        row = await self.db.fetchone(
            "SELECT signal_id FROM horizon_bridge_seen WHERE signal_id=?",
            (signal_id,),
        )
        return row is not None

    async def _mark_seen(self, signal: dict[str, Any]) -> None:
        await self.db.execute(
            """
            INSERT OR IGNORE INTO horizon_bridge_seen(
                signal_id,entity_key,aura_event,observed_at,first_seen_at
            ) VALUES(?,?,?,?,?)
            """,
            (
                str(signal["signal_id"]),
                str(signal.get("entity_key") or ""),
                str(signal["aura_event"]),
                str(signal.get("observed_at") or ""),
                datetime.now(timezone.utc).isoformat(),
            ),
        )

    async def _prune_seen(self) -> None:
        await self.db.execute(
            """
            DELETE FROM horizon_bridge_seen
            WHERE signal_id IN (
                SELECT signal_id
                FROM horizon_bridge_seen
                ORDER BY first_seen_at DESC
                LIMIT -1 OFFSET ?
            )
            """,
            (self.MAX_SEEN_SIGNALS,),
        )

    @staticmethod
    def _validate_signal(signal: dict[str, Any]) -> None:
        if not str(signal.get("signal_id") or ""):
            raise ValueError("signal_id HORIZON manquant")
        aura_event = str(signal.get("aura_event") or "")
        if aura_event not in {
            "horizon.world.confirmed",
            "horizon.world.emerging",
            "horizon.personal.forecast",
        }:
            raise ValueError(f"Type d'événement HORIZON non autorisé: {aura_event}")
        payload = signal.get("payload")
        if not isinstance(payload, dict):
            raise ValueError("payload HORIZON invalide")
        if aura_event == "horizon.world.emerging":
            if payload.get("epistemic_status") != "unconfirmed_emerging_event":
                raise ValueError("Une hypothèse HORIZON doit rester explicitement non confirmée")
            if payload.get("autonomy_hint") != "notify_or_verify_only":
                raise ValueError("Une hypothèse HORIZON ne peut pas autoriser une action autonome")

    async def ingest_feed(self, feed: dict[str, Any]) -> dict[str, Any]:
        if self.dispatcher is None:
            raise RuntimeError("Dispatcher AURA indisponible")
        critical = dict(feed.get("critical_semantics") or {})
        if critical.get("scores_are_not_probabilities") is not True:
            raise RuntimeError("Le contrat HORIZON ne garantit pas la séparation score/probabilité")
        if critical.get("aura_must_preserve_epistemic_status") is not True:
            raise RuntimeError("Le contrat HORIZON ne garantit pas le statut épistémique")

        dispatched = 0
        duplicates = 0
        for raw in list(feed.get("signals") or []):
            signal = dict(raw)
            self._validate_signal(signal)
            signal_id = str(signal["signal_id"])
            if await self._seen(signal_id):
                duplicates += 1
                continue

            payload = dict(signal["payload"])
            payload.update(
                {
                    "horizon_signal_id": signal_id,
                    "horizon_entity_key": str(signal.get("entity_key") or ""),
                    "horizon_observed_at": str(signal.get("observed_at") or ""),
                    "horizon_bridge": str(feed.get("bridge") or self.EXPECTED_BRIDGE),
                }
            )
            await self.dispatcher(
                str(signal["aura_event"]),
                payload,
                source="horizon",
            )
            await self._mark_seen(signal)
            dispatched += 1
            self.total_dispatched += 1

        await self._prune_seen()
        return {
            "ok": True,
            "new_signals": dispatched,
            "duplicates": duplicates,
            "total_feed_signals": len(feed.get("signals") or []),
        }

    async def push_fact(
        self,
        *,
        domain: str,
        key: str,
        value: dict[str, Any],
        confidence: float = 1.0,
        sensitivity: str = "personal",
        expires_at: str | None = None,
        replace_current: bool = True,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "domain": str(domain),
            "key": str(key),
            "value": dict(value),
            "source": "aura",
            "provenance": {
                "bridge": self.EXPECTED_BRIDGE,
                "origin": "aura_local_context",
            },
            "confidence": max(0.0, min(float(confidence), 1.0)),
            "sensitivity": str(sensitivity),
            "replace_current": bool(replace_current),
        }
        if expires_at:
            body["expires_at"] = expires_at
        try:
            return await self._request_json(
                "POST",
                f"/v1/horizon/context/users/{quote(self.external_id, safe='')}/state/facts",
                body=body,
            )
        except RuntimeError as exc:
            if "HTTP 404" not in str(exc):
                raise
            await self._create_user()
            return await self._request_json(
                "POST",
                f"/v1/horizon/context/users/{quote(self.external_id, safe='')}/state/facts",
                body=body,
            )

    async def push_intent(
        self,
        *,
        kind: str,
        statement: str,
        target: dict[str, Any] | None = None,
        priority: float = 0.5,
    ) -> dict[str, Any]:
        body = {
            "kind": str(kind),
            "statement": str(statement),
            "target": dict(target or {}),
            "priority": max(0.0, min(float(priority), 1.0)),
        }
        try:
            return await self._request_json(
                "POST",
                f"/v1/horizon/context/users/{quote(self.external_id, safe='')}/intents",
                body=body,
            )
        except RuntimeError as exc:
            if "HTTP 404" not in str(exc):
                raise
            await self._create_user()
            return await self._request_json(
                "POST",
                f"/v1/horizon/context/users/{quote(self.external_id, safe='')}/intents",
                body=body,
            )

    async def context_for_ai(self) -> str:
        if not self.last_feed:
            return ""
        limit = max(1, min(int(getattr(self.settings, "horizon_ai_context_signals", 10)), 30))
        rows = list(self.last_feed.get("signals") or [])[-limit:]
        if not rows:
            return ""

        lines: list[str] = []
        for signal in rows:
            payload = dict(signal.get("payload") or {})
            kind = str(payload.get("kind") or "")
            if kind == "confirmed_event":
                label = "ÉVÉNEMENT HORIZON"
                statement = str(payload.get("title") or "")
            elif kind == "emerging_hypothesis":
                label = "HYPOTHÈSE NON CONFIRMÉE"
                statement = str(payload.get("title") or "")
            elif kind == "personal_forecast":
                label = "PRÉVISION PERSONNELLE"
                statement = str(payload.get("predicted_outcome") or payload.get("event_title") or "")
            else:
                continue
            domain = str(payload.get("domain_label") or payload.get("domain") or "")
            if statement:
                lines.append(f"[{label}] {domain}: {statement}"[:600])

        if not lines:
            return ""
        return (
            "Contexte HORIZON récent. Respecte exactement les étiquettes: une HYPOTHÈSE NON "
            "CONFIRMÉE n'est jamais un fait et aucun score HORIZON ne doit être présenté comme "
            "une probabilité calibrée.\n" + "\n".join(lines)
        )

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "started": self.started,
            "bridge": self.EXPECTED_BRIDGE,
            "base_url": self.base_url,
            "external_id": self.external_id,
            "poll_seconds": max(15, int(getattr(self.settings, "horizon_poll_seconds", 60))),
            "last_sync_at": self.last_sync_at,
            "last_success_at": self.last_success_at,
            "last_error": self.last_error,
            "last_new_signals": self.last_new_signals,
            "total_dispatched": self.total_dispatched,
            "feed_summary": dict(self.last_feed.get("summary") or {}),
            "epistemic_guard": True,
        }
