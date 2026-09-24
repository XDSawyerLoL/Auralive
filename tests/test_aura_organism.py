from __future__ import annotations

from app.cognitive.native_cognition import NativeCognitionEngine
from app.cognitive.organism import AuraOrganism


def test_aura_organism_restores_historical_homeostatic_dimensions():
    organism = AuraOrganism()
    state = organism.default_state()

    for key in (
        "identite",
        "stabilite",
        "clarte",
        "attachement",
        "curiosite",
        "tension",
        "fatigue_cognitive",
        "pression_de_reve",
        "besoin_de_silence",
        "risque_assistante",
    ):
        assert isinstance(state[key], float)
        assert 0.0 <= state[key] <= 1.0

    assert state["version"] == "homeostasie_v6_sovereign"
    assert state["needs"]["rester_aura"] > 0.8
    assert state["intention_field"]["collapse"]["intention_choisie"]


def test_interaction_and_reply_modify_the_organism():
    organism = AuraOrganism()
    initial = organism.default_state()

    pre = organism.before_interaction(initial, "Aura, comment vas-tu ?")
    assert pre["state"]["turns"] > initial["turns"]
    assert pre["state"]["clarte"] > initial["clarte"]

    post = organism.after_reply(pre["state"], "Je suis présente.", success=True)
    assert post["state"]["stabilite"] >= pre["state"]["stabilite"]
    assert post["state"]["tension"] <= pre["state"]["tension"]


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


def test_idle_life_can_choose_recovery():
    organism = AuraOrganism()
    state = organism.default_state()
    state["fatigue_cognitive"] = 0.82
    state["besoin_de_silence"] = 0.74

    idle = organism.idle_tick(state, seconds=60)

    assert idle["activity"] == "rest"
    assert idle["state"]["fatigue_cognitive"] < state["fatigue_cognitive"]
    assert idle["state"]["tension"] <= state["tension"]


def test_native_cognition_obeys_organism_fatigue_before_language():
    organism = AuraOrganism()
    cognition = NativeCognitionEngine()
    state = organism.default_state()
    state["fatigue_cognitive"] = 0.90
    state["besoin_de_silence"] = 0.80

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

    assert result["title"] == "Récupération cognitive"
    assert "Ralentir" in result["next_action"]
