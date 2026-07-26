from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import Any

import aiohttp

from app.config import Settings
from app.core.identity import AuraIdentity

logger = logging.getLogger(__name__)


class AuraAI:
    def __init__(self, settings: Settings, identity: AuraIdentity):
        self.settings = settings
        self.identity = identity
        self.session: aiohttp.ClientSession | None = None
        self.warmup_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if not self.session:
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.settings.ai_timeout_seconds)
            )
        if self.enabled and self.settings.ai_warmup_enabled and not self.warmup_task:
            self.warmup_task = asyncio.create_task(self._warmup(), name="mairaiy-ai-warmup")

    async def _warmup(self) -> None:
        """Charge le modèle en arrière-plan sans publier quoi que ce soit sur Twitch."""
        try:
            await self.generate(
                "Réponds uniquement par OK.",
                "Initialisation silencieuse. Aucun commentaire supplémentaire.",
                2,
            )
            logger.info("Moteur IA préchargé")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.info("Préchargement IA indisponible: %s", exc)

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

        # Le chat global n'est plus injecté comme une pseudo-conversation. Il avait notamment
        # contaminé les réponses avec des annonces de bots tiers. On ne conserve que quelques
        # lignes humaines en simple contexte d'ambiance, jamais comme sujet prioritaire.
        safe_channel_context = [line for line in recent_chat[-6:] if not self._looks_like_bot_line(line)]
        history = list(conversation_history or [])[-12:]
        messages: list[dict[str, str]] = [{"role": "system", "content": self.identity.system_prompt}]
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
                    "content": "Ambiance récente du chat, seulement si réellement utile : " + " | ".join(safe_channel_context),
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
            return self._validate_answer(answer, viewer_name)
        except Exception as exc:
            logger.exception("Échec génération IA: %s", exc)
            return "Mon moteur de réponse a eu un problème. Réessaie dans quelques secondes."

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
        system = system_instruction if system_is_complete else (
            self.identity.system_prompt
            + (f"\nMission ponctuelle : {system_instruction}" if system_instruction else "")
        )
        return await self._chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            max_tokens,
        )

    async def _chat(self, messages: list[dict[str, str]], max_tokens: int) -> str:
        await self.start()
        if self.settings.ai_mode == "ollama":
            return await self._ollama(messages, max_tokens)
        return await self._openai_compatible(messages, max_tokens)

    async def _ollama(self, messages: list[dict[str, str]], max_tokens: int) -> str:
        assert self.session
        async with self.session.post(
            f"{self.settings.ai_base_url}/api/chat",
            json={
                "model": self.settings.ai_fast_model or self.settings.ai_model,
                "stream": False,
                "keep_alive": self.settings.ai_keep_alive,
                "messages": messages,
                "options": {
                    "temperature": min(self.settings.ai_temperature, 0.55),
                    "num_predict": max(1, min(int(max_tokens), 360)),
                    "num_ctx": self.settings.ai_context_window,
                    "repeat_penalty": 1.12,
                },
            },
        ) as response:
            response.raise_for_status()
            payload = await response.json()
            return self._clean(payload["message"]["content"])

    async def _openai_compatible(self, messages: list[dict[str, str]], max_tokens: int) -> str:
        assert self.session
        headers = {"Content-Type": "application/json"}
        if self.settings.ai_api_key:
            headers["Authorization"] = f"Bearer {self.settings.ai_api_key}"
        async with self.session.post(
            f"{self.settings.ai_base_url}/v1/chat/completions",
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
            return self._clean(payload["choices"][0]["message"]["content"])

    @staticmethod
    def _grounded_identity_answer(message: str) -> str | None:
        """Répond localement aux questions d'identité où une invention serait inacceptable."""
        lowered = " ".join(str(message).casefold().split())
        about_sansa = "sansa" in lowered or "sansahd" in lowered
        if any(phrase in lowered for phrase in ("qui es-tu", "qui tu es", "tu es qui", "présente-toi", "presente-toi")):
            return (
                "Je suis Aura, la conscience artificielle de la chaîne SANSAHD. "
                "J'utilise le compte Twitch mairaiy pour parler, animer le chat et accompagner Sansa pendant ses lives."
            )
        if about_sansa and any(phrase in lowered for phrase in (
            "raconte-moi", "raconte moi", "dis-moi un truc", "dis moi un truc",
            "que sais-tu", "que sais tu", "tu sais quoi", "quoi sur", "qui est",
        )):
            return (
                "Je sais seulement que SANSAHD et Sansa désignent la même personne, que c'est un homme et le diffuseur de la chaîne. "
                "Je n'inventerai pas d'anecdote personnelle sur lui."
            )
        if about_sansa and any(word in lowered for word in ("homme", "mec", "femme", "fille", "genre")):
            return "Sansa est un homme et SANSAHD est son nom de chaîne."
        return None

    @staticmethod
    def _needs_conversation_repair(message: str) -> bool:
        lowered = " ".join(str(message).casefold().split())
        markers = (
            "aucun sens", "à côté de la plaque", "a cote de la plaque", "de quoi tu parle",
            "de quoi tu parles", "pourquoi tu me dis", "tu te trompes", "c'est faux",
            "ce n'est pas ça", "ce n'est pas ca", "tu ne réponds pas", "tu ne reponds pas",
            "sérieusement", "serieusement", "en fait tu me troll",
        )
        return any(marker in lowered for marker in markers)

    @staticmethod
    def _looks_like_bot_line(line: str) -> bool:
        lowered = line.casefold()
        return any(marker in lowered for marker in ("streamelements:", "wizebot:", "nightbot:", "mairaiy:"))

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
        # Évite les répétitions de pseudo produites par certains modèles.
        clean = re.sub(rf"^@?{re.escape(viewer_name)}\s*[:,-]?\s*", "", clean, flags=re.I)
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
            return "Je suis Aura, présente sur Twitch avec le compte mairaiy. J'anime le chat et j'assiste Sansa pendant ses lives."
        return "Le moteur IA est désactivé. Vérifie la configuration IA dans le fichier .env."
