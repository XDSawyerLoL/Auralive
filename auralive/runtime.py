from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from .automation import Automation, AutomationEngine, AutomationRegistry, Event, install_builtins
from .automation.models import ExecutionReport
from .automation.serialization import report_to_dict
from .catalog import trigger_catalog
from .integrations.mairaiy import install_mairaiy_actions
from .integrations.obs import install_obs_actions
from .integrations.twitch import install_twitch_actions
from .storage import SQLiteStore


class ExecutionBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    async def publish(self, report: ExecutionReport) -> None:
        payload = report_to_dict(report)
        for queue in tuple(self._subscribers):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                queue.put_nowait(payload)

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._subscribers.discard(queue)


class AuraRuntime:
    def __init__(
        self,
        *,
        database_path: str | Path = "data/aura_live_v2.db",
        services: dict[str, Any] | None = None,
    ) -> None:
        self.registry = AutomationRegistry()
        install_builtins(self.registry)
        install_twitch_actions(self.registry)
        install_obs_actions(self.registry)
        install_mairaiy_actions(self.registry)

        self.store = SQLiteStore(database_path)
        self.services = services or {}
        self.services.setdefault("files_root", "data/automation-files")
        self.services.setdefault("emergency", False)
        self.engine = AutomationEngine(self.registry, services=self.services)
        self.bus = ExecutionBus()
        self.engine.add_listener(self._persist_report)
        self.engine.add_listener(self.bus.publish)
        self.initialized = False

    @property
    def emergency_active(self) -> bool:
        return bool(self.services.get("emergency", False))

    async def initialize(self) -> None:
        await self.store.initialize()
        self.engine.global_variables.update(await self.store.load_variables("global"))
        for automation in await self.store.load_automations():
            self.engine.upsert(automation)
        self.initialized = True

    async def shutdown(self) -> None:
        await self.store.save_variables("global", self.engine.global_variables)
        self.initialized = False

    async def upsert(self, automation: Automation) -> Automation:
        existing = self.engine.automations.get(automation.id)
        if existing is not None and automation.version <= existing.version:
            automation.version = existing.version + 1
        self.engine.upsert(automation)
        await self.store.save_automation(automation)
        return automation

    async def remove(self, automation_id: str) -> None:
        self.engine.remove(automation_id)
        await self.store.delete_automation(automation_id)

    async def dispatch(self, event: Event) -> list[ExecutionReport]:
        if not self.emergency_active:
            return await self.engine.dispatch(event)

        safe = sorted(
            (
                automation
                for automation in self.engine.automations.values()
                if automation.enabled
                and self.engine._trigger_matches(automation.trigger, event.type)
                and (
                    "emergency-safe" in automation.tags
                    or automation.trigger == "aura.emergency"
                    or automation.trigger.startswith("twitch.moderation.")
                )
            ),
            key=lambda automation: automation.priority,
        )
        return await asyncio.gather(
            *(self.engine._run_queued(automation, event) for automation in safe)
        ) if safe else []

    async def simulate(self, automation_id: str, event: Event) -> ExecutionReport:
        return await self.engine.simulate(automation_id, event)

    async def set_emergency(self, active: bool) -> bool:
        self.services["emergency"] = bool(active)
        await self.dispatch(
            Event(
                "aura.emergency",
                {"active": bool(active)},
                source="control-panel",
            )
        )
        return self.emergency_active

    async def _persist_report(self, report: ExecutionReport) -> None:
        await self.store.save_report(report)
        await self.store.save_variables("global", self.engine.global_variables)
        user_id = str(report.variables.get("event", {}).get("user_id") or "")
        if user_id:
            await self.store.save_variables(
                "viewer",
                self.engine.viewer_variables[user_id],
                owner_key=user_id,
            )

    def catalog(self) -> dict[str, Any]:
        return {
            "triggers": trigger_catalog(),
            **self.registry.catalog(),
        }

    def health(self) -> dict[str, Any]:
        return {
            "ok": self.initialized,
            "version": "2.0.0-alpha.2",
            "automations": len(self.engine.automations),
            "actions": len(self.registry.actions),
            "conditions": len(self.registry.conditions),
            "emergency": self.emergency_active,
            "services": {
                name: service is not None
                for name, service in self.services.items()
                if name != "dispatch"
            },
        }
