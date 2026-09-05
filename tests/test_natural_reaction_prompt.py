from __future__ import annotations

import json
from pathlib import Path

from app.core.identity import AuraIdentity
from app.services.voice_realtime import _PRIVATE_VOICE_CONTEXT


ROOT = Path(__file__).resolve().parents[1]
IDENTITY_PATH = ROOT / "config" / "aura_identity.json"
ENV_EXAMPLE = ROOT / ".env.example"


def test_global_identity_forbids_invented_production_tasks() -> None:
    data = json.loads(IDENTITY_PATH.read_text(encoding="utf-8"))
    rules = "\n".join(data.get("rules") or []).casefold()

    assert data["name"] == "Mairaiy"
    assert "une remarque simple n'est pas une mission" in rules
    assert "montage" in rules
    assert "titre de live" in rules
    assert "si personne ne te l'a demandé" in rules
    assert "je m'y mets" in rules
    assert "travaillé pendant son absence" in rules


def test_system_prompt_contains_natural_reaction_guardrails() -> None:
    prompt = AuraIdentity(IDENTITY_PATH).system_prompt.casefold()

    assert "une remarque simple n'est pas une mission" in prompt
    assert "ne propose jamais spontanément un montage" in prompt
    assert "sobriété quand une simple réaction suffit" in prompt


def test_private_voice_prompt_is_stricter_than_public_cohost_prompt() -> None:
    prompt = _PRIVATE_VOICE_CONTEXT.casefold()

    assert "directement et uniquement avec sansa" in prompt
    assert "ne transforme jamais une remarque en mission" in prompt
    assert "titre de live" in prompt
    assert "montage" in prompt
    assert "une ou deux phrases naturelles" in prompt
    assert "je et tu" in prompt


def test_default_local_model_prefers_quality_over_auto_fast_model() -> None:
    env = ENV_EXAMPLE.read_text(encoding="utf-8")

    assert "AI_MODEL=gemma3:12b" in env
    assert "AI_AUTO_FAST_MODEL=false" in env
