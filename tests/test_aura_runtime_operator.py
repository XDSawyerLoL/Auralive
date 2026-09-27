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
        aura_runtime_deep_web_enabled=True,
        aura_runtime_deep_web_max_chars=60_000,
        aura_runtime_browser_enabled=False,
        aura_runtime_browser_max_steps=5,
        ai_model="qwen3:8b",
        aura_runtime_ollama_url="http://127.0.0.1:11434",
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


def test_browser_capability_is_disabled_by_default(tmp_path, monkeypatch):
    config = settings(tmp_path)
    operator = RuntimeOperator(FakeAI(), config)
    monkeypatch.setattr(
        operator.open_capabilities,
        "_installed",
        lambda module: module == "browser_use",
    )
    rows = {row["name"]: row for row in operator.capabilities()}
    assert "browser.task" not in rows


@pytest.mark.asyncio
async def test_deep_web_capability_uses_runtime_network_gate(tmp_path, monkeypatch):
    config = settings(tmp_path)
    operator = RuntimeOperator(FakeAI(), config)
    monkeypatch.setattr(
        operator.open_capabilities,
        "_installed",
        lambda module: module == "crawl4ai",
    )

    checked = []

    async def fake_safe_url(url):
        checked.append(url)
        return url

    async def fake_deep_read(url, *, query=""):
        return {
            "ok": True,
            "engine": "crawl4ai",
            "url": url,
            "query": query,
            "content": "page dynamique",
            "chars": 15,
            "read_only": True,
        }

    monkeypatch.setattr(operator, "_safe_public_url", fake_safe_url)
    monkeypatch.setattr(operator.open_capabilities, "deep_read", fake_deep_read)
    result = await operator.operate(
        '{"summary":"read","actions":[{"type":"web.deep_read","url":"https://example.com","query":"test"}]}',
        requested_risks={"network"},
    )

    assert result["executed"] is True
    assert result["steps"][0]["engine"] == "crawl4ai"
    assert result["steps"][0]["read_only"] is True
    assert checked == ["https://example.com"]


@pytest.mark.asyncio
async def test_browser_task_requires_explicit_browser_control_risk(tmp_path, monkeypatch):
    config = settings(tmp_path)
    config.aura_runtime_browser_enabled = True
    operator = RuntimeOperator(FakeAI(), config)
    monkeypatch.setattr(
        operator.open_capabilities,
        "_installed",
        lambda module: module == "browser_use",
    )

    result = await operator.operate(
        '{"summary":"browse","actions":[{"type":"browser.task","task":"Inspecte GitHub"}]}',
        requested_risks={"browser-control"},
    )

    assert result["executed"] is False
    assert "browser-control" in result["error"]
