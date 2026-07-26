import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.core.event_bus import OverlayBus
from app.services.avatar_audio import (
    AvatarAudioService,
    _normalize_text,
    _rate_to_sapi,
    _volume_to_sapi,
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


def test_non_windows_service_reports_browser_fallback(tmp_path: Path):
    service = AvatarAudioService(tmp_path)
    diagnostic = service.diagnostic()
    assert diagnostic["engine"] in {"windows-system-speech", "browser-fallback"}
    assert diagnostic["last_error"] == ""
