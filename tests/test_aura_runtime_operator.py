from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace

import pytest

from aura_runtime.operator import RuntimeOperator


class FakeAI:
    enabled = True

    async def generate(self, prompt, system_instruction='', max_tokens=700, **kwargs):
        return '{"summary":"inspect","actions":[{"type":"system.info"}]}'


def settings(tmp_path: Path):
    return SimpleNamespace(
        aura_runtime_operator_roots=[tmp_path],
        aura_runtime_operator_allowed_risks={
            "safe", "ai", "network", "local-write", "process", "local-control"
        },
        aura_runtime_operator_commands={"python", "python3"},
        aura_runtime_operator_domains=set(),
        aura_runtime_operator_max_file_bytes=200_000,
        aura_runtime_operator_process_timeout_seconds=10,
        aura_runtime_operator_http_timeout_seconds=10,
    )


@pytest.mark.asyncio
async def test_runtime_operator_executes_typed_safe_plan(tmp_path):
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    result = await operator.operate("Inspecte la machine", requested_risks={"safe"})
    assert result["executed"] is True
    assert result["status"] == "completed"
    assert result["steps"][0]["type"] == "system.info"


def test_runtime_operator_blocks_workspace_escape(tmp_path):
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    with pytest.raises(PermissionError, match="hors workspace"):
        operator._resolve_path("../outside.txt")


@pytest.mark.asyncio
async def test_runtime_operator_rejects_non_allowlisted_process_without_shell(tmp_path):
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    result = await operator.operate(
        '{"summary":"bad","actions":[{"type":"process.run","command":"bash","args":["-c","echo hacked"],"cwd":"."}]}',
        requested_risks={"process"},
    )
    assert result["executed"] is False
    assert result["status"] == "error"
    assert "hors allowlist" in result["error"]


@pytest.mark.asyncio
async def test_runtime_operator_rolls_back_file_when_later_step_fails(tmp_path):
    target = tmp_path / "config.txt"
    target.write_text("before", encoding="utf-8")
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    task = (
        '{"summary":"transaction","actions":['
        '{"type":"fs.write","path":"config.txt","content":"after"},'
        '{"type":"process.run","command":"bash","args":["-c","false"],"cwd":"."}'
        ']}'
    )
    result = await operator.operate(
        task,
        requested_risks={"local-write", "process"},
    )
    assert result["executed"] is False
    assert target.read_text(encoding="utf-8") == "before"
    assert result["rollback"]
    assert result["rollback"][0]["ok"] is True


def test_runtime_operator_child_environment_does_not_forward_aura_secrets(monkeypatch, tmp_path):
    monkeypatch.setenv("AURA_CLOUD_TOKEN", "secret-cloud-token")
    monkeypatch.setenv("OPENAI_API_KEY", "secret-api-key")
    monkeypatch.setenv("PATH", os.environ.get("PATH", ""))
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    child = operator._safe_env()
    assert "AURA_CLOUD_TOKEN" not in child
    assert "OPENAI_API_KEY" not in child
    assert "PATH" in child


def test_runtime_operator_capabilities_are_typed_and_risk_labeled(tmp_path):
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    rows = {row["name"]: row for row in operator.capabilities()}
    assert rows["fs.read"]["risk"] == "safe"
    assert rows["fs.write"]["risk"] == "local-write"
    assert rows["process.run"]["risk"] == "process"
    assert rows["http.get"]["risk"] == "network"
