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


class FakeKokoroVoice:
    should_fail = False

    def __init__(self, _output_dir: Path):
        self.enabled = True
        self.voice_name = "ff_siwis"
        self.last_error = ""
        self.last_file = "kokoro.wav"
        self.last_generation_ms = 45
        self.last_audio_duration_ms = 1250
        self.calls = 0

    async def ensure_ready(self):
        return not self.should_fail

    async def synthesize(self, *_args, **_kwargs):
        self.calls += 1
        if self.should_fail:
            self.last_error = "Kokoro indisponible"
            return None
        return "/media/tts/kokoro.wav"

    def diagnostic(self):
        return {
            "enabled": True,
            "ready": not self.should_fail,
            "engine": "kokoro-onnx",
            "voice": self.voice_name,
            "offline": True,
            "last_error": self.last_error,
        }


class FakePiperVoice:
    def __init__(self, _output_dir: Path):
        self.voice_name = "fr_FR-siwis-medium"
        self.last_error = ""
        self.last_file = "piper.wav"
        self.last_generation_ms = 80
        self.last_audio_duration_ms = 1400
        self.calls = 0

    async def synthesize(self, *_args, **_kwargs):
        self.calls += 1
        return "/media/tts/piper.wav"

    def diagnostic(self):
        return {
            "enabled": True,
            "ready": True,
            "voice": self.voice_name,
            "offline": True,
            "last_error": self.last_error,
        }


def _install(tmp_path, monkeypatch, *, kokoro_fails: bool = False):
    monkeypatch.delenv("MAIRAIY_LOCKED_VOICE", raising=False)
    monkeypatch.delenv("MAIRAIY_GEMINI_VOICE", raising=False)
    monkeypatch.delenv("MAIRAIY_VOICE_LOCKED", raising=False)
    monkeypatch.delenv("TTS_ALLOW_VOICE_FALLBACK", raising=False)
    monkeypatch.delenv("MAIRAIY_FORCE_LOCAL_VOICE", raising=False)
    monkeypatch.delenv("MAIRAIY_KOKORO_PRIMARY", raising=False)
    monkeypatch.setenv("MAIRAIY_LOCAL_VOICE_ENABLED", "true")
    FakeKokoroVoice.should_fail = kokoro_fails
    monkeypatch.setattr(voice_identity_lock, "LocalKokoroVoice", FakeKokoroVoice)
    monkeypatch.setattr(voice_identity_lock, "LocalPiperVoice", FakePiperVoice)

    audio = FakeAudio(tmp_path)
    aura = SimpleNamespace(avatar_audio=audio)
    voice_identity_lock.install_voice_identity_lock(aura)
    return aura, audio


def test_kokoro_is_primary_and_never_calls_gemini_when_healthy(tmp_path, monkeypatch) -> None:
    aura, audio = _install(tmp_path, monkeypatch)

    first = asyncio.run(audio.synthesize("Bonjour Sansa"))
    second = asyncio.run(audio.synthesize("Deuxième phrase"))

    assert first == "/media/tts/kokoro.wav"
    assert second == "/media/tts/kokoro.wav"
    assert aura.local_kokoro_voice.calls == 2
    assert audio.gemini_calls == 0
    assert audio.windows_calls == 0
    assert audio.last_engine == "kokoro-local"
    assert audio.last_voice == "ff_siwis"
    assert audio.generated_count == 2

    diagnostic = audio.diagnostic()
    assert diagnostic["voice_identity"]["locked"] is True
    assert diagnostic["voice_identity"]["primary_engine"] == "kokoro-local"
    assert diagnostic["voice_identity"]["primary_voice"] == "ff_siwis"
    assert diagnostic["voice_identity"]["gemini_fallback_voice"] == "Aoede"
    assert diagnostic["kokoro_voice"]["offline"] is True


def test_kokoro_failure_then_gemini_quota_uses_piper_without_windows(tmp_path, monkeypatch) -> None:
    _aura, audio = _install(tmp_path, monkeypatch, kokoro_fails=True)

    first = asyncio.run(audio.synthesize("Bonjour Sansa"))
    second = asyncio.run(audio.synthesize("Deuxième phrase"))

    assert first == "/media/tts/piper.wav"
    assert second == "/media/tts/piper.wav"
    assert audio.gemini_calls == 1
    assert audio.windows_calls == 0
    assert audio.last_engine == "piper-local"
    assert audio.last_voice == "fr_FR-siwis-medium"

    diagnostic = audio.diagnostic()
    assert diagnostic["gemini_circuit"]["open"] is True
    assert diagnostic["gemini_circuit"]["quota_events"] == 1
    assert diagnostic["kokoro_voice"]["last_error"] == "Kokoro indisponible"
