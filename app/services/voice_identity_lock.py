from __future__ import annotations

from types import MethodType
from typing import Any

from app.services import avatar_audio
from app.services.local_kokoro_voice import LocalKokoroVoice


def install_voice_identity_lock(aura: Any) -> Any:
    """Restaure l'identite vocale historique Mairaiy d'Aura Live 2.0.7.

    Mairaiy parle exclusivement via Gemini TTS avec la voix prebuilt Aoede et
    le prompt naturel defini dans avatar_audio.py. Kokoro reste chargeable pour
    compatibilite/diagnostic, mais n'est jamais utilise comme voix de Mairaiy.
    Si Gemini n'est pas disponible, Mairaiy reste silencieuse plutot que de
    changer de timbre.
    """
    service = aura.avatar_audio
    if getattr(service, "_mairaiy_voice_identity_locked", False):
        return service

    original_diagnostic = service.diagnostic
    locked_voice = "Aoede"
    locked_model = "gemini-3.1-flash-tts-preview"

    # Preserve the existing Kokoro component for setup/diagnostics and old UI
    # contracts, but it is deliberately outside the Mairaiy synthesis path.
    kokoro_voice = LocalKokoroVoice(service.output_dir)
    aura.local_kokoro_voice = kokoro_voice

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
        del voice, volume
        clean = avatar_audio._normalize_text(text)
        if not clean:
            self.last_error = "Texte vocal vide"
            self.last_engine = "gemini-tts-unavailable"
            self.last_voice = locked_voice
            return None

        async with self._lock:
            self.output_dir.mkdir(parents=True, exist_ok=True)
            self.last_provider_error = ""
            self.last_error = ""
            self.last_audio_duration_ms = 0
            self.last_voice = locked_voice

            if not self.gemini_api_key:
                self.last_error = "Gemini TTS non configure: cle TTS_API_KEY ou AI_API_KEY absente"
                self.last_engine = "gemini-tts-unavailable"
                return None

            url = await self._synthesize_gemini(
                clean,
                voice=locked_voice,
                rate=rate,
                pitch=pitch,
                context=context,
                style=style,
                model=locked_model,
            )
            if url:
                # _synthesize_gemini already records gemini-tts + Aoede.
                return url

            if not self.last_error:
                self.last_error = "Gemini TTS Aoede indisponible"
            self.last_engine = "gemini-tts-unavailable"
            self.last_voice = locked_voice
            return None

    def diagnostic(self: Any) -> dict[str, Any]:
        payload = original_diagnostic()
        payload["voice_identity"] = {
            "locked": True,
            "historical_profile": "aura-live-2.0.7-natural",
            "primary_engine": "gemini-tts",
            "primary_model": locked_model,
            "primary_voice": locked_voice,
            "current_voice": self.last_voice or locked_voice,
            "current_engine": self.last_engine or (
                "gemini-tts" if self.gemini_api_key else "gemini-tts-unavailable"
            ),
            "generic_fallback_allowed": False,
            "kokoro_is_mairaiy_voice": False,
            "policy": "Gemini TTS Aoede uniquement; silence plutot qu'un changement de timbre",
        }
        payload["kokoro_voice"] = {
            **kokoro_voice.diagnostic(),
            "used_for_mairaiy": False,
        }
        return payload

    service._mairaiy_original_synthesize = service.synthesize
    service.synthesize = MethodType(synthesize, service)
    service.diagnostic = MethodType(diagnostic, service)
    service._mairaiy_voice_identity_locked = True
    return service
