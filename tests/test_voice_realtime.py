from __future__ import annotations

import asyncio
from types import SimpleNamespace

from app.services.voice_realtime import VoiceRealtimeService, _compact_spoken_answer


class FakeAI:
    def __init__(self):
        self.last_message = ""
        self.last_context = ""
        self.last_recent_chat = None
        self.runtime_model = "phi4-mini"
        self.settings = SimpleNamespace(ai_mode="ollama", ai_model="gemma3:12b")

    @property
    def active_model(self):
        return self.runtime_model or self.settings.ai_model

    async def reply(self, _name, message, context, recent_chat, *_args, **_kwargs):
        self.last_message = message
        self.last_context = context
        self.last_recent_chat = recent_chat
        return "Oui, je t'entends parfaitement."


class FakeMemory:
    async def context(self, _viewer):
        return "mémoire privée utile"

    async def conversation(self, _user_id, limit=12):
        return []

    async def remember_turn(self, *_args):
        return None


class FakeOverlay:
    def __init__(self, audio, engine: str):
        self.audio = audio
        self.engine = engine

    def count(self, _target):
        return 1

    async def emit(self, _event, *, target=None):
        assert target == "avatar"
        self.audio.generated_count += 1
        self.audio.last_engine = self.engine
        self.audio.last_file = "mairaiy-test.wav"
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


def build_service(engine: str = "gemini-tts", *, with_cohost: bool = False):
    audio = SimpleNamespace(
        generated_count=0,
        last_engine="",
        last_error="",
        last_file="",
        last_audio_duration_ms=0,
    )
    ai = FakeAI()
    aura = SimpleNamespace(
        ai=ai,
        memory=FakeMemory(),
        recent_chat=["viewer: change le titre", "viewer: fais un montage"],
        avatar_audio=audio,
    )
    if with_cohost:
        async def original_reply(name, message, context, recent_chat, *_args, **_kwargs):
            assert name == "Sansa"
            ai.last_message = message
            ai.last_context = context
            ai.last_recent_chat = recent_chat
            assert ai.runtime_model == "gemma3:12b"
            return "Ça va, mais tu peux clairement faire mieux. Pas besoin d'en faire des tonnes."

        async def wrapped_reply(*_args, **_kwargs):
            raise AssertionError("Le wrapper cohost ne doit pas être utilisé en conversation privée")

        aura.cohost = SimpleNamespace(_original_ai_reply=original_reply)
        ai.reply = wrapped_reply

    aura.overlay = FakeOverlay(audio, engine)

    async def say(_text):
        return {"is_sent": True}

    aura.say = say
    voice_input = FakeVoiceInput()
    return VoiceRealtimeService(aura, FakeDB(), voice_input), voice_input, ai


def test_browser_transcript_produces_answer_then_voice() -> None:
    async def scenario() -> None:
        service, voice_input, _ai = build_service()
        result = await service.talk_text("Est-ce que tu m'entends ?")

        assert result["answer"] == "Oui, je t'entends parfaitement."
        assert result["voice_pending"] is True
        assert result["wake_word_required"] is False
        assert result["addressed_automatically"] is True
        assert result["response_model"] == "gemma3:12b"
        assert service.voice_task is not None
        await service.voice_task

        diagnostic = service.diagnostic()
        assert diagnostic["last_voice_delivered"] is True
        assert diagnostic["last_voice_engine"] == "gemini-tts"
        assert diagnostic["last_audio_url"] == "/media/tts/mairaiy-test.wav"
        assert diagnostic["last_audio_duration_ms"] == 1200
        assert diagnostic["last_rearm_after_ms"] >= 2700
        assert diagnostic["stage"] == "idle"
        assert diagnostic["wake_word_required"] is False
        assert diagnostic["wake_word"] is None
        assert voice_input.last_voice_delivered is True

    asyncio.run(scenario())


def test_private_voice_bypasses_cohost_chat_pollution_and_uses_quality_model() -> None:
    async def scenario() -> None:
        service, _voice_input, ai = build_service(with_cohost=True)
        result = await service.talk_text("C'est pas si mal, mais y a du travail.")

        assert result["answer"] == "Ça va, mais tu peux clairement faire mieux. Pas besoin d'en faire des tonnes."
        assert result["response_model"] == "gemma3:12b"
        assert ai.last_message == "C'est pas si mal, mais y a du travail."
        assert ai.last_recent_chat == []
        assert "[PRIVATE_VOICE_CONVERSATION]" in ai.last_context
        assert "Ne transforme jamais une remarque en mission" in ai.last_context
        assert ai.runtime_model == "phi4-mini"
        await service.voice_task

    asyncio.run(scenario())


def test_spoken_answer_is_limited_to_two_sentences_without_hard_cut() -> None:
    value = (
        "Oui, là je te suis. "
        "C'est déjà mieux comme ça. "
        "Ensuite je vais inventer un montage et un titre dont personne n'a parlé. "
        "Et encore une quatrième phrase inutile."
    )
    assert _compact_spoken_answer(value) == "Oui, là je te suis. C'est déjà mieux comme ça."


def test_fixed_local_voice_is_a_delivered_response() -> None:
    async def scenario() -> None:
        service, voice_input, _ai = build_service("piper-local")
        await service.talk_text("Continue de commenter la partie")
        assert service.voice_task is not None
        await service.voice_task

        diagnostic = service.diagnostic()
        assert diagnostic["last_voice_delivered"] is True
        assert diagnostic["last_voice_engine"] == "piper-local"
        assert diagnostic["last_audio_url"] == "/media/tts/mairaiy-test.wav"
        assert diagnostic["last_audio_duration_ms"] == 1200
        assert diagnostic["last_voice_error"] == ""
        assert voice_input.last_voice_delivered is True

    asyncio.run(scenario())


def test_kokoro_local_voice_is_a_delivered_response() -> None:
    async def scenario() -> None:
        service, voice_input, _ai = build_service("kokoro-local")
        await service.talk_text("Parle-moi avec ta voix locale")
        assert service.voice_task is not None
        await service.voice_task

        diagnostic = service.diagnostic()
        assert diagnostic["last_voice_delivered"] is True
        assert diagnostic["last_voice_engine"] == "kokoro-local"
        assert diagnostic["last_audio_url"] == "/media/tts/mairaiy-test.wav"
        assert diagnostic["last_audio_duration_ms"] == 1200
        assert diagnostic["last_voice_error"] == ""
        assert voice_input.last_voice_delivered is True

    asyncio.run(scenario())


def test_sentence_without_name_is_not_ignored() -> None:
    async def scenario() -> None:
        service, _voice_input, ai = build_service()
        result = await service.talk_text("Je parle simplement avec toi")

        assert result["ignored"] is False
        assert result["wake_word_detected"] is False
        assert result["answer"]
        assert ai.last_message == "Je parle simplement avec toi"
        assert ai.last_recent_chat == []
        assert service.voice_task is not None
        await service.voice_task

    asyncio.run(scenario())


def test_optional_name_is_removed_from_prompt() -> None:
    async def scenario() -> None:
        service, _voice_input, ai = build_service()
        result = await service.talk_text("Mairaiy, regarde ce combat")

        assert result["wake_word_detected"] is True
        assert ai.last_message == "regarde ce combat"
        await service.voice_task

    asyncio.run(scenario())
