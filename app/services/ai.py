from __future__ import annotations

import asyncio
import logging
import random
import re
from time import monotonic
from typing import Any

import aiohttp

from app.config import Settings
from app.core.identity import AuraIdentity

logger = logging.getLogger(__name__)

_FAST_MODEL_HINTS = (
    "phi4-mini",
    "phi3:mini",
    "gemma3:4b",
    "gemma3:1b",
    "qwen3:4b",
    "qwen2.5:3b",
    "llama3.2:3b",
    "llama3.2:1b",
    "smollm",
)


class AuraAI:
    def __init__(self, settings: Settings, identity: AuraIdentity):
        self.settings = settings
        self.identity = identity
        self.session: aiohttp.ClientSession | None = None
        self.warmup_task: asyncio.Task[None] | None = None
        self.detected_fast_model: str = ""
        self.runtime_model: str = ""
        self.consecutive_failures = 0
        self.degraded_until = 0.0
        self.last_error = ""
        self.last_latency_ms = 0

    async def start(self) -> None:
        if not self.session:
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=max(10, self.settings.ai_timeout_seconds))
            )
        if self.enabled and self.settings.ai_warmup_enabled and not self.warmup_task:
            self.warmup_task = asyncio.create_task(self._warmup(), name="mairaiy-ai-warmup")

    async def _warmup(self) -> None:
        """Charge le modèle sans bloquer Aura Live ni publier sur Twitch."""
        try:
            await asyncio.wait_for(
                self._prepare_runtime_model(),
                timeout=max(3, self.settings.ai_warmup_timeout_seconds),
            )
            await asyncio.wait_for(
                self.generate(
                    "Réponds uniquement par OK.",
                    "Initialisation silencieuse. Aucun commentaire supplémentaire.",
                    2,
                ),
                timeout=max(3, self.settings.ai_warmup_timeout_seconds),
            )
            logger.info("Moteur IA préchargé avec %s", self.active_model)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self._register_failure(exc)
            logger.info("Préchargement IA indisponible: %s", self._error_label(exc))

    async def close(self) -> None:
        if self.warmup_task:
            self.warmup_task.cancel()
            try:
                await self.warmup_task
            except asyncio.CancelledError:
                pass
            self.warmup_task = None
        if self.session:
            await self.session.close()
            self.session = None

    @property
    def enabled(self) -> bool:
        return self.settings.ai_mode in {"ollama", "openai_compatible"}

    @property
    def active_model(self) -> str:
        return (
            self.runtime_model
            or self.settings.ai_fast_model
            or self.detected_fast_model
            or self.settings.ai_model
        )

    @property
    def degraded(self) -> bool:
        return monotonic() < self.degraded_until

    async def recover(self) -> dict[str, Any]:
        """Réinitialise le coupe-circuit et redétecte un modèle local rapide."""
        self.consecutive_failures = 0
        self.degraded_until = 0.0
        self.last_error = ""
        self.detected_fast_model = ""
        self.runtime_model = ""
        await self.start()
        await self._prepare_runtime_model(force=True)
        return self.diagnostic()

    def diagnostic(self) -> dict[str, Any]:
        remaining = max(0, round(self.degraded_until - monotonic()))
        return {
            "enabled": self.enabled,
            "mode": self.settings.ai_mode,
            "base_url": self.settings.ai_base_url,
            "configured_model": self.settings.ai_model,
            "configured_fast_model": self.settings.ai_fast_model,
            "detected_fast_model": self.detected_fast_model,
            "active_model": self.active_model,
            "degraded": self.degraded,
            "degraded_seconds_remaining": remaining,
            "consecutive_failures": self.consecutive_failures,
            "last_error": self.last_error,
            "last_latency_ms": self.last_latency_ms,
            "request_timeout_seconds": self.settings.ai_request_timeout_seconds,
        }

    async def reply(
        self,
        viewer_name: str,
        message: str,
        viewer_context: str,
        recent_chat: list[str],
        conversation_history: list[dict[str, str]] | None = None,
    ) -> str:
        grounded = self._grounded_identity_answer(message)
        if grounded:
            return grounded
        if not self.enabled:
            return self._fallback(viewer_name, message)
        if self.degraded:
            return self._degraded_fallback(viewer_name, message)

        safe_channel_context = [
            line for line in recent_chat[-6:] if not self._looks_like_bot_line(line)
        ]
        history = list(conversation_history or [])[-12:]
        messages: list[dict[str, str]] = [
            {"role": "system", "content": self.identity.system_prompt}
        ]
        messages.append(
            {
                "role": "system",
                "content": (
                    f"Interlocuteur actuel : {viewer_name}. "
                    f"Contexte de fidélité : {viewer_context or 'aucune information utile'}.\n"
                    "La conversation ci-dessous est prioritaire sur toute ambiance du chat. "
                    "Réponds au dernier message en tenant compte des corrections et des questions précédentes. "
                    "N'invente aucun fait personnel sur SANSAHD ou un viewer. "
                    "Si une information n'est pas connue, dis-le simplement au lieu de fabriquer une anecdote."
                ),
            }
        )
        if self._needs_conversation_repair(message):
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "L'interlocuteur signale une incohérence ou te corrige. Coupe immédiatement l'humour et les piques. "
                        "Reconnais clairement l'erreur, réponds à sa question réelle et ne qualifie personne de perdu, têtu ou inattentif. "
                        "Ne change pas de sujet et n'ajoute aucun fait qui ne figure pas dans les faits établis."
                    ),
                }
            )
        if safe_channel_context:
            messages.append(
                {
                    "role": "system",
                    "content": "Ambiance récente du chat, seulement si réellement utile : "
                    + " | ".join(safe_channel_context),
                }
            )
        for item in history:
            role = item.get("role")
            content = str(item.get("content") or "").strip()
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content[:900]})
        messages.append({"role": "user", "content": message})

        try:
            answer = await self._chat(messages, self.settings.ai_chat_max_tokens)
            self._register_success()
            return self._validate_answer(answer, viewer_name)
        except asyncio.TimeoutError as exc:
            self._register_failure(exc)
            logger.warning(
                "Délai IA dépassé avec %s après %ss",
                self.active_model,
                self.settings.ai_request_timeout_seconds,
            )
            return self._degraded_fallback(viewer_name, message)
        except (aiohttp.ClientError, ConnectionError, OSError) as exc:
            self._register_failure(exc)
            logger.warning("Moteur IA local inaccessible: %s", self._error_label(exc))
            return self._degraded_fallback(viewer_name, message)
        except Exception as exc:
            self._register_failure(exc)
            logger.exception("Échec génération IA: %s", exc)
            return self._degraded_fallback(viewer_name, message)

    async def generate(
        self,
        prompt: str,
        system_instruction: str = "",
        max_tokens: int = 120,
        *,
        system_is_complete: bool = False,
    ) -> str:
        if not self.enabled:
            return "Le moteur IA est désactivé."
        system = (
            system_instruction
            if system_is_complete
            else self.identity.system_prompt
            + (
                f"\nMission ponctuelle : {system_instruction}"
                if system_instruction
                else ""
            )
        )
        answer = await self._chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            max_tokens,
        )
        self._register_success()
        return answer

    async def _chat(self, messages: list[dict[str, str]], max_tokens: int) -> str:
        await self.start()
        if self.settings.ai_mode == "ollama":
            await self._prepare_runtime_model()
            primary = self.active_model
            try:
                return await self._ollama(
                    messages,
                    max_tokens,
                    model=primary,
                    timeout_seconds=self.settings.ai_request_timeout_seconds,
                )
            except asyncio.TimeoutError:
                fallback = await self._secondary_model(primary)
                if not self.settings.ai_retry_on_timeout or not fallback:
                    raise
                logger.warning(
                    "Le modèle %s est trop lent, bascule immédiate vers %s",
                    primary,
                    fallback,
                )
                self.runtime_model = fallback
                return await self._ollama(
                    messages,
                    min(max_tokens, 80),
                    model=fallback,
                    timeout_seconds=max(
                        12, min(30, self.settings.ai_request_timeout_seconds)
                    ),
                    context_window=min(self.settings.ai_context_window, 3072),
                )
        return await self._openai_compatible(messages, max_tokens)

    async def _prepare_runtime_model(self, *, force: bool = False) -> None:
        if self.settings.ai_mode != "ollama":
            return
        if self.runtime_model and not force:
            return
        if self.settings.ai_fast_model:
            self.runtime_model = self.settings.ai_fast_model
            return
        if not self.settings.ai_auto_fast_model:
            self.runtime_model = self.settings.ai_model
            return
        detected = await self._discover_fast_model()
        self.detected_fast_model = detected
        self.runtime_model = detected or self.settings.ai_model

    async def _discover_fast_model(self) -> str:
        assert self.session
        try:
            async with self.session.get(
                f"{self.settings.ai_base_url}/api/tags",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as response:
                response.raise_for_status()
                payload = await response.json()
        except Exception as exc:
            logger.debug("Détection des modèles Ollama impossible: %s", exc)
            return ""

        rows = list(payload.get("models") or [])
        names = [str(row.get("name") or row.get("model") or "") for row in rows]
        names = [name for name in names if name]
        for hint in _FAST_MODEL_HINTS:
            match = next((name for name in names if hint in name.casefold()), None)
            if match:
                return match

        alternatives = [
            row
            for row in rows
            if str(row.get("name") or row.get("model") or "")
            and str(row.get("name") or row.get("model") or "")
            != self.settings.ai_model
        ]
        alternatives.sort(key=lambda row: int(row.get("size") or 2**63 - 1))
        if alternatives:
            return str(alternatives[0].get("name") or alternatives[0].get("model"))
        return ""

    async def _secondary_model(self, primary: str) -> str:
        if self.settings.ai_fast_model and self.settings.ai_fast_model != primary:
            return self.settings.ai_fast_model
        detected = self.detected_fast_model or await self._discover_fast_model()
        if detected and detected != primary:
            self.detected_fast_model = detected
            return detected
        if self.settings.ai_model != primary:
            return self.settings.ai_model
        return ""

    async def _ollama(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        *,
        model: str,
        timeout_seconds: int,
        context_window: int | None = None,
    ) -> str:
        assert self.session
        started = monotonic()
        async with self.session.post(
            f"{self.settings.ai_base_url}/api/chat",
            timeout=aiohttp.ClientTimeout(total=max(5, timeout_seconds)),
            json={
                "model": model,
                "stream": False,
                "keep_alive": self.settings.ai_keep_alive,
                "messages": messages,
                "options": {
                    "temperature": min(self.settings.ai_temperature, 0.55),
                    "num_predict": max(1, min(int(max_tokens), 360)),
                    "num_ctx": context_window or self.settings.ai_context_window,
                    "repeat_penalty": 1.12,
                },
            },
        ) as response:
            response.raise_for_status()
            payload = await response.json()
        self.last_latency_ms = round((monotonic() - started) * 1000)
        return self._clean(payload["message"]["content"])

    async def _openai_compatible(
        self, messages: list[dict[str, str]], max_tokens: int
    ) -> str:
        assert self.session
        headers = {"Content-Type": "application/json"}
        if self.settings.ai_api_key:
            headers["Authorization"] = f"Bearer {self.settings.ai_api_key}"
        started = monotonic()
        async with self.session.post(
            f"{self.settings.ai_base_url}/v1/chat/completions",
            timeout=aiohttp.ClientTimeout(
                total=max(5, self.settings.ai_request_timeout_seconds)
            ),
            headers=headers,
            json={
                "model": self.settings.ai_fast_model or self.settings.ai_model,
                "temperature": min(self.settings.ai_temperature, 0.55),
                "max_tokens": max(1, min(int(max_tokens), 360)),
                "messages": messages,
            },
        ) as response:
            response.raise_for_status()
            payload = await response.json()
        self.last_latency_ms = round((monotonic() - started) * 1000)
        return self._clean(payload["choices"][0]["message"]["content"])

    def _register_success(self) -> None:
        self.consecutive_failures = 0
        self.degraded_until = 0.0
        self.last_error = ""

    def _register_failure(self, exc: BaseException) -> None:
        self.consecutive_failures += 1
        self.last_error = self._error_label(exc)
        cooldown = max(10, self.settings.ai_failure_cooldown_seconds)
        if self.consecutive_failures >= 1:
            self.degraded_until = monotonic() + cooldown

    @staticmethod
    def _error_label(exc: BaseException) -> str:
        text = str(exc).strip()
        return text or exc.__class__.__name__

    @staticmethod
    def _grounded_identity_answer(message: str) -> str | None:
        lowered = " ".join(str(message).casefold().split())
        about_sansa = "sansa" in lowered or "sansahd" in lowered
        if any(
            phrase in lowered
            for phrase in (
                "qui es-tu",
                "qui tu es",
                "tu es qui",
                "présente-toi",
                "presente-toi",
            )
        ):
            return (
                "Je suis Aura, la conscience artificielle de la chaîne SANSAHD. "
                "J'utilise le compte Twitch mairaiy pour parler, animer le chat et accompagner Sansa pendant ses lives."
            )
        if about_sansa and any(
            phrase in lowered
            for phrase in (
                "raconte-moi",
                "raconte moi",
                "dis-moi un truc",
                "dis moi un truc",
                "que sais-tu",
                "que sais tu",
                "tu sais quoi",
                "quoi sur",
                "qui est",
            )
        ):
            return (
                "Je sais seulement que SANSAHD et Sansa désignent la même personne, que c'est un homme et le diffuseur de la chaîne. "
                "Je n'inventerai pas d'anecdote personnelle sur lui."
            )
        if about_sansa and any(
            word in lowered for word in ("homme", "mec", "femme", "fille", "genre")
        ):
            return "Sansa est un homme et SANSAHD est son nom de chaîne."
        return None

    @staticmethod
    def _needs_conversation_repair(message: str) -> bool:
        lowered = " ".join(str(message).casefold().split())
        markers = (
            "aucun sens",
            "à côté de la plaque",
            "a cote de la plaque",
            "de quoi tu parle",
            "de quoi tu parles",
            "pourquoi tu me dis",
            "tu te trompes",
            "c'est faux",
            "ce n'est pas ça",
            "ce n'est pas ca",
            "tu ne réponds pas",
            "tu ne reponds pas",
            "sérieusement",
            "serieusement",
            "en fait tu me troll",
        )
        return any(marker in lowered for marker in markers)

    @staticmethod
    def _looks_like_bot_line(line: str) -> bool:
        lowered = line.casefold()
        return any(
            marker in lowered
            for marker in (
                "streamelements:",
                "wizebot:",
                "nightbot:",
                "mairaiy:",
                "streamboo",
                "buy viewers",
                "ai viewers",
            )
        )

    @staticmethod
    def _clean(text: str) -> str:
        cleaned = " ".join(str(text).strip().replace("\n", " ").split())
        cleaned = re.sub(r"^(mairaiy|aura)\s*:\s*", "", cleaned, flags=re.I)
        return cleaned[:460]

    @classmethod
    def _validate_answer(cls, answer: str, viewer_name: str) -> str:
        clean = cls._clean(answer)
        forbidden = ("je réfléchis", "laisse-moi réfléchir", "analyse en cours")
        if not clean or any(phrase in clean.casefold() for phrase in forbidden):
            return "Je n'ai pas formulé une réponse correcte. Repose-moi la question autrement."
        clean = re.sub(
            rf"^@?{re.escape(viewer_name)}\s*[:,-]?\s*", "", clean, flags=re.I
        )
        return clean.strip()[:430]

    @staticmethod
    def _fallback(viewer_name: str, message: str) -> str:
        lowered = message.lower()
        if any(word in lowered for word in ("salut", "bonjour", "bonsoir")):
            return random.choice(
                [
                    f"Salut {viewer_name}. Bienvenue dans le chat.",
                    f"Salut {viewer_name}. Je suis bien connectée.",
                ]
            )
        if "qui es-tu" in lowered or "qui tu es" in lowered:
            return (
                "Je suis Aura, présente sur Twitch avec le compte mairaiy. "
                "J'anime le chat et j'assiste Sansa pendant ses lives."
            )
        return "Le moteur IA est désactivé. Vérifie la configuration IA dans le fichier .env."

    @staticmethod
    def _degraded_fallback(viewer_name: str, message: str) -> str:
        lowered = message.casefold()
        if any(word in lowered for word in ("salut", "bonjour", "bonsoir")):
            return f"Salut {viewer_name}. Je suis connectée, mais mon modèle local est momentanément trop lent."
        if "ça va" in lowered or "ca va" in lowered:
            return "Je suis connectée. Mon moteur local ralentit, donc je réponds en mode de secours."
        if "qui es-tu" in lowered or "qui tu es" in lowered:
            return (
                "Je suis Aura, présente sur Twitch avec le compte mairaiy. "
                "Mon modèle local est en récupération, mais le reste du bot continue de fonctionner."
            )
        return (
            "Mon modèle local n'a pas répondu assez vite. "
            "Je reste opérationnelle pour le chat, les alertes, la modération et OBS."
        )
