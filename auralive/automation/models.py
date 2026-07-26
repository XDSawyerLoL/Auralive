from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import uuid4


class RunMode(str, Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"


class FailurePolicy(str, Enum):
    STOP = "stop"
    CONTINUE = "continue"
    ROLLBACK = "rollback"


class ConditionMode(str, Enum):
    ALL = "all"
    ANY = "any"


class ExecutionStatus(str, Enum):
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(slots=True)
class Event:
    type: str
    payload: dict[str, Any]
    source: str = "internal"
    id: str = field(default_factory=lambda: str(uuid4()))
    occurred_at: str = field(default_factory=utc_now_iso)


@dataclass(slots=True)
class ConditionSpec:
    type: str
    config: dict[str, Any] = field(default_factory=dict)
    negate: bool = False
    enabled: bool = True


@dataclass(slots=True)
class ActionSpec:
    type: str
    config: dict[str, Any] = field(default_factory=dict)
    timeout_seconds: float = 30.0
    failure_policy: FailurePolicy = FailurePolicy.STOP
    enabled: bool = True
    retries: int = 0
    retry_delay_seconds: float = 0.0
    save_as: str | None = None
    id: str = field(default_factory=lambda: str(uuid4()))


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
    condition_mode: ConditionMode = ConditionMode.ALL
    cooldown_seconds: float = 0.0
    cooldown_scope: str = "global"
    max_concurrency: int = 1
    tags: list[str] = field(default_factory=list)
    description: str = ""
    version: int = 1


@dataclass(slots=True)
class ExecutionStep:
    action_type: str
    ok: bool
    output: Any = None
    error: str | None = None
    action_id: str | None = None
    attempts: int = 1
    started_at: str = field(default_factory=utc_now_iso)
    finished_at: str | None = None
    duration_ms: float = 0.0
    rolled_back: bool = False


@dataclass(slots=True)
class ExecutionReport:
    automation_id: str
    event_type: str
    ok: bool
    skipped: bool = False
    steps: list[ExecutionStep] = field(default_factory=list)
    variables: dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid4()))
    event_id: str | None = None
    status: ExecutionStatus = ExecutionStatus.SUCCEEDED
    reason: str | None = None
    started_at: str = field(default_factory=utc_now_iso)
    finished_at: str | None = None
    duration_ms: float = 0.0
