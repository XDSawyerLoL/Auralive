import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.services.tts_budget import TTSBudgetGuard, _estimate_seconds


def run(coro):
    return asyncio.run(coro)


class FakeAudio:
    def __init__(self, path: Path):
        self.output_dir = path
        self.last_audio_duration_ms = 4000
        self.last_provider_error = ""
        self.last_error = ""
        self.calls = 0

    async def _synthesize_gemini(self, text: str, **kwargs):
        self.calls += 1
        return "/media/tts/test.wav"

    def diagnostic(self):
        return {"engine": "gemini-tts"}


def test_estimate_is_positive_and_grows_with_text():
    assert _estimate_seconds("bonjour") >= 1.2
    assert _estimate_seconds("un deux trois quatre cinq six sept huit") > _estimate_seconds("bonjour")


def test_successful_generation_updates_conservative_daily_usage(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("TTS_BUDGET_ENABLED", "true")
    monkeypatch.setenv("TTS_MAX_DAILY_USD", "0.50")
    audio = FakeAudio(tmp_path)
    guard = TTSBudgetGuard(audio)
    result = run(guard.guarded_gemini("Bonjour le Spot"))
    assert result == "/media/tts/test.wav"
    diagnostic = guard.diagnostic()["budget"]
    assert diagnostic["requests_today"] == 1
    assert diagnostic["audio_minutes_today"] > 0
    assert diagnostic["estimated_usd_today"] > 0
    assert "secret" not in str(diagnostic)


def test_budget_exhaustion_falls_back_without_calling_gemini(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("TTS_BUDGET_ENABLED", "true")
    monkeypatch.setenv("TTS_MAX_DAILY_USD", "0.00001")
    audio = FakeAudio(tmp_path)
    guard = TTSBudgetGuard(audio)
    result = run(guard.guarded_gemini("Cette phrase dépasse volontairement le plafond minuscule."))
    assert result is None
    assert audio.calls == 0
    assert "Plafond Gemini TTS atteint" in guard.last_block_reason
