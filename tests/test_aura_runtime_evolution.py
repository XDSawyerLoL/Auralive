from __future__ import annotations

import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest

from aura_runtime.evolution_fleet import EvolutionFleet
from aura_runtime.evolution_lab import RuntimeFleetLab
from aura_runtime.standalone import StandaloneRuntimeHost


class FakeAI:
    enabled = True
    active_model = 'qwen3:8b'
    constellation = SimpleNamespace(installed=[{'name': 'qwen3:8b'}])

    def diagnostic(self):
        return {'runtime_model': self.active_model}


class FakeHost:
    def __init__(self):
        self.ai = FakeAI()


def settings(tmp_path: Path):
    return SimpleNamespace(
        aura_runtime_data_dir=tmp_path,
        evolution_github_repository='XDSawyerLoL/Auralive',
        evolution_github_allowed_repositories=(
            'XDSawyerLoL/Auralive,'
            'XDSawyerLoL/QuanticSillage,'
            'XDSawyerLoL/QuanticMail,'
            'XDSawyerLoL/QUANTIC-OS,'
            'XDSawyerLoL/Quantic-Browser,'
            'XDSawyerLoL/Human-Agency-Engine'
        ),
        evolution_github_token='',
        evolution_auto_submit=True,
        ai_model='qwen3:8b',
        aura_runtime_ollama_url='http://127.0.0.1:11434',
        aura_cloud_worker_timeout_seconds=95,
    )


@pytest.mark.asyncio
async def test_runtime_fleet_lab_persists_cycles_without_studio(tmp_path):
    lab = RuntimeFleetLab(FakeHost(), settings(tmp_path))
    await lab.initialize()
    await lab.db.execute(
        "INSERT INTO aura_evolution_cycles(id,trigger,objective,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        ('cycle-1', 'test', 'Improve product', 'fleet-researching', 'now', 'now'),
    )
    await lab._set_cycle('cycle-1', status='fleet-validating', diagnosis={'ok': True})
    with sqlite3.connect(tmp_path / 'evolution.sqlite3') as connection:
        row = connection.execute(
            'SELECT status,diagnosis FROM aura_evolution_cycles WHERE id=?',
            ('cycle-1',),
        ).fetchone()
    assert row is not None
    assert row[0] == 'fleet-validating'
    assert '"ok": true' in row[1].lower()


def test_runtime_fleet_lab_uses_same_conservative_patch_boundary(tmp_path):
    lab = RuntimeFleetLab(FakeHost(), settings(tmp_path))
    assert lab._scan_patch('value = 1', 'value = 2', auto=True) == []
    issues = lab._scan_patch('value = 1', 'subprocess.run(["cmd"])', auto=True)
    assert any('primitive sensible' in issue for issue in issues)


def test_runtime_fleet_policy_operates_without_app_namespace(tmp_path):
    lab = RuntimeFleetLab(FakeHost(), settings(tmp_path))
    fleet = EvolutionFleet(lab)
    assert fleet.validate_repository('XDSawyerLoL/QuanticMail') == 'XDSawyerLoL/QuanticMail'
    ok, _ = fleet.path_allowed('XDSawyerLoL/QuanticMail', 'standalone-relay/main.ts')
    assert ok is True
    denied, _ = fleet.path_allowed('XDSawyerLoL/QuanticMail', 'app/security/auth.ts')
    assert denied is False


def test_standalone_host_has_runtime_owned_evolution_lab(tmp_path):
    cfg = settings(tmp_path)
    host = StandaloneRuntimeHost(cfg)
    assert isinstance(host.evolution, RuntimeFleetLab)
    assert host.evolution.aura is host
