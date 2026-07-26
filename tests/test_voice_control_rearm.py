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


def test_every_recognized_phrase_is_sent_without_wake_word() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert "function consumeFinal" in source
    assert "phraseParts.push(clean)" in source
    assert "sendPhrase(phrase)" in source
    assert "WAKE_PATTERN" not in source
    assert "wakeArmed" not in source
    assert "Mot d’appel" not in source


def test_listening_restarts_after_browser_end() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert "instance.onend = () =>" in source
    assert "scheduleRestart(350)" in source
    assert "waitForVoiceCompletion" in source
    assert "last_rearm_after_ms" in source


def test_voice_control_cache_version_is_bumped() -> None:
    html = TEMPLATE.read_text(encoding="utf-8")
    assert "voice-control.js?v=2.4.2" in html
    assert "Tu n’as plus besoin de dire « Mairaiy »" in html


def test_response_request_has_a_watchdog() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert "new AbortController()" in source
    assert "requestController.abort()" in source
    assert "35000" in source
    assert "VOICE_WAIT_LIMIT_MS = 50000" in source
