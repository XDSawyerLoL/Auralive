from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class RunMode(str, Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"


class FailurePolicy(str, Enum):
    STOP = "stop"
    CONTINUE = "continue"
    ROLLBACK = "rollback"


@dataclass(slots=True)
class Event:
    type: str
    payload: dict[str, Any]
    source: str = "internal"


@dataclass(slots=True)
class ConditionSpec:
    type: str
    config: dict[str, Any] = field(default_factory=dict)
    negate: bool = False


@dataclass(slots=True)
class ActionSpec:
    type: str
    config: dict[str, Any] = field(default_factory=dict)
    timeout_seconds: float = 30.0
    failure_policy: FailurePolicy = FailurePolicy.STOP


@dataclass(slots=True)
class Automation:
    id: str
    name: str
    trigger: str
    actions: list[ActionSpec]
    conditions: list[ConditionSpec] = field(default_factory=list)
    enabled: bool = True
    priority: int = 100
    run_mode: RunMode = RunMode.SEQUENTIAL
    queue_key: str | None = None


@dataclass(slots=True)
class ExecutionStep:
    action_type: str
    ok: bool
    output: Any = None
    error: str | None = None


@dataclass(slots=True)
class ExecutionReport:
    automation_id: str
    event_type: str
    ok: bool
    skipped: bool = False
    steps: list[ExecutionStep] = field(default_factory=list)
    variables: dict[str, Any] = field(default_factory=dict)
