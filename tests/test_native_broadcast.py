from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

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
