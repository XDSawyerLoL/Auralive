from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from time import monotonic
from typing import Any
from urllib.parse import urlparse

import aiohttp

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ModelProfile:
    key: str
    patterns: tuple[str, ...]
    roles: dict[str, float]
    license: str
    legal_class: str
    family: str
    notes: str = ""
    install_hint: str = ""
    min_ram_gb: int = 0
    tags: tuple[str, ...] = field(default_factory=tuple)


CATALOG: tuple[ModelProfile, ...] = (
    ModelProfile(
        key="gpt-oss-20b",
        patterns=("gpt-oss:20b", "gpt-oss"),
        roles={
            "reasoning": 1.00,
            "tools": 1.00,
            "critic": 0.96,
            "code": 0.92,
            "research": 0.90,
            "general": 0.88,
            "conversation": 0.76,
        },
        license="Apache-2.0",
        legal_class="permissive",
        family="gpt-oss",
        notes="MoE local, bon choix pour raisonnement et outils.",
        install_hint="gpt-oss:20b",
        min_ram_gb=16,
        tags=("tools", "reasoning", "moe", "open-weight"),
    ),
    ModelProfile(
        key="deepseek-r1",
        patterns=("deepseek-r1", "deepseek-r1:8b", "deepseek-r1:14b", "deepseek-r1:32b"),
        roles={
            "reasoning": 0.99,
            "critic": 0.96,
            "research": 0.91,
            "code": 0.89,
            "math": 1.00,
            "general": 0.80,
            "conversation": 0.67,
        },
        license="MIT (repo R1; vérifier le tag dérivé exact)",
        legal_class="permissive-with-base-check",
        family="deepseek",
        notes="Spécialisé raisonnement; idéal en second cerveau/critique.",
        install_hint="deepseek-r1:8b",
        min_ram_gb=8,
        tags=("reasoning", "math", "critic", "open-weight"),
    ),
    ModelProfile(
        key="dolphin-mistral",
        patterns=("dolphin-mistral",),
        roles={
            "empathy": 0.95,
            "conversation": 0.93,
            "code": 0.84,
            "general": 0.88,
            "tools": 0.76,
            "research": 0.72,
        },
        license="Apache-2.0",
        legal_class="permissive",
        family="dolphin",
        notes="Mistral/Dolphin local steerable; utile pour conversation et empathie.",
        install_hint="dolphin-mistral:7b",
        min_ram_gb=8,
        tags=("conversation", "empathy", "steerable", "open-weight"),
    ),
    ModelProfile(
        key="dolphin3",
        patterns=("dolphin3",),
        roles={
            "conversation": 0.95,
            "empathy": 0.90,
            "tools": 0.86,
            "code": 0.84,
            "general": 0.91,
            "research": 0.76,
        },
        license="Llama 3.1 Community (base model)",
        legal_class="community-license",
        family="dolphin",
        notes="Très steerable mais pas Apache/MIT : licence communautaire Llama.",
        install_hint="dolphin3:8b",
        min_ram_gb=8,
        tags=("conversation", "tools", "steerable"),
    ),
    ModelProfile(
        key="hermes3",
        patterns=("hermes3",),
        roles={
            "tools": 0.96,
            "conversation": 0.94,
            "empathy": 0.88,
            "general": 0.91,
            "code": 0.86,
            "reasoning": 0.84,
            "research": 0.80,
        },
        license="Llama 3 Community",
        legal_class="community-license",
        family="hermes",
        notes="Agentique et très steerable; licence Llama, pas Apache/MIT.",
        install_hint="hermes3:8b",
        min_ram_gb=8,
        tags=("tools", "conversation", "agentic"),
    ),
    ModelProfile(
        key="hermes4",
        patterns=("hermes-4", "hermes4"),
        roles={
            "tools": 0.99,
            "reasoning": 0.94,
            "conversation": 0.94,
            "empathy": 0.88,
            "code": 0.90,
            "general": 0.93,
        },
        license="Apache-2.0",
        legal_class="permissive",
        family="hermes",
        notes="Hermes 4 Qwen3: bon candidat si servi par vLLM/llama.cpp/OpenAI-compatible.",
        install_hint="NousResearch/Hermes-4-14B",
        min_ram_gb=16,
        tags=("tools", "reasoning", "agentic", "open-weight"),
    ),
    ModelProfile(
        key="qwen3",
        patterns=("qwen3",),
        roles={
            "general": 0.92,
            "reasoning": 0.91,
            "code": 0.89,
            "tools": 0.88,
            "research": 0.86,
            "conversation": 0.82,
        },
        license="Apache-2.0 (selon tag officiel Qwen3)",
        legal_class="permissive-with-tag-check",
        family="qwen",
        notes="Polyvalent et efficace; bon compromis local.",
        install_hint="qwen3:8b",
        min_ram_gb=8,
        tags=("general", "reasoning", "tools", "open-weight"),
    ),
    ModelProfile(
        key="phi4-mini",
        patterns=("phi4-mini", "phi4:mini"),
        roles={
            "fast": 1.00,
            "general": 0.78,
            "tools": 0.72,
            "code": 0.70,
            "conversation": 0.70,
        },
        license="MIT (selon distribution Microsoft officielle)",
        legal_class="permissive-with-tag-check",
        family="phi",
        notes="Petit modèle rapide pour tâches simples.",
        install_hint="phi4-mini",
        min_ram_gb=4,
        tags=("fast", "small", "open-weight"),
    ),
    ModelProfile(
        key="gemma",
        patterns=("gemma3", "gemma2", "gemma"),
        roles={
            "general": 0.86,
            "conversation": 0.82,
            "fast": 0.75,
            "vision": 0.78,
        },
        license="Gemma Terms",
        legal_class="custom-license",
        family="gemma",
        notes="Fallback local existant; licence spécifique Google.",
        install_hint="gemma3:4b",
        min_ram_gb=6,
        tags=("general", "vision"),
    ),
)


