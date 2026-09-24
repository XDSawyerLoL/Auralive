from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.model_constellation import ModelConstellation


def settings():
    return SimpleNamespace(
        ai_mode="ollama",
        ai_base_url="http://127.0.0.1:11434",
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
