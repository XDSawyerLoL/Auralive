from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.services import voice_identity_lock


class FakeAudio:
    def __init__(self, output_dir: Path, *, fail_gemini: bool = False):
        self.output_dir = output_dir
        self._lock = asyncio.Lock()
        self._gemini_api_key = "key"
        self.fail_gemini = fail_gemini
        self.last_provider_error = ""
        self.last_error = ""
        self.last_audio_duration_ms = 0
        self.last_duration_ms = 0
        self.last_engine = ""
        self.last_voice = ""
        self.last_file = ""
        self.generated_count = 0
        self.gemini_calls: list[dict[str, object]] = []
        self.windows_calls = 0

    @property
    def gemini_api_key(self) -> str:
        return self._gemini_api_key

    async def synthesize(self, *_args, **_kwargs):
        return "original"

    async def _synthesize_gemini(self, text: str, **kwargs):
        self.gemini_calls.append({"text": text, **kwargs})
        if self.fail_gemini:
            self.last_error = "Gemini TTS HTTP 429: quota"
            self.last_provider_error = self.last_error
            return None
        self.last_engine = "gemini-tts"
        self.last_voice = str(kwargs.get("voice") or "")
        self.generated_count += 1
        return "/media/tts/aoede.wav"

    async def _synthesize_windows(self, *_args, **_kwargs):
        self.windows_calls += 1
        return "/media/windows.wav"

    def diagnostic(self):
        return {
            "engine": self.last_engine,
            "last_error": self.last_error,
        }


class FakeKokoroVoice:
    def __init__(self, _output_dir: Path):
        self.enabled = True
        self.voice_name = "ff_siwis"
        self.calls = 0
        self.last_error = ""

    async def ensure_ready(self):
        return True

    async def synthesize(self, *_args, **_kwargs):
        self.calls += 1
        return "/media/tts/kokoro.wav"

    def diagnostic(self):
        return {
            "enabled": True,
            "ready": True,
            "engine": "kokoro-onnx",
            "voice": self.voice_name,
            "offline": True,
            "last_error": self.last_error,
        }


def _install(tmp_path, monkeypatch, *, fail_gemini: bool = False, with_key: bool = True):
    monkeypatch.setattr(voice_identity_lock, "LocalKokoroVoice", FakeKokoroVoice)
    audio = FakeAudio(tmp_path, fail_gemini=fail_gemini)
    if not with_key:
        audio._gemini_api_key = ""
    aura = SimpleNamespace(avatar_audio=audio)
    voice_identity_lock.install_voice_identity_lock(aura)
    return aura, audio


def test_historical_aoede_is_the_only_mairaiy_voice(tmp_path, monkeypatch) -> None:
    aura, audio = _install(tmp_path, monkeypatch)

    first = asyncio.run(audio.synthesize("Bonjour Sansa"))
    second = asyncio.run(audio.synthesize("Deuxième phrase"))

    assert first == "/media/tts/aoede.wav"
    assert second == "/media/tts/aoede.wav"
    assert len(audio.gemini_calls) == 2
    assert audio.windows_calls == 0
    assert aura.local_kokoro_voice.calls == 0
    assert audio.last_engine == "gemini-tts"
    assert audio.last_voice == "Aoede"

    for call in audio.gemini_calls:
        assert call["voice"] == "Aoede"
        assert call["model"] == "gemini-3.1-flash-tts-preview"

    diagnostic = audio.diagnostic()
    identity = diagnostic["voice_identity"]
    assert identity["locked"] is True
    assert identity["historical_profile"] == "aura-live-2.0.7-natural"
    assert identity["primary_engine"] == "gemini-tts"
    assert identity["primary_model"] == "gemini-3.1-flash-tts-preview"
    assert identity["primary_voice"] == "Aoede"
    assert identity["generic_fallback_allowed"] is False
    assert identity["kokoro_is_mairaiy_voice"] is False
    assert diagnostic["kokoro_voice"]["used_for_mairaiy"] is False


def test_gemini_failure_stays_silent_instead_of_changing_timbre(tmp_path, monkeypatch) -> None:
    aura, audio = _install(tmp_path, monkeypatch, fail_gemini=True)

    result = asyncio.run(audio.synthesize("Bonjour Sansa"))

    assert result is None
    assert len(audio.gemini_calls) == 1
    assert audio.windows_calls == 0
    assert aura.local_kokoro_voice.calls == 0
    assert audio.last_engine == "gemini-tts-unavailable"
    assert audio.last_voice == "Aoede"
    assert "429" in audio.last_error


def test_missing_gemini_key_never_falls_back_to_kokoro_or_windows(tmp_path, monkeypatch) -> None:
    aura, audio = _install(tmp_path, monkeypatch, with_key=False)

    result = asyncio.run(audio.synthesize("Bonjour"))

    assert result is None
    assert audio.gemini_calls == []
    assert audio.windows_calls == 0
    assert aura.local_kokoro_voice.calls == 0
    assert audio.last_engine == "gemini-tts-unavailable"
    assert "cle TTS_API_KEY ou AI_API_KEY absente" in audio.last_error
