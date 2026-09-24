from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.cognitive.evolution import EvolutionLab
from app.database import Database


class FakeAutomation:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict, str]] = []

    async def dispatch(self, event_type: str, payload: dict | None = None, *, source: str = "aura"):
        self.events.append((event_type, payload or {}, source))
        return []


def make_settings(mode: str = "observe", *, auto_submit: bool = False, auto_merge: bool = False):
    return SimpleNamespace(
        evolution_enabled=True,
        evolution_mode=mode,
        evolution_interval_seconds=21600,
        evolution_auto_submit=auto_submit,
        evolution_auto_merge=auto_merge,
        evolution_github_token="",
        evolution_github_repository="XDSawyerLoL/Auralive",
        evolution_github_base_branch="main",
        evolution_allowed_domains="api.github.com,pypi.org",
        evolution_research_urls="",
        evolution_required_checks="validate,build-engine,build-windows-lite,build-windows",
    )


@pytest.mark.asyncio
async def test_observe_mode_stops_before_any_patch(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    automation = FakeAutomation()
    lab = EvolutionLab(
        aura=SimpleNamespace(ai=SimpleNamespace()),
        db=db,
        automation=automation,
        cognitive=SimpleNamespace(),
        settings=make_settings("observe"),
    )
    lab.root = tmp_path / "evolution"
    lab.workspaces = lab.root / "workspaces"
    lab.artifacts = lab.root / "artifacts"
    lab.backups = lab.root / "backups"

    async def research(objective: str, cycle_id: str):
        return {
            "objective": objective,
            "sources": [{"source": "test", "title": "finding", "content": "evidence"}],
            "source_count": 1,
            "allowed_domains": ["api.github.com", "pypi.org"],
        }

    async def diagnose(objective: str, research_payload: dict):
        return {
            "worth_changing": True,
            "diagnosis": "Une optimisation mesurable est possible.",
            "target_files": ["app/example.py"],
            "expected_gain": "latence réduite",
            "failure_risk": "low",
            "evidence": ["test"],
        }

    async def forbidden_candidate(*args, **kwargs):
        raise AssertionError("observe mode must never generate a patch candidate")

    lab.research = research
    lab.diagnose = diagnose
    lab.propose_candidate = forbidden_candidate

    result = await lab.run_cycle("Inspecte les optimisations possibles.", trigger="test")

    assert result["status"] == "proposal-ready"
    assert result["mode"] == "observe"
    assert not any(lab.workspaces.iterdir())
    cycles = await lab.cycles()
    assert cycles[0]["status"] == "proposal-ready"
    assert any(event[0] == "aura.evolution.cycle" for event in automation.events)


@pytest.mark.asyncio
async def test_observe_mode_status_exposes_effective_capabilities(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    lab = EvolutionLab(
        aura=SimpleNamespace(ai=SimpleNamespace()),
        db=db,
        automation=FakeAutomation(),
        cognitive=SimpleNamespace(),
        settings=make_settings("observe", auto_submit=True, auto_merge=True),
    )
    lab.root = tmp_path / "evolution"
    lab.workspaces = lab.root / "workspaces"
    lab.artifacts = lab.root / "artifacts"
    lab.backups = lab.root / "backups"
    await lab.initialize()

    status = await lab.status()

    assert status["enabled"] is True
    assert status["mode"] == "observe"
    assert status["auto_submit"] is False
    assert status["auto_merge"] is False
    assert status["effective_capabilities"]["research"] is True
    assert status["effective_capabilities"]["diagnose"] is True
    assert status["effective_capabilities"]["patch_workspace"] is False
    assert status["effective_capabilities"]["remote_submit"] is False
    assert status["effective_capabilities"]["remote_merge"] is False


def test_evolution_modes_enforce_progressive_authority():
    base = {
        "evolution_enabled": True,
        "evolution_interval_seconds": 21600,
        "evolution_github_token": "",
        "evolution_github_repository": "XDSawyerLoL/Auralive",
        "evolution_github_base_branch": "main",
        "evolution_allowed_domains": "api.github.com,pypi.org",
        "evolution_research_urls": "",
        "evolution_required_checks": "validate,build-engine,build-windows-lite,build-windows",
        "evolution_auto_submit": True,
        "evolution_auto_merge": True,
    }
    dummy = SimpleNamespace()
    for mode, submit, merge in [
        ("observe", False, False),
        ("sandbox", False, False),
        ("submit", True, False),
        ("promote", True, True),
    ]:
        settings = SimpleNamespace(**base, evolution_mode=mode)
        lab = EvolutionLab(dummy, dummy, dummy, dummy, settings)
        assert lab.mode == mode
        assert lab.auto_submit is submit
        assert lab.auto_merge is merge
