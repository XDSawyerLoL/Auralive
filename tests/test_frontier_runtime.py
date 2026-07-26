from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.automation.frontier_runtime import FrontierAutomationRuntime
from app.database import Database


class FakeOverlay:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def emit(self, payload):
        self.events.append(payload)


class FakeAura:
    def __init__(self) -> None:
        self.stream_online = False
        self.twitch = SimpleNamespace()
        self.obs = SimpleNamespace()
        self.ai = SimpleNamespace()
        self.overlay = FakeOverlay()
        self.engagement = SimpleNamespace()
        self.messages: list[str] = []

    async def say(self, message, reply_message_id=None):
        self.messages.append(message)
        return {"is_sent": True}


@pytest.mark.asyncio
async def test_frontier_keeps_legacy_actions_and_adds_nested_flow(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    runtime = FrontierAutomationRuntime(
        FakeAura(), db, SimpleNamespace(database_path=tmp_path / "aura.db")
    )
    await runtime.initialize()

    assert "aura.chat.send" in runtime.registry.actions
    assert "flow.branch" in runtime.registry.actions
    assert "mairaiy.respond" in runtime.registry.actions
    assert "twitch.shield_mode" in runtime.registry.actions

    await runtime.upsert(
        {
            "id": "frontier-branch",
            "name": "Branche native",
            "trigger": "automation.manual",
            "actions": [
                {
                    "type": "flow.branch",
                    "config": {
                        "condition": {
                            "type": "event.equals",
                            "config": {"key": "choice", "value": "yes"},
                        },
                        "then_actions": [
                            {
                                "type": "variables.set",
                                "config": {"scope": "global", "name": "branch", "value": "yes"},
                            }
                        ],
                        "else_actions": [
                            {
                                "type": "variables.set",
                                "config": {"scope": "global", "name": "branch", "value": "no"},
                            }
                        ],
                    },
                }
            ],
        }
    )

    reports = await runtime.dispatch(
        "automation.manual", {"choice": "yes", "user_id": "tester"}, source="test"
    )

    assert reports[0]["ok"] is True
    assert runtime.engine.global_variables["branch"] == "yes"
    await runtime.close()


@pytest.mark.asyncio
async def test_frontier_blocks_arbitrary_network_actions_until_locally_allowed(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    runtime = FrontierAutomationRuntime(
        FakeAura(), db, SimpleNamespace(database_path=tmp_path / "aura.db")
    )
    await runtime.initialize()
    await runtime.upsert(
        {
            "id": "blocked-network",
            "name": "Réseau bloqué",
            "trigger": "automation.manual",
            "actions": [
                {
                    "type": "http.request",
                    "config": {"url": "https://example.invalid", "method": "GET"},
                }
            ],
        }
    )

    reports = await runtime.dispatch("automation.manual", {}, source="test")

    assert reports[0]["ok"] is False
    assert "Autorisation locale requise" in reports[0]["steps"][0]["error"]
    permissions = await runtime.permission_policy.list_permissions()
    assert permissions["permissions"]["network"] is False
    audit = await runtime.permission_policy.recent_log()
    assert audit[0]["action_type"] == "http.request"
    assert audit[0]["allowed"] == 0
    await runtime.close()


@pytest.mark.asyncio
async def test_frontier_installs_disabled_templates_without_duplicate_chat_bot(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    runtime = FrontierAutomationRuntime(
        FakeAura(), db, SimpleNamespace(database_path=tmp_path / "aura.db")
    )
    await runtime.initialize()
    await runtime.install_frontier_defaults()

    identifiers = set(runtime.engine.automations)
    assert "frontier-raid-cinematic" in identifiers
    assert "frontier-emergency-shield" in identifiers
    assert runtime.engine.automations["frontier-raid-cinematic"].enabled is False
    assert not any(
        item.enabled and item.trigger == "channel.chat.message"
        for item in runtime.engine.automations.values()
    )
    await runtime.close()


@pytest.mark.asyncio
async def test_unsaved_document_can_be_simulated_without_persistence(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    runtime = FrontierAutomationRuntime(
        FakeAura(), db, SimpleNamespace(database_path=tmp_path / "aura.db")
    )
    await runtime.initialize()

    report = await runtime.simulate_document(
        {
            "id": "unsaved",
            "name": "Brouillon",
            "trigger": "automation.manual",
            "actions": [
                {
                    "type": "variables.set",
                    "config": {"scope": "global", "name": "viewer", "value": "{{event.user_name}}"},
                }
            ],
        },
        "automation.manual",
        {"user_name": "Sansa"},
    )

    assert report["ok"] is True
    assert report["steps"][0]["output"]["config"]["value"] == "Sansa"
    assert "unsaved" not in runtime.engine.automations
    assert "viewer" not in runtime.engine.global_variables
    await runtime.close()
