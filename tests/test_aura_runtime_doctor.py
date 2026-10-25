from __future__ import annotations

from aura_runtime.doctor import inspect_environment


def test_missing_token_blocks_runtime_but_no_secret_is_exposed():
    report = inspect_environment({"AURA_CLOUD_BASE_URL": "https://aura.example"})
    assert report["bridge_token_configured"] is False
    assert report["ready_for_bridge_start"] is False
    assert "AURA_BRIDGE_TOKEN non configuré" in report["blockers"]
    assert report["requests_sent"] == 0 and report["model_calls"] == 0


def test_valid_bridge_token_is_not_in_report():
    secret = "never-output-secret-123"
    report = inspect_environment({
        "AURA_CLOUD_BASE_URL": "https://aura.example",
        "AURA_BRIDGE_TOKEN": secret,
    })
    assert report["bridge_token_configured"] is True
    assert secret not in str(report)


def test_unsafe_cloud_url_is_refused_before_network():
    for url in (
        "http://aura.example", "https://user:password@aura.example",
        "https://aura.example/?token=x",
    ):
        report = inspect_environment({
            "AURA_CLOUD_BASE_URL": url,
            "AURA_BRIDGE_TOKEN": "placeholder",
        })
        assert report["cloud_base_url_valid"] is False
