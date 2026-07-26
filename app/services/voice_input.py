from __future__ import annotations

import asyncio
import base64
import binascii
import logging
import os
import time
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_ALLOWED_MIME_TYPES = {"audio/wav", "audio/x-wav", "audio/wave"}
_MAX_AUDIO_BYTES = 8 * 1024 * 1024


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


class VoiceInputService:
    """Push-to-talk local : WAV du navigateur -> transcription Gemini -> réponse vocale."""

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

    async def talk(self, audio_base64: str, mime_type: str, *, send_to_chat: bool = False) -> dict[str, Any]:
        started = time.monotonic()
        audio = decode_audio_base64(audio_base64)
        async with self.lock:
            try:
                transcript = await self.transcribe(audio, mime_type)
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
                    transcript,
                    context + "\nLe diffuseur parle au micro depuis le panneau privé Aura Live.",
                    list(self.aura.recent_chat),
                    history,
                )
                answer = " ".join(str(answer or "").split()).strip()[:480]
                if not answer:
                    raise RuntimeError("Mairaiy n'a produit aucune réponse")

                await self.aura.memory.remember_turn(viewer["user_id"], "user", transcript)
                await self.aura.memory.remember_turn(viewer["user_id"], "assistant", answer)

                # La génération vocale et l'événement avatar sont terminés avant
                # l'éventuelle publication dans Twitch : aucun gros décalage.
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

                self.last_transcript = transcript
                self.last_answer = answer
                self.last_error = ""
                self.request_count += 1
                self.last_latency_ms = round((time.monotonic() - started) * 1000)
                return {
                    "ok": True,
                    "transcript": transcript,
                    "answer": answer,
                    "sent_to_chat": sent,
                    "avatar_connected": self.aura.overlay.count("avatar") > 0,
                    "latency_ms": self.last_latency_ms,
                }
            except Exception as exc:
                self.last_error = str(exc or exc.__class__.__name__)[:500]
                self.last_latency_ms = round((time.monotonic() - started) * 1000)
                logger.warning("Dialogue vocal impossible: %s", self.last_error)
                raise

    def diagnostic(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "configured": bool(self.settings.ai_mode == "gemini" and self.settings.ai_api_key),
            "model": self.model,
            "max_seconds": self.max_seconds,
            "busy": self.lock.locked(),
            "request_count": self.request_count,
            "last_transcript": self.last_transcript[:180],
            "last_answer": self.last_answer[:180],
            "last_error": self.last_error,
            "last_latency_ms": self.last_latency_ms,
            "audio_persisted": False,
        }


def install_voice_input(aura: Any, db: Any, cohost: Any, settings: Any) -> VoiceInputService:
    existing = getattr(aura, "voice_input", None)
    if existing:
        return existing
    service = VoiceInputService(aura, db, cohost, settings)
    aura.voice_input = service
    return service
