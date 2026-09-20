from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from app.core.event_bus import OverlayBus
from app.services.native_broadcast import NativeBroadcastService


def make_service(tmp_path):
    settings = SimpleNamespace(
        broadcast_engine="native",
        native_engine_exe=str(tmp_path / "missing-engine.exe"),
        obs_enabled=True,
    )
    service = NativeBroadcastService(settings)
    service.runtime_dir = tmp_path
    service.command_path = tmp_path / "command.json"
    service.status_path = tmp_path / "status.json"
    service.config_path = tmp_path / "engine.json"
    return service


def test_native_broadcast_status_without_binary(tmp_path):
    service = make_service(tmp_path)
    status = service.status()

    assert status["selected"] is True
    assert status["engine_available"] is False
    assert status["process_running"] is False
    assert status["obs_fallback_enabled"] is True


def test_native_broadcast_rejects_unknown_command(tmp_path):
    service = make_service(tmp_path)

    with pytest.raises(ValueError):
        service.command("danger.unknown", auto_start=False)


def test_native_broadcast_atomic_command_file(tmp_path):
    service = make_service(tmp_path)
    payload = {"id": 42, "action": "preview.start"}

    service._atomic_json(service.command_path, payload)

    assert json.loads(service.command_path.read_text(encoding="utf-8")) == payload
    assert not service.command_path.with_suffix(".json.tmp").exists()


def test_native_audio_chunk_is_realtime_silence_without_tracks(tmp_path):
    service = make_service(tmp_path)

    chunk = service.native_audio_chunk(19200)

    assert len(chunk) == 19200
    assert chunk == b"\x00" * 19200


def test_native_audio_chunk_mixes_pcm_tracks(tmp_path):
    service = make_service(tmp_path)
    sample = (1000).to_bytes(2, "little", signed=True)
    with service._audio_lock:
        service._audio_tracks = [{"data": sample * 8, "offset": 0}]

    chunk = service.native_audio_chunk(16)

    assert len(chunk) == 16
    assert int.from_bytes(chunk[:2], "little", signed=True) == 1000
    assert service._audio_tracks == []


def test_overlay_bus_listener_can_prepare_event_before_delivery():
    bus = OverlayBus()
    event = {"type": "tts", "text": "Bonjour"}

    async def listener(payload):
        payload["audio_url"] = "/media/native-test.wav"

    bus.subscribe(listener)
    asyncio.run(bus.emit(event))

    assert event["audio_url"] == "/media/native-test.wav"


def test_system_audio_chunk_has_fixed_realtime_shape(tmp_path):
    service = make_service(tmp_path)

    chunk = service.system_audio_chunk(19200)

    assert len(chunk) == 19200
    service._stop_system_audio_capture()


def test_system_audio_status_reports_backend(tmp_path):
    service = make_service(tmp_path)

    status = service.system_audio_status()

    assert status["backend"] == "WASAPI / PyAudioWPatch"
    assert "backend_present" in status
