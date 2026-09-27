from __future__ import annotations

from app.services.model_scorecard import ModelScorecard


def test_scorecard_persists_role_specific_performance(tmp_path):
    path = tmp_path / "model-scorecard.json"
    scorecard = ModelScorecard(path, exploration=0)

    for _ in range(6):
        scorecard.record(
            "qwen3:8b",
            "code",
            success=True,
            latency_ms=1200,
            quality=0.9,
            source="test",
        )
        scorecard.record(
            "qwen3:14b",
            "code",
            success=False,
            latency_ms=16000,
            quality=0.2,
            source="test",
        )

    fast = scorecard.metrics("qwen3:8b", "code")
    weak = scorecard.metrics("qwen3:14b", "code")
    assert fast["learned_bonus"] > weak["learned_bonus"]
    assert fast["success_rate"] > weak["success_rate"]

    reloaded = ModelScorecard(path, exploration=0)
    persisted = reloaded.metrics("qwen3:8b", "code")
    assert persisted["calls"] == 6
    assert persisted["successes"] == 6
    assert persisted["ema_quality"] > 0.8


def test_scorecard_keeps_domains_independent(tmp_path):
    scorecard = ModelScorecard(tmp_path / "scorecard.json", exploration=0)
    for _ in range(5):
        scorecard.record("specialist:1", "code", success=True, quality=0.95)
        scorecard.record("specialist:1", "empathy", success=False, quality=0.1)

    code = scorecard.metrics("specialist:1", "code")
    empathy = scorecard.metrics("specialist:1", "empathy")
    assert code["learned_bonus"] > 0
    assert empathy["learned_bonus"] < 0
