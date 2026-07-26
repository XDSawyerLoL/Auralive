from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.automation.runtime import AutomationStudioRuntime
from app.database import Database


class FakeOverlay:
    def __init__(self):
        self.events = []

    async def emit(self, payload):
        self.events.append(payload)


class FakeAura:
    def __init__(self):
        self.stream_online = False
        self.twitch = SimpleNamespace()
        self.obs = SimpleNamespace()
        self.ai = SimpleNamespace()
        self.overlay = FakeOverlay()
        self.engagement = SimpleNamespace()
        self.messages = []

    async def say(self, message, reply_message_id=None):
        self.messages.append(message)
        return {"is_sent": True}


@pytest.mark.asyncio
async def test_runtime_preserves_old_database_and_runs_native_engine(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    aura = FakeAura()
    settings = SimpleNamespace(database_path=tmp_path / "aura.db")
    runtime = AutomationStudioRuntime(aura, db, settings)
    await runtime.initialize()

    definition = await runtime.upsert(
        {
            "id": "hello",
            "name": "Bonjour Automation Studio",
            "trigger": "automation.manual",
            "actions": [
                {"type": "variables.set", "config": {"scope": "global", "name": "ready", "value": True}},
                {"type": "aura.chat.send", "config": {"message": "Aura Live 2 est prête"}},
            ],
        }
    )
    assert definition["name"] == "Bonjour Automation Studio"

    reports = await runtime.dispatch("automation.manual", {"user_id": "tester"}, source="test")
    assert reports[0]["ok"] is True
    assert runtime.engine.global_variables["ready"] is True
    assert aura.messages == ["Aura Live 2 est prête"]

    stored = await runtime.reports(10)
    assert stored and stored[0]["automation_id"] == "hello"
    assert await db.fetchone("SELECT name FROM commands LIMIT 1") is not None
    assert "obs.request" in runtime.registry.actions
    assert "aura.ai.generate" in runtime.registry.actions
    await runtime.close()


def test_template_round_trip():
    template = AutomationStudioRuntime.templates()[0]
    automation = AutomationStudioRuntime.from_dict({**template, "enabled": True})
    exported = AutomationStudioRuntime.to_dict(automation)
    assert exported["trigger"] == "channel.follow"
    assert exported["actions"][0]["type"] == "aura.ai.generate"
