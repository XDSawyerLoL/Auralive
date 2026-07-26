from __future__ import annotations

import asyncio
from types import SimpleNamespace

from app.services.voice_realtime import VoiceRealtimeService


class FakeAI:
    async def reply(self, *_args, **_kwargs):
        return "Oui, je t'entends parfaitement."


class FakeMemory:
    async def context(self, _viewer):
        return ""

    async def conversation(self, _user_id, limit=12):
        return []

    async def remember_turn(self, *_args):
        return None


class FakeOverlay:
    def __init__(self, audio):
        self.audio = audio

    def count(self, _target):
        return 1

    async def emit(self, _event, *, target=None):
        assert target == "avatar"
        self.audio.generated_count += 1
        self.audio.last_engine = "gemini-tts"
        self.audio.last_audio_duration_ms = 1200


class FakeDB:
    async def get_viewer(self, *, user_id):
        assert user_id == "voice-broadcaster"
        return None

    async def upsert_viewer(self, user_id, _login, _display_name):
        return {"user_id": user_id}


class FakeVoiceInput:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.last_transcript = ""
        self.last_answer = ""
        self.last_error = ""
        self.last_stage = "idle"
        self.last_latency_ms = 0
        self.last_wake_detected = False
        self.last_voice_delivered = False
        self.last_voice_error = ""
        self.request_count = 0
        self.ignored_count = 0


def build_service():
    audio = SimpleNamespace(
        generated_count=0,
        last_engine="",
        last_error="",
        last_audio_duration_ms=0,
    )
    aura = SimpleNamespace(
        ai=FakeAI(),
        memory=FakeMemory(),
        recent_chat=[],
        avatar_audio=audio,
    )
    aura.overlay = FakeOverlay(audio)

    async def say(_text):
        return {"is_sent": True}

    aura.say = say
    voice_input = FakeVoiceInput()
    return VoiceRealtimeService(aura, FakeDB(), voice_input), voice_input


def test_browser_transcript_produces_answer_then_voice() -> None:
    async def scenario() -> None:
        service, voice_input = build_service()
        result = await service.talk_text("Mairaiy, est-ce que tu m'entends ?")

        assert result["answer"] == "Oui, je t'entends parfaitement."
        assert result["voice_pending"] is True
        assert service.voice_task is not None
        await service.voice_task

        diagnostic = service.diagnostic()
        assert diagnostic["last_voice_delivered"] is True
        assert diagnostic["last_audio_duration_ms"] == 1200
        assert diagnostic["last_rearm_after_ms"] >= 2700
        assert diagnostic["stage"] == "idle"
        assert voice_input.last_voice_delivered is True

    asyncio.run(scenario())


def test_sentence_without_wake_word_is_ignored() -> None:
    async def scenario() -> None:
        service, _voice_input = build_service()
        result = await service.talk_text("Je parle simplement au chat")

        assert result["ignored"] is True
        assert result["ignore_reason"] == "wake_word_missing"
        assert service.voice_task is None

    asyncio.run(scenario())
