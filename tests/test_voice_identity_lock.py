from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.services import voice_identity_lock


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
        self.last_duration_ms = 0
        self.last_engine = ""
        self.last_voice = ""
        self.last_file = ""
        self.generated_count = 0
        self.windows_calls = 0
        self.gemini_calls = 0

    async def synthesize(self, *_args, **_kwargs):
        return "original"

    async def _synthesize_gemini(self, *_args, **_kwargs):
        self.gemini_calls += 1
        self.last_error = "Gemini TTS HTTP 429: You exceeded your current quota"
        self.last_provider_error = self.last_error
        return None

    async def _synthesize_windows(self, *_args, **_kwargs):
        self.windows_calls += 1
        return "/media/windows.wav"

    def _cleanup(self):
        return None

    def diagnostic(self):
        return {"engine": self.last_engine}


class FakeLocalVoice:
    def __init__(self, _output_dir: Path):
        self.voice_name = "fr_FR-siwis-medium"
        self.last_error = ""
        self.last_file = "local.wav"
        self.last_generation_ms = 80
        self.last_audio_duration_ms = 1400
        self.calls = 0

    async def synthesize(self, *_args, **_kwargs):
        self.calls += 1
        return "/media/tts/local.wav"

    def diagnostic(self):
        return {
            "enabled": True,
            "ready": True,
            "voice": self.voice_name,
            "offline": True,
            "last_error": self.last_error,
        }


def test_quota_switches_once_to_fixed_local_voice(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("MAIRAIY_LOCKED_VOICE", raising=False)
    monkeypatch.delenv("MAIRAIY_VOICE_LOCKED", raising=False)
    monkeypatch.delenv("TTS_ALLOW_VOICE_FALLBACK", raising=False)
    monkeypatch.delenv("MAIRAIY_FORCE_LOCAL_VOICE", raising=False)
    monkeypatch.setenv("MAIRAIY_LOCAL_VOICE_ENABLED", "true")
    monkeypatch.setattr(voice_identity_lock, "LocalPiperVoice", FakeLocalVoice)

    audio = FakeAudio(tmp_path)
    aura = SimpleNamespace(avatar_audio=audio)
    voice_identity_lock.install_voice_identity_lock(aura)

    first = asyncio.run(audio.synthesize("Bonjour Sansa"))
    second = asyncio.run(audio.synthesize("Deuxième phrase"))

    assert first == "/media/tts/local.wav"
    assert second == "/media/tts/local.wav"
    assert audio.gemini_calls == 1
    assert audio.windows_calls == 0
    assert audio.last_engine == "piper-local"
    assert audio.last_voice == "fr_FR-siwis-medium"
    assert audio.generated_count == 2

    diagnostic = audio.diagnostic()
    assert diagnostic["voice_identity"]["locked"] is True
    assert diagnostic["voice_identity"]["windows_or_browser_fallback_allowed"] is False
    assert diagnostic["gemini_circuit"]["open"] is True
    assert diagnostic["gemini_circuit"]["quota_events"] == 1
    assert diagnostic["gemini_circuit"]["last_switch_reason"] == "gemini_quota_429"
    assert diagnostic["local_voice"]["offline"] is True
