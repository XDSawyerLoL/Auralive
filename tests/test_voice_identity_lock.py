from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.services.voice_identity_lock import install_voice_identity_lock


class FakeAudio:
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self._lock = asyncio.Lock()
        self.gemini_api_key = "key"
        self.preferred_mode = "gemini"
        self.windows_available = True
        self.last_provider_error = ""
        self.last_error = ""
        self.last_audio_duration_ms = 0
        self.last_engine = ""
        self.last_voice = ""
        self.windows_calls = 0

    async def synthesize(self, *_args, **_kwargs):
        return "original"

    async def _synthesize_gemini(self, *_args, **_kwargs):
        self.last_error = "Gemini indisponible"
        return None

    async def _synthesize_windows(self, *_args, **_kwargs):
        self.windows_calls += 1
        return "/media/windows.wav"

    def diagnostic(self):
        return {"engine": self.last_engine}


def test_locked_voice_never_switches_to_windows(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("MAIRAIY_LOCKED_VOICE", raising=False)
    monkeypatch.delenv("MAIRAIY_VOICE_LOCKED", raising=False)
    monkeypatch.delenv("TTS_ALLOW_VOICE_FALLBACK", raising=False)
    audio = FakeAudio(tmp_path)
    aura = SimpleNamespace(avatar_audio=audio)
    install_voice_identity_lock(aura)

    result = asyncio.run(audio.synthesize("Bonjour Sansa"))

    assert result is None
    assert audio.windows_calls == 0
    assert audio.last_engine == "gemini-tts-unavailable"
    assert audio.last_voice == "Leda"
    assert audio.diagnostic()["voice_identity"]["locked"] is True
    assert audio.diagnostic()["voice_identity"]["fallback_allowed"] is False
