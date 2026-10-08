from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_production_certifier_checks_sha_and_real_chat_contract():
    source = (ROOT / "scripts" / "certify-aura-production.mjs").read_text(encoding="utf-8")
    assert "AURA_EXPECTED_GIT_SHA" in source
    assert "/api/build" in source
    assert "homeostasie_v9_unified" in source
    assert "/api/chat" in source
    assert "body: { text: 'Que fais-tu en ce moment ?' }" in source
    assert "body.answer" in source


def test_external_benchmark_targets_current_candidate_not_legacy_freeze():
    workflow = (ROOT / ".github" / "workflows" / "external-benchmarks.yml").read_text(encoding="utf-8")
    harness = (ROOT / "evaluation" / "external" / "arc_agi2_public.mjs").read_text(encoding="utf-8")
    assert "Current Candidate" in workflow
    assert "AURA_EVALUATED_SHA" in workflow
    assert "AURA_FROZEN_SHA" not in workflow
    assert "evaluated_aura_sha" in harness
