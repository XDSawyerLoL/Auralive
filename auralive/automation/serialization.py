from __future__ import annotations

from dataclasses import asdict, is_dataclass
from enum import Enum
from pathlib import Path
from typing import Any

from .models import (
    ActionSpec,
    Automation,
    ConditionMode,
    ConditionSpec,
    ExecutionReport,
    FailurePolicy,
    RunMode,
)


def jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Path):
        return str(value)
    if is_dataclass(value):
        return jsonable(asdict(value))
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(item) for item in value]
    return str(value)


def automation_to_dict(automation: Automation) -> dict[str, Any]:
    return jsonable(automation)


def automation_from_dict(data: dict[str, Any]) -> Automation:
    actions = [
        ActionSpec(
            type=str(item["type"]),
            config=dict(item.get("config", {})),
            timeout_seconds=float(item.get("timeout_seconds", 30.0)),
            failure_policy=FailurePolicy(item.get("failure_policy", FailurePolicy.STOP.value)),
            enabled=bool(item.get("enabled", True)),
            retries=int(item.get("retries", 0)),
            retry_delay_seconds=float(item.get("retry_delay_seconds", 0.0)),
            save_as=item.get("save_as"),
            id=str(item.get("id") or ""),
        )
        for item in data.get("actions", [])
    ]
    for action in actions:
        if not action.id:
            action.id = ActionSpec(type=action.type).id

    conditions = [
        ConditionSpec(
            type=str(item["type"]),
            config=dict(item.get("config", {})),
            negate=bool(item.get("negate", False)),
            enabled=bool(item.get("enabled", True)),
        )
        for item in data.get("conditions", [])
    ]
    return Automation(
        id=str(data["id"]),
        name=str(data["name"]),
        trigger=str(data["trigger"]),
        actions=actions,
        conditions=conditions,
        enabled=bool(data.get("enabled", True)),
        priority=int(data.get("priority", 100)),
        run_mode=RunMode(data.get("run_mode", RunMode.SEQUENTIAL.value)),
        queue_key=data.get("queue_key"),
        condition_mode=ConditionMode(data.get("condition_mode", ConditionMode.ALL.value)),
        cooldown_seconds=float(data.get("cooldown_seconds", 0.0)),
        cooldown_scope=str(data.get("cooldown_scope", "global")),
        max_concurrency=int(data.get("max_concurrency", 1)),
        tags=[str(item) for item in data.get("tags", [])],
        description=str(data.get("description", "")),
        version=int(data.get("version", 1)),
    )


def report_to_dict(report: ExecutionReport) -> dict[str, Any]:
    return jsonable(report)
