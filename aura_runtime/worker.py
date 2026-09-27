from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import math
import os
import platform
import socket
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import aiohttp

logger = logging.getLogger(__name__)


class AuraRuntimeWorker:
    """Worker local universel d'AURA.

    Le transport Cloud, les leases, le Compute Mesh et la distribution des jobs
    appartiennent à AURA Runtime. Les capacités concrètes sont fournies par un
    hôte/adaptateur injecté par un produit Quantic ou par un service autonome.
    """

    VERSION = "aura-runtime-worker-v3"

    def __init__(
        self,
        host: Any,
        settings: Any,
        *,
        fleet_factory: Any = None,
        host_product: str = "",
        runtime_packaging: str = "standalone",
    ):
        self.host = host
        self.settings = settings
        self.fleet_factory = fleet_factory
        self.host_product = str(host_product or "").strip()
        self.runtime_packaging = str(runtime_packaging or "standalone").strip()
        self.worker_id = self._resolve_worker_id()
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
        self._product_observed_at: dict[str, float] = {}

    @property
    def compute_consent(self) -> bool:
        return bool(getattr(self.settings, "aura_compute_mesh_consent", False))

    def _resolve_worker_id(self) -> str:
        if not self.compute_consent:
            return f"aura-runtime-{socket.gethostname().casefold()}-{uuid4().hex[:8]}"
        path = Path(
            getattr(
                self.settings,
                "aura_compute_mesh_identity_file",
                Path("data") / "compute-mesh-node-id",
            )
        )
        try:
            if path.is_file():
                token = path.read_text(encoding="utf-8").strip()
                if token:
                    return f"mesh-{token[:48]}"
            token = uuid4().hex
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(token, encoding="utf-8")
            return f"mesh-{token}"
        except Exception:
            return f"mesh-{uuid4().hex}"

    @staticmethod
    def _physical_ram_bytes() -> int:
        try:
            if hasattr(os, "sysconf"):
                pages = int(os.sysconf("SC_PHYS_PAGES"))
                page_size = int(os.sysconf("SC_PAGE_SIZE"))
                if pages > 0 and page_size > 0:
                    return pages * page_size
        except Exception:
            pass
        if os.name == "nt":
            try:
                import ctypes

                class MemoryStatusEx(ctypes.Structure):
                    _fields_ = [
                        ("dwLength", ctypes.c_ulong),
                        ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong),
                        ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong),
                        ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong),
                        ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                    ]

                status = MemoryStatusEx()
                status.dwLength = ctypes.sizeof(MemoryStatusEx)
                if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                    return int(status.ullTotalPhys)
            except Exception:
                pass
        return 0

    def _available_models(self) -> list[str]:
        ai_service = getattr(self.host, "ai", None)
        constellation = getattr(ai_service, "constellation", None)
        installed = list(getattr(constellation, "installed", []) or [])
        models = [
            str(item.get("name") or "").strip()
            for item in installed
            if isinstance(item, dict) and str(item.get("name") or "").strip()
        ]
        fallback = str(
            getattr(ai_service, "active_model", "")
            or getattr(self.settings, "ai_model", "")
            or ""
        ).strip()
        if fallback and fallback not in models:
            models.append(fallback)
        return models[:16]

    def _mesh_capabilities(self) -> list[str]:
        if not self.compute_consent:
            return []
        capabilities = ["compute"]
        if bool(getattr(getattr(self.host, "ai", None), "enabled", False)):
            capabilities.append("inference")
            if (
                bool(getattr(self.settings, "ai_constellation_moa_enabled", False))
                and len(self._available_models()) >= 2
            ):
                capabilities.append("moa")
        return capabilities

    def _job_kinds(self) -> list[str]:
        kinds = {"compute"}
        ai = getattr(self.host, "ai", None)
        if bool(getattr(ai, "enabled", False)) and callable(getattr(ai, "generate", None)):
            kinds.add("inference")
        operator = getattr(self.host, "operator", None) or getattr(self.host, "cognitive", None)
        if operator is not None and callable(getattr(operator, "operate", None)):
            kinds.add("operator")
        voice = getattr(self.host, "avatar_audio", None)
        if voice is not None and callable(getattr(voice, "synthesize", None)):
            kinds.add("tts")
        image = getattr(self.host, "image", None)
        if image is not None and callable(getattr(image, "generate", None)):
            kinds.add("image")
        evolution = getattr(self.host, "evolution", None)
        github_token = str(getattr(evolution, "github_token", "") or "").strip()
        if evolution is not None and self.fleet_factory is not None and github_token:
            kinds.add("evolution")
        return sorted(kinds)

    def _resource_profile(self) -> dict[str, Any]:
        ai = self._ai_diagnostic()
        model = str(
            ai.get("runtime_model")
            or ai.get("model")
            or getattr(self.settings, "ai_model", "")
            or ""
        )
        accelerator = str(
            ai.get("device")
            or ai.get("accelerator")
            or ai.get("gpu")
            or ""
        )
        return {
            "cpu_threads": int(os.cpu_count() or 1),
            "ram_bytes": self._physical_ram_bytes(),
            "gpu": accelerator,
            "models": self._available_models() or ([model] if model else []),
            "platform": platform.system(),
            "architecture": platform.machine(),
            "runtime_role": "aura-runtime",
            "runtime_host_product": self.host_product,
            "runtime_packaging": self.runtime_packaging,
            "job_kinds": self._job_kinds(),
        }

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
            "User-Agent": f"AURA-Runtime/{self.VERSION}",
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
            name="aura-runtime-worker",
        )
        logger.info("AURA Runtime worker actif vers %s", self.base_url)

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

    async def observe_product(
        self,
        product_id: str,
        *,
        state: str = "online",
        detail: str = "",
        metadata: dict[str, Any] | None = None,
        min_interval_seconds: float = 60.0,
    ) -> bool:
        """Forward operational product presence to AURA Cloud, never user content."""
        if not self.enabled:
            return False
        product = str(product_id or "").strip().lower()[:80]
        if not product:
            return False
        now = time.monotonic()
        previous = float(self._product_observed_at.get(product, 0.0))
        if now - previous < max(5.0, float(min_interval_seconds)):
            return True
        try:
            await self._post(
                f"/api/aura/products/{product}/observe",
                {
                    "state": str(state or "online")[:40],
                    "detail": str(detail or "")[:500],
                    "metadata": {
                        **(metadata or {}),
                        "via": "aura-runtime",
                        "runtime_host_product": self.host_product,
                        "runtime_packaging": self.runtime_packaging,
                        "content_forwarded": False,
                    },
                },
            )
            self._product_observed_at[product] = now
            return True
        except Exception:
            return False

    async def mesh_peer_register(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post(
            "/api/mesh/peer/register",
            {**dict(payload or {}), "worker_id": self.worker_id},
        )

    async def mesh_peer_signal(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post(
            "/api/mesh/peer/signal",
            {**dict(payload or {}), "worker_id": self.worker_id},
        )

    async def mesh_peer_poll(self, peer_id: str, after_id: int = 0) -> dict[str, Any]:
        return await self._post(
            "/api/mesh/peer/poll",
            {
                "worker_id": self.worker_id,
                "peer_id": str(peer_id or "")[:80],
                "after_id": max(0, int(after_id or 0)),
            },
        )

    async def mesh_peer_complete(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post(
            "/api/mesh/peer/complete",
            {**dict(payload or {}), "worker_id": self.worker_id},
        )

    async def mesh_moa(
        self,
        *,
        prompt: str,
        system: str = "",
        max_tokens: int = 700,
        max_agents: int = 3,
    ) -> dict[str, Any]:
        """Ask AURA Cloud to orchestrate a distributed Mixture-of-Agents.

        The Cloud token remains inside AURA Runtime; browser clients never
        receive it.
        If the cloud mesh is unavailable, callers can fall back to the local
        constellation without weakening privacy.
        """
        if not self.enabled:
            raise RuntimeError("Pont AURA Cloud non configuré")
        return await self._post(
            "/api/mesh/execute",
            {
                "kind": "moa",
                "payload": {
                    "prompt": str(prompt or "")[:50_000],
                    "system": str(system or "")[:20_000],
                    "max_tokens": max(128, min(int(max_tokens or 700), 4000)),
                    "max_agents": max(2, min(int(max_agents or 3), 3)),
                },
                "max_agents": max(2, min(int(max_agents or 3), 3)),
                "timeout_ms": self.timeout_seconds * 1000,
            },
        )

    def _capabilities(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []

        operator = getattr(self.host, "operator", None)
        if operator is not None and callable(getattr(operator, "capabilities", None)):
            try:
                for item in list(operator.capabilities() or []):
                    if not isinstance(item, dict):
                        continue
                    result.append(
                        {
                            "name": str(item.get("name") or ""),
                            "title": str(item.get("title") or ""),
                            "category": str(item.get("category") or ""),
                            "risk": str(item.get("risk") or "safe"),
                        }
                    )
            except Exception:
                logger.debug("Catalogue AURA Runtime Operator indisponible", exc_info=True)

        cognitive = getattr(self.host, "cognitive", None)
        automation = getattr(cognitive, "automation", None)
        registry = getattr(automation, "registry", None)
        definitions = getattr(registry, "action_definitions", {}) or {}
        for item in definitions.values():
            result.append(
                {
                    "name": str(getattr(item, "name", "")),
                    "title": str(getattr(item, "title", "")),
                    "category": str(getattr(item, "category", "")),
                    "risk": str(getattr(item, "risk", "safe")),
                }
            )

        unique: dict[str, dict[str, Any]] = {}
        for row in result:
            name = str(row.get("name") or "").strip()
            if name:
                unique[name] = row
        return sorted(unique.values(), key=lambda row: (row["category"], row["name"]))[:500]

    def _ai_diagnostic(self) -> dict[str, Any]:
        try:
            payload = self.host.ai.diagnostic()
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}

    def _voice_diagnostic(self) -> dict[str, Any]:
        try:
            payload = self.host.avatar_audio.diagnostic()
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}

    async def _heartbeat(self) -> None:
        ai = self._ai_diagnostic()
        voice = self._voice_diagnostic()
        identity = dict(voice.get("voice_identity") or {})
        cognitive = getattr(self.host, "cognitive", None)
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
                "compute_consent": self.compute_consent,
                "mesh_capabilities": self._mesh_capabilities(),
                "resources": self._resource_profile(),
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

    async def _renew(self, job_id: str) -> dict[str, Any]:
        return await self._post(
            f"/api/bridge/jobs/{job_id}/renew",
            {"worker_id": self.worker_id},
        )

    async def _lease_renewer(self, job_id: str, lease_until_ms: float = 0.0) -> None:
        deadline_ms = float(lease_until_ms or 0.0)
        while self.started:
            now_ms = time.time() * 1000.0
            remaining_seconds = max(0.0, (deadline_ms - now_ms) / 1000.0)
            # Renouvelle bien avant l'expiration, même si le serveur est configuré
            # avec le minimum autorisé de 15 secondes.
            interval = (
                max(1.0, min(30.0, remaining_seconds * 0.45))
                if remaining_seconds > 0.0
                else 5.0
            )
            await asyncio.sleep(interval)
            try:
                response = await self._renew(job_id)
                renewed = float(response.get("lease_until") or 0.0)
                if renewed > 0.0:
                    deadline_ms = renewed
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Renouvellement lease AURA Cloud %s impossible: %s",
                    job_id,
                    exc,
                )

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
        answer = await self.host.ai.generate(
            prompt,
            system,
            max_tokens,
            system_is_complete=True,
            task_role=str(payload.get("task_role") or "auto"),
            preferred_model=str(payload.get("preferred_model") or ""),
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
        operator = getattr(self.host, "operator", None) or getattr(self.host, "cognitive", None)
        if operator is None or not callable(getattr(operator, "operate", None)):
            raise RuntimeError("AURA Runtime Operator indisponible")
        configured = set(getattr(operator, "operator_allowed_risks", set()))
        requested = {str(item).casefold() for item in requested_risks if str(item).strip()}
        # Une mission Cloud ne peut jamais élargir la politique locale : elle ne
        # peut demander qu'un sous-ensemble de ce qu'AURA Runtime autorise.
        allowed = configured.intersection(requested or configured)
        return await operator.operate(
            str(payload.get("task") or ""),
            max_steps=max(1, min(int(payload.get("max_steps") or 6), 8)),
            requested_risks=allowed,
            source="aura-runtime-worker",
        )

    async def _run_tts(self, payload: dict[str, Any]) -> dict[str, Any]:
        text = str(payload.get("text") or "").strip()
        if not text:
            raise ValueError("Texte vocal vide")
        audio_url = await self.host.avatar_audio.synthesize(
            text,
            rate=float(payload.get("rate") or 1.0),
            pitch=float(payload.get("pitch") or 1.0),
            volume=float(payload.get("volume") or 1.0),
            context=str(payload.get("context") or "aura-cloud"),
        )
        if not audio_url:
            raise RuntimeError(
                str(getattr(self.host.avatar_audio, "last_error", "") or "Synthèse vocale impossible")
            )

        filename = str(getattr(self.host.avatar_audio, "last_file", "") or "").strip()
        path = Path(self.host.avatar_audio.output_dir) / filename
        if not filename or not path.is_file():
            raise RuntimeError("Fichier vocal local introuvable après synthèse")
        data = await asyncio.to_thread(path.read_bytes)
        if len(data) > 9_000_000:
            raise RuntimeError("Réponse vocale trop volumineuse pour le pont Cloud")
        return {
            "audio_base64": base64.b64encode(data).decode("ascii"),
            "mime_type": "audio/wav",
            "engine": str(getattr(self.host.avatar_audio, "last_engine", "") or ""),
            "voice": str(getattr(self.host.avatar_audio, "last_voice", "") or "ff_siwis"),
            "duration_ms": int(getattr(self.host.avatar_audio, "last_audio_duration_ms", 0) or 0),
        }

    async def _run_image(self, payload: dict[str, Any]) -> dict[str, Any]:
        image = getattr(self.host, "image", None)
        if image is None:
            raise RuntimeError("Moteur image local indisponible")
        result = await image.generate(
            str(payload.get("prompt") or ""),
            negative_prompt=str(payload.get("negative_prompt") or ""),
            width=int(payload.get("width") or self.settings.image_default_width),
            height=int(payload.get("height") or self.settings.image_default_height),
            steps=int(payload.get("steps") or self.settings.image_default_steps),
            seed=int(payload["seed"]) if payload.get("seed") is not None else None,
            model=str(payload.get("model") or ""),
        )
        path = Path(str(result.get("path") or ""))
        encoded = ""
        if path.is_file():
            data = await asyncio.to_thread(path.read_bytes)
            if len(data) <= 12_000_000:
                encoded = base64.b64encode(data).decode("ascii")
        return {
            **result,
            "image_base64": encoded,
        }

    async def _run_compute(self, payload: dict[str, Any]) -> dict[str, Any]:
        op = str(payload.get("op") or "").strip().casefold()

        def numbers(value: Any) -> list[float]:
            rows = list(value or [])
            if len(rows) > 4096:
                raise ValueError("Vecteur Compute Mesh trop volumineux")
            result = [float(item) for item in rows]
            if any(not math.isfinite(item) for item in result):
                raise ValueError("Valeur non finie interdite")
            return result

        if op == "sha256":
            raw = str(payload.get("text") or payload.get("value") or "")
            value: Any = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        elif op == "sum":
            value = sum(numbers(payload.get("values")))
        elif op in {"dot", "cosine"}:
            left = numbers(payload.get("left"))
            right = numbers(payload.get("right"))
            if len(left) != len(right):
                raise ValueError("Les vecteurs doivent avoir la même taille")
            dot = sum(a * b for a, b in zip(left, right, strict=True))
            if op == "dot":
                value = dot
            else:
                norm_left = math.sqrt(sum(item * item for item in left))
                norm_right = math.sqrt(sum(item * item for item in right))
                value = 0.0 if not norm_left or not norm_right else dot / (norm_left * norm_right)
        else:
            raise ValueError(f"Opération Compute Mesh inconnue: {op}")

        return {
            "op": op,
            "value": value,
            "engine": "python-stdlib",
            "deterministic": True,
        }

    async def _run_evolution(self, payload: dict[str, Any]) -> dict[str, Any]:
        evolution = getattr(self.host, "evolution", None)
        if evolution is None:
            raise RuntimeError("AURA Evolution local indisponible")
        objective = str(payload.get("objective") or "").strip()
        trigger = str(payload.get("trigger") or "aura-runtime-worker")
        repository = str(payload.get("repository") or "").strip()
        base_branch = str(payload.get("base_branch") or "main").strip() or "main"

        if repository and repository.casefold() != str(evolution.github_repository).casefold():
            if self.fleet_factory is None:
                raise RuntimeError("Adaptateur Evolution Fleet indisponible dans cet hôte AURA Runtime")
            fleet = self.fleet_factory(evolution)
            return await fleet.run_cycle(
                objective or "Diagnostiquer et améliorer ce produit Quantic de façon minimale et réversible.",
                repository=repository,
                base_branch=base_branch,
                trigger=trigger,
                submit=bool(evolution.auto_submit),
            )

        return await evolution.run_cycle(
            objective or await evolution._next_objective(),
            trigger=trigger,
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
        if kind == "compute":
            return await self._run_compute(payload)
        if kind == "inference":
            return await self._run_inference(payload)
        if kind == "operator":
            return await self._run_operator(payload, risks)
        if kind == "tts":
            return await self._run_tts(payload)
        if kind == "image":
            return await self._run_image(payload)
        if kind == "evolution":
            return await self._run_evolution(payload)
        raise ValueError(f"Type de mission Cloud inconnu: {kind}")

    async def _run_job(self, job: dict[str, Any]) -> None:
        job_id = str(job.get("id") or "")
        self.last_job_id = job_id
        self.last_job_kind = str(job.get("kind") or "")
        lease_task = asyncio.create_task(
            self._lease_renewer(
                job_id,
                float(job.get("lease_until") or 0.0),
            ),
            name=f"aura-cloud-lease-{job_id[:8]}",
        )
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
        finally:
            lease_task.cancel()
            try:
                await lease_task
            except asyncio.CancelledError:
                pass

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
            "compute_consent": self.compute_consent,
            "mesh_capabilities": self._mesh_capabilities(),
            "peer_mesh_enabled": self.compute_consent,
            "resources": self._resource_profile(),
            "cloud_url": self.base_url,
            "token_configured": bool(self.token),
            "last_seen_at": self.last_seen_at,
            "last_job_id": self.last_job_id,
            "last_job_kind": self.last_job_kind,
            "jobs_completed": self.jobs_completed,
            "jobs_failed": self.jobs_failed,
            "last_error": self.last_error,
        }
