from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.model_constellation import ModelConstellation


def settings(mode="ollama", base_url="http://127.0.0.1:11434"):
    return SimpleNamespace(
        ai_mode=mode,
        ai_base_url=base_url,
        ai_fast_model="",
        ai_model="gemma3:12b",
    )


def test_constellation_knows_permissive_and_community_licenses():
    router = ModelConstellation(settings())
    assert router.profile_for("gpt-oss:20b").legal_class == "permissive"
    assert router.profile_for("dolphin-mistral:7b").legal_class == "permissive"
    assert router.profile_for("hermes3:8b").legal_class == "community-license"


def test_role_inference_routes_code_empathy_and_tools():
    router = ModelConstellation(settings())
    assert router.infer_role([{"content": "corrige ce bug Python et ajoute des tests"}]) == "code"
    assert router.infer_role([{"content": "je me sens triste et j'ai besoin d'être compris"}]) == "empathy"
    assert router.infer_role([{"content": "utilise le tool JSON pour exécuter cette action"}]) == "tools"


@pytest.mark.asyncio
async def test_installed_specialist_is_selected_without_downloading(monkeypatch):
    router = ModelConstellation(settings())
    router.installed = [
        {
            "name": "dolphin-mistral:7b",
            "size": 4_000_000_000,
            "modified_at": "",
            "profile": "dolphin-mistral",
            "family": "dolphin",
            "license": "Apache-2.0",
            "legal_class": "permissive",
            "roles": {},
            "tags": [],
        },
        {
            "name": "deepseek-r1:8b",
            "size": 5_000_000_000,
            "modified_at": "",
            "profile": "deepseek-r1",
            "family": "deepseek",
            "license": "MIT",
            "legal_class": "permissive-with-base-check",
            "roles": {},
            "tags": [],
        },
    ]

    async def no_refresh(*, force=False):
        return router.installed

    monkeypatch.setattr(router, "refresh", no_refresh)
    reasoning = await router.choose("reasoning")
    empathy = await router.choose("empathy")
    assert reasoning["name"] == "deepseek-r1:8b"
    assert empathy["name"] == "dolphin-mistral:7b"


class _JsonResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError(f"HTTP {self.status}")

    async def json(self):
        return self.payload


class _TransitionSession:
    def __init__(self):
        self.pulled = False
        self.urls = []

    def get(self, url, **kwargs):
        self.urls.append(url)
        models = [{"name": "deepseek-r1:8b", "size": 5_000_000_000}] if self.pulled else []
        return _JsonResponse({"models": models})

    def post(self, url, **kwargs):
        self.urls.append(url)
        self.pulled = True
        return _JsonResponse({"status": "success"})


@pytest.mark.asyncio
async def test_pull_can_validate_local_ollama_before_provider_switch():
    router = ModelConstellation(
        settings(mode="openai_compatible", base_url="https://provider.example/v1")
    )
    router.session = _TransitionSession()

    result = await router.pull(
        "deepseek-r1:8b",
        base_url="http://127.0.0.1:11434",
    )

    assert result["ok"] is True
    assert result["installed"] is True
    assert result["base_url"] == "http://127.0.0.1:11434"
    assert router.settings.ai_mode == "openai_compatible"
    assert all("provider.example" not in url for url in router.session.urls)


@pytest.mark.asyncio
async def test_pull_refuses_non_local_install_endpoint():
    router = ModelConstellation(settings())
    router.session = _TransitionSession()
    with pytest.raises(ValueError, match="Ollama doit être local"):
        await router.pull("deepseek-r1:8b", base_url="https://remote.example")


