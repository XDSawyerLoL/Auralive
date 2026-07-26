from __future__ import annotations

import os
from types import MethodType
from typing import Any

from app.services import avatar_audio


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().casefold() in {"1", "true", "yes", "oui", "on"}


def install_voice_identity_lock(aura: Any) -> Any:
    """Garde un timbre unique pour Mairaiy.

    Un échec Gemini ne doit jamais faire basculer silencieusement vers la voix
    Windows ou celle du navigateur. Une absence temporaire de voix est plus
    cohérente qu'un changement brutal de personnage en plein direct.
    """
    service = aura.avatar_audio
    if getattr(service, "_mairaiy_voice_identity_locked", False):
        return service

    original_diagnostic = service.diagnostic
    locked_voice = str(os.getenv("TTS_VOICE", "Leda") or "Leda").strip() or "Leda"
    voice_locked = _bool_env("MAIRAIY_VOICE_LOCKED", True)
    allow_fallback = _bool_env("TTS_ALLOW_VOICE_FALLBACK", False)

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
            self.last_engine = "gemini-tts-unavailable"
            return None

        async with self._lock:
            self.output_dir.mkdir(parents=True, exist_ok=True)
            self.last_provider_error = ""
            self.last_error = ""
            self.last_audio_duration_ms = 0
            self.last_voice = locked_voice

            if self.gemini_api_key:
                url = await self._synthesize_gemini(
                    clean,
                    voice=locked_voice,
                    rate=rate,
                    pitch=pitch,
                    context=context,
                    style=style,
                )
                if url:
                    return url

            if allow_fallback:
                if self.preferred_mode != "browser" and self.windows_available:
                    url = await self._synthesize_windows(
                        clean,
                        voice=voice,
                        rate=rate,
                        volume=volume,
                    )
                    if url:
                        return url

            if not self.last_error:
                self.last_error = "Voix Gemini indisponible; changement de timbre refusé"
            self.last_engine = "gemini-tts-unavailable"
            self.last_voice = locked_voice
            return None

    def diagnostic(self: Any) -> dict[str, Any]:
        payload = original_diagnostic()
        payload["voice_identity"] = {
            "locked": voice_locked,
            "voice": locked_voice,
            "fallback_allowed": allow_fallback,
            "policy": "silence plutôt que changement de timbre",
        }
        return payload

    service._mairaiy_original_synthesize = service.synthesize
    service.synthesize = MethodType(synthesize, service)
    service.diagnostic = MethodType(diagnostic, service)
    service._mairaiy_voice_identity_locked = True
    return service
