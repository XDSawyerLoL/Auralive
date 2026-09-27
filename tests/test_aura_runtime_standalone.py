from __future__ import annotations

from pathlib import Path

import pytest

from aura_runtime.standalone import StandaloneRuntimeHost, runtime_settings_from_env
from aura_runtime.worker import AuraRuntimeWorker


def test_studio_worker_is_only_a_runtime_compatibility_adapter():
    shim = Path('app/services/aura_cloud_worker.py').read_text(encoding='utf-8')
    assert 'from aura_runtime.worker import AuraRuntimeWorker' in shim
    assert 'class AuraCloudWorker(AuraRuntimeWorker)' in shim
    assert 'fleet_factory=EvolutionFleet' in shim
    assert AuraRuntimeWorker.__module__ == 'aura_runtime.worker'


def test_runtime_core_has_no_direct_app_or_studio_imports():
    source = Path('aura_runtime/worker.py').read_text(encoding='utf-8')
    assert 'from app.' not in source
    assert 'import app.' not in source
    assert 'EvolutionFleet' not in source
    assert '"runtime_host_product": "quantic-studio"' not in source


def test_standalone_runtime_settings_are_environment_driven(monkeypatch, tmp_path):
    monkeypatch.setenv('AURA_CLOUD_BASE_URL', 'https://aura.example')
    monkeypatch.setenv('AURA_CLOUD_TOKEN', 'test-token')
    monkeypatch.setenv('AURA_RUNTIME_MODEL', 'qwen3:8b')
    monkeypatch.setenv('AURA_RUNTIME_OLLAMA_URL', 'http://127.0.0.1:11434')
    monkeypatch.setenv('AURA_COMPUTE_MESH_CONSENT', 'true')
    monkeypatch.setenv('AURA_RUNTIME_IDENTITY_FILE', str(tmp_path / 'node-id'))
    settings = runtime_settings_from_env()
    assert settings.aura_cloud_base_url == 'https://aura.example'
    assert settings.aura_cloud_token == 'test-token'
    assert settings.ai_model == 'qwen3:8b'
    assert settings.aura_compute_mesh_consent is True
    assert settings.aura_compute_mesh_identity_file == tmp_path / 'node-id'


@pytest.mark.asyncio
async def test_standalone_runtime_can_execute_compute_without_studio(monkeypatch, tmp_path):
    monkeypatch.setenv('AURA_CLOUD_BASE_URL', 'https://aura.example')
    monkeypatch.setenv('AURA_CLOUD_TOKEN', 'test-token')
    monkeypatch.setenv('AURA_RUNTIME_IDENTITY_FILE', str(tmp_path / 'node-id'))
    settings = runtime_settings_from_env()
    host = StandaloneRuntimeHost(settings)
    worker = AuraRuntimeWorker(host, settings, runtime_packaging='standalone-service')
    result = await worker._execute({'kind': 'compute', 'payload': {'op': 'sum', 'values': [1, 2, 3]}})
    assert result['value'] == 6
    profile = worker._resource_profile()
    assert profile['runtime_role'] == 'aura-runtime'
    assert profile['runtime_host_product'] == ''
    assert profile['runtime_packaging'] == 'standalone-service'
    assert 'compute' in profile['job_kinds']
    assert 'inference' in profile['job_kinds']
    assert 'operator' not in profile['job_kinds']
    assert 'tts' not in profile['job_kinds']
    assert 'image' not in profile['job_kinds']
    assert 'evolution' not in profile['job_kinds']
