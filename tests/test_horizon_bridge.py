from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.database import Database
from app.services.horizon_bridge import HorizonBridge


def settings(tmp_path: Path):
    return SimpleNamespace(
        horizon_enabled=True,
        horizon_base_url="http://horizon.invalid",
        horizon_api_key="",
        horizon_external_id="test-local",
        horizon_request_timeout_seconds=2,
        horizon_poll_seconds=60,
        horizon_event_limit=100,
        horizon_candidate_limit=100,
        horizon_forecast_limit=100,
        horizon_ai_context_signals=10,
        horizon_country="FR",
        horizon_currency="EUR",
        horizon_timezone="Europe/Paris",
        database_path=tmp_path / "aura.db",
    )


def feed():
    return {
        "bridge": "horizon-aura-bridge-v1",
        "generated_at": "2026-09-23T20:00:00+00:00",
        "user_found": True,
        "summary": {"signals": 2},
        "critical_semantics": {
            "scores_are_not_probabilities": True,
            "aura_must_preserve_epistemic_status": True,
        },
        "signals": [
            {
                "signal_id": "hypothesis:1:abc",
                "entity_key": "hypothesis:1",
                "aura_event": "horizon.world.emerging",
                "observed_at": "2026-09-23T19:00:00",
                "payload": {
                    "kind": "emerging_hypothesis",
                    "title": "Perturbation potentielle",
                    "domain": "transport_mobility",
                    "domain_label": "Transport",
                    "epistemic_status": "unconfirmed_emerging_event",
                    "corroboration_score": 0.72,
                    "corroboration_score_is_probability": False,
                    "probability": None,
                    "personal": False,
                    "autonomy_hint": "notify_or_verify_only",
                },
            },
            {
                "signal_id": "forecast:7:def",
                "entity_key": "forecast:7",
                "aura_event": "horizon.personal.forecast",
                "observed_at": "2026-09-23T19:05:00",
                "payload": {
                    "kind": "personal_forecast",
                    "event_title": "Trafic perturbé",
                    "predicted_outcome": "Le déplacement peut être affecté.",
                    "domain": "transport_mobility",
                    "domain_label": "Transport",
                    "epistemic_status": "personal_forecast",
                    "predictive_score": 0.61,
                    "predictive_score_is_probability": False,
                    "personal": True,
                    "autonomy_hint": "personal_relevance_gate_then_propose",
                },
            },
        ],
    }


@pytest.mark.asyncio
async def test_bridge_deduplicates_and_preserves_epistemic_labels(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    bridge = HorizonBridge(settings(tmp_path), db)
    events = []

    async def dispatch(event_type, payload, *, source):
        events.append((event_type, payload, source))
        return []

    bridge.dispatcher = dispatch
    await bridge._initialize_storage()

    first = await bridge.ingest_feed(feed())
    second = await bridge.ingest_feed(feed())

    assert first["new_signals"] == 2
    assert second["new_signals"] == 0
    assert [item[0] for item in events] == [
        "horizon.world.emerging",
        "horizon.personal.forecast",
    ]
    assert events[0][1]["epistemic_status"] == "unconfirmed_emerging_event"
    assert events[0][1]["corroboration_score_is_probability"] is False


@pytest.mark.asyncio
async def test_bridge_rejects_hypothesis_that_requests_autonomous_action(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    bridge = HorizonBridge(settings(tmp_path), db)

    async def dispatch(event_type, payload, *, source):
        return []

    bridge.dispatcher = dispatch
    await bridge._initialize_storage()
    payload = feed()
    payload["signals"][0]["payload"]["autonomy_hint"] = "verify_then_act"

    with pytest.raises(ValueError, match="hypothèse HORIZON"):
        await bridge.ingest_feed(payload)


@pytest.mark.asyncio
async def test_bridge_builds_truth_labeled_ai_context(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    bridge = HorizonBridge(settings(tmp_path), db)
    bridge.last_feed = feed()

    context = await bridge.context_for_ai()
    assert "HYPOTHÈSE NON CONFIRMÉE" in context
    assert "PRÉVISION PERSONNELLE" in context
    assert "probabilité calibrée" in context
