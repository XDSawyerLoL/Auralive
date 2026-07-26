import asyncio
import base64
import io
import wave
from types import SimpleNamespace

import pytest

from app.services.voice_input import VoiceInputService, _wake_invocation, decode_audio_base64


def make_wav() -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16_000)
        audio.writeframes(b"\x00\x00" * 1600)
    return output.getvalue()


def test_decode_accepts_browser_wav_base64():
    wav = make_wav()
    encoded = base64.b64encode(wav).decode("ascii")
    assert decode_audio_base64(encoded) == wav
    assert decode_audio_base64(f"data:audio/wav;base64,{encoded}") == wav


def test_decode_rejects_empty_or_invalid_audio():
    with pytest.raises(ValueError, match="vide"):
        decode_audio_base64("")
    with pytest.raises(ValueError, match="invalide"):
        decode_audio_base64("pas-du-base64")


def test_wake_word_is_detected_and_removed_from_prompt():
    detected, prompt = _wake_invocation("Mairaiy, tu as vu ce qui vient de se passer ?")
    assert detected is True
    assert prompt == "tu as vu ce qui vient de se passer ?"
    detected, prompt = _wake_invocation("Je parle simplement au chat")
    assert detected is False
    assert prompt == "Je parle simplement au chat"


def test_wake_word_accepts_common_french_transcription_variants():
    detected, prompt = _wake_invocation("Marie, est-ce que tu vois la partie ?")
    assert detected is True
    assert prompt == "est-ce que tu vois la partie ?"
    detected, prompt = _wake_invocation("Maïra tu m'entends ?")
    assert detected is True
    assert prompt == "tu m'entends ?"


def test_voice_input_uses_low_latency_gemini_model(monkeypatch):
    monkeypatch.delenv("VOICE_INPUT_MODEL", raising=False)
    aura = SimpleNamespace()
    settings = SimpleNamespace(ai_mode="gemini", ai_api_key="secret", ai_model="gemini-3.5-flash-lite")
    service = VoiceInputService(aura, SimpleNamespace(), SimpleNamespace(), settings)
    diagnostic = service.diagnostic()
    assert diagnostic["configured"] is True
    assert diagnostic["model"] == "gemini-3.5-flash-lite"
    assert diagnostic["audio_persisted"] is False
    assert diagnostic["controls"]["self_rearming"] is True
    assert diagnostic["controls"]["wake_word_fuzzy"] is True
    assert "secret" not in str(diagnostic)


class FakeMemory:
    async def context(self, _viewer):
        return ""

    async def conversation(self, _user_id, limit=12):
        return []

    async def remember_turn(self, _user_id, _role, _content):
        return None


class FakeDB:
    async def get_viewer(self, *, user_id):
        return {"user_id": user_id}

    async def upsert_viewer(self, user_id, _login, _display_name):
        return {"user_id": user_id}


class FakeOverlay:
    def count(self, _target):
        return 1

    async def emit(self, event, *, target=None):
        if event.get("speak", True):
            raise asyncio.TimeoutError
        return None


class FakeAI:
    async def reply(self, *_args, **_kwargs):
        return "Oui, je suis là et je vois la partie."


@pytest.mark.asyncio
async def test_text_answer_survives_voice_timeout(monkeypatch):
    aura = SimpleNamespace(
        ai=FakeAI(),
        memory=FakeMemory(),
        overlay=FakeOverlay(),
        avatar_audio=SimpleNamespace(last_audio_duration_ms=9000),
        recent_chat=[],
        say=lambda _message: None,
    )
    settings = SimpleNamespace(ai_mode="gemini", ai_api_key="secret", ai_model="gemini-3.5-flash-lite")
    service = VoiceInputService(aura, FakeDB(), SimpleNamespace(), settings)

    async def fake_transcribe(_audio, _mime_type):
        return "Marie, tu m'entends ?"

    monkeypatch.setattr(service, "transcribe", fake_transcribe)
    encoded = base64.b64encode(make_wav()).decode("ascii")
    result = await service.talk(
        encoded,
        "audio/wav; mode=handsfree",
        require_wake_word=True,
    )

    assert result["answer"] == "Oui, je suis là et je vois la partie."
    assert result["voice_delivered"] is False
    assert "25 secondes" in result["voice_error"]
    assert result["audio_duration_ms"] == 0
    assert result["rearm_after_ms"] == 1200
    assert service.request_count == 1
    assert service.last_stage == "idle"
