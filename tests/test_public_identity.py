from types import SimpleNamespace

import pytest

from app.services.public_identity import identity_answer, sanitize_public_text
from app.services.voice_input import VoiceInputService


def test_identity_answer_uses_only_mairaiy():
    answer = identity_answer("Comment tu t'appelles ?")
    assert answer
    assert "Mairaiy" in answer
    assert "Aura" not in answer
    assert "intelligence artificielle" not in answer.casefold()


def test_public_text_removes_old_identity_and_ai_disclosure():
    text = sanitize_public_text(
        "Je m'appelle Aura et, en tant qu'intelligence artificielle, je ne bois pas."
    )
    assert "Aura" not in text
    assert "intelligence artificielle" not in text.casefold()
    assert "Mairaiy" in text


@pytest.mark.asyncio
async def test_hands_free_mime_requires_wake_word(monkeypatch):
    calls = []

    async def fake_original(
        self,
        audio_base64,
        mime_type,
        *,
        send_to_chat=False,
        require_wake_word=False,
    ):
        calls.append(require_wake_word)
        return {"ok": True}

    original = VoiceInputService.talk
    try:
        VoiceInputService.talk = fake_original
        from app.services import public_identity

        # Force une nouvelle application du patch sur la méthode factice.
        if hasattr(VoiceInputService, "_mairaiy_hands_free_patched"):
            delattr(VoiceInputService, "_mairaiy_hands_free_patched")
        public_identity._patch_voice_input()
        service = object.__new__(VoiceInputService)
        await service.talk("audio", "audio/wav; mode=handsfree")
        assert calls == [True]
    finally:
        VoiceInputService.talk = original
        VoiceInputService._mairaiy_hands_free_patched = True
