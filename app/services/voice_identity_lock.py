from __future__ import annotations

import os
import time
from types import MethodType
from typing import Any

from app.services import avatar_audio
from app.services.local_kokoro_voice import LocalKokoroVoice
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
    """Verrouille Mairaiy sur Kokoro local, avec secours Gemini puis Piper.

    La voix principale est ff_siwis via Kokoro ONNX, entierement locale.
    Gemini/Aoede n'est utilise que si Kokoro devient indisponible, puis Piper
    sert de dernier secours local. Windows/navigateur restent desactives par
    defaut pour eviter tout changement de timbre pendant un live.
    """
    service = aura.avatar_audio
    if getattr(service, "_mairaiy_voice_identity_locked", False):
        return service

    original_diagnostic = service.diagnostic
    gemini_voice = str(
        os.getenv("MAIRAIY_GEMINI_VOICE")
        or os.getenv("MAIRAIY_LOCKED_VOICE")
        or os.getenv("TTS_VOICE")
        or "Aoede"
    ).strip() or "Aoede"
    voice_locked = _bool_env("MAIRAIY_VOICE_LOCKED", True)
    kokoro_primary = _bool_env("MAIRAIY_KOKORO_PRIMARY", True)
    allow_windows_fallback = _bool_env("TTS_ALLOW_VOICE_FALLBACK", False)
    piper_fallback_enabled = _bool_env(
        "MAIRAIY_PIPER_FALLBACK_ENABLED",
        _bool_env("MAIRAIY_LOCAL_VOICE_ENABLED", True),
    )
    force_local = _bool_env("MAIRAIY_FORCE_LOCAL_VOICE", False)
    quota_cooldown_seconds = _int_env(
        "MAIRAIY_GEMINI_429_COOLDOWN_SECONDS",
        21_600,
        60,
        86_400,
    )

    kokoro_voice = LocalKokoroVoice(service.output_dir)
    piper_voice = LocalPiperVoice(service.output_dir)
    aura.local_kokoro_voice = kokoro_voice
    aura.local_piper_voice = piper_voice

    state: dict[str, Any] = {
        "quota_events": 0,
        "gemini_blocked_until": 0.0,
        "session_local_locked": force_local,
        "last_switch_reason": "forced_local" if force_local else "",
        "last_gemini_error": "",
        "last_kokoro_error": "",
    }

    def _apply_local_result(self: Any, provider: Any, *, engine: str) -> str:
        self.last_error = ""
        self.last_provider_error = ""
        self.last_file = provider.last_file
        self.last_duration_ms = provider.last_generation_ms
        self.last_audio_duration_ms = provider.last_audio_duration_ms
        self.last_engine = engine
        self.last_voice = provider.voice_name
        self.generated_count += 1
        return f"/media/tts/{provider.last_file}"

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

            if kokoro_primary and kokoro_voice.enabled:
                url = await kokoro_voice.synthesize(clean, rate=rate, volume=volume)
                if url:
                    state["last_kokoro_error"] = ""
                    state["last_switch_reason"] = "kokoro_primary"
                    result = _apply_local_result(self, kokoro_voice, engine="kokoro-local")
                    await __import__("asyncio").to_thread(self._cleanup)
                    return result
                state["last_kokoro_error"] = str(kokoro_voice.last_error or "")[:500]
                state["last_switch_reason"] = "kokoro_unavailable"

            now = time.monotonic()
            gemini_blocked = bool(
                state["session_local_locked"]
                or now < float(state["gemini_blocked_until"] or 0.0)
            )
            if self.gemini_api_key and not gemini_blocked:
                url = await self._synthesize_gemini(
                    clean,
                    voice=gemini_voice,
                    rate=rate,
                    pitch=pitch,
                    context=context,
                    style=style,
                )
                if url:
                    state["last_gemini_error"] = ""
                    state["last_switch_reason"] = "gemini_fallback"
                    return url

                gemini_error = str(self.last_error or self.last_provider_error or "")[:500]
                state["last_gemini_error"] = gemini_error
                if _is_quota_error(gemini_error):
                    state["quota_events"] += 1
                    state["session_local_locked"] = True
                    state["gemini_blocked_until"] = now + quota_cooldown_seconds
                    state["last_switch_reason"] = "gemini_quota_429"

            if piper_fallback_enabled:
                url = await piper_voice.synthesize(clean, rate=rate, volume=volume)
                if url:
                    result = _apply_local_result(self, piper_voice, engine="piper-local")
                    await __import__("asyncio").to_thread(self._cleanup)
                    state["last_switch_reason"] = "piper_fallback"
                    return result
                self.last_error = piper_voice.last_error or "Voix Piper indisponible"

            if allow_windows_fallback and self.preferred_mode != "browser" and self.windows_available:
                url = await self._synthesize_windows(
                    clean,
                    voice=voice,
                    rate=rate,
                    volume=volume,
                )
                if url:
                    state["last_switch_reason"] = "windows_fallback"
                    return url

            if not self.last_error:
                self.last_error = "Kokoro, Gemini et Piper sont indisponibles"
            self.last_engine = "voice-unavailable"
            self.last_voice = kokoro_voice.voice_name
            return None

    def diagnostic(self: Any) -> dict[str, Any]:
        payload = original_diagnostic()
        now = time.monotonic()
        blocked_for = max(
            0,
            round(float(state["gemini_blocked_until"] or 0.0) - now),
        )
        current_voice = self.last_voice or kokoro_voice.voice_name
        current_engine = self.last_engine or (
            "kokoro-local" if kokoro_primary else "gemini-tts"
        )
        payload["voice_identity"] = {
            "locked": voice_locked,
            "primary_engine": "kokoro-local" if kokoro_primary else "gemini-tts",
            "primary_voice": kokoro_voice.voice_name if kokoro_primary else gemini_voice,
            "gemini_fallback_voice": gemini_voice,
            "current_voice": current_voice,
            "current_engine": current_engine,
            "windows_or_browser_fallback_allowed": allow_windows_fallback,
            "piper_last_resort_enabled": piper_fallback_enabled,
            "policy": (
                f"Kokoro {kokoro_voice.voice_name} puis Gemini {gemini_voice}, "
                "puis Piper local; jamais de voix Windows aleatoire"
            ),
            "last_switch_reason": state["last_switch_reason"],
        }
        payload["gemini_circuit"] = {
            "open": bool(state["session_local_locked"] or blocked_for > 0),
            "retry_after_seconds": blocked_for,
            "quota_events": state["quota_events"],
            "session_local_locked": state["session_local_locked"],
            "last_switch_reason": state["last_switch_reason"],
            "last_error": state["last_gemini_error"],
        }
        payload["kokoro_voice"] = {
            **kokoro_voice.diagnostic(),
            "last_error": state["last_kokoro_error"] or kokoro_voice.last_error,
        }
        payload["local_voice"] = piper_voice.diagnostic()
        return payload

    service._mairaiy_original_synthesize = service.synthesize
    service.synthesize = MethodType(synthesize, service)
    service.diagnostic = MethodType(diagnostic, service)
    service._mairaiy_voice_identity_locked = True
    return service
