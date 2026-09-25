from __future__ import annotations

from app.cognitive.active_inference import ActiveInferenceEngine
from app.cognitive.organism import AuraOrganism
from app.cognitive.world_model import CounterfactualWorldModel


def test_active_inference_uses_intention_entropy_for_compute_budget():
    engine = ActiveInferenceEngine()
    clear = {
        "clarte": 0.9,
        "stabilite": 0.9,
        "intention_field": {"potentials": {"agir": 1.0, "explorer": 0.05, "silence": 0.02}},
    }
    ambiguous = {
        "clarte": 0.45,
        "stabilite": 0.55,
        "intention_field": {"potentials": {"agir": 0.5, "explorer": 0.49, "silence": 0.48}},
    }

    cheap = engine.assess(clear)
    deep = engine.assess(ambiguous, novelty=0.8, risk=0.5)
    assert cheap["difficulty"] < deep["difficulty"]
    assert cheap["token_budget"] <= deep["token_budget"]


def test_surprise_is_higher_for_unlikely_events():
    engine = ActiveInferenceEngine()
    assert engine.surprise(0.01) > engine.surprise(0.8)


def test_world_model_prefers_verification_when_clarity_is_low():
    model = CounterfactualWorldModel()
    forecast = model.forecast_policy(
        {"stabilite": 0.45, "clarte": 0.30, "besoin_de_silence": 0.1},
        uncertainty=0.75,
        explicit_mission=True,
    )
    assert forecast["selected"] == "verify_first"


def test_default_aura_organism_does_not_trigger_deep_compute():
    engine = ActiveInferenceEngine()
    organism = AuraOrganism().default_state()
    assessment = engine.assess(organism)
    assert assessment["compute_tier"] in {"native", "fast"}
    assert assessment["token_budget"] <= 180
    assert assessment["difficulty"] < 0.45
