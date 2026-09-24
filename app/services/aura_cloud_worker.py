from __future__ import annotations

import asyncio
import base64
import logging
import platform
import socket
from pathlib import Path
from typing import Any
from uuid import uuid4

import aiohttp

logger = logging.getLogger(__name__)


class AuraCloudWorker:
    """Corps local d'AURA.

    Quantic Studio initie uniquement des connexions HTTPS sortantes vers AURA
    Cloud. Le cloud peut ainsi déléguer langage local, voix, automatisations et
    évolution sans exposer le PC sur Internet.
    """

    VERSION = "aura-quantic-worker-v1"

    def __init__(self, aura: Any, settings: Any):
        self.aura = aura
        self.settings = settings
        self.worker_id = (
            f"quantic-{socket.gethostname().casefold()}-{uuid4().hex[:8]}"
        )
        self.session: aiohttp.ClientSession | None = None
        self.task: asyncio.Task[None] | None = None
        self.started = False
        self.last_error = ""
        self.last_seen_at = ""
        self.last_job_id = ""
        self.last_job_kind = ""
        self.jobs_completed = 0
        self.jobs_failed = 0
        self._last_heartbeat = 0.0

    @property
    def enabled(self) -> bool:
        return bool(
            getattr(self.settings, "aura_cloud_worker_enabled", True)
            and str(getattr(self.settings, "aura_cloud_base_url", "") or "").strip()
            and str(getattr(self.settings, "aura_cloud_token", "") or "").strip()
        )

    @property
    def base_url(self) -> str:
        return str(getattr(self.settings, "aura_cloud_base_url", "") or "").rstrip("/")

    @property
    def token(self) -> str:
        return str(getattr(self.settings, "aura_cloud_token", "") or "").strip()

    @property
    def poll_seconds(self) -> float:
        return max(
            0.5,
            min(
                float(getattr(self.settings, "aura_cloud_worker_poll_seconds", 1.5) or 1.5),
                30.0,
            ),
        )

    @property
    def heartbeat_seconds(self) -> int:
        return max(
            5,
            min(
                int(getattr(self.settings, "aura_cloud_worker_heartbeat_seconds", 15) or 15),
                300,
            ),
        )

    @property
    def timeout_seconds(self) -> int:
        return max(
            15,
            min(
                int(getattr(self.settings, "aura_cloud_worker_timeout_seconds", 95) or 95),
                240,
            ),
        )

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": f"AURA-Quantic-Worker/{self.VERSION}",
        }

    async def start(self) -> None:
        if self.started:
            return
        self.started = True
        if not self.enabled:
            self.last_error = (
                "Pont Cloud inactif: AURA_CLOUD_TOKEN ou AURA_CLOUD_BASE_URL manquant"
            )
            logger.info(self.last_error)
            return

        timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
        self.session = aiohttp.ClientSession(timeout=timeout)
        self.task = asyncio.create_task(
            self._loop(),
            name="aura-cloud-quantic-worker",
        )
        logger.info("AURA Quantic worker actif vers %s", self.base_url)

    async def close(self) -> None:
        self.started = False
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

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if self.session is None:
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.timeout_seconds)
            )
        assert self.session is not None
        async with self.session.post(
            f"{self.base_url}{path}",
            json=payload,
            headers=self._headers(),
        ) as response:
            text = await response.text()
            if response.status >= 400:
                raise RuntimeError(
                    f"AURA Cloud HTTP {response.status}: {text[:500]}"
                )
            if not text:
                return {}
            try:
                data = __import__("json").loads(text)
            except Exception as exc:
                raise RuntimeError("AURA Cloud a renvoyé une réponse non JSON") from exc
            return data if isinstance(data, dict) else {}

    def _capabilities(self) -> list[dict[str, Any]]:
        cognitive = getattr(self.aura, "cognitive", None)
        automation = getattr(cognitive, "automation", None)
        registry = getattr(automation, "registry", None)
        definitions = getattr(registry, "action_definitions", {}) or {}
        result: list[dict[str, Any]] = []
        for item in definitions.values():
            result.append(
                {
                    "name": str(getattr(item, "name", "")),
                    "title": str(getattr(item, "title", "")),
                    "category": str(getattr(item, "category", "")),
                    "risk": str(getattr(item, "risk", "safe")),
                }
            )
        return sorted(result, key=lambda row: (row["category"], row["name"]))[:500]

    def _ai_diagnostic(self) -> dict[str, Any]:
        try:
            payload = self.aura.ai.diagnostic()
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}

    def _voice_diagnostic(self) -> dict[str, Any]:
        try:
            payload = self.aura.avatar_audio.diagnostic()
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}

    async def _heartbeat(self) -> None:
        ai = self._ai_diagnostic()
        voice = self._voice_diagnostic()
        identity = dict(voice.get("voice_identity") or {})
        cognitive = getattr(self.aura, "cognitive", None)
        organism = {}
        if cognitive is not None and hasattr(cognitive, "organism_state"):
            try:
                organism = await cognitive.organism_state(public=False)
            except Exception:
                organism = {}

        response = await self._post(
            "/api/bridge/heartbeat",
            {
                "worker_id": self.worker_id,
                "version": self.VERSION,
                "capabilities": self._capabilities(),
                "model": str(
                    ai.get("runtime_model")
                    or ai.get("model")
                    or getattr(self.settings, "ai_model", "")
                ),
                "voice": str(
                    identity.get("current_voice")
                    or identity.get("primary_voice")
                    or "ff_siwis"
                ),
                "engine": str(identity.get("current_engine") or identity.get("primary_engine") or ""),
                "platform": platform.platform(),
                "organism": organism,
            },
        )
        cloud_organism = response.get("organism")
        if (
            cognitive is not None
            and isinstance(cloud_organism, dict)
            and hasattr(cognitive, "import_organism_state")
        ):
            try:
                await cognitive.import_organism_state(cloud_organism)
            except Exception:
                logger.debug("Synchronisation organisme Cloud ignorée", exc_info=True)

        self.last_seen_at = __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat()

    async def _claim(self) -> dict[str, Any] | None:
        payload = await self._post(
            "/api/bridge/claim",
            {"worker_id": self.worker_id},
        )
        job = payload.get("job")
        return job if isinstance(job, dict) and job.get("id") else None

    async def _complete(
        self,
        job_id: str,
        *,
        ok: bool,
        result: dict[str, Any] | None = None,
        error: str = "",
    ) -> None:
        await self._post(
            f"/api/bridge/jobs/{job_id}/complete",
            {
                "worker_id": self.worker_id,
                "ok": bool(ok),
                "result": result or {},
                "error": str(error)[:4000],
            },
        )

    async def _run_inference(self, payload: dict[str, Any]) -> dict[str, Any]:
        prompt = str(payload.get("prompt") or "")
        system = str(payload.get("system") or "")
        max_tokens = max(64, min(int(payload.get("max_tokens") or 700), 8000))
        answer = await self.aura.ai.generate(
            prompt,
            system,
            max_tokens,
            system_is_complete=True,
        )
        return {
            "answer": str(answer or ""),
            "engine": "local",
            "diagnostic": self._ai_diagnostic(),
        }

    async def _run_operator(
        self,
        payload: dict[str, Any],
        requested_risks: list[str],
    ) -> dict[str, Any]:
        cognitive = getattr(self.aura, "cognitive", None)
        if cognitive is None:
            raise RuntimeError("Noyau cognitif local indisponible")
        configured = set(getattr(cognitive, "operator_allowed_risks", set()))
        requested = {str(item).casefold() for item in requested_risks if str(item).strip()}
        # Une mission cloud ne peut jamais élargir la politique locale : elle ne
        # peut que demander un sous-ensemble de ce que Quantic Studio autorise.
        allowed = configured.intersection(requested or configured)
        return await cognitive.operate(
            str(payload.get("task") or ""),
            max_steps=max(1, min(int(payload.get("max_steps") or 6), 8)),
            requested_risks=allowed,
            source="aura-cloud-worker",
        )

    async def _run_tts(self, payload: dict[str, Any]) -> dict[str, Any]:
        text = str(payload.get("text") or "").strip()
        if not text:
            raise ValueError("Texte vocal vide")
        audio_url = await self.aura.avatar_audio.synthesize(
            text,
            rate=float(payload.get("rate") or 1.0),
            pitch=float(payload.get("pitch") or 1.0),
            volume=float(payload.get("volume") or 1.0),
            context=str(payload.get("context") or "aura-cloud"),
        )
        if not audio_url:
            raise RuntimeError(
                str(getattr(self.aura.avatar_audio, "last_error", "") or "Synthèse vocale impossible")
            )

        filename = str(getattr(self.aura.avatar_audio, "last_file", "") or "").strip()
        path = Path(self.aura.avatar_audio.output_dir) / filename
        if not filename or not path.is_file():
            raise RuntimeError("Fichier vocal local introuvable après synthèse")
        data = await asyncio.to_thread(path.read_bytes)
        if len(data) > 9_000_000:
            raise RuntimeError("Réponse vocale trop volumineuse pour le pont Cloud")
        return {
            "audio_base64": base64.b64encode(data).decode("ascii"),
            "mime_type": "audio/wav",
            "engine": str(getattr(self.aura.avatar_audio, "last_engine", "") or ""),
            "voice": str(getattr(self.aura.avatar_audio, "last_voice", "") or "ff_siwis"),
            "duration_ms": int(getattr(self.aura.avatar_audio, "last_audio_duration_ms", 0) or 0),
        }

    async def _run_evolution(self, payload: dict[str, Any]) -> dict[str, Any]:
        evolution = getattr(self.aura, "evolution", None)
        if evolution is None:
            raise RuntimeError("AURA Evolution local indisponible")
        objective = str(payload.get("objective") or "").strip()
        return await evolution.run_cycle(
            objective or await evolution._next_objective(),
            trigger=str(payload.get("trigger") or "aura-cloud-worker"),
            submit=None,
        )

    async def _execute(self, job: dict[str, Any]) -> dict[str, Any]:
        kind = str(job.get("kind") or "")
        payload = dict(job.get("payload") or {})
        risks = [
            str(item)
            for item in (job.get("requested_risks") or [])
            if str(item).strip()
        ]
        if kind == "inference":
            return await self._run_inference(payload)
        if kind == "operator":
            return await self._run_operator(payload, risks)
        if kind == "tts":
            return await self._run_tts(payload)
        if kind == "evolution":
            return await self._run_evolution(payload)
        raise ValueError(f"Type de mission Cloud inconnu: {kind}")

    async def _run_job(self, job: dict[str, Any]) -> None:
        job_id = str(job.get("id") or "")
        self.last_job_id = job_id
        self.last_job_kind = str(job.get("kind") or "")
        try:
            result = await self._execute(job)
            await self._complete(job_id, ok=True, result=result)
            self.jobs_completed += 1
            self.last_error = ""
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            self.jobs_failed += 1
            self.last_error = f"{exc.__class__.__name__}: {exc}"[:1000]
            logger.warning(
                "Mission AURA Cloud %s (%s) en erreur: %s",
                job_id,
                self.last_job_kind,
                self.last_error,
            )
            try:
                await self._complete(job_id, ok=False, error=self.last_error)
            except Exception:
                logger.debug("Impossible de signaler l'échec du job Cloud", exc_info=True)

    async def _loop(self) -> None:
        loop = asyncio.get_running_loop()
        while self.started:
            try:
                now = loop.time()
                if now - self._last_heartbeat >= self.heartbeat_seconds:
                    await self._heartbeat()
                    self._last_heartbeat = now

                job = await self._claim()
                if job:
                    await self._run_job(job)
                    continue
                await asyncio.sleep(self.poll_seconds)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"{exc.__class__.__name__}: {exc}"[:1000]
                logger.warning("Pont AURA Cloud temporairement indisponible: %s", self.last_error)
                await asyncio.sleep(min(max(self.poll_seconds * 2, 2.0), 15.0))

    def diagnostic(self) -> dict[str, Any]:
        return {
            "version": self.VERSION,
            "enabled": self.enabled,
            "started": self.started,
            "worker_id": self.worker_id,
            "cloud_url": self.base_url,
            "token_configured": bool(self.token),
            "last_seen_at": self.last_seen_at,
            "last_job_id": self.last_job_id,
            "last_job_kind": self.last_job_kind,
            "jobs_completed": self.jobs_completed,
            "jobs_failed": self.jobs_failed,
            "last_error": self.last_error,
        }