@pytest.mark.asyncio
async def test_choose_many_returns_distinct_ranked_specialists(monkeypatch):
    router = ModelConstellation(settings())
    router.installed = [
        router._decode_installed([{"name": "deepseek-r1:8b", "size": 5_000_000_000}])[0],
        router._decode_installed([{"name": "qwen3:8b", "size": 5_000_000_000}])[0],
        router._decode_installed([{"name": "dolphin-mistral:7b", "size": 4_000_000_000}])[0],
    ]

    async def no_refresh(*, force=False):
        return router.installed

    monkeypatch.setattr(router, "refresh", no_refresh)
    routes = await router.choose_many("reasoning", count=3)

    assert len(routes) == 3
    assert len({item["name"] for item in routes}) == 3
    assert router.last_ensemble["count"] == 3


@pytest.mark.asyncio
async def test_learned_outcomes_change_routing_between_equivalent_models(monkeypatch):
    router = ModelConstellation(settings())
    router.scorecard.exploration = 0
    router.installed = router._decode_installed([
        {"name": "qwen3:8b", "size": 5_000_000_000},
        {"name": "qwen3:14b", "size": 9_000_000_000},
    ])

    async def no_refresh(*, force=False):
        return router.installed

    monkeypatch.setattr(router, "refresh", no_refresh)
    for _ in range(8):
        router.record_outcome(
            "qwen3:8b", "code", success=False, latency_ms=15000, quality=0.2
        )
        router.record_outcome(
            "qwen3:14b", "code", success=True, latency_ms=1800, quality=0.9
        )

    route = await router.choose("code")
    assert route["name"] == "qwen3:14b"
    assert route["reason"] == "adaptive-learned-role-router"
    assert route["learned"]["calls"] == 8


def test_mesh_scorecard_contains_skill_metrics_without_user_content():
    router = ModelConstellation(settings())
    router.installed = router._decode_installed([
        {"name": "deepseek-r1:8b", "size": 5_000_000_000},
    ])
    router.record_outcome(
        "deepseek-r1:8b",
        "reasoning",
        success=True,
        latency_ms=1100,
        quality=0.9,
        source="unit-test",
    )

    payload = router.model_scorecard()
    assert payload[0]["name"] == "deepseek-r1:8b"
    assert payload[0]["roles"]["reasoning"]["samples"] == 1
    assert "prompt" not in str(payload).casefold()



def test_constellation_knows_divergent_qwen_and_frontier_kimi_profiles():
    router = ModelConstellation(settings())
    qwen = router.profile_for("lukey03/Qwen3.5-9B-abliterated")
    kimi = router.profile_for("moonshotai/Kimi-K3")

    assert qwen is not None
    assert qwen.license == "Apache-2.0"
    assert qwen.legal_class == "permissive"
    assert qwen.roles["divergent"] > qwen.roles["reasoning"]
    assert "proposal-only" in qwen.tags
    assert qwen.install_hint == ""

    assert kimi is not None
    assert kimi.legal_class == "custom-license"
    assert kimi.roles["vision"] >= 0.99
    assert kimi.roles["long_context"] >= 0.99
    assert kimi.install_hint == ""


def test_role_inference_recognizes_divergence_vision_and_long_context():
    router = ModelConstellation(settings())
    assert router.infer_role([{"content": "brainstorm des idées créatives et divergentes"}]) == "divergent"
    assert router.infer_role([{"content": "analyse cette image et sa composition visuelle"}]) == "vision"
    assert router.infer_role([{"content": "analyse ce très long document en entier"}]) == "long_context"


@pytest.mark.asyncio
async def test_curated_specialists_route_when_already_provisioned(monkeypatch):
    router = ModelConstellation(settings())
    router.installed = router._decode_installed([
        {"name": "lukey03/Qwen3.5-9B-abliterated", "size": 6_000_000_000},
        {"name": "moonshotai/Kimi-K3", "size": 0},
        {"name": "qwen3:8b", "size": 5_000_000_000},
    ])

    async def no_refresh(*, force=False):
        return router.installed

    monkeypatch.setattr(router, "refresh", no_refresh)

    divergent = await router.choose("divergent")
    vision = await router.choose("vision")
    assert divergent["name"] == "lukey03/Qwen3.5-9B-abliterated"
    assert vision["name"] == "moonshotai/Kimi-K3"
