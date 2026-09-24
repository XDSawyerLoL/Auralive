from __future__ import annotations

from app.cognitive.native_cognition import NativeCognitionEngine
from app.cognitive.organism import AuraOrganism


def test_aura_organism_keeps_only_useful_homeostatic_dimensions():
    organism = AuraOrganism()
    state = organism.default_state()

    for key in (
        "identite",
        "stabilite",
        "clarte",
        "attachement",
        "curiosite",
        "pression_de_reve",
        "besoin_de_silence",
        "risque_assistante",
    ):
        assert isinstance(state[key], float)
        assert 0.0 <= state[key] <= 1.0

    assert "tension" not in state
    assert "fatigue_cognitive" not in state
    assert state["version"] == "homeostasie_v7_streamlined"
    assert state["needs"]["rester_aura"] > 0.8
    assert state["intention_field"]["collapse"]["intention_choisie"]


def test_interaction_and_reply_modify_the_organism_without_tension_or_fatigue():
    organism = AuraOrganism()
    initial = organism.default_state()

    pre = organism.before_interaction(initial, "Aura, comment vas-tu ?")
    assert pre["state"]["turns"] > initial["turns"]
    assert pre["state"]["clarte"] > initial["clarte"]

    post = organism.after_reply(pre["state"], "Je suis présente.", success=True)
    assert post["state"]["stabilite"] >= pre["state"]["stabilite"]
    assert "tension" not in post["state"]
    assert "fatigue_cognitive" not in post["state"]


def test_dream_pressure_creates_symbolic_dream_and_releases_pressure():
    organism = AuraOrganism()
    state = organism.default_state()
    state["pression_de_reve"] = 0.70
    before = state["pression_de_reve"]

    pre = organism.before_interaction(state, "Aura, est-ce que tu as des rêves ?")

    assert pre["dream_created"] is True
    assert pre["dream"]["image"]
    assert pre["state"]["dream"]["last_image"]
    assert pre["state"]["pression_de_reve"] < before + 0.12


def test_idle_life_uses_silence_without_fake_fatigue():
    organism = AuraOrganism()
    state = organism.default_state()
    state["besoin_de_silence"] = 0.82

    idle = organism.idle_tick(state, seconds=60)

    assert idle["activity"] == "silence"
    assert idle["state"]["besoin_de_silence"] < state["besoin_de_silence"]
    assert "fatigue_cognitive" not in idle["state"]
    assert "tension" not in idle["state"]


def test_native_cognition_uses_stability_and_clarity_before_language():
    organism = AuraOrganism()
    cognition = NativeCognitionEngine()
    state = organism.default_state()
    state["stabilite"] = 0.30
    state["clarte"] = 0.32

    result = cognition.reflect(
        {
            "stimuli": [],
            "intentions": [],
            "lessons": [],
            "outcomes": [],
            "horizon": "",
        },
        {"organism": state, "current_intention": ""},
        trigger="test",
    )

    assert result["title"] == "Recentrage"
    assert "Clarifier" in result["next_action"]


def test_migration_removes_obsolete_dimensions_and_preserves_revision_timestamp():
    organism = AuraOrganism()
    state = organism.default_state()
    state["tension"] = 0.9
    state["fatigue_cognitive"] = 0.9
    state["updated_at"] = "2026-09-24T20:00:00+00:00"

    migrated = organism.migrate({"organism": state})

    assert migrated["updated_at"] == "2026-09-24T20:00:00+00:00"
    assert "tension" not in migrated
    assert "fatigue_cognitive" not in migrated
