from __future__ import annotations

import asyncio
import copy
import inspect
import re
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from typing import Any

from .models import (
    Automation,
    ConditionMode,
    Event,
    ExecutionReport,
    ExecutionStatus,
    ExecutionStep,
    FailurePolicy,
    RunMode,
    utc_now_iso,
)
from .registry import AutomationRegistry

ReportListener = Callable[[ExecutionReport], Awaitable[None] | None]
_TEMPLATE = re.compile(r"\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}")


class AutomationEngine:
    def __init__(
        self,
        registry: AutomationRegistry,
        *,
        history_limit: int = 500,
        services: dict[str, Any] | None = None,
    ) -> None:
        self.registry = registry
        self.automations: dict[str, Automation] = {}
        self._queues: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._semaphores: dict[str, asyncio.Semaphore] = {}
        self._cooldowns: dict[str, float] = {}
        self.global_variables: dict[str, Any] = {}
        self.viewer_variables: dict[str, dict[str, Any]] = defaultdict(dict)
        self.history: deque[ExecutionReport] = deque(maxlen=history_limit)
        self.listeners: list[ReportListener] = []
        self.services: dict[str, Any] = services or {}
        self.services.setdefault("dispatch", self.dispatch)

    def set_service(self, name: str, service: Any) -> None:
        self.services[name] = service

    def upsert(self, automation: Automation) -> None:
        if automation.max_concurrency < 1:
            raise ValueError("max_concurrency doit être supérieur ou égal à 1")
        self.automations[automation.id] = automation
        self._semaphores[automation.id] = asyncio.Semaphore(automation.max_concurrency)

    def remove(self, automation_id: str) -> None:
        self.automations.pop(automation_id, None)
        self._semaphores.pop(automation_id, None)

    def add_listener(self, listener: ReportListener) -> None:
        self.listeners.append(listener)

    async def dispatch(self, event: Event) -> list[ExecutionReport]:
        matches = sorted(
            (
                automation
                for automation in self.automations.values()
                if automation.enabled and self._trigger_matches(automation.trigger, event.type)
            ),
            key=lambda automation: automation.priority,
        )
        if not matches:
            return []
        return await asyncio.gather(*(self._run_queued(item, event) for item in matches))

    async def simulate(self, automation_id: str, event: Event) -> ExecutionReport:
        automation = self.automations[automation_id]
        return await self._run(automation, event, dry_run=True)

    async def _run_queued(self, automation: Automation, event: Event) -> ExecutionReport:
        cooldown_reason = self._cooldown_reason(automation, event)
        if cooldown_reason:
            report = self._new_report(automation, event)
            report.ok = True
            report.skipped = True
            report.status = ExecutionStatus.SKIPPED
            report.reason = cooldown_reason
            await self._finish_report(report, time.perf_counter())
            return report

        semaphore = self._semaphores.setdefault(
            automation.id, asyncio.Semaphore(automation.max_concurrency)
        )
        async with semaphore:
            if automation.queue_key:
                async with self._queues[self._render_queue_key(automation.queue_key, event)]:
                    return await self._run(automation, event)
            return await self._run(automation, event)

    async def _run(
        self, automation: Automation, event: Event, *, dry_run: bool = False
    ) -> ExecutionReport:
        started = time.perf_counter()
        report = self._new_report(automation, event)
        context = self._build_context(event, dry_run=dry_run)
        report.variables = context

        conditions_ok, condition_error = await self._evaluate_conditions(automation, event, context)
        if condition_error:
            report.ok = False
            report.status = ExecutionStatus.FAILED
            report.reason = condition_error
            report.steps.append(ExecutionStep("condition", False, error=condition_error))
            await self._finish_report(report, started)
            return report
        if not conditions_ok:
            report.ok = True
            report.skipped = True
            report.status = ExecutionStatus.SKIPPED
            report.reason = "Conditions non remplies"
            await self._finish_report(report, started)
            return report

        actions = [action for action in automation.actions if action.enabled]
        if dry_run:
            report.steps = [
                ExecutionStep(
                    action.type,
                    True,
                    output={"simulation": True, "config": self._resolve(action.config, context)},
                    action_id=action.id,
                    finished_at=utc_now_iso(),
                )
                for action in actions
            ]
            report.ok = True
            report.status = ExecutionStatus.SUCCEEDED
            await self._finish_report(report, started, persist=False)
            return report

        self._touch_cooldown(automation, event)
        if automation.run_mode == RunMode.PARALLEL:
            report.steps = list(
                await asyncio.gather(
                    *(self._execute_action(action, event, context) for action in actions)
                )
            )
            report.ok = all(step.ok for step in report.steps)
        else:
            completed: list[tuple[Any, ExecutionStep]] = []
            for action in actions:
                step = await self._execute_action(action, event, context)
                report.steps.append(step)
                if step.ok:
                    completed.append((action, step))
                    continue
                if action.failure_policy == FailurePolicy.ROLLBACK:
                    await self._rollback(completed, event, context)
                    for _, completed_step in completed:
                        completed_step.rolled_back = True
                    break
                if action.failure_policy == FailurePolicy.STOP:
                    break
            report.ok = all(step.ok for step in report.steps)

        report.status = ExecutionStatus.SUCCEEDED if report.ok else ExecutionStatus.FAILED
        await self._finish_report(report, started)
        return report

    async def _evaluate_conditions(
        self, automation: Automation, event: Event, context: dict[str, Any]
    ) -> tuple[bool, str | None]:
        enabled = [item for item in automation.conditions if item.enabled]
        if not enabled:
            return True, None
        results: list[bool] = []
        for condition in enabled:
            handler = self.registry.conditions.get(condition.type)
            if handler is None:
                return False, f"Condition inconnue : {condition.type}"
            try:
                config = self._resolve(condition.config, context)
                result = bool(await handler(config, event, context))
            except Exception as exc:  # noqa: BLE001
                return False, f"Condition {condition.type} en erreur : {exc}"
            results.append(not result if condition.negate else result)
        if automation.condition_mode == ConditionMode.ANY:
            return any(results), None
        return all(results), None

    async def _execute_action(
        self, action: Any, event: Event, context: dict[str, Any]
    ) -> ExecutionStep:
        handler = self.registry.actions.get(action.type)
        if handler is None:
            return ExecutionStep(
                action.type,
                False,
                error=f"Action inconnue : {action.type}",
                action_id=action.id,
                finished_at=utc_now_iso(),
            )

        started = time.perf_counter()
        attempts = max(1, int(action.retries) + 1)
        last_error: str | None = None
        for attempt in range(1, attempts + 1):
            try:
                config = self._resolve(action.config, context)
                output = await asyncio.wait_for(
                    handler(config, event, context), timeout=action.timeout_seconds
                )
                if action.save_as:
                    context["local"][action.save_as] = output
                return ExecutionStep(
                    action.type,
                    True,
                    output=output,
                    action_id=action.id,
                    attempts=attempt,
                    finished_at=utc_now_iso(),
                    duration_ms=round((time.perf_counter() - started) * 1000, 3),
                )
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                if attempt < attempts and action.retry_delay_seconds > 0:
                    await asyncio.sleep(action.retry_delay_seconds)
        return ExecutionStep(
            action.type,
            False,
            error=last_error or "Erreur inconnue",
            action_id=action.id,
            attempts=attempts,
            finished_at=utc_now_iso(),
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
        )

    async def _rollback(
        self,
        completed: list[tuple[Any, ExecutionStep]],
        event: Event,
        context: dict[str, Any],
    ) -> None:
        for action, step in reversed(completed):
            definition = self.registry.action_definitions.get(action.type)
            if definition is None or definition.rollback is None:
                continue
            try:
                await definition.rollback(step.output, action.config, event, context)
            except Exception:  # noqa: BLE001
                continue

    def _build_context(self, event: Event, *, dry_run: bool) -> dict[str, Any]:
        viewer_id = str(event.payload.get("user_id") or "")
        global_values = copy.deepcopy(self.global_variables) if dry_run else self.global_variables
        viewer_values = (
            copy.deepcopy(self.viewer_variables[viewer_id])
            if dry_run and viewer_id
            else self.viewer_variables[viewer_id] if viewer_id else {}
        )
        return {
            "event": event.payload,
            "event_meta": {
                "id": event.id,
                "type": event.type,
                "source": event.source,
                "occurred_at": event.occurred_at,
            },
            "source": event.source,
            "dry_run": dry_run,
            "global": global_values,
            "viewer": viewer_values,
            "local": {},
            "services": self.services,
        }

    def _resolve(self, value: Any, context: dict[str, Any]) -> Any:
        if isinstance(value, dict):
            return {key: self._resolve(item, context) for key, item in value.items()}
        if isinstance(value, list):
            return [self._resolve(item, context) for item in value]
        if not isinstance(value, str):
            return value

        full_match = _TEMPLATE.fullmatch(value)
        if full_match:
            return self._lookup(full_match.group(1), context)

        def replace(match: re.Match[str]) -> str:
            resolved = self._lookup(match.group(1), context)
            return "" if resolved is None else str(resolved)

        return _TEMPLATE.sub(replace, value)

    @staticmethod
    def _lookup(path: str, context: dict[str, Any]) -> Any:
        current: Any = context
        for part in path.split("."):
            if isinstance(current, dict):
                current = current.get(part)
            else:
                current = getattr(current, part, None)
            if current is None:
                return None
        return current

    @staticmethod
    def _trigger_matches(pattern: str, event_type: str) -> bool:
        if pattern == "*":
            return True
        if pattern.endswith(".*"):
            return event_type.startswith(pattern[:-1])
        return pattern == event_type

    def _cooldown_key(self, automation: Automation, event: Event) -> str:
        if automation.cooldown_scope == "viewer":
            viewer_id = str(event.payload.get("user_id") or event.payload.get("user_name") or "")
            return f"{automation.id}:viewer:{viewer_id}"
        return f"{automation.id}:global"

    def _cooldown_reason(self, automation: Automation, event: Event) -> str | None:
        if automation.cooldown_seconds <= 0:
            return None
        remaining = self._cooldowns.get(self._cooldown_key(automation, event), 0.0) - time.monotonic()
        if remaining > 0:
            return f"Cooldown actif ({remaining:.1f} s restantes)"
        return None

    def _touch_cooldown(self, automation: Automation, event: Event) -> None:
        if automation.cooldown_seconds > 0:
            self._cooldowns[self._cooldown_key(automation, event)] = (
                time.monotonic() + automation.cooldown_seconds
            )

    def _render_queue_key(self, queue_key: str, event: Event) -> str:
        context = self._build_context(event, dry_run=True)
        resolved = self._resolve(queue_key, context)
        return str(resolved or queue_key)

    @staticmethod
    def _new_report(automation: Automation, event: Event) -> ExecutionReport:
        return ExecutionReport(
            automation_id=automation.id,
            event_type=event.type,
            event_id=event.id,
            ok=False,
            status=ExecutionStatus.RUNNING,
        )

    @staticmethod
    def _snapshot_context(context: dict[str, Any]) -> dict[str, Any]:
        snapshot = {key: value for key, value in context.items() if key != "services"}
        snapshot["services"] = {
            name: service is not None
            for name, service in context.get("services", {}).items()
            if name != "dispatch"
        }
        return copy.deepcopy(snapshot)

    async def _finish_report(
        self, report: ExecutionReport, started: float, *, persist: bool = True
    ) -> None:
        report.finished_at = utc_now_iso()
        report.duration_ms = round((time.perf_counter() - started) * 1000, 3)
        report.variables = self._snapshot_context(report.variables)
        if persist:
            self.history.append(report)
        for listener in self.listeners:
            result = listener(report)
            if inspect.isawaitable(result):
                await result
