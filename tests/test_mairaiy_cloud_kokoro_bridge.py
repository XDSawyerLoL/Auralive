from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_cloud_voice_route_uses_historical_gemini_aoede_identity() -> None:
    source = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
    studio = (ROOT / "app" / "main_v3.py").read_text(encoding="utf-8")
    lock = (ROOT / "app" / "services" / "voice_identity_lock.py").read_text(encoding="utf-8")
    audio = (ROOT / "app" / "services" / "avatar_audio.py").read_text(encoding="utf-8")

    assert '@app.post("/voice/v1/audio/speech")' in source
    assert 'engine_voice: str = Field(default="Aoede"' in source
    assert '"X-Mairaiy-Voice": "Aoede"' in source
    assert '"X-Mairaiy-Language": "fr-fr"' in source
    assert '"X-Mairaiy-Engine": "gemini-tts"' in source
    assert 'audio_url = await service.synthesize(' in source

    assert 'install_voice_identity_lock(aura)' in studio
    assert 'locked_voice = "Aoede"' in lock
    assert 'primary_engine": "gemini-tts"' in lock
    assert 'kokoro_is_mairaiy_voice": False' in lock
    assert '_GEMINI_TTS_DEFAULT_VOICE = "Aoede"' in audio
    assert 'close-mic, modern and natural' in audio


def test_exact_cloud_voice_route_refuses_other_timbres() -> None:
    source = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
    start = source.index('@app.post("/voice/v1/audio/speech")')
    end = source.index("\n\ndef overlay_html", start)
    route = source[start:end]

    assert 'voice="Aoede"' in route
    assert 'service.last_engine or "") != "gemini-tts"' in route
    assert 'service.last_voice or "").casefold() != "aoede"' in route
    assert "piper" not in route.casefold()
    assert "kokoro" not in route.casefold()
    assert "windows" not in route.casefold()
    assert "speechsynthesis" not in route.casefold()
