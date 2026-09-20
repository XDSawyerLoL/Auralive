from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "app" / "web" / "templates" / "index.html"
STUDIO_JS = ROOT / "app" / "web" / "static" / "aura-studio.js"
APP_JS = ROOT / "app" / "web" / "static" / "app.js"


def test_quantic_studio_ui_has_no_obs_controls_or_copy() -> None:
    html = INDEX.read_text(encoding="utf-8")
    studio_js = STUDIO_JS.read_text(encoding="utf-8")
    app_js = APP_JS.read_text(encoding="utf-8")

    forbidden = (
        "Tester OBS",
        "OBS Studio",
        "Port 4455",
        "WebSocket configuré",
        'data-studio-engine="obs"',
        "Lien OBS copié",
    )
    merged = html + "\n" + studio_js + "\n" + app_js
    for text in forbidden:
        assert text not in merged


def test_primary_studio_controls_are_complete() -> None:
    html = INDEX.read_text(encoding="utf-8")
    for action in ("preview", "record", "replay", "clip", "live"):
        assert f'data-studio-action="{action}"' in html
    assert 'id="studio-action-feedback"' in html
    assert "Quantic Studio Core" in html


def test_studio_actions_have_timeout_locking_and_non_overlapping_polling() -> None:
    source = STUDIO_JS.read_text(encoding="utf-8")
    assert "AbortController" in source
    assert "timeoutMs" in source
    assert "actionLocks: new Set()" in source
    assert "studio.actionLocks.has(kind)" in source
    assert "studio.refreshInFlight" in source
    assert "setActionPending(kind, true)" in source
    assert "setActionPending(kind, false)" in source
    assert "now - studio.lastActionAt < 350" in source
