from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from app.cognitive.evolution import EvolutionLab


class DummyDB:
    def __init__(self, path: Path):
        self.path = path


def settings(*, auto_merge: bool = False):
    return SimpleNamespace(
        evolution_enabled=True,
        evolution_interval_seconds=3600,
        evolution_auto_submit=True,
        evolution_auto_merge=auto_merge,
        evolution_github_token="token",
        evolution_github_repository="XDSawyerLoL/Auralive",
        evolution_github_base_branch="main",
        evolution_allowed_domains="api.github.com,pypi.org",
        evolution_research_urls="",
        evolution_required_checks="validate,build-windows-lite,build-windows",
    )


def lab(tmp_path: Path, *, auto_merge: bool = False) -> EvolutionLab:
    return EvolutionLab(
        SimpleNamespace(ai=SimpleNamespace()),
        DummyDB(tmp_path / "aura.db"),
        SimpleNamespace(),
        SimpleNamespace(),
        settings(auto_merge=auto_merge),
    )


def test_auto_path_policy_protects_safety_and_tests(tmp_path: Path):
    evolution = lab(tmp_path)

    assert evolution._path_policy("app/services/cohost.py", auto=True) == (True, "")
    assert evolution._path_policy("tests/test_core.py", auto=True)[0] is False
    assert evolution._path_policy("app/cognitive/evolution.py", auto=True)[0] is False
    assert evolution._path_policy("app/security/foo.py", auto=True)[0] is False
    assert evolution._path_policy("../escape.py", auto=True)[0] is False
    assert evolution._path_policy("README.md", auto=True)[0] is False


def test_patch_scan_blocks_new_sensitive_primitives(tmp_path: Path):
    evolution = lab(tmp_path)
    issues = evolution._scan_patch(
        "def run():\n    return True\n",
        "def run():\n    subprocess.run(['cmd'])\n",
        auto=True,
    )
    assert any("subprocess.run(" in item for item in issues)


def test_local_validation_requires_security_invariants_and_runtime_canary(
    tmp_path: Path,
    monkeypatch,
):
    evolution = lab(tmp_path)
    workspace = tmp_path / "candidate"
    (workspace / "app").mkdir(parents=True)
    (workspace / "app" / "safe.py").write_text("VALUE = 2\n", encoding="utf-8")

    calls = []

    def fake_run(cwd, args, *, timeout):
        calls.append((Path(cwd), list(args), timeout))
        return {
            "args": list(args),
            "returncode": 0,
            "ok": True,
            "stdout": "ok",
            "stderr": "",
            "duration_ms": 1.0,
        }

    monkeypatch.setattr(evolution, "_run_validation_command", fake_run)
    candidate = {
        "auto_promotable": True,
        "workspace": str(workspace),
        "edits": [{"path": "app/safe.py"}],
    }

    result = evolution._validate_candidate_sync(candidate)

    assert result["ok"] is True
    assert result["candidate_security_invariants"]["ok"] is True
    assert result["candidate_runtime_canary"]["ok"] is True
    assert any("tests/test_horizon_bridge.py" in call[1] for call in calls)
    assert any("-c" in call[1] and "app.main_v3" in call[1][-1] for call in calls)


def _remote_fixture(*, current_base: str, checks_ok: bool = True):
    required = ["validate", "build-engine", "build-windows-lite", "build-windows"]
    return {
        "pr": {
            "head": {"sha": "head123", "ref": "aura-evolution/20260924-cycle"},
        },
        "checks": {
            "check_runs": [
                {
                    "name": name,
                    "status": "completed",
                    "conclusion": "success" if checks_ok else "failure",
                }
                for name in required
            ]
        },
        "base": {"object": {"sha": current_base}},
        "files": [{"filename": "app/services/cohost.py"}],
    }


def test_remote_gate_requires_same_base_sha(tmp_path: Path, monkeypatch):
    evolution = lab(tmp_path, auto_merge=True)
    fixture = _remote_fixture(current_base="new-main")
    statuses = []

    def request(method, path, **kwargs):
        if "/pulls/42/files" in path:
            return fixture["files"]
        if "/pulls/42" in path:
            return fixture["pr"]
        if "/commits/head123/check-runs" in path:
            return fixture["checks"]
        if "/git/ref/heads/main" in path:
            return fixture["base"]
        raise AssertionError(path)

    monkeypatch.setattr(evolution, "_github_request", request)
    monkeypatch.setattr(
        evolution,
        "_sync_db_status",
        lambda cycle_id, status, details: statuses.append((cycle_id, status, details)),
    )

    result = evolution._check_remote_sync(
        "cycle-1",
        {"pr_number": 42, "base_sha": "old-main"},
    )

    assert result["successful"] is False
    assert result["revalidation_required"] is True
    assert statuses[-1][1] == "revalidation-required"


def test_remote_gate_merges_only_after_all_independent_checks(tmp_path: Path, monkeypatch):
    evolution = lab(tmp_path, auto_merge=True)
    fixture = _remote_fixture(current_base="main123")
    statuses = []
    merge_calls = []

    def request(method, path, **kwargs):
        if method == "PUT" and "/pulls/42/merge" in path:
            merge_calls.append(kwargs.get("payload"))
            return {"merged": True, "sha": "merged123"}
        if "/pulls/42/files" in path:
            return fixture["files"]
        if "/pulls/42" in path:
            return fixture["pr"]
        if "/commits/head123/check-runs" in path:
            return fixture["checks"]
        if "/git/ref/heads/main" in path:
            return fixture["base"]
        raise AssertionError(path)

    monkeypatch.setattr(evolution, "_github_request", request)
    monkeypatch.setattr(
        evolution,
        "_sync_db_status",
        lambda cycle_id, status, details: statuses.append((cycle_id, status, details)),
    )

    result = evolution._check_remote_sync(
        "cycle-2",
        {"pr_number": 42, "base_sha": "main123"},
    )

    assert result["successful"] is True
    assert result["remote_policy_ok"] is True
    assert result["base_unchanged"] is True
    assert merge_calls
    assert statuses[-1][1] == "promoted"


def test_native_paths_require_dedicated_core_check(tmp_path: Path):
    evolution = lab(tmp_path)
    generic = evolution.required_checks_for_paths(["app/services/cohost.py"])
    native = evolution.required_checks_for_paths(["app/main_v3.py"])

    assert "build-engine" not in generic
    assert "build-engine" in native
    assert {"validate", "build-windows-lite", "build-windows"}.issubset(native)
