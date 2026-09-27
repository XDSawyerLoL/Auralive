from pathlib import Path


def test_native_and_fleet_evolution_branches_are_both_policy_gated():
    workflow = (Path(__file__).resolve().parents[1] / ".github" / "workflows" / "aura-change-policy.yml").read_text(encoding="utf-8")
    assert "aura-evolution/*" in workflow
    assert "aura-evolution-fleet/*" in workflow
