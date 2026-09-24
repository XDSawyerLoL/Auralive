from __future__ import annotations

from app.cognitive.native_cognition import NativeCognitionEngine


def test_native_reflection_is_independent_from_language_model():
    engine = NativeCognitionEngine()
    result = engine.reflect(
        {
            "stimuli": [{"type": "automation.failure", "source": "automation", "payload": {}}],
            "intentions": [{"statement": "Maintenir la stabilité", "priority": 0.9}],
            "lessons": [{"content": "Vérifier avant de répéter."}],
            "outcomes": [{"ok": 0, "signature": "timeout-worker"}],
            "horizon": "",
        },
        {"current_intention": "Maintenir la stabilité", "pressure": 0.4},
        trigger="test",
    )

    assert result["title"] == "Stabilisation prioritaire"
    assert "Vérifier" in result["next_action"]
    assert result["confidence"] >= 0.7
    assert result["basis"]["restricted_authority"] is False


def test_reply_plan_comes_from_soul_before_expression():
    engine = NativeCognitionEngine()
    plan = engine.plan_reply(
        text="Que fais-tu maintenant ?",
        soul={
            "current_intention": "Consolider la mémoire",
            "dominant_thought": "Vérifier la continuité",
        },
        intentions=[{"statement": "Consolider la mémoire", "priority": 0.8}],
        lessons=[],
        reflections=[],
        work=[{"title": "Continuité cognitive"}],
        private=True,
    )

    assert plan["act"] == "report_current_activity"
    assert plan["needs_semantic_support"] is False
    assert "Consolider la mémoire" in " ".join(plan["facts"])
    assert "Intention actuelle" in engine.deterministic_reply(plan)
