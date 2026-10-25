from __future__ import annotations

import pytest

from aura_runtime.browser_audit import audit_target_url, grade_navigation
from aura_runtime.operator import RuntimeOperator
from test_aura_runtime_operator import FakeAI, settings


def test_browser_audit_only_allows_bounded_public_swapp_urls():
    assert audit_target_url("https://swapp.tv/actus") == "https://swapp.tv/actus"
    for value in (
        "http://swapp.tv/", "https://evil.example/", "https://swapp.tv.evil.com/",
        "https://swapp.tv/account", "https://swapp.tv/?token=x",
        "https://user:pass@swapp.tv/", "https://swapp.tv:8080/",
        "https://swapp.tv/../../../secrets",
    ):
        with pytest.raises(PermissionError):
            audit_target_url(value)


def test_browser_audit_requires_http_title_body_unchanged_route_and_sha256():
    candidate = dict(
        requested_path="/actus", final_url="https://swapp.tv/actus", status=200,
        title="Actualités SWAPP", body_visible=True,
        screenshot_digest="a" * 64, page_errors=[],
    )
    assert grade_navigation(**candidate)["ok"]
    for field, value in (
        ("status", 500), ("final_url", "https://swapp.tv/"),
        ("title", ""), ("body_visible", False),
        ("screenshot_digest", ""), ("page_errors", ["Uncaught error"]),
    ):
        assert not grade_navigation(**(candidate | {field: value}))["ok"]


@pytest.mark.asyncio
async def test_runtime_operator_runs_browser_audit_without_an_llm(monkeypatch, tmp_path):
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    monkeypatch.setattr(operator.open_capabilities, "_installed", lambda name: name == "playwright")
    calls = []

    async def fake_audit(routes, *, network_validator, artifacts_dir, browser_engine):
        calls.append((routes, artifacts_dir, browser_engine, network_validator))
        return {
            "ok": True, "executed": True, "status": "completed",
            "checks_passed": 2, "checks_total": 2, "checks": [{"screenshot_sha256": "a" * 64}],
        }

    monkeypatch.setattr("aura_runtime.browser_audit.audit_public_pages", fake_audit)
    result = await operator.operate(
        '{"summary":"Audit public","actions":[{"type":"browser.audit","routes":["/"]}]}',
        requested_risks={"browser-control"},
    )
    assert result["executed"] is True and result["status"] == "completed"
    assert result["steps"][0]["checks_passed"] == 2
    assert calls[0][0] == ["/"]
    assert calls[0][1] == (tmp_path / "aura-browser-audits").resolve()
    assert calls[0][2] == "chromium"
    assert callable(calls[0][3])


@pytest.mark.asyncio
async def test_failed_browser_audit_is_not_declared_successful(monkeypatch, tmp_path):
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    monkeypatch.setattr(operator.open_capabilities, "_installed", lambda name: name == "playwright")

    async def fake_audit(routes, *, network_validator, artifacts_dir, browser_engine):
        return {
            "ok": False, "executed": True, "status": "failed",
            "checks_passed": 1, "checks_total": 2, "checks": [{"ok": False}],
        }

    monkeypatch.setattr("aura_runtime.browser_audit.audit_public_pages", fake_audit)
    result = await operator.operate(
        '{"summary":"Audit","actions":[{"type":"browser.audit","routes":["/","/actus"]}]}',
        requested_risks={"browser-control"},
    )
    assert result["executed"] is False and result["status"] == "error"
    assert result["steps"][0]["ok"] is False
    assert "verification failed" in result["error"]


@pytest.mark.asyncio
async def test_browser_audit_requires_browser_control_permission(monkeypatch, tmp_path):
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    monkeypatch.setattr(operator.open_capabilities, "_installed", lambda name: name == "playwright")
    result = await operator.operate(
        '{"actions":[{"type":"browser.audit","routes":["/"]}]}',
        requested_risks={"network"},
    )
    assert result["executed"] is False and result["status"] == "error"
    assert "non autorisé" in result["error"]


def test_mobile_overflow_and_broken_images_are_falsifiable_failures():
    base = dict(
        requested_path="/twitch", final_url="https://swapp.tv/twitch", status=200,
        title="Live SWAPP", body_visible=True, screenshot_digest="b" * 64,
        page_errors=[],
    )
    assert grade_navigation(**base)["ok"]
    assert "debordement-horizontal" in grade_navigation(**base, horizontal_overflow_px=24)["problems"]
    assert "images-cassees" in grade_navigation(**base, broken_images=2)["problems"]
    assert grade_navigation(**base, horizontal_overflow_px=4)["ok"]


def test_empty_js_shell_is_not_considered_a_rendered_page():
    base = dict(
        requested_path="/", final_url="https://swapp.tv/", status=200,
        title="SWAPP", body_visible=True, screenshot_digest="a" * 64, page_errors=[],
    )
    result = grade_navigation(**base, visible_text_chars=0)
    assert result["ok"] is False
    assert "interface-vide-ou-non-hydratee" in result["problems"]
    assert grade_navigation(**base, visible_text_chars=120)["ok"] is True

def test_local_file_navigation_is_refused_by_swapp_audit():
    with pytest.raises(PermissionError):
        audit_target_url("file:///C:/Users/test/secrets.txt")
