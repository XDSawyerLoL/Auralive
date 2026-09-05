from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

from app.services.voice_input import _clean_transcript, _wake_invocation

logger = logging.getLogger(__name__)

_ANSWER_TIMEOUT_SECONDS = 25
_VOICE_TIMEOUT_SECONDS = 42
_DELIVERED_VOICE_ENGINES = {"kokoro-local", "gemini-tts", "piper-local"}
_PRIVATE_VOICE_CONTEXT = """
[PRIVATE_VOICE_CONVERSATION]
Tu parles directement et uniquement avec Sansa, à l'oral, comme une coanimatrice assise à côté de lui.
La dernière phrase de Sansa est toujours prioritaire. Réagis à ce qu'il vient réellement de dire, pas à ce que tu imagines autour.
Ne transforme jamais une remarque en mission ou en tâche de production.
Ne propose jamais spontanément un titre de live, un montage, un planning, un CTA, une publication ou une action technique sauf si Sansa te le demande explicitement.
N'invente jamais ce que tu vois à l'écran, le jeu en cours, l'état du live ou ce que fait Sansa si aucune donnée fiable ne te l'indique.
Quand Sansa fait une remarque simple, réponds comme dans une vraie conversation: une réaction courte, une opinion ou une question naturelle suffit.
Utilise je et tu. Ne parle pas au public avec vous sauf si Sansa te demande explicitement de t'adresser au chat.
Évite les formules d'assistant comme « je m'y mets », « nous avons besoin de », « je vais te ramener des options » si aucune action n'a été demandée.
Par défaut, réponds en une ou deux phrases naturelles. Développe seulement si Sansa demande une explication détaillée.
""".strip()


def _compact_spoken_answer(value: Any, limit: int = 360) -> str:
    """Garde une réponse orale courte sans couper brutalement une phrase."""
    text = " ".join(str(value or "").replace("\n", " ").split()).strip()
    if not text:
        return ""

    # Pour le live, deux phrases suffisent presque toujours. Cela évite les
    # monologues où un petit modèle part sur une mission que Sansa n'a jamais demandée.
    sentences = [part.strip() for part in re.split(r"(?<=[.!?…])\s+", text) if part.strip()]
    if len(sentences) > 2:
        text = " ".join(sentences[:2]).strip()

    if len(text) <= limit:
        return text

    clipped = text[:limit].rstrip()
    boundary = max(clipped.rfind("."), clipped.rfind("!"), clipped.rfind("?"), clipped.rfind("…"))
    if boundary >= 80:
        return clipped[: boundary + 1].strip()
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    return clipped.rstrip(" ,;:-") + "."


