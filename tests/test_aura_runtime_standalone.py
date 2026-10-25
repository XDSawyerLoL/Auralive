from __future__ import annotations

from pathlib import Path

import pytest

from aura_runtime.standalone import StandaloneRuntimeHost, _load_env_file, runtime_settings_from_env
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
    standalone = Path('aura_runtime/standalone.py').read_text(encoding='utf-8')
    constellation = Path('aura_runtime/model_constellation.py').read_text(encoding='utf-8')
    assert 'from app.' not in standalone
    assert 'from app.' not in constellation


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
    assert settings.ai_constellation_moa_enabled is True
    assert settings.ai_constellation_max_models == 3
    assert settings.ai_constellation_moa_parallel is False


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
    assert 'operator' in profile['job_kinds']
    assert 'tts' not in profile['job_kinds']
    assert 'image' not in profile['job_kinds']
    assert 'evolution' not in profile['job_kinds']


def test_standalone_runtime_advertises_learned_model_competence(monkeypatch, tmp_path):
    monkeypatch.setenv('AURA_CLOUD_BASE_URL', 'https://aura.example')
    monkeypatch.setenv('AURA_CLOUD_TOKEN', 'test-token')
    monkeypatch.setenv('AURA_RUNTIME_DATA_DIR', str(tmp_path))
    settings = runtime_settings_from_env()
    host = StandaloneRuntimeHost(settings)
    host.ai.constellation.installed = host.ai.constellation._decode_installed([
        {'name': 'qwen3:8b', 'size': 5_000_000_000},
        {'name': 'deepseek-r1:8b', 'size': 5_000_000_000},
    ])
    for _ in range(4):
        host.ai.constellation.record_outcome(
            'deepseek-r1:8b',
            'reasoning',
            success=True,
            latency_ms=1200,
            quality=0.9,
            source='unit-test',
        )

    worker = AuraRuntimeWorker(host, settings, runtime_packaging='standalone-service')
    profile = worker._resource_profile()
    assert profile['zero_cost'] is True
    assert set(profile['models']) == {'qwen3:8b', 'deepseek-r1:8b'}
    deepseek = next(
        row for row in profile['model_scorecard']
        if row['name'] == 'deepseek-r1:8b'
    )
    assert deepseek['roles']['reasoning']['samples'] == 4
    assert deepseek['roles']['reasoning']['score'] > 0.99


