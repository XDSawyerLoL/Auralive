from __future__ import annotations

import asyncio
import base64
import binascii
import logging
import os
import re
import time
from typing import Any

import aiohttp

from app.services.live_awareness import install_live_awareness

logger = logging.getLogger(__name__)

_ALLOWED_MIME_TYPES = {"audio/wav", "audio/x-wav", "audio/wave"}
_MAX_AUDIO_BYTES = 8 * 1024 * 1024
_WAKE_NAMES = ("mairaiy", "mairay", "mairai", "aura")


def decode_audio_base64(value: str) -> bytes:
    clean = str(value or "").strip()
    if not clean:
        raise ValueError("Enregistrement vocal vide")
    if clean.startswith("data:"):
        if "," not in clean:
            raise ValueError("Format audio invalide")
        clean = clean.split(",", 1)[1]
    try:
        audio = base64.b64decode(clean, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Audio encodé invalide") from exc
    if len(audio) < 512:
        raise ValueError("Enregistrement trop court")
    if len(audio) > _MAX_AUDIO_BYTES:
        raise ValueError("Enregistrement trop volumineux")
    return audio


def _extract_text(body: dict[str, Any]) -> str:
    candidates = body.get("candidates") or []
    if not candidates:
        return ""
    parts = candidates[0].get("content", {}).get("parts", []) or []
    texts = [
        str(part.get("text") or "").strip()
        for part in parts
        if not bool(part.get("thought")) and str(part.get("text") or "").strip()
    ]
    return " ".join(texts).strip()


def _clean_transcript(value: str) -> str:
    text = " ".join(str(value or "").replace("\n", " ").split()).strip()
    prefixes = ("transcription :", "transcript :", "texte :")
    lowered = text.casefold()
    for prefix in prefixes:
        if lowered.startswith(prefix):
            text = text[len(prefix) :].strip()
            break
    return text.strip(' "“”')[:600]


def _wake_invocation(value: str) -> tuple[bool, str]:
    text = _clean_transcript(value)
    for name in _WAKE_NAMES:
        pattern = rf"(?i)(?<![\w]){re.escape(name)}(?![\w])[:,]?"
        if re.search(pattern, text):
            cleaned = re.sub(pattern, " ", text, count=1)
            return True, " ".join(cleaned.split()).strip()
    return False, text


class VoiceInputService:
    """Dialogue local : WAV du navigateur -> transcription Gemini -> réponse vocale."""

    def __init__(self, aura: Any, db: Any, cohost: Any, settings: Any):
        self.aura = aura
        self.db = db
        self.cohost = cohost
        self.settings = settings
        self.lock = asyncio.Lock()
        self.last_transcript = ""
        self.last_answer = ""
        self.last_error = ""
        self.last_latency_ms = 0
        self.request_count = 0
        self.ignored_count = 0

    @property
    def enabled(self) -> bool:
        raw = str(os.getenv("VOICE_INPUT_ENABLED", "true")).casefold()
        return raw in {"1", "true", "yes", "oui", "on"}

    @property
    def model(self) -> str:
        explicit = str(os.getenv("VOICE_INPUT_MODEL", "") or "").strip()
        if explicit:
            return explicit.removeprefix("models/")
        configured = str(getattr(self.settings, "ai_model", "") or "").strip()
        if configured.startswith("gemini-"):
            return configured
        return "gemini-3.5-flash-lite"

    @property
    def max_seconds(self) -> int:
        try:
            return max(3, min(60, int(os.getenv("VOICE_INPUT_MAX_SECONDS", "20"))))
        except ValueError:
            return 20

    async def transcribe(self, audio: bytes, mime_type: str) -> str:
        if not self.enabled:
            raise RuntimeError("Le dialogue vocal est désactivé")
        if self.settings.ai_mode != "gemini" or not self.settings.ai_api_key:
            raise RuntimeError("Le dialogue vocal nécessite AI_MODE=gemini et AI_API_KEY")
        normalized_mime = str(mime_type or "audio/wav").split(";", 1)[0].casefold()
        if normalized_mime not in _ALLOWED_MIME_TYPES:
            raise ValueError("Le micro doit envoyer un fichier WAV")
        if not audio.startswith(b"RIFF") or b"WAVE" not in audio[:16]:
            raise ValueError("Le fichier reçu n'est pas un WAV valide")

        await self.aura.ai.start()
        assert self.aura.ai.session
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent"
        )
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                "Transcris exactement la parole française de cet enregistrement. "
                                "Retourne uniquement les mots prononcés, sans titre, sans explication, "
                                "sans code temporel. Si aucune parole intelligible n'est présente, "
                                "réponds exactement SILENCE."
                            )
                        },
                        {
                            "inlineData": {
                                "mimeType": "audio/wav",
                                "data": base64.b64encode(audio).decode("ascii"),
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "candidateCount": 1,
                "temperature": 0,
                "maxOutputTokens": 160,
                "thinkingConfig": {
                    "thinkingLevel": "minimal",
                    "includeThoughts": False,
                },
            },
        }
        async with self.aura.ai.session.post(
            endpoint,
            headers={
                "x-goog-api-key": self.settings.ai_api_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=aiohttp.ClientTimeout(total=30, connect=10),
        ) as response:
            body = await response.json(content_type=None)
            if response.status >= 400:
                detail = (body.get("error") or {}).get("message") if isinstance(body, dict) else str(body)
                raise RuntimeError(f"Transcription Gemini {response.status}: {detail or 'erreur inconnue'}")
        transcript = _clean_transcript(_extract_text(body))
        if not transcript or transcript.casefold() == "silence":
            raise ValueError("Aucune parole intelligible détectée")
        return transcript

    async def talk(
        self,
        audio_base64: str,
        mime_type: str,
        *,
        send_to_chat: bool = False,
        require_wake_word: bool = False,
    ) -> dict[str, Any]:
        started = time.monotonic()
        audio = decode_audio_base64(audio_base64)
        async with self.lock:
            try:
                transcript = await self.transcribe(audio, mime_type)
                wake_detected, cleaned_transcript = _wake_invocation(transcript)
                self.last_transcript = transcript
                if require_wake_word and not wake_detected:
                    self.last_answer = ""
                    self.last_error = ""
                    self.ignored_count += 1
                    self.last_latency_ms = round((time.monotonic() - started) * 1000)
                    return {
                        "ok": True,
                        "ignored": True,
                        "wake_word_detected": False,
                        "transcript": transcript,
                        "answer": "",
                        "sent_to_chat": False,
                        "avatar_connected": self.aura.overlay.count("avatar") > 0,
                        "latency_ms": self.last_latency_ms,
                        "rearm_after_ms": 500,
                    }

                prompt = cleaned_transcript if wake_detected and cleaned_transcript else transcript
                viewer = await self.db.get_viewer(user_id="voice-broadcaster")
                if not viewer:
                    viewer = await self.db.upsert_viewer(
                        "voice-broadcaster",
                        "sansahd_voice",
                        "Sansa",
                    )
                context = await self.aura.memory.context(viewer)
                history = await self.aura.memory.conversation(viewer["user_id"], limit=12)
                answer = await self.aura.ai.reply(
                    "Sansa",
                    prompt,
                    context + "\nLe diffuseur parle au micro depuis le panneau privé Aura Live.",
                    list(self.aura.recent_chat),
                    history,
                )
                answer = " ".join(str(answer or "").split()).strip()[:480]
                if not answer:
                    raise RuntimeError("Mairaiy n'a produit aucune réponse")

                await self.aura.memory.remember_turn(viewer["user_id"], "user", prompt)
                await self.aura.memory.remember_turn(viewer["user_id"], "assistant", answer)

                await self.aura.overlay.emit(
                    {
                        "type": "aura_message",
                        "viewer": "Sansa",
                        "message": answer,
                        "text": answer,
                        "source_type": "voice_input",
                        "speak": True,
                    },
                    target="avatar",
                )
                sent = False
                if send_to_chat:
                    sent = bool(await self.aura.say(answer))

                audio_duration_ms = int(
                    getattr(self.aura.avatar_audio, "last_audio_duration_ms", 0) or 0
                )
                rearm_after_ms = max(1200, audio_duration_ms + 900)
                self.last_answer = answer
                self.last_error = ""
                self.request_count += 1
                self.last_latency_ms = round((time.monotonic() - started) * 1000)
                return {
                    "ok": True,
                    "ignored": False,
                    "wake_word_detected": wake_detected,
                    "transcript": transcript,
                    "answer": answer,
                    "sent_to_chat": sent,
                    "avatar_connected": self.aura.overlay.count("avatar") > 0,
                    "latency_ms": self.last_latency_ms,
                    "audio_duration_ms": audio_duration_ms,
                    "rearm_after_ms": rearm_after_ms,
                }
            except Exception as exc:
                self.last_error = str(exc or exc.__class__.__name__)[:500]
                self.last_latency_ms = round((time.monotonic() - started) * 1000)
                logger.warning("Dialogue vocal impossible: %s", self.last_error)
                raise

    def diagnostic(self) -> dict[str, Any]:
        live_awareness = getattr(self.aura, "live_awareness", None)
        return {
            "enabled": self.enabled,
            "configured": bool(self.settings.ai_mode == "gemini" and self.settings.ai_api_key),
            "model": self.model,
            "max_seconds": self.max_seconds,
            "busy": self.lock.locked(),
            "request_count": self.request_count,
            "ignored_count": self.ignored_count,
            "last_transcript": self.last_transcript[:180],
            "last_answer": self.last_answer[:180],
            "last_error": self.last_error,
            "last_latency_ms": self.last_latency_ms,
            "audio_persisted": False,
            "controls": {
                "click_to_talk": True,
                "hold_space": True,
                "hands_free": True,
                "wake_word": "Mairaiy",
                "self_rearming": True,
            },
            "live_awareness": live_awareness.diagnostic() if live_awareness else None,
        }


def install_voice_input(aura: Any, db: Any, cohost: Any, settings: Any) -> VoiceInputService:
    existing = getattr(aura, "voice_input", None)
    if existing:
        return existing
    service = VoiceInputService(aura, db, cohost, settings)
    aura.voice_input = service
    install_live_awareness(aura, db, cohost, settings)
    return service
