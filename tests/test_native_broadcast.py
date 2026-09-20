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
    service.stream_key_path = tmp_path / "stream-key.dpapi"
    service.stream_destinations_path = tmp_path / "stream-destinations.dpapi"
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


def test_output_configuration_never_returns_stream_secret(tmp_path, monkeypatch):
    service = make_service(tmp_path)
    monkeypatch.setenv("AURA_NATIVE_STREAM_KEY", "super-secret-ci-key")
    service.config_path.write_text(
        json.dumps({"settings": {"rtmp_url": "rtmp://example.test/live", "stream_key": ""}}),
        encoding="utf-8",
    )

    output = service.output_configuration()
    status = service.status()

    assert output["stream_key_configured"] is True
    assert output["rtmp_url"] == "rtmp://example.test/live"
    assert "super-secret-ci-key" not in json.dumps(output)
    assert "super-secret-ci-key" not in json.dumps(status)


def test_configure_output_keeps_engine_json_secret_empty(tmp_path, monkeypatch):
    service = make_service(tmp_path)
    service.config_path.write_text(
        json.dumps(
            {
                "settings": {
                    "rtmp_url": "rtmp://old.test/live",
                    "stream_key": "",
                    "ffmpeg_path": "ffmpeg",
                },
                "scenes": [],
            }
        ),
        encoding="utf-8",
    )

    def fake_store(secret: str) -> None:
        assert secret == "vault-only-secret"
        service.stream_key_path.write_bytes(b"encrypted-test-data")

    monkeypatch.setattr(service, "set_stream_secret", fake_store)

    result = service.configure_output(
        "rtmps://new.example.test/live",
        "vault-only-secret",
    )
    payload = json.loads(service.config_path.read_text(encoding="utf-8"))

    assert payload["settings"]["rtmp_url"] == "rtmps://new.example.test/live"
    assert payload["settings"]["stream_key"] == ""
    assert result["stream_key_configured"] is True
    assert "vault-only-secret" not in json.dumps(result)
    assert "vault-only-secret" not in service.config_path.read_text(encoding="utf-8")



def test_multistream_vault_redacts_secondary_stream_keys(tmp_path, monkeypatch):
    service = make_service(tmp_path)
    monkeypatch.setattr("app.services.native_broadcast.os.name", "nt")
    monkeypatch.setattr(service, "_dpapi_protect", lambda payload: payload)
    monkeypatch.setattr(service, "_dpapi_unprotect", lambda payload: payload)

    service.configure_stream_destinations(
        [
            {
                "id": "youtube",
                "label": "YouTube",
                "rtmp_url": "rtmps://a.rtmp.youtube.com/live2",
                "stream_key": "secondary-super-secret",
                "enabled": True,
            }
        ]
    )

    public = service.stream_destinations_public()
    encrypted_payload = service.stream_destinations_path.read_bytes()

    assert public == [
        {
            "id": "youtube",
            "label": "YouTube",
            "rtmp_url": "rtmps://a.rtmp.youtube.com/live2",
            "enabled": True,
            "stream_key_configured": True,
        }
    ]
    assert "secondary-super-secret" not in json.dumps(public)
    assert b"secondary-super-secret" in encrypted_payload


def test_multistream_preserves_existing_secret_when_key_is_omitted(tmp_path, monkeypatch):
    service = make_service(tmp_path)
    monkeypatch.setattr("app.services.native_broadcast.os.name", "nt")
    monkeypatch.setattr(service, "_dpapi_protect", lambda payload: payload)
    monkeypatch.setattr(service, "_dpapi_unprotect", lambda payload: payload)

    service.configure_stream_destinations(
        [
            {
                "id": "youtube",
                "label": "YouTube",
                "rtmp_url": "rtmps://a.rtmp.youtube.com/live2",
                "stream_key": "keep-me",
                "enabled": True,
            }
        ]
    )
    service.configure_stream_destinations(
        [
            {
                "id": "youtube",
                "label": "YouTube",
                "rtmp_url": "rtmps://a.rtmp.youtube.com/live2",
                "stream_key": None,
                "enabled": True,
            }
        ]
    )

    private = service._stream_destinations_private()
    assert private[0]["stream_key"] == "keep-me"


def test_native_command_allowlist_includes_pro_suite(tmp_path):
    service = make_service(tmp_path)
    for action in (
        "replay.start",
        "replay.stop",
        "replay.save",
        "scene.create",
        "scene.rename",
        "scene.remove",
        "transition.update",
    ):
        service.command(action, auto_start=False)