def test_standalone_loads_root_dotenv_without_overriding_real_environment(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv('AURA_CLOUD_BASE_URL', raising=False)
    monkeypatch.delenv('AURA_CLOUD_TOKEN', raising=False)
    (tmp_path / '.env').write_text(
        'AURA_CLOUD_BASE_URL=https://from-dotenv.example\n'
        'AURA_CLOUD_TOKEN=dotenv-token\n',
        encoding='utf-8',
    )
    _load_env_file()
    settings = runtime_settings_from_env()
    assert settings.aura_cloud_base_url == 'https://from-dotenv.example'
    assert settings.aura_cloud_token == 'dotenv-token'

    monkeypatch.setenv('AURA_CLOUD_TOKEN', 'real-environment-token')
    (tmp_path / '.env').write_text(
        'AURA_CLOUD_TOKEN=must-not-override\n',
        encoding='utf-8',
    )
    _load_env_file()
    assert runtime_settings_from_env().aura_cloud_token == 'real-environment-token'


def test_cloud_worker_bridge_token_is_the_actual_enablement_gate(monkeypatch, tmp_path):
    monkeypatch.setenv('AURA_CLOUD_BASE_URL', 'https://aura.example')
    monkeypatch.setenv('AURA_CLOUD_TOKEN', 'legacy-not-the-bridge')
    monkeypatch.setenv('AURA_RUNTIME_IDENTITY_FILE', str(tmp_path / 'worker-id'))
    monkeypatch.delenv('AURA_BRIDGE_TOKEN', raising=False)
    monkeypatch.delenv('AURA_ALLOW_LEGACY_BRIDGE_ADMIN_TOKEN', raising=False)
    config = runtime_settings_from_env()
    host = StandaloneRuntimeHost(config)
    worker = AuraRuntimeWorker(host, config, runtime_packaging='standalone-service')
    assert worker.enabled is False
    assert worker.token == ''

    monkeypatch.setenv('AURA_BRIDGE_TOKEN', 'local-test-bridge-token')
    assert worker.enabled is True
    assert worker._headers()['Authorization'] == 'Bearer local-test-bridge-token'


@pytest.mark.asyncio
async def test_cloud_request_with_empty_risks_cannot_gain_local_permissions(monkeypatch, tmp_path):
    monkeypatch.setenv('AURA_CLOUD_BASE_URL', 'https://aura.example')
    monkeypatch.setenv('AURA_BRIDGE_TOKEN', 'test-only')
    monkeypatch.setenv('AURA_RUNTIME_IDENTITY_FILE', str(tmp_path / 'worker-id'))
    config = runtime_settings_from_env()
    host = StandaloneRuntimeHost(config)
    captured = {}

    async def fake_operate(task, *, max_steps, requested_risks, source):
        captured['risks'] = requested_risks
        return {'executed': False, 'status': 'not-executed'}

    monkeypatch.setattr(host.operator, 'operate', fake_operate)
    worker = AuraRuntimeWorker(host, config, runtime_packaging='standalone-service')
    await worker._run_operator({'task': 'test'}, [])
    assert captured['risks'] == set()


@pytest.mark.asyncio
async def test_cloud_worker_reports_failed_operator_receipt_as_failed_job(monkeypatch, tmp_path):
    import asyncio
    monkeypatch.setenv('AURA_CLOUD_BASE_URL', 'https://aura.example')
    monkeypatch.setenv('AURA_BRIDGE_TOKEN', 'test-only')
    monkeypatch.setenv('AURA_RUNTIME_IDENTITY_FILE', str(tmp_path / 'worker-id'))
    config = runtime_settings_from_env()
    host = StandaloneRuntimeHost(config)
    worker = AuraRuntimeWorker(host, config, runtime_packaging='standalone-service')
    receipts = []

    async def execute(_job):
        return {
            'executed': False, 'status': 'error',
            'steps': [{'type': 'browser.audit', 'ok': False, 'checks_total': 2, 'checks_passed': 1}],
            'error': 'page SWAPP indisponible',
        }

    async def complete(_id, **kwargs):
        receipts.append(kwargs)

    async def lease(_id, _deadline):
        await asyncio.sleep(3600)

    monkeypatch.setattr(worker, '_execute', execute)
    monkeypatch.setattr(worker, '_complete', complete)
    monkeypatch.setattr(worker, '_lease_renewer', lease)
    await worker._run_job({'id': 'job-failed', 'kind': 'operator', 'lease_until': 0})
    assert receipts[0]['ok'] is False
    assert receipts[0]['result']['steps'][0]['checks_passed'] == 1
    assert worker.jobs_failed == 1
    assert worker.jobs_completed == 0


@pytest.mark.asyncio
async def test_cloud_worker_accepts_only_proved_operator_steps(monkeypatch, tmp_path):
    import asyncio
    monkeypatch.setenv('AURA_CLOUD_BASE_URL', 'https://aura.example')
    monkeypatch.setenv('AURA_BRIDGE_TOKEN', 'test-only')
    monkeypatch.setenv('AURA_RUNTIME_IDENTITY_FILE', str(tmp_path / 'worker-id'))
    config = runtime_settings_from_env()
    host = StandaloneRuntimeHost(config)
    worker = AuraRuntimeWorker(host, config, runtime_packaging='standalone-service')
    receipts = []

    async def execute(_job):
        return {
            'executed': True, 'status': 'completed',
            'steps': [{'type': 'system.info', 'ok': True, 'platform': 'test-machine'}],
        }

    async def complete(_id, **kwargs):
        receipts.append(kwargs)

    async def lease(_id, _deadline):
        await asyncio.sleep(3600)

    monkeypatch.setattr(worker, '_execute', execute)
    monkeypatch.setattr(worker, '_complete', complete)
    monkeypatch.setattr(worker, '_lease_renewer', lease)
    await worker._run_job({'id': 'job-proved', 'kind': 'operator', 'lease_until': 0})
    assert receipts[0]['ok'] is True
    assert worker.jobs_completed == 1
    assert worker.jobs_failed == 0
