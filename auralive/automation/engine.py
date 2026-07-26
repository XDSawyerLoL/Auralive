from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from .models import Automation, Event, ExecutionReport, ExecutionStep, FailurePolicy, RunMode
from .registry import AutomationRegistry


class AutomationEngine:
    def __init__(self, registry: AutomationRegistry) -> None:
        self.registry = registry
        self.automations: dict[str, Automation] = {}
        self._queues: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self.global_variables: dict[str, Any] = {}
        self.viewer_variables: dict[str, dict[str, Any]] = defaultdict(dict)

    def upsert(self, automation: Automation) -> None:
        self.automations[automation.id] = automation

    def remove(self, automation_id: str) -> None:
        self.automations.pop(automation_id, None)

    async def dispatch(self, event: Event) -> list[ExecutionReport]:
        matches = sorted(
            (
                automation
                for automation in self.automations.values()
                if automation.enabled and automation.trigger == event.type
            ),
            key=lambda automation: automation.priority,
        )
        return await asyncio.gather(*(self._run_queued(item, event) for item in matches))

    async def simulate(self, automation_id: str, event: Event) -> ExecutionReport:
        automation = self.automations[automation_id]
        return await self._run(automation, event, dry_run=True)

    async def _run_queued(self, automation: Automation, event: Event) -> ExecutionReport:
        if not automation.queue_key:
            return await self._run(automation, event)
        async with self._queues[automation.queue_key]:
            return await self._run(automation, event)

    async def _run(
        self, automation: Automation, event: Event, *, dry_run: bool = False
    ) -> ExecutionReport:
        context = self._build_context(event, dry_run=dry_run)
        for condition in automation.conditions:
            handler = self.registry.conditions.get(condition.type)
            if handler is None:
                return ExecutionReport(
                    automation_id=automation.id,
                    event_type=event.type,
                    ok=False,
                    steps=[ExecutionStep(condition.type, False, error="Condition inconnue")],
                    variables=context,
                )
            result = await handler(condition.config, event, context)
            if condition.negate:
                result = not result
            if not result:
                return ExecutionReport(
                    automation_id=automation.id,
                    event_type=event.type,
                    ok=True,
                    skipped=True,
                    variables=context,
                )

        if dry_run:
            return ExecutionReport(
                automation_id=automation.id,
                event_type=event.type,
                ok=True,
                steps=[ExecutionStep(action.type, True, output="simulation") for action in automation.actions],
                variables=context,
            )

        if automation.run_mode is RunMode.PARALLEL:
            steps = await asyncio.gather(
                *(self._execute_action(action, event, context) for action in automation.actions)
            )
            return ExecutionReport(
                automation_id=automation.id,
                event_type=event.type,
                ok=all(step.ok for step in steps),
                steps=list(steps),
                variables=context,
            )

        steps: list[ExecutionStep] = []
        for action in automation.actions:
            step = await self._execute_action(action, event, context)
            steps.append(step)
            if not step.ok and action.failure_policy is FailurePolicy.STOP:
                break
        return ExecutionReport(
            automation_id=automation.id,
            event_type=event.type,
            ok=all(step.ok for step in steps),
            steps=steps,
            variables=context,
        )

    async def _execute_action(self, action: Any, event: Event, context: dict[str, Any]) -> ExecutionStep:
        handler = self.registry.actions.get(action.type)
        if handler is None:
            return ExecutionStep(action.type, False, error="Action inconnue")
        try:
            output = await asyncio.wait_for(
                handler(action.config, event, context), timeout=action.timeout_seconds
            )
            return ExecutionStep(action.type, True, output=output)
        except Exception as exc:  # noqa: BLE001
            return ExecutionStep(action.type, False, error=str(exc))

    def _build_context(self, event: Event, *, dry_run: bool) -> dict[str, Any]:
        viewer_id = str(event.payload.get("user_id") or "")
        return {
            "event": event.payload,
            "source": event.source,
            "dry_run": dry_run,
            "global": self.global_variables,
            "viewer": self.viewer_variables[viewer_id] if viewer_id else {},
            "local": {},
        }
