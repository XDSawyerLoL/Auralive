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
    assert "secret" not in str(diagnostic)
