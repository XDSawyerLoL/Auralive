from __future__ import annotations

import inspect
from types import SimpleNamespace

import pytest

from aura_runtime.contracts import EmptyRuntimeHost
from aura_runtime.standalone import settings_from_env
from aura_runtime.worker import AuraRuntimeWorker


def minimal_settings():
    return SimpleNamespace(
        aura_cloud_worker_enabled=True,
        aura_cloud_base_url="https://example.invalid",
        aura_cloud_token="secret",
        aura_cloud_worker_poll_seconds=1.5,
        aura_cloud_worker_heartbeat_seconds=15,
        aura_cloud_worker_timeout_seconds=95,
        aura_compute_mesh_consent=False,
        ai_model="",
        ai_constellation_moa_enabled=False,
        image_default_width=1024,
        image_default_height=1024,
        image_default_steps=8,
    )


def test_runtime_package_has_no_product_layer_imports():
    source = inspect.getsource(__import__("aura_runtime.worker", fromlist=["AuraRuntimeWorker"]))
    assert "from app." not in source
    assert "import app." not in source


def test_standalone_runtime_is_product_agnostic_and_claims_only_compute():
    worker = AuraRuntimeWorker(
        EmptyRuntimeHost(),
        minimal_settings(),
        host_product="",
        packaging="standalone-daemon",
    )
    assert worker.VERSION == "aura-runtime-worker-v3"
    assert worker._job_kinds() == ["compute"]
    profile = worker._resource_profile()
    assert profile["runtime_role"] == "aura-runtime"
    assert profile["runtime_host_product"] == ""
    assert profile["runtime_packaging"] == "standalone-daemon"


@pytest.mark.asyncio
async def test_standalone_runtime_executes_compute_without_quantic_studio():
    worker = AuraRuntimeWorker(EmptyRuntimeHost(), minimal_settings())
    result = await worker._run_compute({"op": "sum", "values": [1, 2, 3]})
    assert result["value"] == 6
    assert result["deterministic"] is True


@pytest.mark.asyncio
async def test_claim_declares_supported_job_kinds(monkeypatch):
    worker = AuraRuntimeWorker(EmptyRuntimeHost(), minimal_settings())
    calls = []

    async def fake_post(path, payload):
        calls.append((path, payload))
        return {"job": None}

    monkeypatch.setattr(worker, "_post", fake_post)
    await worker._claim()
    assert calls == [
        (
            "/api/bridge/claim",
            {"worker_id": worker.worker_id, "job_kinds": ["compute"]},
        )
    ]


def test_standalone_env_settings_do_not_require_studio(monkeypatch):
    monkeypatch.setenv("AURA_CLOUD_BASE_URL", "https://example.invalid")
    monkeypatch.setenv("AURA_CLOUD_TOKEN", "secret")
    monkeypatch.setenv("AURA_COMPUTE_MESH_CONSENT", "true")
    settings = settings_from_env()
    assert settings.aura_cloud_base_url == "https://example.invalid"
    assert settings.aura_cloud_token == "secret"
    assert settings.aura_compute_mesh_consent is True
