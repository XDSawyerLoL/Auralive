from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAIN_V3 = ROOT / "app" / "main_v3.py"
VOICE_REALTIME = ROOT / "app" / "services" / "voice_realtime.py"
AVATAR_TEST_JS = ROOT / "app" / "web" / "static" / "avatar-test-fast.js"
OLD_AVATAR_STUDIO = ROOT / "app" / "web" / "static" / "avatar-studio.js"


def test_twitch_oauth_opens_system_browser_instead_of_redirecting_app_window() -> None:
    source = MAIN_V3.read_text(encoding="utf-8")
    assert "os.startfile(url)" in source
    assert "await asyncio.to_thread(_open_external_url, url)" in source
    assert "return RedirectResponse(url=url" not in source
    assert "navigateur Windows normal" in source


def test_avatar_voice_test_synthesizes_without_overlay_dependency() -> None:
    source = MAIN_V3.read_text(encoding="utf-8")
    patch = AVATAR_TEST_JS.read_text(encoding="utf-8")

    assert '_remove_route("/api/avatar/test", "POST")' in source
    assert "aura.avatar_audio.synthesize(" in source
    assert '"overlay_required": False' in source
    assert "result.audio_url" in patch
    assert "new Audio(" in patch
    assert "audio.play()" in patch
    assert "stopImmediatePropagation" in patch
    assert "avatar-test-fast.js?v=2.5.2" in source


def test_legacy_overlay_error_is_neutralized_by_capture_override() -> None:
    legacy = OLD_AVATAR_STUDIO.read_text(encoding="utf-8")
    patch = AVATAR_TEST_JS.read_text(encoding="utf-8")
    # L'ancien message reste dans le module historique, mais le listener capture
    # du correctif intercepte le bouton avant ce handler et lit le WAV localement.
    assert "La source /overlay/avatar n’est pas connectée" in legacy
    assert "document.addEventListener('click'" in patch
    assert "event.stopImmediatePropagation()" in patch


def test_voice_realtime_has_short_ollama_path_and_nonblocking_obs() -> None:
    source = VOICE_REALTIME.read_text(encoding="utf-8")
    assert "_ANSWER_TIMEOUT_SECONDS = 12" in source
    assert "context_window=min(2048" in source
    assert "messages,\n                64," in source
    assert "self.aura.avatar_audio.synthesize(" in source
    assert '"type": "avatar_voice"' in source
    assert "asyncio.create_task(self._prepare_obs_audio()" in source
    assert "await self._prepare_obs_audio()" not in source