class VoiceRealtimeService:
    """Dialogue direct depuis la transcription native Edge/Chrome.

    La page vocale est un canal privé réservé à Sansa : chaque phrase reconnue
    est donc adressée à Mairaiy sans imposer de mot d'appel.
    """

    def __init__(self, aura: Any, db: Any, voice_input: Any):
        self.aura = aura
        self.db = db
        self.voice_input = voice_input
        self.voice_task: asyncio.Task[None] | None = None
        self.request_count = 0
        self.ignored_count = 0
        self.last_transcript = ""
        self.last_answer = ""
        self.last_error = ""
        self.last_stage = "idle"
        self.last_voice_delivered = False
        self.last_voice_error = ""
        self.last_voice_engine = ""
        self.last_audio_url = ""
        self.last_audio_duration_ms = 0
        self.last_rearm_after_ms = 1200
        self.last_latency_ms = 0
        self.last_obs_audio: dict[str, Any] = {}
        self.last_response_model = ""

    @property
    def busy(self) -> bool:
        return bool(
            self.voice_input.lock.locked()
            or (self.voice_task and not self.voice_task.done())
        )

    async def _private_reply(
        self,
        prompt: str,
        context: str,
        history: list[dict[str, str]],
    ) -> str:
        """Conversation privée: pas de pollution du chat, modèle qualité si local."""
        ai = self.aura.ai
        cohost = getattr(self.aura, "cohost", None)
        # CohostService remplace aura.ai.reply pour ajouter le contexte de chaîne.
        # Pour la conversation privée, on utilise volontairement la méthode d'origine.
        reply = getattr(cohost, "_original_ai_reply", None)
        if not callable(reply):
            reply = ai.reply

        settings = getattr(ai, "settings", None)
        mode = str(getattr(settings, "ai_mode", "") or "").casefold()
        quality_model = str(getattr(settings, "ai_model", "") or "").strip()
        previous_runtime_model = str(getattr(ai, "runtime_model", "") or "")

        if mode == "ollama" and quality_model:
            # Les réactions directes privilégient la qualité. Les automatismes du
            # live peuvent continuer à utiliser le modèle rapide après la réponse.
            ai.runtime_model = quality_model
            self.last_response_model = quality_model
        else:
            self.last_response_model = str(getattr(ai, "active_model", "") or quality_model)

        private_context = (
            f"{context}\n\n{_PRIVATE_VOICE_CONTEXT}" if context else _PRIVATE_VOICE_CONTEXT
        )
        try:
            return await reply(
                "Sansa",
                prompt,
                private_context,
                [],  # Jamais le chat Twitch récent dans la conversation privée.
                history,
            )
        finally:
            if mode == "ollama":
                ai.runtime_model = previous_runtime_model

    async def talk_text(
        self,
        transcript: str,
        *,
        send_to_chat: bool = False,
    ) -> dict[str, Any]:
        started = time.monotonic()
        text = _clean_transcript(transcript)
        if not text:
            raise ValueError("Aucune phrase reconnue")
        if self.busy:
            raise RuntimeError("Mairaiy termine déjà une réponse")

        wake_detected, stripped = _wake_invocation(text)
        prompt = stripped.strip() if wake_detected and stripped.strip() else text
        self.last_transcript = text
        self.voice_input.last_transcript = text
        self.voice_input.last_wake_detected = wake_detected

        async with self.voice_input.lock:
            self.last_error = ""
            self.last_voice_error = ""
            self.last_voice_delivered = False
            self.last_voice_engine = ""
            self.last_audio_url = ""
            self.last_audio_duration_ms = 0
            self.last_rearm_after_ms = 1200
            self.last_stage = "response_generation"
            self.voice_input.last_stage = "response_generation"
            self.voice_input.last_error = ""

            viewer = await self.db.get_viewer(user_id="voice-broadcaster")
            if not viewer:
                viewer = await self.db.upsert_viewer(
                    "voice-broadcaster",
                    "sansahd_voice",
                    "Sansa",
                )
            context = await self.aura.memory.context(viewer)
            history = await self.aura.memory.conversation(viewer["user_id"], limit=12)

            try:
                answer = await asyncio.wait_for(
                    self._private_reply(prompt, context, history),
                    timeout=_ANSWER_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError as exc:
                self.last_stage = "error"
                self.last_error = "La réponse a dépassé 25 secondes"
                self.voice_input.last_stage = "error"
                self.voice_input.last_error = self.last_error
                raise RuntimeError(self.last_error) from exc

            answer = _compact_spoken_answer(answer)
            if not answer:
                self.last_stage = "error"
                self.last_error = "Mairaiy n'a produit aucune réponse"
                self.voice_input.last_stage = "error"
                self.voice_input.last_error = self.last_error
                raise RuntimeError(self.last_error)

            self.last_answer = answer
            self.voice_input.last_answer = answer
            await self.aura.memory.remember_turn(viewer["user_id"], "user", prompt)
            await self.aura.memory.remember_turn(viewer["user_id"], "assistant", answer)

            self.request_count += 1
            self.voice_input.request_count += 1
            self.last_latency_ms = round((time.monotonic() - started) * 1000)
            self.voice_input.last_latency_ms = self.last_latency_ms
            self.last_stage = "voice_pending"
            self.voice_input.last_stage = "voice_pending"

            self.voice_task = asyncio.create_task(
                self._deliver_voice(answer, send_to_chat=send_to_chat),
                name="mairaiy-realtime-voice",
            )

        return {
            "ok": True,
            "ignored": False,
            "wake_word_required": False,
            "wake_word_detected": wake_detected,
            "addressed_automatically": True,
            "transcript": text,
            "answer": answer,
            "voice_pending": True,
            "voice_delivered": False,
            "latency_ms": self.last_latency_ms,
            "response_model": self.last_response_model,
            "rearm_after_ms": 0,
        }

    async def _prepare_obs_audio(self) -> None:
        obs = getattr(self.aura, "obs", None)
        ensure = getattr(obs, "ensure_avatar_audio_monitor", None)
        if not callable(ensure):
            self.last_obs_audio = {"ok": False, "reason": "obs_helper_unavailable"}
            return
        try:
            self.last_obs_audio = dict(await ensure())
        except Exception as exc:
            self.last_obs_audio = {
                "ok": False,
                "reason": "obs_error",
                "error": str(exc or exc.__class__.__name__)[:300],
            }

    async def _deliver_voice(self, answer: str, *, send_to_chat: bool) -> None:
        previous_count = int(getattr(self.aura.avatar_audio, "generated_count", 0) or 0)
        self.last_stage = "voice_generation"
        self.voice_input.last_stage = "voice_generation"
        self.aura.avatar_audio.last_audio_duration_ms = 0
        voice_error = ""
        delivered = False
        engine = ""
        self.last_audio_url = ""

        # Si OBS est lancé, Aura configure automatiquement la Browser Source
        # avatar en Monitor + Output avant d'envoyer la nouvelle voix.
        await self._prepare_obs_audio()

        try:
            await asyncio.wait_for(
                self.aura.overlay.emit(
                    {
                        "type": "aura_message",
                        "viewer": "Sansa",
                        "message": answer,
                        "text": answer,
                        "source_type": "voice_input",
                        "speak": True,
                    },
                    target="avatar",
                ),
                timeout=_VOICE_TIMEOUT_SECONDS,
            )
            engine = str(getattr(self.aura.avatar_audio, "last_engine", ""))
            delivered = bool(
                int(getattr(self.aura.avatar_audio, "generated_count", 0) or 0)
                > previous_count
                and engine in _DELIVERED_VOICE_ENGINES
            )
            if delivered:
                filename = str(getattr(self.aura.avatar_audio, "last_file", "") or "").strip()
                if filename:
                    self.last_audio_url = f"/media/tts/{filename}"
            else:
                voice_error = str(
                    getattr(self.aura.avatar_audio, "last_error", "")
                    or "La voix de Mairaiy n'a pas été produite"
                )[:300]
        except asyncio.TimeoutError:
            voice_error = "La génération vocale a dépassé 42 secondes"
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            voice_error = str(exc or exc.__class__.__name__)[:300]

        if send_to_chat:
            try:
                await self.aura.say(answer)
            except Exception as exc:
                logger.warning("Réponse vocale prête mais publication Twitch impossible: %s", exc)

        duration = (
            int(getattr(self.aura.avatar_audio, "last_audio_duration_ms", 0) or 0)
            if delivered
            else 0
        )
        rearm = max(1800, duration + 1500) if delivered else 1200
        self.last_voice_delivered = delivered
        self.last_voice_error = voice_error
        self.last_voice_engine = engine
        self.last_audio_duration_ms = duration
        self.last_rearm_after_ms = rearm
        self.last_stage = "idle"

        self.voice_input.last_voice_delivered = delivered
        self.voice_input.last_voice_error = voice_error
        self.voice_input.last_stage = "idle"
        if voice_error:
            logger.warning("Réponse texte produite, voix Mairaiy indisponible: %s", voice_error)

    async def close(self) -> None:
        if self.voice_task and not self.voice_task.done():
            self.voice_task.cancel()
            try:
                await self.voice_task
            except asyncio.CancelledError:
                pass

    def diagnostic(self) -> dict[str, Any]:
        return {
            "mode": "browser-speech-recognition",
            "continuous": True,
            "wake_word": None,
            "wake_word_required": False,
            "addressing": "all_recognized_phrases",
            "busy": self.busy,
            "voice_task_running": bool(self.voice_task and not self.voice_task.done()),
            "stage": self.last_stage,
            "request_count": self.request_count,
            "ignored_count": self.ignored_count,
            "last_transcript": self.last_transcript[:180],
            "last_answer": self.last_answer[:180],
            "last_error": self.last_error,
            "last_voice_delivered": self.last_voice_delivered,
            "last_voice_error": self.last_voice_error,
            "last_voice_engine": self.last_voice_engine,
            "last_audio_url": self.last_audio_url,
            "last_audio_duration_ms": self.last_audio_duration_ms,
            "last_rearm_after_ms": self.last_rearm_after_ms,
            "last_latency_ms": self.last_latency_ms,
            "last_response_model": self.last_response_model,
            "obs_audio": self.last_obs_audio,
        }


def install_voice_realtime(aura: Any, db: Any, voice_input: Any) -> VoiceRealtimeService:
    existing = getattr(aura, "voice_realtime", None)
    if existing:
        return existing
    service = VoiceRealtimeService(aura, db, voice_input)
    aura.voice_realtime = service
    return service
