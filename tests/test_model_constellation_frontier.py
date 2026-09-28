import asyncio
from types import SimpleNamespace

from aura_runtime.model_constellation import CATALOG, ModelConstellation


def profile(key: str):
    return next(item for item in CATALOG if item.key == key)


def test_abliterated_qwen_is_bounded_to_divergent_roles():
    item = profile("qwen3.5-9b-abliterated")
    assert item.license == "Apache-2.0"
    assert "redteam-only" in item.tags
    assert "no-autonomous-actions" in item.tags
    assert item.roles["redteam"] == 1.0
    assert item.roles["general"] < 0.25
    assert ModelConstellation.profile_for("lukey03/Qwen3.5-9B-abliterated") is item


def test_kimi_k3_is_registered_as_frontier_remote_profile():
    item = profile("kimi-k3")
    assert item.family == "kimi"
    assert item.legal_class == "custom-license"
    assert item.roles["vision"] == 1.0
    assert item.roles["long-context"] == 1.0
    assert item.min_ram_gb >= 1024
    assert "remote-frontier" in item.tags
    assert ModelConstellation.profile_for("moonshotai/Kimi-K3") is item


def test_abliterated_model_is_not_selected_for_tool_authority():
    settings = SimpleNamespace(
        ai_mode="off",
        ai_fast_model="qwen3:8b",
        ai_model="qwen3:8b",
        ai_constellation_scorecard_file=None,
        ai_constellation_exploration=0.0,
    )
    router = ModelConstellation(settings)
    router.installed = [
        {
            "name": "lukey03/Qwen3.5-9B-abliterated",
            "size": 10 * 1024**3,
            "profile": "qwen3.5-9b-abliterated",
            "family": "qwen-abliterated",
            "license": "Apache-2.0",
            "legal_class": "permissive",
            "roles": dict(profile("qwen3.5-9b-abliterated").roles),
            "tags": list(profile("qwen3.5-9b-abliterated").tags),
        }
    ]

    tool_route = asyncio.run(router.choose("tools"))
    redteam_route = asyncio.run(router.choose("redteam"))

    assert tool_route["name"] != "lukey03/Qwen3.5-9B-abliterated"
    assert redteam_route["name"] == "lukey03/Qwen3.5-9B-abliterated"
