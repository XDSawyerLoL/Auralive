from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.services.voice_input import _clean_transcript, _wake_invocation

logger = logging.getLogger(__name__)

_ANSWER_TIMEOUT_SECONDS = 25
_VOICE_TIMEOUT_SECONDS = 42
_DELIVERED_VOICE_ENGINES = {"gemini-tts", "piper-local"}


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
        self.last_audio_duration_ms = 0
        self.last_rearm_after_ms = 1200
        self.last_latency_ms = 0

    @property
    def busy(self) -> bool:
        return bool(
            self.voice_input.lock.locked()
            or (self.voice_task and not self.voice_task.done())
        )

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
                    self.aura.ai.reply(
                        "Sansa",
                        prompt,
                        context
                        + "\nSansa parle directement à Mairaiy depuis le panneau vocal privé. "
                        + "Chaque phrase reconnue lui est adressée, même sans prononcer son prénom. "
                        + "Réponds comme sa coanimatrice présente à côté de lui, naturellement et brièvement.",
                        list(self.aura.recent_chat),
                        history,
                    ),
                    timeout=_ANSWER_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError as exc:
                self.last_stage = "error"
                self.last_error = "La réponse a dépassé 25 secondes"
                self.voice_input.last_stage = "error"
                self.voice_input.last_error = self.last_error
                raise RuntimeError(self.last_error) from exc

            answer = " ".join(str(answer or "").split()).strip()[:480]
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
            "rearm_after_ms": 0,
        }

    async def _deliver_voice(self, answer: str, *, send_to_chat: bool) -> None:
        previous_count = int(getattr(self.aura.avatar_audio, "generated_count", 0) or 0)
        self.last_stage = "voice_generation"
        self.voice_input.last_stage = "voice_generation"
        self.aura.avatar_audio.last_audio_duration_ms = 0
        voice_error = ""
        delivered = False
        engine = ""

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
            if not delivered:
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
            "last_audio_duration_ms": self.last_audio_duration_ms,
            "last_rearm_after_ms": self.last_rearm_after_ms,
            "last_latency_ms": self.last_latency_ms,
        }


def install_voice_realtime(aura: Any, db: Any, voice_input: Any) -> VoiceRealtimeService:
    existing = getattr(aura, "voice_realtime", None)
    if existing:
        return existing
    service = VoiceRealtimeService(aura, db, voice_input)
    aura.voice_realtime = service
    return service
