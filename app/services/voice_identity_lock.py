from __future__ import annotations

import os
import time
from types import MethodType
from typing import Any

from app.services import avatar_audio
from app.services.local_piper_voice import LocalPiperVoice


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().casefold() in {"1", "true", "yes", "oui", "on"}


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(maximum, int(os.getenv(name, str(default)))))
    except (TypeError, ValueError):
        return default


def _is_quota_error(value: str) -> bool:
    message = str(value or "").casefold()
    return any(
        marker in message
        for marker in (
            "http 429",
            "resource_exhausted",
            "quota exceeded",
            "exceeded your current quota",
            "rate limit",
        )
    )


def install_voice_identity_lock(aura: Any) -> Any:
    """Garde une identite vocale previsible meme lorsque Gemini refuse le TTS.

    Leda reste la voix principale. Un quota 429 ouvre un circuit pour le reste du
    live et dirige les phrases vers une seule voix Piper locale, sans bascule
    aleatoire vers Windows ou le navigateur.
    """
    service = aura.avatar_audio
    if getattr(service, "_mairaiy_voice_identity_locked", False):
        return service

    original_diagnostic = service.diagnostic
    locked_voice = str(os.getenv("MAIRAIY_LOCKED_VOICE", "Leda") or "Leda").strip() or "Leda"
    voice_locked = _bool_env("MAIRAIY_VOICE_LOCKED", True)
    allow_windows_fallback = _bool_env("TTS_ALLOW_VOICE_FALLBACK", False)
    local_fallback_enabled = _bool_env("MAIRAIY_LOCAL_VOICE_ENABLED", True)
    force_local = _bool_env("MAIRAIY_FORCE_LOCAL_VOICE", False)
    quota_cooldown_seconds = _int_env(
        "MAIRAIY_GEMINI_429_COOLDOWN_SECONDS",
        21_600,
        60,
        86_400,
    )
    local_voice = LocalPiperVoice(service.output_dir)
    aura.local_piper_voice = local_voice
    state: dict[str, Any] = {
        "quota_events": 0,
        "gemini_blocked_until": 0.0,
        "session_local_locked": force_local,
        "last_switch_reason": "forced_local" if force_local else "",
        "last_gemini_error": "",
    }

    async def synthesize(
        self: Any,
        text: str,
        *,
        voice: str = "",
        rate: float = 1.0,
        pitch: float = 1.0,
        volume: float = 1.0,
        context: str = "conversation",
        style: str = "",
    ) -> str | None:
        if not voice_locked:
            return await self._mairaiy_original_synthesize(
                text,
                voice=voice,
                rate=rate,
                pitch=pitch,
                volume=volume,
                context=context,
                style=style,
            )

        clean = avatar_audio._normalize_text(text)
        if not clean:
            self.last_error = "Texte vocal vide"
            self.last_engine = "voice-unavailable"
            return None

        async with self._lock:
            self.output_dir.mkdir(parents=True, exist_ok=True)
            self.last_provider_error = ""
            self.last_error = ""
            self.last_audio_duration_ms = 0
            self.last_voice = locked_voice

            now = time.monotonic()
            gemini_blocked = bool(
                state["session_local_locked"]
                or now < float(state["gemini_blocked_until"] or 0.0)
            )
            if self.gemini_api_key and not gemini_blocked:
                url = await self._synthesize_gemini(
                    clean,
                    voice=locked_voice,
                    rate=rate,
                    pitch=pitch,
                    context=context,
                    style=style,
                )
                if url:
                    state["last_gemini_error"] = ""
                    return url

                gemini_error = str(self.last_error or self.last_provider_error or "")[:500]
                state["last_gemini_error"] = gemini_error
                if _is_quota_error(gemini_error):
                    state["quota_events"] += 1
                    state["session_local_locked"] = True
                    state["gemini_blocked_until"] = now + quota_cooldown_seconds
                    state["last_switch_reason"] = "gemini_quota_429"

            if local_fallback_enabled:
                url = await local_voice.synthesize(clean, rate=rate, volume=volume)
                if url:
                    self.last_error = ""
                    self.last_file = local_voice.last_file
                    self.last_duration_ms = local_voice.last_generation_ms
                    self.last_audio_duration_ms = local_voice.last_audio_duration_ms
                    self.last_engine = "piper-local"
                    self.last_voice = local_voice.voice_name
                    self.generated_count += 1
                    await __import__("asyncio").to_thread(self._cleanup)
                    return url
                self.last_error = local_voice.last_error or "Voix locale indisponible"

            if allow_windows_fallback and self.preferred_mode != "browser" and self.windows_available:
                url = await self._synthesize_windows(
                    clean,
                    voice=voice,
                    rate=rate,
                    volume=volume,
                )
                if url:
                    return url

            if not self.last_error:
                self.last_error = "Gemini et la voix locale sont indisponibles"
            self.last_engine = "voice-unavailable"
            self.last_voice = locked_voice
            return None

    def diagnostic(self: Any) -> dict[str, Any]:
        payload = original_diagnostic()
        now = time.monotonic()
        blocked_for = max(0, round(float(state["gemini_blocked_until"] or 0.0) - now))
        payload["voice_identity"] = {
            "locked": voice_locked,
            "primary_voice": locked_voice,
            "current_voice": self.last_voice or locked_voice,
            "current_engine": self.last_engine or "gemini-tts",
            "windows_or_browser_fallback_allowed": allow_windows_fallback,
            "local_quota_fallback_enabled": local_fallback_enabled,
            "policy": "Leda puis une voix locale fixe en cas de quota; jamais de voix aleatoire",
        }
        payload["gemini_circuit"] = {
            "open": bool(state["session_local_locked"] or blocked_for > 0),
            "retry_after_seconds": blocked_for,
            "quota_events": state["quota_events"],
            "session_local_locked": state["session_local_locked"],
            "last_switch_reason": state["last_switch_reason"],
            "last_error": state["last_gemini_error"],
        }
        payload["local_voice"] = local_voice.diagnostic()
        return payload

    service._mairaiy_original_synthesize = service.synthesize
    service.synthesize = MethodType(synthesize, service)
    service.diagnostic = MethodType(diagnostic, service)
    service._mairaiy_voice_identity_locked = True
    return service
