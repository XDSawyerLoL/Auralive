from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.services.obs import OBSClient


def test_obs_avatar_audio_is_monitor_and_output() -> None:
    async def scenario() -> None:
        settings = SimpleNamespace(obs_enabled=True, obs_host="127.0.0.1", obs_port=4455, obs_password="")
        client = OBSClient(settings)
        calls: list[tuple[str, dict]] = []

        async def fake_call(request_type: str, request_data: dict | None = None):
            payload = request_data or {}
            calls.append((request_type, payload))
            if request_type == "GetInputList":
                return {
                    "inputs": [
                        {"inputName": "Mairaiy Avatar", "inputKind": "browser_source"},
                        {"inputName": "Other", "inputKind": "browser_source"},
                    ]
                }
            if request_type == "GetInputSettings":
                if payload.get("inputName") == "Mairaiy Avatar":
                    return {"inputSettings": {"url": "http://localhost:8787/overlay/avatar"}}
                return {"inputSettings": {"url": "http://localhost:8787/overlay/chat"}}
            return {}

        client.call = fake_call  # type: ignore[method-assign]
        result = await client.ensure_avatar_audio_monitor()

        assert result["ok"] is True
        assert result["input_name"] == "Mairaiy Avatar"
        assert (
            "SetInputSettings",
            {
                "inputName": "Mairaiy Avatar",
                "inputSettings": {"reroute_audio": True},
                "overlay": True,
            },
        ) in calls
        assert (
            "SetInputMute",
            {"inputName": "Mairaiy Avatar", "inputMuted": False},
        ) in calls
        assert (
            "SetInputAudioMonitorType",
            {
                "inputName": "Mairaiy Avatar",
                "monitorType": "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT",
            },
        ) in calls

    asyncio.run(scenario())


def test_desktop_allows_local_audio_autoplay() -> None:
    source = Path("app/desktop.py").read_text(encoding="utf-8")
    assert "--autoplay-policy=no-user-gesture-required" in source


def test_voice_control_has_local_audio_sink_when_avatar_absent() -> None:
    source = Path("app/web/static/avatar/voice-control.js").read_text(encoding="utf-8")
    assert "mairaiy-local-monitor" in source
    assert "playLocalVoice" in source
    assert "!Boolean(data.avatar_connected)" in source
    assert "realtime.last_audio_url" in source


def test_kokoro_never_falls_back_to_random_browser_voice() -> None:
    source = Path("app/web/static/avatar/avatar.js").read_text(encoding="utf-8")
    assert "engine==='kokoro-local'" in source
