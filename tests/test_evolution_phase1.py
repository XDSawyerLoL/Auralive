from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.cognitive.evolution import EvolutionLab
from app.database import Database


class FakeAutomation:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict, str]] = []

    async def dispatch(self, event_type, payload=None, *, source="aura"):
        self.events.append((event_type, dict(payload or {}), source))
        return []


class FakeAI:
    enabled = True


def settings(tmp_path: Path, *, mode: str = "observe"):
    return SimpleNamespace(
        evolution_enabled=True,
        evolution_mode=mode,
        evolution_source_root="",
        evolution_interval_seconds=21600,
        evolution_auto_submit=True,
        evolution_auto_merge=True,
        evolution_github_token="",
        evolution_github_repository="XDSawyerLoL/Auralive",
        evolution_github_base_branch="main",
        evolution_allowed_domains="api.github.com,pypi.org",
        evolution_research_urls="",
        evolution_required_checks="validate,build-engine,build-windows-lite,build-windows",
        database_path=tmp_path / "aura.db",
    )


def isolate_lab(lab: EvolutionLab, tmp_path: Path) -> None:
    lab.root = tmp_path / "evolution"
    lab.workspaces = lab.root / "workspaces"
    lab.artifacts = lab.root / "artifacts"
    lab.backups = lab.root / "backups"


@pytest.mark.asyncio
async def test_observe_phase_cannot_patch_submit_or_merge(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    automation = FakeAutomation()
    lab = EvolutionLab(
        SimpleNamespace(ai=FakeAI()),
        db,
        automation,
        SimpleNamespace(),
        settings(tmp_path, mode="observe"),
    )
    isolate_lab(lab, tmp_path)

    async def fake_research(objective, cycle_id):
        return {
            "objective": objective,
            "source_count": 1,
            "sources": [{"source": "test", "title": "signal", "content": "safe"}],
        }

    async def fake_diagnose(objective, research):
        return {
            "worth_changing": True,
            "diagnosis": "Une optimisation est plausible.",
            "target_files": ["app/example.py"],
            "expected_gain": "latence",
            "failure_risk": "low",
            "evidence": ["test"],
        }

    async def forbidden(*args, **kwargs):
        raise AssertionError("La phase observe ne doit jamais créer de candidat")

    lab.research = fake_research
    lab.diagnose = fake_diagnose
    lab.propose_candidate = forbidden
    lab.submit_candidate = forbidden

    result = await lab.run_cycle(
        "Chercher une amélioration faible risque.",
        trigger="test",
        submit=True,
    )

    assert result["status"] == "observed"
    assert result["mode"] == "observe"
    assert result["candidate"] == {}
    assert result["promotion"] == {}
    assert lab.auto_submit is False
    assert lab.auto_merge is False
    assert automation.events[-1][0] == "aura.evolution.cycle"
    assert automation.events[-1][1]["status"] == "observed"

    cycles = await lab.cycles()
    assert cycles[0]["status"] == "observed"


@pytest.mark.asyncio
async def test_status_exposes_phase_and_sandbox_readiness(tmp_path: Path):
    source = tmp_path / "source"
    (source / "app").mkdir(parents=True)
    (source / "tests").mkdir()
    (source / "requirements.txt").write_text("fastapi==0.116.1\n", encoding="utf-8")

    cfg = settings(tmp_path, mode="sandbox")
    cfg.evolution_source_root = str(source)
    cfg.evolution_auto_submit = False
    cfg.evolution_auto_merge = False

    db = Database(tmp_path / "aura.db")
    await db.initialize()
    lab = EvolutionLab(
        SimpleNamespace(ai=FakeAI()),
        db,
        FakeAutomation(),
        SimpleNamespace(),
        cfg,
    )
    isolate_lab(lab, tmp_path)
    await lab.initialize()

    status = await lab.status()

    assert status["mode"] == "sandbox"
    assert status["phase"] == "sandbox-manual-promotion"
    assert status["sandbox"]["ready"] is True
    assert status["sandbox"]["missing"] == []
    assert status["source_root"] == str(source.resolve())


def test_unknown_evolution_mode_fails_closed_to_observe(tmp_path: Path):
    lab = EvolutionLab(
        SimpleNamespace(ai=FakeAI()),
        SimpleNamespace(),
        FakeAutomation(),
        SimpleNamespace(),
        settings(tmp_path, mode="anything-goes"),
    )
    assert lab.mode == "observe"
    assert lab.auto_submit is False
    assert lab.auto_merge is False
