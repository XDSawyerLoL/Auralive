from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_cloud_voice_route_uses_quantic_studio_exact_kokoro_instance() -> None:
    source = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
    studio = (ROOT / "app" / "main_v3.py").read_text(encoding="utf-8")

    assert 'getattr(aura, "local_kokoro_voice", None) or mairaiy_kokoro' in source
    assert '@app.post("/voice/v1/audio/speech")' in source
    assert 'engine_voice: str = Field(default="ff_siwis"' in source
    assert '"X-Mairaiy-Voice": "ff_siwis"' in source
    assert '"X-Mairaiy-Language": "fr-fr"' in source
    assert '"X-Mairaiy-Engine": "kokoro-onnx"' in source
    assert 'audio_url = await exact_voice.synthesize(' in source

    assert 'install_voice_identity_lock(aura)' in studio
    assert 'voice = getattr(aura, "local_kokoro_voice", None)' in studio
    assert 'ready = await voice.ensure_ready()' in studio


def test_exact_cloud_voice_route_has_no_generic_tts_fallback() -> None:
    source = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
    start = source.index('@app.post("/voice/v1/audio/speech")')
    end = source.index("\n\ndef overlay_html", start)
    route = source[start:end]

    assert "gemini" not in route.casefold()
    assert "piper" not in route.casefold()
    assert "windows" not in route.casefold()
    assert "speechsynthesis" not in route.casefold()
    assert "LocalKokoroVoice" not in route
    assert "exact_voice.synthesize" in route
