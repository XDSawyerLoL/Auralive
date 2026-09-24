from __future__ import annotations

import base64
import hashlib
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.cognitive.evolution import EvolutionLab, EvolutionPolicyError
from app.database import Database


class DummyAutomation:
    pass


class DummyCognitive:
    pass


def make_settings(**overrides):
    values = {
        "evolution_enabled": True,
        "evolution_interval_seconds": 21600,
        "evolution_auto_submit": False,
        "evolution_auto_merge": False,
        "evolution_github_token": "",
        "evolution_github_repository": "XDSawyerLoL/Auralive",
        "evolution_github_base_branch": "main",
        "evolution_allowed_domains": "api.github.com,pypi.org",
        "evolution_research_urls": "",
        "evolution_required_checks": "validate,build-engine,build-windows-lite,build-windows",
        "evolution_canary_timeout_seconds": 90,
        "evolution_max_test_regression_ratio": 1.75,
        "evolution_max_test_regression_seconds": 5,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_lab(tmp_path: Path, **settings):
    db = Database(tmp_path / "aura.db")
    lab = EvolutionLab(
        SimpleNamespace(ai=None),
        db,
        DummyAutomation(),
        DummyCognitive(),
        make_settings(**settings),
    )
    lab.root = tmp_path / "evolution"
    lab.workspaces = lab.root / "workspaces"
    lab.artifacts = lab.root / "artifacts"
    lab.backups = lab.root / "backups"
    return lab


def test_canary_targets_changed_application_modules(tmp_path: Path):
    lab = make_lab(tmp_path)
    assert lab._module_name_for_path("app/services/example.py") == "app.services.example"
    assert lab._module_name_for_path("app/example/__init__.py") == "app.example"
    assert lab._module_name_for_path("tests/test_example.py") is None

    command = lab._canary_command(
        ["app/services/example.py", "app/example/__init__.py", "tests/test_example.py"]
    )
    assert command[0]
    assert command[1] == "-c"
    assert "app.services.example" in command[2]
    assert "app.example" in command[2]
    assert "tests.test_example" not in command[2]


def test_performance_gate_rejects_large_test_regression(tmp_path: Path):
    lab = make_lab(
        tmp_path,
        evolution_max_test_regression_ratio=1.5,
        evolution_max_test_regression_seconds=2,
    )
    accepted = lab._performance_gate(
        {"duration_ms": 10_000},
        {"duration_ms": 15_500},
    )
    rejected = lab._performance_gate(
        {"duration_ms": 10_000},
        {"duration_ms": 18_000},
    )
    assert accepted["ok"] is True
    assert rejected["ok"] is False
    assert rejected["allowed_ms"] == 17_000


@pytest.mark.asyncio
async def test_status_reports_phase_one_when_submit_and_merge_are_disabled(tmp_path: Path):
    lab = make_lab(tmp_path)
    await lab.initialize()
    status = await lab.status()
    assert status["enabled"] is True
    assert status["phase"] == "phase-1-research-sandbox"
    assert status["auto_submit"] is False
    assert status["auto_merge"] is False
    assert "remote source freshness check" in status["gates"]


def test_auto_promotion_cannot_touch_policy_or_security_surfaces(tmp_path: Path):
    lab = make_lab(tmp_path)
    assert lab._path_policy("app/features/helper.py", auto=True) == (True, "")
    allowed, reason = lab._path_policy("app/cognitive/evolution.py", auto=True)
    assert allowed is False
    assert "protégé" in reason
    allowed, reason = lab._path_policy("app/services/oauth_helper.py", auto=True)
    assert allowed is False
    assert "sécurité" in reason


def test_submit_rejects_candidate_if_remote_source_changed(tmp_path: Path):
    lab = make_lab(tmp_path)
    workspace = tmp_path / "workspace"
    target = workspace / "app" / "feature.py"
    target.parent.mkdir(parents=True)
    target.write_text("candidate = True\n", encoding="utf-8")

    original = "candidate = False\n"
    candidate = {
        "workspace": str(workspace),
        "summary": "safe change",
        "auto_promotable": True,
        "edits": [
            {
                "path": "app/feature.py",
                "before_sha256": hashlib.sha256(original.encode("utf-8")).hexdigest(),
            }
        ],
    }
    validation = {"ok": True}

    def fake_request(method, path, *, payload=None, accept="application/vnd.github+json"):
        if method == "GET" and "/git/ref/heads/" in path:
            return {"object": {"sha": "abc123"}}
        if method == "POST" and path.endswith("/git/refs"):
            return {}
        if method == "GET" and "/contents/app/feature.py" in path:
            changed = base64.b64encode(b"human_fix = True\n").decode("ascii")
            return {"sha": "blob123", "encoding": "base64", "content": changed}
        raise AssertionError(f"unexpected GitHub request: {method} {path}")

    lab._github_request = fake_request  # type: ignore[method-assign]

    with pytest.raises(EvolutionPolicyError, match="source distante modifiée"):
        lab._submit_candidate_sync("cycle-1", candidate, validation)
