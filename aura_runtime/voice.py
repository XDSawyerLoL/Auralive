from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from typing import Any

from .voice_kokoro import LocalKokoroVoice
from .voice_piper import LocalPiperVoice


def _bool(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "1" if default else "0")).strip().casefold()
    return raw in {"1", "true", "yes", "oui", "on"}


def _module_available(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, AttributeError, ValueError):
        return False


class RuntimeVoice:
    """Voix locale AURA Runtime avec Kokoro prioritaire et Piper en secours."""

    VERSION = "aura-runtime-voice-v1"

    def __init__(self, settings: Any):
        self.settings = settings
        self.enabled = bool(getattr(settings, "aura_runtime_voice_enabled", True))
        self.mode = str(getattr(settings, "aura_runtime_voice_mode", "auto") or "auto").strip().casefold()
        if self.mode not in {"auto", "kokoro", "piper", "off"}:
            self.mode = "auto"
        self.output_dir = Path(
            getattr(
                settings,
                "aura_runtime_voice_output_dir",
                Path(getattr(settings, "aura_runtime_data_dir", Path.home() / ".aura-runtime")) / "tts",
            )
        ).expanduser().resolve()
        runtime_dir = Path(
            getattr(settings, "aura_runtime_data_dir", Path.home() / ".aura-runtime")
        ).expanduser().resolve()
        self.kokoro = LocalKokoroVoice(self.output_dir, runtime_dir=runtime_dir)
        self.piper = LocalPiperVoice(self.output_dir, runtime_dir=runtime_dir)
        self.last_error = ""
        self.last_file = ""
        self.last_engine = ""
        self.last_voice = ""
        self.last_audio_duration_ms = 0
        self.last_generation_ms = 0

    @property
    def kokoro_dependencies_available(self) -> bool:
        return all(
            _module_available(name)
            for name in ("kokoro_onnx", "misaki", "soundfile", "numpy")
        )

    @property
    def piper_dependencies_available(self) -> bool:
        return _module_available("piper")

    @property
    def available(self) -> bool:
        if not self.enabled or self.mode == "off":
            return False
        if self.mode == "kokoro":
            return self.kokoro_dependencies_available
        if self.mode == "piper":
            return self.piper_dependencies_available
        return self.kokoro_dependencies_available or self.piper_dependencies_available

    def _engines(self) -> list[tuple[str, Any]]:
        if not self.available:
            return []
        if self.mode == "kokoro":
            return [("kokoro-onnx", self.kokoro)]
        if self.mode == "piper":
            return [("piper", self.piper)]
        engines: list[tuple[str, Any]] = []
        if self.kokoro_dependencies_available:
            engines.append(("kokoro-onnx", self.kokoro))
        if self.piper_dependencies_available:
            engines.append(("piper", self.piper))
        return engines

    async def synthesize(
        self,
        text: str,
        *,
        voice: str = "",
        rate: float = 1.0,
        pitch: float = 1.0,
        volume: float = 1.0,
        context: str = "aura-runtime",
        style: str = "",
    ) -> str | None:
        del voice, pitch, context, style
        if not self.available:
            self.last_error = (
                "Aucun moteur vocal local AURA Runtime disponible. "
                "Installer le profil voix Kokoro/Piper ou désactiver TTS sur ce nœud."
            )
            return None

        errors: list[str] = []
        for engine_name, engine in self._engines():
            try:
                result = await engine.synthesize(text, rate=rate, volume=volume)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{engine_name}: {exc.__class__.__name__}: {exc}")
                continue
            if not result:
                errors.append(f"{engine_name}: {str(getattr(engine, 'last_error', '') or 'échec')}")
                continue
            self.last_file = str(getattr(engine, "last_file", "") or "")
            self.last_engine = engine_name
            self.last_voice = str(
                getattr(engine, "voice_name", "")
                or ("ff_siwis" if engine_name == "kokoro-onnx" else "")
            )
            self.last_audio_duration_ms = int(
                getattr(engine, "last_audio_duration_ms", 0) or 0
            )
            self.last_generation_ms = int(
                getattr(engine, "last_generation_ms", 0) or 0
            )
            self.last_error = ""
            return result

        self.last_error = " | ".join(errors)[-2000:] or "Synthèse locale impossible"
        return None

    def diagnostic(self) -> dict[str, Any]:
        return {
            "version": self.VERSION,
            "enabled": self.enabled,
            "available": self.available,
            "mode": self.mode,
            "offline": True,
            "output_dir": str(self.output_dir),
            "last_engine": self.last_engine,
            "last_voice": self.last_voice,
            "last_file": self.last_file,
            "last_audio_duration_ms": self.last_audio_duration_ms,
            "last_generation_ms": self.last_generation_ms,
            "last_error": self.last_error,
            "engines": {
                "kokoro": {
                    "dependencies_available": self.kokoro_dependencies_available,
                    **self.kokoro.diagnostic(),
                },
                "piper": {
                    "dependencies_available": self.piper_dependencies_available,
                    **self.piper.diagnostic(),
                },
            },
        }
