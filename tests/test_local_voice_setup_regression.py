from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VOICE_UI = ROOT / "app" / "web" / "static" / "avatar" / "voice-control.js"
SETUP_UI = ROOT / "app" / "web" / "templates" / "setup.html"
MAIN_V3 = ROOT / "app" / "main_v3.py"
VOICE_REALTIME = ROOT / "app" / "services" / "voice_realtime.py"


def test_voice_control_exposes_historical_aoede_status() -> None:
    content = VOICE_UI.read_text(encoding="utf-8")
    assert "KOKORO LOCAL" not in content
    assert "VOIX DE SECOURS" not in content
    assert "MAIRAIY AOEDE" in content
    assert "MAIRAIY AOEDE À CONFIGURER" in content
    assert "voix Aoede" in content


def test_kokoro_counts_as_a_delivered_realtime_engine() -> None:
    content = VOICE_REALTIME.read_text(encoding="utf-8")
    assert '"kokoro-local"' in content
    assert '_DELIVERED_VOICE_ENGINES' in content


def test_missing_twitch_credentials_redirect_to_local_setup() -> None:
    main = MAIN_V3.read_text(encoding="utf-8")
    setup = SETUP_UI.read_text(encoding="utf-8")

    assert '_remove_route("/auth/twitch/{role}", "GET")' in main
    assert 'RedirectResponse(url=f"/setup?role={role}"' in main
    assert '"TWITCH_CLIENT_ID": client_id' in main
    assert '"TWITCH_CLIENT_SECRET": client_secret' in main
    assert 'settings.twitch_client_id = client_id' in main
    assert 'settings.twitch_client_secret = client_secret' in main
    assert "Renseigne TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET dans .env" not in main
    assert "Twitch Client ID" in setup
    assert "Twitch Client Secret" in setup
    assert "Gemini TTS · Aoede" in setup
    assert "Enregistrer et tester Aoede" in setup
    assert "Gemini n’est pas requis" not in setup
    assert "Voix attendue : ff_siwis" not in setup


def test_setup_api_never_returns_twitch_secret() -> None:
    main = MAIN_V3.read_text(encoding="utf-8")
    status_start = main.index('async def local_setup_status')
    status_end = main.index('@app.post("/api/setup/twitch")')
    status_block = main[status_start:status_end]
    assert '"twitch_secret_present"' in status_block
    assert 'settings.twitch_client_secret,' not in status_block
