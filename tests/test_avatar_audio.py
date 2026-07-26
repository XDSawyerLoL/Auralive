import asyncio
import wave
from pathlib import Path

from app.core.event_bus import OverlayBus
from app.services.avatar_audio import (
    AvatarAudioService,
    _build_gemini_prompt,
    _normalize_text,
    _pcm_rate_from_mime,
    _rate_to_sapi,
    _select_gemini_voice,
    _volume_to_sapi,
    _write_pcm_wav,
)


def run(coro):
    return asyncio.run(coro)


class FakeWebSocket:
    def __init__(self, label: str = ""):
        self.query_params = {"client": label}
        self.events = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def send_json(self, event):
        self.events.append(event)


def test_text_and_voice_values_are_normalized():
    assert _normalize_text("  @Sansa   Bonjour\nle Spot  ") == "Bonjour le Spot"
    assert _rate_to_sapi(1.0) == 0
    assert _rate_to_sapi(2.0) > 0
    assert _volume_to_sapi(0.75) == 75
    assert _volume_to_sapi(4) == 100


def test_gemini_voice_and_prompt_keep_mairaiy_natural(monkeypatch):
    monkeypatch.delenv("TTS_VOICE", raising=False)
    assert _select_gemini_voice("aoede") == "Aoede"
    assert _select_gemini_voice("voix inconnue") == "Aoede"
    prompt = _build_gemini_prompt(
        "Salut le Spot !",
        rate=1.08,
        pitch=1.0,
        context="aura_message",
    )
    assert "Mairaiy" in prompt
    assert "native French from France" in prompt
    assert "Avoid robotic cadence" in prompt
    assert prompt.rstrip().endswith("Salut le Spot !")


def test_pcm_audio_is_wrapped_in_a_valid_wav(tmp_path: Path):
    path = tmp_path / "voice.wav"
    pcm = b"\x00\x00" * 2400
    _write_pcm_wav(path, pcm, rate=24_000)
    with wave.open(str(path), "rb") as audio:
        assert audio.getnchannels() == 1
        assert audio.getsampwidth() == 2
        assert audio.getframerate() == 24_000
        assert audio.getnframes() == 2400
    assert _pcm_rate_from_mime("audio/L16;codec=pcm;rate=24000") == 24_000


def test_overlay_bus_targets_only_avatar_clients():
    async def scenario():
        bus = OverlayBus()
        avatar = FakeWebSocket("avatar")
        alerts = FakeWebSocket("alerts")
        await bus.connect(avatar)
        await bus.connect(alerts)
        await bus.emit({"type": "avatar_voice"}, target="avatar")
        assert avatar.events == [{"type": "avatar_voice"}]
        assert alerts.events == []
        assert bus.count("avatar") == 1
        assert bus.summary()["alerts"] == 1

    run(scenario())


def test_service_reports_a_secure_provider_without_exposing_key(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "secret-test-key")
    monkeypatch.delenv("TTS_MODE", raising=False)
    service = AvatarAudioService(tmp_path)
    diagnostic = service.diagnostic()
    assert diagnostic["preferred_mode"] == "gemini"
    assert diagnostic["gemini_configured"] is True
    assert diagnostic["model"] == "gemini-3.1-flash-tts-preview"
    assert "secret-test-key" not in str(diagnostic)
    assert diagnostic["last_error"] == ""
