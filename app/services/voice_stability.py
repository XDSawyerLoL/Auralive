from __future__ import annotations

import io
import logging
import sys
import time
import wave
from array import array
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_EXPECTED_HANDSFREE_ERRORS = (
    "aucune parole intelligible",
    "enregistrement trop court",
    "enregistrement vocal vide",
    "phrase trop courte",
)


def _wav_duration_ms(path: Path) -> int:
    try:
        with wave.open(str(path), "rb") as source:
            rate = int(source.getframerate() or 0)
            frames = int(source.getnframes() or 0)
        if rate <= 0 or frames <= 0:
            return 0
        return max(1, round(frames / rate * 1000))
    except (OSError, EOFError, wave.Error):
        return 0


def _normalize_wav_level(audio: bytes) -> tuple[bytes, float, float]:
    """Remonte une voix faible sans amplifier un silence presque total."""
    try:
        with wave.open(io.BytesIO(audio), "rb") as source:
            params = source.getparams()
            if source.getnchannels() != 1 or source.getsampwidth() != 2:
                return audio, 0.0, 1.0
            frames = source.readframes(source.getnframes())
    except (OSError, EOFError, wave.Error):
        return audio, 0.0, 1.0

    samples = array("h")
    samples.frombytes(frames)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        return audio, 0.0, 1.0

    peak_value = max(abs(int(value)) for value in samples)
    peak = peak_value / 32768.0
    if peak < 0.008 or peak >= 0.72:
        return audio, round(peak, 5), 1.0

    gain = min(6.0, 0.78 / max(peak, 0.001))
    if gain <= 1.05:
        return audio, round(peak, 5), 1.0

    normalized = array(
        "h",
        (
            max(-32768, min(32767, round(int(value) * gain)))
            for value in samples
        ),
    )
    if sys.byteorder != "little":
        normalized.byteswap()

    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setparams(params)
        target.writeframes(normalized.tobytes())
    return output.getvalue(), round(peak, 5), round(gain, 2)


def _is_hands_free(mime_type: str, require_wake_word: bool) -> bool:
    compact = str(mime_type or "").casefold().replace(" ", "")
    return bool(require_wake_word or "mode=handsfree" in compact)


def install_voice_stability(aura: Any) -> dict[str, Any]:
    """Stabilise le dialogue mains libres et empêche Mairaiy de s'entendre elle-même."""
    existing = getattr(aura, "voice_stability", None)
    if existing:
        return existing

    from app.services.avatar_audio import AvatarAudioService
    from app.services.voice_input import VoiceInputService

    state: dict[str, Any] = {
        "enabled": True,
        "ignored_noise": 0,
        "anti_echo_rearms": 0,
        "last_audio_duration_ms": 0,
        "last_rearm_after_ms": 0,
        "last_input_peak": 0.0,
        "last_input_gain": 1.0,
        "last_voice_delivered": False,
        "last_voice_error": "",
    }

    if not getattr(AvatarAudioService, "_mairaiy_duration_patch", False):
        original_synthesize = AvatarAudioService.synthesize

        async def synthesize(self: Any, *args: Any, **kwargs: Any) -> str | None:
            # Une tentative en échec ne doit jamais réutiliser la durée du fichier précédent.
            self.last_audio_duration_ms = 0
            state["last_audio_duration_ms"] = 0
            url = await original_synthesize(self, *args, **kwargs)
            if url:
                duration = _wav_duration_ms(self.output_dir / Path(url).name)
                if duration > 0:
                    self.last_audio_duration_ms = duration
                    state["last_audio_duration_ms"] = duration
            return url

        AvatarAudioService.synthesize = synthesize
        AvatarAudioService._mairaiy_duration_patch = True

    if not getattr(VoiceInputService, "_mairaiy_stability_patch", False):
        original_transcribe = VoiceInputService.transcribe
        original_talk = VoiceInputService.talk
        original_diagnostic = VoiceInputService.diagnostic

        async def transcribe(self: Any, audio: bytes, mime_type: str) -> str:
            normalized, peak, gain = _normalize_wav_level(audio)
            state["last_input_peak"] = peak
            state["last_input_gain"] = gain
            return await original_transcribe(self, normalized, mime_type)

        async def talk(
            self: Any,
            audio_base64: str,
            mime_type: str,
            *,
            send_to_chat: bool = False,
            require_wake_word: bool = False,
        ) -> dict[str, Any]:
            started = time.monotonic()
            hands_free = _is_hands_free(mime_type, require_wake_word)
            try:
                result = await original_talk(
                    self,
                    audio_base64,
                    mime_type,
                    send_to_chat=send_to_chat,
                    require_wake_word=require_wake_word,
                )
            except ValueError as exc:
                message = str(exc or "").casefold()
                if not hands_free or not any(marker in message for marker in _EXPECTED_HANDSFREE_ERRORS):
                    raise

                state["ignored_noise"] += 1
                self.ignored_count += 1
                self.last_error = ""
                self.last_answer = ""
                self.last_ignore_reason = "silence_or_noise"
                self.last_stage = "idle"
                self.last_latency_ms = round((time.monotonic() - started) * 1000)
                logger.debug("Bruit ou silence ignoré par l'écoute mains libres")
                return {
                    "ok": True,
                    "ignored": True,
                    "ignore_reason": "silence_or_noise",
                    "wake_word_detected": False,
                    "transcript": "",
                    "answer": "",
                    "sent_to_chat": False,
                    "avatar_connected": self.aura.overlay.count("avatar") > 0,
                    "latency_ms": self.last_latency_ms,
                    "audio_duration_ms": 0,
                    "rearm_after_ms": 650,
                    "input_peak": state["last_input_peak"],
                    "input_gain": state["last_input_gain"],
                    "voice_delivered": False,
                    "voice_error": "",
                }

            if not hands_free:
                return result

            voice_delivered = bool(result.get("voice_delivered", not result.get("ignored")))
            if voice_delivered:
                duration = max(
                    int(result.get("audio_duration_ms") or 0),
                    int(getattr(self.aura.avatar_audio, "last_audio_duration_ms", 0) or 0),
                )
            else:
                duration = 0

            if result.get("ignored"):
                rearm = max(500, int(result.get("rearm_after_ms") or 0))
            elif not voice_delivered:
                # Une réponse texte sans voix ne nécessite pas de longue pause anti-écho.
                rearm = max(1000, int(result.get("rearm_after_ms") or 0))
            else:
                rearm = max(2800, duration + 1800, int(result.get("rearm_after_ms") or 0))
                state["anti_echo_rearms"] += 1

            result["audio_duration_ms"] = duration
            result["rearm_after_ms"] = rearm
            result["input_peak"] = state["last_input_peak"]
            result["input_gain"] = state["last_input_gain"]
            state["last_audio_duration_ms"] = duration
            state["last_rearm_after_ms"] = rearm
            state["last_voice_delivered"] = voice_delivered
            state["last_voice_error"] = str(result.get("voice_error") or "")[:300]
            return result

        def diagnostic(self: Any) -> dict[str, Any]:
            payload = original_diagnostic(self)
            payload["stability"] = dict(state)
            payload["controls"]["anti_echo"] = True
            payload["controls"]["silence_is_not_error"] = True
            payload["controls"]["input_normalization"] = True
            payload["controls"]["ambient_calibration"] = True
            payload["controls"]["text_survives_voice_failure"] = True
            return payload

        VoiceInputService.transcribe = transcribe
        VoiceInputService.talk = talk
        VoiceInputService.diagnostic = diagnostic
        VoiceInputService._mairaiy_stability_patch = True

    aura.voice_stability = state
    return state
