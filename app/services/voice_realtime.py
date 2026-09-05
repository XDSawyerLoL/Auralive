from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

from app.services.voice_input import _clean_transcript, _wake_invocation

logger = logging.getLogger(__name__)

_ANSWER_TIMEOUT_SECONDS = 12
_VOICE_TIMEOUT_SECONDS = 25
_DELIVERED_VOICE_ENGINES = {"kokoro-local", "gemini-tts", "piper-local"}
_PRIVATE_VOICE_CONTEXT = """
Tu es Mairaiy, la coanimatrice de Sansa. Tu lui parles directement à l'oral, comme si tu étais assise à côté de lui.
Réagis d'abord à sa dernière phrase. Ne transforme jamais une remarque en mission, projet ou tâche de production.
Ne propose pas spontanément de titre de live, montage, planning, CTA, publication ou action technique.
N'invente jamais ce que tu vois, le jeu en cours ou l'état du live sans donnée fiable.
Utilise un français naturel, le tutoiement, une personnalité vive et légèrement taquine quand cela convient.
Une réaction simple appelle une réaction simple. Par défaut: une ou deux phrases courtes, sans formule d'assistant.
""".strip()


def _compact_spoken_answer(value: Any, limit: int = 360) -> str:
    """Garde une réponse orale courte sans couper brutalement une phrase."""
    text = " ".join(str(value or "").replace("\n", " ").split()).strip()
    if not text:
        return ""

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
    """Dialogue privé temps réel, optimisé pour la latence."""

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
        self.last_rearm_after_ms = 900
        self.last_latency_ms = 0
        self.last_voice_generation_ms = 0
        self.last_obs_audio: dict[str, Any] = {}
        self.last_response_model = ""
        self.last_fastpath = False

    @property
    def busy(self) -> bool:
        return bool(
            self.voice_input.lock.locked()
            or (self.voice_task and not self.voice_task.done())
        )

    async def _private_reply(
        self,
        prompt: str,
        history: list[dict[str, str]],
    ) -> str:
        """Chemin court Ollama: petit contexte, modèle qualité déjà chaud, aucun Cohost."""
        ai = self.aura.ai
        settings = getattr(ai, "settings", None)
        mode = str(getattr(settings, "ai_mode", "") or "").casefold()
        quality_model = str(getattr(settings, "ai_model", "") or "").strip()

        if mode == "ollama" and quality_model and callable(getattr(ai, "_ollama", None)):
            await ai.start()
            messages: list[dict[str, str]] = [
                {"role": "system", "content": _PRIVATE_VOICE_CONTEXT}
            ]
            for item in list(history or [])[-6:]:
                role = str(item.get("role") or "")
                content = " ".join(str(item.get("content") or "").split()).strip()
                if role in {"user", "assistant"} and content:
                    messages.append({"role": role, "content": content[:500]})
            messages.append({"role": "user", "content": prompt})

            self.last_response_model = quality_model
            self.last_fastpath = True
            answer = await ai._ollama(
                messages,
                64,
                model=quality_model,
                timeout_seconds=min(10, max(4, int(getattr(settings, "ai_request_timeout_seconds", 10)))),
                context_window=min(2048, max(1024, int(getattr(settings, "ai_context_window", 2048)))),
            )
            register_success = getattr(ai, "_register_success", None)
            if callable(register_success):
                register_success()
            validate = getattr(ai, "_validate_answer", None)
            return validate(answer, "Sansa") if callable(validate) else str(answer or "")

        # Fournisseurs non Ollama: conserve le chemin standard, mais toujours sans
        # chat Twitch ni contexte Cohost.
        cohost = getattr(self.aura, "cohost", None)
        reply = getattr(cohost, "_original_ai_reply", None)
        if not callable(reply):
            reply = ai.reply
        self.last_response_model = str(getattr(ai, "active_model", "") or quality_model)
        self.last_fastpath = False
        return await reply(
            "Sansa",
            prompt,
            _PRIVATE_VOICE_CONTEXT,
            [],
            list(history or [])[-6:],
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
            self.last_audio_url = ""
            self.last_audio_duration_ms = 0
            self.last_voice_generation_ms = 0
            self.last_rearm_after_ms = 900
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
            history = await self.aura.memory.conversation(viewer["user_id"], limit=6)

            try:
                answer = await asyncio.wait_for(
                    self._private_reply(prompt, history),
                    timeout=_ANSWER_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError as exc:
                self.last_stage = "error"
                self.last_error = "La réponse a dépassé 12 secondes"
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
            "fastpath": self.last_fastpath,
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
        """Synthèse directe. OBS n'est jamais dans le chemin critique."""
        self.last_stage = "voice_generation"
        self.voice_input.last_stage = "voice_generation"
        self.aura.avatar_audio.last_audio_duration_ms = 0
        voice_error = ""
        delivered = False
        engine = ""
        self.last_audio_url = ""
        started = time.monotonic()

        try:
            voice = str(await self.db.get_setting("avatar.voice", "") or "")
            rate = float(await self.db.get_setting("avatar.rate", 1.0) or 1.0)
            pitch = float(await self.db.get_setting("avatar.pitch", 1.0) or 1.0)
            volume = float(await self.db.get_setting("avatar.volume", 1.0) or 1.0)
            audio_url = await asyncio.wait_for(
                self.aura.avatar_audio.synthesize(
                    answer,
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                    volume=volume,
                    context="voice_input",
                ),
                timeout=_VOICE_TIMEOUT_SECONDS,
            )
            engine = str(getattr(self.aura.avatar_audio, "last_engine", ""))
            delivered = bool(audio_url and engine in _DELIVERED_VOICE_ENGINES)
            if delivered:
                self.last_audio_url = str(audio_url)
                if self.aura.overlay.count("avatar") > 0:
                    await self.aura.overlay.emit(
                        {
                            "type": "avatar_voice",
                            "viewer": "Sansa",
                            "message": answer,
                            "text": answer,
                            "audio_url": self.last_audio_url,
                            "voice": str(getattr(self.aura.avatar_audio, "last_voice", "") or voice),
                            "rate": rate,
                            "pitch": pitch,
                            "volume": volume,
                            "audio_engine": engine,
                            "source_type": "voice_input",
                            "speak": True,
                        },
                        target="avatar",
                    )
                    # Le routage OBS peut prendre plusieurs WebSocket round trips.
                    # Il est volontairement lancé après la voix et sans l'attendre.
                    asyncio.create_task(self._prepare_obs_audio(), name="mairaiy-obs-audio-route")
            else:
                voice_error = str(
                    getattr(self.aura.avatar_audio, "last_error", "")
                    or "La voix de Mairaiy n'a pas été produite"
                )[:300]
        except asyncio.TimeoutError:
            voice_error = "La génération vocale a dépassé 25 secondes"
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            voice_error = str(exc or exc.__class__.__name__)[:300]

        self.last_voice_generation_ms = round((time.monotonic() - started) * 1000)

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
        rearm = max(1200, duration + 500) if delivered else 900
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
            "last_voice_generation_ms": self.last_voice_generation_ms,
            "last_response_model": self.last_response_model,
            "fastpath": self.last_fastpath,
            "obs_audio": self.last_obs_audio,
        }


def install_voice_realtime(aura: Any, db: Any, voice_input: Any) -> VoiceRealtimeService:
    existing = getattr(aura, "voice_realtime", None)
    if existing:
        return existing
    service = VoiceRealtimeService(aura, db, voice_input)
    aura.voice_realtime = service
    return service
