from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "app" / "web" / "static" / "avatar" / "voice-control.js"
TEMPLATE = ROOT / "app" / "web" / "templates" / "voice_control.html"


def test_cooldown_is_released_before_hands_free_rearm() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert "if (state === 'cooldown') setState('idle');" in source
    assert "if (!handsFree.checked || state === 'processing' || state === 'capturing') return;" in source
    assert "function scheduleRearm" in source
    assert "setState('idle');\n      if (handsFree.checked) await startHandsFree();" in source


def test_voice_control_cache_version_is_bumped() -> None:
    html = TEMPLATE.read_text(encoding="utf-8")
    assert "voice-control.js?v=2.3.3" in html


def test_response_request_has_a_watchdog() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert "const REQUEST_TIMEOUT_MS = 75000;" in source
    assert "signal: controller.signal" in source
    assert "const MAX_REARM_MS = 45000;" in source