class ModelConstellation:
    """Routeur adaptatif entre plusieurs modèles locaux.

    AURA garde l'intention et la décision. La constellation choisit seulement
    le moteur linguistique/sémantique le plus rentable pour la tâche.
    """

    VERSION = "aura-model-constellation-v2"

    def __init__(self, settings: Any):
        self.settings = settings
        self.session: aiohttp.ClientSession | None = None
        self.last_refresh = 0.0
        self.installed: list[dict[str, Any]] = []
        self.last_route: dict[str, Any] = {}
        self.last_ensemble: dict[str, Any] = {}
        self.last_error = ""
        self.route_counts: dict[str, int] = {}
        self.latencies: dict[str, list[int]] = {}

    async def start(self, session: aiohttp.ClientSession | None = None) -> None:
        self.session = session or self.session
        await self.refresh(force=True)

    async def close(self) -> None:
        # La session appartient normalement à AuraAI.
        self.session = None

    @staticmethod
    def profile_for(name: str) -> ModelProfile | None:
        lowered = str(name or "").casefold()
        for profile in CATALOG:
            if any(pattern.casefold() in lowered for pattern in profile.patterns):
                return profile
        return None

    def _decode_installed(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        installed: list[dict[str, Any]] = []
        for row in rows:
            name = str(row.get("name") or row.get("model") or "").strip()
            if not name:
                continue
            profile = self.profile_for(name)
            installed.append(
                {
                    "name": name,
                    "size": int(row.get("size") or 0),
                    "modified_at": row.get("modified_at"),
                    "profile": profile.key if profile else "unknown",
                    "family": profile.family if profile else "unknown",
                    "license": profile.license if profile else "unknown",
                    "legal_class": profile.legal_class if profile else "unknown",
                    "roles": dict(profile.roles) if profile else {},
                    "tags": list(profile.tags) if profile else [],
                }
            )
        return installed

    async def _read_tags(self, base_url: str, *, timeout: float = 5.0) -> list[dict[str, Any]]:
        if self.session is None:
            raise RuntimeError("Session Ollama indisponible")
        async with self.session.get(
            f"{str(base_url).rstrip('/')}/api/tags",
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as response:
            response.raise_for_status()
            payload = await response.json()
        return list(payload.get("models") or [])

    async def refresh(self, *, force: bool = False) -> list[dict[str, Any]]:
        if str(getattr(self.settings, "ai_mode", "")).casefold() != "ollama":
            return self.installed
        if not force and monotonic() - self.last_refresh < 15:
            return self.installed
        if self.session is None:
            return self.installed

        try:
            rows = await self._read_tags(self.settings.ai_base_url)
            self.installed = self._decode_installed(rows)
            self.last_refresh = monotonic()
            self.last_error = ""
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"{exc.__class__.__name__}: {exc}"[:500]
        return self.installed

    def infer_role(
        self,
        messages: list[dict[str, str]] | None = None,
        *,
        explicit: str = "auto",
    ) -> str:
        explicit = str(explicit or "auto").strip().casefold()
        if explicit and explicit != "auto":
            return explicit

        text = " ".join(str(item.get("content") or "") for item in (messages or [])[-4:]).casefold()
        if not text:
            return "general"

        if any(token in text for token in (
            "function", "tool", "json", "automation", "action", "catalogue",
            "outil", "exécute", "execute", "api", "schema",
        )):
            return "tools"
        if any(token in text for token in (
            "python", "javascript", "typescript", "rust", "sql", "bug", "code",
            "refactor", "compile", "test", "github", "pull request",
        )):
            return "code"
        if any(token in text for token in (
            "preuve", "démontrer", "demontrer", "math", "équation", "equation",
            "raisonne", "analyse approfondie", "compare", "hypothèse", "hypothese",
        )):
            return "reasoning"
        if any(token in text for token in (
            "je me sens", "triste", "heureux", "angoiss", "émotion", "emotion",
            "empath", "relation", "ressens", "confiance",
        )):
            return "empathy"
        if any(token in text for token in ("cherche", "recherche", "source", "document", "actualité", "actualite")):
            return "research"
        if len(text) < 180 and any(token in text for token in ("bonjour", "salut", "merci", "ok", "oui", "non")):
            return "fast"
        return "conversation"

    def _performance_bonus(self, name: str) -> float:
        samples = self.latencies.get(name) or []
        if not samples:
            return 0.0
        avg = sum(samples[-8:]) / max(1, len(samples[-8:]))
        if avg <= 1500:
            return 0.12
        if avg <= 4000:
            return 0.06
        if avg >= 15000:
            return -0.12
        return 0.0

    def _license_bonus(self, legal_class: str) -> float:
        if legal_class == "permissive":
            return 0.08
        if legal_class.startswith("permissive"):
            return 0.05
        if legal_class == "community-license":
            return -0.02
        return 0.0

    async def choose(
        self,
        role: str,
        *,
        preferred: str = "",
        exclude: set[str] | None = None,
    ) -> dict[str, Any]:
        await self.refresh()
        excluded = {str(item).casefold() for item in (exclude or set())}
        role = str(role or "general").casefold()

        if preferred:
            exact = next(
                (row for row in self.installed if row["name"].casefold() == preferred.casefold()),
                None,
            )
            if exact and exact["name"].casefold() not in excluded:
                return {**exact, "role": role, "score": 2.0, "reason": "preferred"}

        candidates: list[tuple[float, dict[str, Any]]] = []
        for row in self.installed:
            if row["name"].casefold() in excluded:
                continue
            profile = self.profile_for(row["name"])
            if profile:
                role_score = float(profile.roles.get(role, profile.roles.get("general", 0.55)))
                score = role_score + self._performance_bonus(row["name"]) + self._license_bonus(profile.legal_class)
            else:
                score = 0.46 + self._performance_bonus(row["name"])
            # Évite de charger un gros modèle pour un réflexe simple.
            if role == "fast":
                gb = float(row.get("size") or 0) / (1024**3)
                score += max(-0.25, min(0.18, (8.0 - gb) * 0.025))
            candidates.append((score, row))

        if not candidates:
            fallback = str(
                getattr(self.settings, "ai_fast_model", "")
                or getattr(self.settings, "ai_model", "")
            )
            return {
                "name": fallback,
                "profile": "configured",
                "family": "configured",
                "license": "unknown",
                "legal_class": "unknown",
                "roles": {},
                "role": role,
                "score": 0.0,
                "reason": "configured-fallback",
            }

        candidates.sort(key=lambda pair: pair[0], reverse=True)
        score, row = candidates[0]
        route = {
            **row,
            "role": role,
            "score": round(score, 4),
            "reason": "adaptive-role-router",
        }
        self.last_route = route
        self.route_counts[row["name"]] = self.route_counts.get(row["name"], 0) + 1
        return route

    async def choose_many(
        self,
        role: str,
        *,
        count: int = 2,
        preferred: str = "",
        exclude: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        wanted = max(1, min(int(count or 1), 4))
        blocked = {str(item).casefold() for item in (exclude or set())}
        chosen: list[dict[str, Any]] = []
        for index in range(wanted):
            route = await self.choose(
                role,
                preferred=preferred if index == 0 else "",
                exclude=blocked,
            )
            name = str(route.get("name") or "").strip()
            if not name or name.casefold() in blocked:
                break
            chosen.append(route)
            blocked.add(name.casefold())
        self.last_ensemble = {
            "role": str(role or "general"),
            "models": [str(item.get("name") or "") for item in chosen],
            "count": len(chosen),
            "mode": "ranked-specialists",
        }
        return chosen

    def record_ensemble(
        self,
        *,
        role: str,
        models: list[str],
        synthesizer: str,
        successful: int,
        elapsed_ms: int,
    ) -> None:
        self.last_ensemble = {
            "role": str(role or "general"),
            "models": [str(item) for item in models if item],
            "synthesizer": str(synthesizer or ""),
            "successful": max(0, int(successful)),
            "elapsed_ms": max(0, int(elapsed_ms)),
            "mode": "mixture-of-agents",
        }

    def record_latency(self, model: str, latency_ms: int) -> None:
        if not model:
            return
        values = self.latencies.setdefault(model, [])
        values.append(max(0, int(latency_ms)))
        if len(values) > 32:
            del values[:-32]

    async def pull(
        self,
        model: str,
        *,
        base_url: str | None = None,
    ) -> dict[str, Any]:
        if self.session is None:
            raise RuntimeError("Session Ollama indisponible")
        wanted = str(model or "").strip()
        if not wanted or len(wanted) > 180 or not re.fullmatch(r"[A-Za-z0-9._:/-]+", wanted):
            raise ValueError("Nom de modèle invalide")

        target = str(base_url or getattr(self.settings, "ai_base_url", "") or "").strip().rstrip("/")
        parsed = urlparse(target)
        if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("Pour l'installation automatique, Ollama doit être local.")

        # Valide l'endpoint AVANT de toucher à la configuration active.
        await self._read_tags(target, timeout=5)
        async with self.session.post(
            f"{target}/api/pull",
            timeout=aiohttp.ClientTimeout(total=3600),
            json={"name": wanted, "stream": False},
        ) as response:
            response.raise_for_status()
            payload = await response.json()

        rows = await self._read_tags(target, timeout=10)
        installed = self._decode_installed(rows)
        present = any(row["name"].split(":")[0] == wanted.split(":")[0] for row in installed)
        if not present:
            raise RuntimeError("Ollama a répondu mais le modèle n'apparaît pas dans /api/tags.")

        self.installed = installed
        self.last_refresh = monotonic()
        self.last_error = ""
        return {
            "ok": True,
            "model": wanted,
            "status": str(payload.get("status") or "success"),
            "installed": True,
            "base_url": target,
        }

    async def catalog(self) -> dict[str, Any]:
        await self.refresh()
        installed_names = {row["name"].casefold() for row in self.installed}
        recommendations = []
        for profile in CATALOG:
            recommendations.append(
                {
                    "key": profile.key,
                    "family": profile.family,
                    "license": profile.license,
                    "legal_class": profile.legal_class,
                    "roles": dict(profile.roles),
                    "notes": profile.notes,
                    "install_hint": profile.install_hint,
                    "min_ram_gb": profile.min_ram_gb,
                    "tags": list(profile.tags),
                    "installed": any(
                        any(pattern.casefold() in name for pattern in profile.patterns)
                        for name in installed_names
                    ),
                }
            )
        return {
            "version": self.VERSION,
            "backend": str(getattr(self.settings, "ai_mode", "")),
            "base_url": str(getattr(self.settings, "ai_base_url", "")),
            "installed": list(self.installed),
            "recommendations": recommendations,
            "last_route": dict(self.last_route),
            "last_ensemble": dict(self.last_ensemble),
            "route_counts": dict(self.route_counts),
            "last_error": self.last_error,
            "principle": "AURA decides; models are replaceable specialist tools.",
        }
