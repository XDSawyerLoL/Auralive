from __future__ import annotations

import asyncio
import inspect
import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from .automation import Automation, AutomationEngine, AutomationRegistry, Event, install_builtins
from .automation.models import ExecutionReport
from .automation.serialization import report_to_dict
from .catalog import trigger_catalog
from .defaults import system_automations
from .gateways import (
    MairaiyHttpGateway,
    ObsWebSocketGateway,
    OverlayHub,
    TwitchEventSubGateway,
    TwitchHelixGateway,
)
from .integrations.mairaiy import install_mairaiy_actions
from .integrations.obs import OBS_EVENT_CATALOG, install_obs_actions
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
        self.services = self._default_services() if services is None else services
        self.services.setdefault("files_root", "data/automation-files")
        self.services.setdefault("emergency", False)
        self.engine = AutomationEngine(self.registry, services=self.services)
        self.services["dispatch"] = self.dispatch
        self.bus = ExecutionBus()
        self.engine.add_listener(self._persist_report)
        self.engine.add_listener(self.bus.publish)
        self.initialized = False
        self.service_errors: dict[str, str] = {}
        self._background_tasks: set[asyncio.Task[Any]] = set()

        obs = self.services.get("obs")
        if obs is not None and hasattr(obs, "event_callback"):
            obs.event_callback = self._handle_obs_event

        twitch = self.services.get("twitch")
        if twitch is not None and self.services.get("eventsub") is None:
            self.services["eventsub"] = TwitchEventSubGateway(
                twitch=twitch,
                event_callback=self._handle_twitch_event,
            )

    @staticmethod
    def _default_services() -> dict[str, Any]:
        services: dict[str, Any] = {}
        overlay = OverlayHub()
        services["overlay"] = overlay

        if os.getenv("AI_ENABLED", "true").lower() != "false":
            services["mairaiy"] = MairaiyHttpGateway.from_env(overlay_hub=overlay)

        if os.getenv("OBS_ENABLED", "true").lower() != "false":
            services["obs"] = ObsWebSocketGateway.from_env()

        twitch_required = (
            "TWITCH_CLIENT_ID",
            "TWITCH_BROADCASTER_ID",
            "TWITCH_BOT_USER_ID",
            "TWITCH_BOT_ACCESS_TOKEN",
            "TWITCH_BROADCASTER_ACCESS_TOKEN",
        )
        if all(os.getenv(name) for name in twitch_required):
            services["twitch"] = TwitchHelixGateway.from_env()
        return services

    @property
    def emergency_active(self) -> bool:
        return bool(self.services.get("emergency", False))

    async def initialize(self) -> None:
        await self.store.initialize()
        self.engine.global_variables.update(await self.store.load_variables("global"))
        for automation in await self.store.load_automations():
            self.engine.upsert(automation)
        await self._install_system_automations()

        mairaiy = self.services.get("mairaiy")
        if mairaiy is not None and hasattr(mairaiy, "initialize"):
            try:
                await mairaiy.initialize()
            except Exception as exc:  # noqa: BLE001
                self.service_errors["mairaiy"] = str(exc)

        obs = self.services.get("obs")
        if (
            obs is not None
            and os.getenv("OBS_CONNECT_ON_START", "true").lower() != "false"
            and hasattr(obs, "connect")
        ):
            try:
                await obs.connect()
                self.services["obs_scene"] = await self._current_obs_scene(obs)
                self.service_errors.pop("obs", None)
            except Exception as exc:  # noqa: BLE001
                self.service_errors["obs"] = str(exc)

        self.initialized = True
        await self.engine.dispatch(Event("aura.started", {"version": "2.0.0-alpha.2"}))

        eventsub = self.services.get("eventsub")
        if eventsub is not None and os.getenv("TWITCH_EVENTSUB_ENABLED", "true").lower() != "false":
            try:
                await eventsub.start()
            except Exception as exc:  # noqa: BLE001
                self.service_errors["eventsub"] = str(exc)

        if (
            mairaiy is not None
            and os.getenv("AI_PRELOAD", "true").lower() != "false"
            and hasattr(mairaiy, "preload")
        ):
            task = asyncio.create_task(self._preload_mairaiy(mairaiy), name="mairaiy-preload")
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)

    async def shutdown(self) -> None:
        if self.initialized:
            await self.engine.dispatch(Event("aura.stopping", {}))
        await self.store.save_variables("global", self.engine.global_variables)
        for task in tuple(self._background_tasks):
            task.cancel()
        for service_name in ("eventsub", "twitch", "obs", "mairaiy"):
            service = self.services.get(service_name)
            close = getattr(service, "close", None)
            if close is None:
                continue
            try:
                result = close()
                if inspect.isawaitable(result):
                    await result
            except Exception as exc:  # noqa: BLE001
                self.service_errors[service_name] = str(exc)
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
        return (
            await asyncio.gather(
                *(self.engine._run_queued(automation, event) for automation in safe)
            )
            if safe
            else []
        )

    async def simulate(self, automation_id: str, event: Event) -> ExecutionReport:
        return await self.engine.simulate(automation_id, event)

    async def simulate_document(
        self,
        automation: Automation,
        event: Event,
    ) -> ExecutionReport:
        temporary_id = automation.id
        previous = self.engine.automations.get(temporary_id)
        self.engine.upsert(automation)
        try:
            return await self.engine.simulate(temporary_id, event)
        finally:
            if previous is not None:
                self.engine.upsert(previous)
            else:
                self.engine.remove(temporary_id)

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

    async def _install_system_automations(self) -> None:
        if os.getenv("AURALIVE_INSTALL_DEFAULTS", "true").lower() == "false":
            return
        available_services = set(self.services)
        for automation in system_automations():
            required = {
                action.type.split(".", 1)[0]
                for action in automation.actions
                if action.type.startswith(("twitch.", "mairaiy.", "obs.", "overlay."))
            }
            if not required.issubset(available_services | {"overlay"}):
                continue
            if automation.id not in self.engine.automations:
                self.engine.upsert(automation)
                await self.store.save_automation(automation)

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

    async def _handle_obs_event(self, event_type: str, event_data: dict[str, Any]) -> None:
        mapping = {item["obs_event"]: item["type"] for item in OBS_EVENT_CATALOG}
        aura_type = mapping.get(event_type, f"obs.raw.{event_type}")
        if event_type == "CurrentProgramSceneChanged":
            self.services["obs_scene"] = event_data.get("sceneName")
        await self.dispatch(Event(aura_type, event_data, source="obs"))

    async def _handle_twitch_event(self, event_type: str, event_data: dict[str, Any]) -> None:
        if event_type == "twitch.stream.online":
            self.services["stream_live"] = True
        elif event_type == "twitch.stream.offline":
            self.services["stream_live"] = False
        await self.dispatch(Event(event_type, event_data, source="twitch"))

    async def _current_obs_scene(self, obs: Any) -> str | None:
        try:
            result = await obs.call("GetCurrentProgramScene", {})
            return result.get("currentProgramSceneName")
        except Exception:  # noqa: BLE001
            return None

    async def _preload_mairaiy(self, mairaiy: Any) -> None:
        try:
            ready = await mairaiy.preload()
            self.services["mairaiy_ready"] = bool(ready)
            self.service_errors.pop("mairaiy", None)
        except Exception as exc:  # noqa: BLE001
            self.services["mairaiy_ready"] = False
            self.service_errors["mairaiy"] = str(exc)

    def catalog(self) -> dict[str, Any]:
        return {
            "triggers": trigger_catalog(),
            **self.registry.catalog(),
        }

    def health(self) -> dict[str, Any]:
        obs = self.services.get("obs")
        overlay = self.services.get("overlay")
        eventsub = self.services.get("eventsub")
        eventsub_status = eventsub.status() if eventsub is not None else {}
        return {
            "ok": self.initialized,
            "version": "2.0.0-alpha.2",
            "automations": len(self.engine.automations),
            "actions": len(self.registry.actions),
            "conditions": len(self.registry.conditions),
            "emergency": self.emergency_active,
            "services": {
                "twitch": self.services.get("twitch") is not None,
                "twitch_chat": bool(eventsub_status.get("chat_connected", False)),
                "twitch_channel": bool(eventsub_status.get("channel_connected", False)),
                "obs": bool(obs is not None and getattr(obs, "connected", False)),
                "mairaiy": self.services.get("mairaiy") is not None,
                "mairaiy_ready": bool(self.services.get("mairaiy_ready", False)),
                "avatar_listeners": overlay.listener_count("avatar") if overlay else 0,
            },
            "eventsub": eventsub_status,
            "service_errors": dict(self.service_errors),
        }
