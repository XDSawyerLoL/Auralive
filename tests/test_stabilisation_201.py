from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.automation.pro_nodes import (
    automation_replaces_legacy,
    install_pro_nodes,
    professional_templates,
)
from app.automation.registry import AutomationRegistry
from app.automation.routes import build_automation_router


def test_professional_nodes_are_registered() -> None:
    registry = AutomationRegistry()
    install_pro_nodes(registry)

    assert "event.number_compare" in registry.conditions
    assert "event.text_compare" in registry.conditions
    assert "twitch.clip.create" in registry.actions
    assert "twitch.stream.marker" in registry.actions
    assert "obs.scene_item.visibility" in registry.actions
    assert "obs.media.restart" in registry.actions
    assert "aura.overlay.alert" in registry.actions


def test_professional_templates_have_unique_ids_and_actions() -> None:
    templates = professional_templates()
    ids = [item["id"] for item in templates]

    assert len(ids) == len(set(ids))
    assert "template-raid-production" in ids
    assert "template-sub-production" in ids
    assert all(item.get("actions") for item in templates)
    assert all(item.get("enabled") is False for item in templates)


def test_only_successful_automation_replaces_legacy_response() -> None:
    assert automation_replaces_legacy(
        "channel.raid",
        [{"ok": True, "skipped": False}],
    )
    assert not automation_replaces_legacy(
        "channel.raid",
        [{"ok": False, "skipped": False}],
    )
    assert not automation_replaces_legacy(
        "channel.raid",
        [{"ok": True, "skipped": True}],
    )
    assert not automation_replaces_legacy(
        "channel.chat.message",
        [{"ok": True, "skipped": False}],
    )


class FakeRuntime:
    def __init__(self) -> None:
        self.started = True
        self.registry = SimpleNamespace(actions={}, conditions={})
        self.engine = SimpleNamespace(automations={})
        self.upsert_calls = 0
        self.definitions = [
            {
                "id": "automation-raid-production",
                "name": "Raid personnalisé",
                "trigger": "channel.raid",
                "enabled": True,
                "actions": [{"type": "debug.capture", "config": {}}],
            }
        ]

    @staticmethod
    def templates() -> list[dict]:
        return []

    async def list_definitions(self) -> list[dict]:
        return self.definitions

    async def reports(self, limit: int = 100) -> list[dict]:
        return []

    async def upsert(self, definition: dict) -> dict:
        self.upsert_calls += 1
        self.definitions.append(definition)
        return definition

    async def remove(self, automation_id: str) -> bool:
        return False

    async def simulate(self, automation_id: str, event_type: str, payload: dict) -> dict:
        return {}

    async def dispatch(self, event_type: str, payload: dict, source: str = "dashboard") -> list[dict]:
        return []

    def catalog(self) -> dict:
        return {"actions": [], "conditions": [], "triggers": []}


@pytest.mark.asyncio
async def test_installing_existing_template_preserves_enabled_state() -> None:
    runtime = FakeRuntime()
    router = build_automation_router(runtime)  # type: ignore[arg-type]
    route = next(
        item
        for item in router.routes
        if getattr(item, "path", "") == "/api/automation/templates/{template_id}/install"
    )

    result = await route.endpoint("template-raid-production")

    assert result["already_installed"] is True
    assert result["enabled"] is True
    assert result["name"] == "Raid personnalisé"
    assert runtime.upsert_calls == 0
