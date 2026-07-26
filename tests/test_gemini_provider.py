from types import SimpleNamespace

from app.services.gemini_provider import (
    _convert_messages,
    _effective_base_url,
    _effective_model,
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
