from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "app" / "web" / "static" / "avatar" / "voice-control.js"
TEMPLATE = ROOT / "app" / "web" / "templates" / "voice_control.html"


def test_continuous_recognition_replaces_custom_vad() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert "window.SpeechRecognition || window.webkitSpeechRecognition" in source
    assert "instance.continuous = true" in source
    assert "createScriptProcessor" not in source
    assert "'/api/voice/text'" in source


def test_recognized_phrases_are_server_filtered_before_reply() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert "function consumeFinal" in source
    assert "phraseParts.push(clean)" in source
    assert "sendPhrase(phrase)" in source
    assert "if (data.ignored)" in source
    assert "ambient_broadcast" in source
    assert "Son du live ignoré" in source
    assert "WAKE_PATTERN" not in source
    assert "wakeArmed" not in source


def test_listening_restarts_after_browser_end_and_ignored_audio() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert "instance.onend = () =>" in source
    assert "scheduleRestart(350)" in source
    assert "waitForVoiceCompletion" in source
    assert "last_rearm_after_ms" in source
    assert "scheduleRestart(Math.max(200, Number(data.rearm_after_ms || 250)))" in source


def test_voice_control_cache_version_is_bumped_for_filter() -> None:
    html = TEMPLATE.read_text(encoding="utf-8")
    assert "voice-control.js?v=2.5.3" in html
    assert "Écoute filtrée" in html
    assert "Chaque phrase reconnue lui est adressée directement" not in html


def test_response_request_has_a_watchdog() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert "new AbortController()" in source
    assert "requestController.abort()" in source
    assert "35000" in source
    assert "VOICE_WAIT_LIMIT_MS = 50000" in source


def test_ui_no_longer_claims_every_phrase_is_for_mairaiy() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    html = TEMPLATE.read_text(encoding="utf-8")
    old_claims = (
        "chaque phrase lui est adressée",
        "toutes tes phrases sont adressées à Mairaiy",
        "Toutes les phrases reconnues sont adressées à Mairaiy",
    )
    for claim in old_claims:
        assert claim not in source
        assert claim not in html
