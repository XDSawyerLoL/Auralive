from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.cognitive.evolution import EvolutionLab
from app.database import Database, utcnow


class FakeAutomation:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict, str]] = []

    async def dispatch(self, event_type, payload=None, *, source="aura"):
        self.events.append((event_type, payload or {}, source))
        return []


class ResearchOnlyEvolution(EvolutionLab):
    async def research(self, objective: str, cycle_id: str):
        return {
            "objective": objective,
            "sources": [{"source": "test", "title": "signal", "content": "candidate"}],
        }

    async def diagnose(self, objective: str, research):
        return {
            "worth_changing": True,
            "summary": "Une amélioration semble testable.",
            "target": "app/example.py",
        }

    async def propose_candidate(self, *args, **kwargs):
        raise AssertionError("Aucun patch ne doit être généré sans arbre source complet")


def settings() -> SimpleNamespace:
    return SimpleNamespace(
        evolution_enabled=True,
        evolution_interval_seconds=21600,
        evolution_auto_submit=False,
        evolution_auto_merge=False,
        evolution_github_token="",
        evolution_github_repository="XDSawyerLoL/Auralive",
        evolution_github_base_branch="main",
        evolution_allowed_domains="api.github.com,pypi.org",
        evolution_research_urls="",
        evolution_required_checks="gate-node-cloud,gate-python-core,gate-rust-core,gate-windows-smoke",
        evolution_canary_required=True,
        evolution_canary_mode="automatic",
        evolution_canary_token="",
        evolution_canary_min_observations=3,
    )


@pytest.mark.asyncio
async def test_phase3_stays_research_only_without_full_source_tree(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    automation = FakeAutomation()
    lab = ResearchOnlyEvolution(
        SimpleNamespace(),
        db,
        automation,
        SimpleNamespace(),
        settings(),
    )
    lab.source_root = tmp_path / "incomplete-runtime"
    lab.source_root.mkdir()

    result = await lab.run_cycle("Cherche une amélioration sûre.", trigger="test")

    assert lab.enabled is True
    assert lab.source_ready is False
    assert result["status"] == "research-only"
    assert "ne génère aucun patch" in result["reason"]

    rows = await lab.cycles()
    assert rows[0]["status"] == "research-only"


@pytest.mark.asyncio
async def test_independent_canary_requires_minimum_observations(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    automation = FakeAutomation()
    lab = EvolutionLab(
        SimpleNamespace(),
        db,
        automation,
        SimpleNamespace(),
        settings(),
    )
    await lab.initialize()

    cycle_id = "cycle-canary"
    now = utcnow()
    await db.execute(
        """
        INSERT INTO aura_evolution_cycles(
            id,trigger,objective,status,created_at,updated_at
        ) VALUES(?,?,?,'awaiting-canary',?,?)
        """,
        (cycle_id, "test", "Valider un canary.", now, now),
    )

    insufficient = await lab.record_canary(
        cycle_id,
        passed=True,
        observations=2,
        metrics={"error_rate_before": 0.12, "error_rate_after": 0.03},
        notes="Deux observations seulement.",
    )
    assert insufficient["ready"] is False

    accepted = await lab.record_canary(
        cycle_id,
        passed=True,
        observations=3,
        metrics={"error_rate_before": 0.12, "error_rate_after": 0.02},
        notes="Trois observations cohérentes.",
    )
    assert accepted["ready"] is True

    current = await lab.canary_status(cycle_id)
    assert current["ready"] is True
    assert current["observations"] == 3
    assert current["metrics"]["error_rate_after"] == 0.02
    assert any(event[0] == "aura.evolution.canary" for event in automation.events)


@pytest.mark.asyncio
async def test_failed_canary_never_becomes_ready(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    automation = FakeAutomation()
    lab = EvolutionLab(
        SimpleNamespace(),
        db,
        automation,
        SimpleNamespace(),
        settings(),
    )
    await lab.initialize()

    cycle_id = "cycle-failed-canary"
    now = utcnow()
    await db.execute(
        """
        INSERT INTO aura_evolution_cycles(
            id,trigger,objective,status,created_at,updated_at
        ) VALUES(?,?,?,'awaiting-canary',?,?)
        """,
        (cycle_id, "test", "Refuser une régression.", now, now),
    )

    result = await lab.record_canary(
        cycle_id,
        passed=False,
        observations=50,
        metrics={"error_rate_before": 0.02, "error_rate_after": 0.08},
        notes="Régression détectée.",
    )
    assert result["ready"] is False
    assert (await lab.canary_status(cycle_id))["ready"] is False


def test_cloud_node_cognition_is_auto_promotable_surface(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    lab = EvolutionLab(
        SimpleNamespace(),
        db,
        FakeAutomation(),
        SimpleNamespace(),
        settings(),
    )
    assert lab._path_policy("cloud-node/src/cognition.js", auto=True) == (True, "")
    ok, reason = lab._path_policy("cloud-node/src/server.js", auto=True)
    assert ok is False
    assert "protégé" in reason


@pytest.mark.asyncio
async def test_automatic_canary_is_created_after_required_ci_checks(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    lab = EvolutionLab(
        SimpleNamespace(),
        db,
        FakeAutomation(),
        SimpleNamespace(),
        settings(),
    )
    await lab.initialize()
    cycle_id = "cycle-auto-canary"
    stamp = utcnow()
    await db.execute(
        """
        INSERT INTO aura_evolution_cycles(
            id,trigger,objective,status,created_at,updated_at
        ) VALUES(?,?,?,'remote-validation',?,?)
        """,
        (cycle_id, "test", "Valider automatiquement.", stamp, stamp),
    )
    result = lab._automatic_canary_sync(
        cycle_id,
        {
            "successful": True,
            "head_sha": "abc123",
            "required_checks": ["node-cloud", "python-core", "rust-core", "windows-smoke"],
            "missing_required_checks": [],
        },
    )
    assert result["ready"] is True
    assert result["observations"] == 3
    assert result["metrics"]["mode"] == "automatic-ci-sandbox"
