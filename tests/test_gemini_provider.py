from types import SimpleNamespace

import pytest

from app.services.gemini_provider import (
    GeminiEmptyResponse,
    _convert_messages,
    _effective_base_url,
    _effective_model,
    _extract_text,
    _generation_config,
)


def test_gemini_replaces_local_ollama_defaults():
    settings = SimpleNamespace(
        ai_base_url="http://localhost:11434",
        ai_fast_model="",
        ai_model="gemma3:12b",
    )
    assert _effective_base_url(settings) == "https://generativelanguage.googleapis.com/v1beta"
    assert _effective_model(settings) == "gemini-3.5-flash-lite"


def test_explicit_gemini_configuration_is_preserved():
    settings = SimpleNamespace(
        ai_base_url="https://generativelanguage.googleapis.com/v1beta",
        ai_fast_model="gemini-3.6-flash",
        ai_model="gemini-3.5-flash-lite",
    )
    assert _effective_base_url(settings).endswith("/v1beta")
    assert _effective_model(settings) == "gemini-3.6-flash"


def test_openai_messages_are_converted_to_gemini_roles():
    system, contents = _convert_messages(
        [
            {"role": "system", "content": "Tu es Aura."},
            {"role": "user", "content": "Bonjour"},
            {"role": "assistant", "content": "Salut"},
            {"role": "user", "content": "Ça va ?"},
        ]
    )
    assert system == "Tu es Aura."
    assert [item["role"] for item in contents] == ["user", "model", "user"]
    assert contents[-1]["parts"][0]["text"] == "Ça va ?"


def test_gemini_short_warmup_keeps_enough_output_tokens():
    config = _generation_config(2)
    assert config["maxOutputTokens"] >= 32
    assert config["thinkingConfig"]["thinkingLevel"] == "minimal"
    assert config["thinkingConfig"]["includeThoughts"] is False


def test_extract_text_ignores_thought_parts():
    body = {
        "candidates": [
            {
                "finishReason": "STOP",
                "content": {
                    "parts": [
                        {"thought": True, "text": "raisonnement interne"},
                        {"text": "OK"},
                    ]
                },
            }
        ]
    }
    assert _extract_text(body) == "OK"


def test_empty_response_exposes_finish_reason():
    with pytest.raises(GeminiEmptyResponse, match="MAX_TOKENS"):
        _extract_text(
            {
                "candidates": [
                    {
                        "finishReason": "MAX_TOKENS",
                        "content": {"parts": []},
                    }
                ],
                "usageMetadata": {"totalTokenCount": 2},
            }
        )
