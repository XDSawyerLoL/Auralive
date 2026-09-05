from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

from app.services.voice_realtime import (
    VoiceRealtimeService,
    _ANSWER_TIMEOUT_SECONDS,
    _PRIVATE_VOICE_CONTEXT,
    _addressing_decision,
    _compact_spoken_answer,
    _looks_like_ambient_broadcast,
)


class FakeAI:
    def __init__(self):
        self.last_message = ""
        self.last_messages = []
        self.last_model = ""
        self.last_max_tokens = 0
        self.last_timeout = 0
        self.last_context_window = 0
        self.runtime_model = "phi4-mini"
        self.successes = 0
        self.settings = SimpleNamespace(
            ai_mode="ollama",
            ai_model="gemma3:12b",
            ai_request_timeout_seconds=45,
            ai_context_window=4096,
        )

    @property
    def active_model(self):
        return self.runtime_model or self.settings.ai_model

    async def start(self):
        return None

    async def _ollama(
        self,
        messages,
        max_tokens,
        *,
        model,
        timeout_seconds,
        context_window=None,
    ):
        self.last_messages = list(messages)
        self.last_message = messages[-1]["content"]
        self.last_model = model
        self.last_max_tokens = max_tokens
        self.last_timeout = timeout_seconds
        self.last_context_window = context_window
        return "Oui, je t'entends parfaitement."

    def _register_success(self):
        self.successes += 1

    @staticmethod
    def _validate_answer(answer, _viewer):
        return str(answer)

    async def reply(self, *_args, **_kwargs):
        raise AssertionError("Le chemin standard ne doit pas être utilisé pour Ollama vocal")


class FakeMemory:
    def __init__(self):
        self.context_called = False
        self.remembered = []

    async def context(self, _viewer):
        self.context_called = True
        raise AssertionError("Le contexte mémoire complet ne doit pas ralentir le vocal")

    async def conversation(self, _user_id, limit=12):
        assert limit == 6
        return [
            {"role": "user", "content": "On garde ça simple."},
            {"role": "assistant", "content": "Oui, clairement."},
        ]

    async def remember_turn(self, *args):
        self.remembered.append(args)


class FakeAudio:
    def __init__(self, engine: str):
        self.engine = engine
        self.generated_count = 0
        self.last_engine = ""
        self.last_error = ""
        self.last_file = ""
        self.last_voice = "ff_siwis"
        self.last_duration_ms = 0
        self.last_audio_duration_ms = 0
        self.calls = 0

    async def synthesize(self, text, **_kwargs):
        assert text
        self.calls += 1
        self.generated_count += 1
        self.last_engine = self.engine
        self.last_file = "mairaiy-test.wav"
        self.last_duration_ms = 45
        self.last_audio_duration_ms = 1200
        return "/media/tts/mairaiy-test.wav"


class FakeOverlay:
    def __init__(self, connected: bool = False):
        self.connected = connected
        self.events = []

    def count(self, _target):
        return 1 if self.connected else 0

    async def emit(self, event, *, target=None):
        self.events.append((dict(event), target))


class SlowOBS:
    def __init__(self):
        self.called = False

    async def ensure_avatar_audio_monitor(self):
        self.called = True
        await asyncio.sleep(2)
        return {"ok": True}


class FakeDB:
    async def get_viewer(self, *, user_id):
        assert user_id == "voice-broadcaster"
        return None

    async def upsert_viewer(self, user_id, _login, _display_name):
        return {"user_id": user_id}

    async def get_setting(self, key, default=None):
        return {
            "avatar.voice": "ff_siwis",
            "avatar.rate": 1.0,
            "avatar.pitch": 1.0,
            "avatar.volume": 1.0,
        }.get(key, default)


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


def build_service(engine: str = "kokoro-local", *, overlay_connected: bool = False):
    audio = FakeAudio(engine)
    ai = FakeAI()
    memory = FakeMemory()
    overlay = FakeOverlay(overlay_connected)
    obs = SlowOBS()
    aura = SimpleNamespace(
        ai=ai,
        memory=memory,
        recent_chat=["viewer: change le titre", "viewer: fais un montage"],
        avatar_audio=audio,
        overlay=overlay,
        obs=obs,
    )

    async def say(_text):
        return {"is_sent": True}

    aura.say = say
    voice_input = FakeVoiceInput()
    return VoiceRealtimeService(aura, FakeDB(), voice_input), voice_input, ai, audio, overlay, obs, memory


def test_browser_transcript_produces_answer_then_voice_without_overlay() -> None:
    async def scenario() -> None:
        service, voice_input, _ai, audio, overlay, _obs, _memory = build_service()
        result = await service.talk_text("Est-ce que tu m'entends ?")

        assert result["answer"] == "Oui, je t'entends parfaitement."
        assert result["voice_pending"] is True
        assert result["wake_word_required"] is False
        assert result["addressed_automatically"] is True
        assert result["response_model"] == "gemma3:12b"
        assert result["fastpath"] is True
        assert service.voice_task is not None
        await service.voice_task

        diagnostic = service.diagnostic()
        assert diagnostic["last_voice_delivered"] is True
        assert diagnostic["last_voice_engine"] == "kokoro-local"
        assert diagnostic["last_audio_url"] == "/media/tts/mairaiy-test.wav"
        assert diagnostic["last_audio_duration_ms"] == 1200
        assert diagnostic["stage"] == "idle"
        assert voice_input.last_voice_delivered is True
        assert audio.calls == 1
        assert overlay.events == []

    asyncio.run(scenario())


def test_private_voice_uses_compact_quality_model_prompt() -> None:
    async def scenario() -> None:
        service, _voice_input, ai, _audio, _overlay, _obs, memory = build_service()
        result = await service.talk_text("Tu trouves ça comment ?")

        assert result["response_model"] == "gemma3:12b"
        assert result["fastpath"] is True
        assert ai.last_message == "Tu trouves ça comment ?"
        assert ai.last_model == "gemma3:12b"
        assert ai.last_max_tokens <= 64
        assert ai.last_timeout <= 10
        assert ai.last_context_window <= 2048
        assert len(ai.last_messages) <= 8
        system = ai.last_messages[0]["content"]
        assert "Ne transforme jamais une remarque en mission" in system
        assert "N'invente jamais ce qu'une phrase ambiguë désigne" in system
        assert "montage" in system
        assert all("change le titre" not in row["content"] for row in ai.last_messages)
        assert memory.context_called is False
        assert ai.runtime_model == "phi4-mini"
        await service.voice_task

    asyncio.run(scenario())


def test_voice_generation_does_not_wait_for_obs() -> None:
    async def scenario() -> None:
        service, _voice_input, _ai, audio, overlay, obs, _memory = build_service(
            overlay_connected=True
        )
        started = time.monotonic()
        await service.talk_text("Réponds vite")
        assert service.voice_task is not None
        await service.voice_task
        elapsed = time.monotonic() - started

        assert elapsed < 1.0
        assert audio.calls == 1
        assert overlay.events
        event, target = overlay.events[-1]
        assert target == "avatar"
        assert event["type"] == "avatar_voice"
        assert event["audio_url"] == "/media/tts/mairaiy-test.wav"
        assert obs.called is True

    asyncio.run(scenario())


def test_spoken_answer_is_limited_to_two_sentences_without_hard_cut() -> None:
    value = (
        "Oui, là je te suis. "
        "C'est déjà mieux comme ça. "
        "Ensuite je vais inventer un montage et un titre dont personne n'a parlé. "
        "Et encore une quatrième phrase inutile."
    )
    assert _compact_spoken_answer(value) == "Oui, là je te suis. C'est déjà mieux comme ça."


def test_voice_timeout_is_short_enough_for_live_conversation() -> None:
    assert _ANSWER_TIMEOUT_SECONDS <= 12


def test_fixed_local_voice_is_a_delivered_response() -> None:
    async def scenario() -> None:
        service, voice_input, _ai, _audio, _overlay, _obs, _memory = build_service("piper-local")
        await service.talk_text("Continue de commenter la partie")
        assert service.voice_task is not None
        await service.voice_task

        diagnostic = service.diagnostic()
        assert diagnostic["last_voice_delivered"] is True
        assert diagnostic["last_voice_engine"] == "piper-local"
        assert diagnostic["last_audio_url"] == "/media/tts/mairaiy-test.wav"
        assert diagnostic["last_voice_error"] == ""
        assert voice_input.last_voice_delivered is True

    asyncio.run(scenario())


def test_optional_name_is_removed_from_prompt() -> None:
    async def scenario() -> None:
        service, _voice_input, ai, _audio, _overlay, _obs, _memory = build_service()
        result = await service.talk_text("Mairaiy, regarde ce combat")

        assert result["wake_word_detected"] is True
        assert ai.last_message == "regarde ce combat"
        await service.voice_task

    asyncio.run(scenario())


def test_justplayer_ad_is_detected_as_ambient_broadcast() -> None:
    phrase = "Publicité de Just player.fr."
    assert _looks_like_ambient_broadcast(phrase) is True
    accepted, reason = _addressing_decision(
        phrase,
        wake_detected=False,
        conversation_active=False,
    )
    assert accepted is False
    assert reason == "ambient_broadcast"


def test_justplayer_ad_does_not_reach_ai_or_voice() -> None:
    async def scenario() -> None:
        service, voice_input, ai, audio, _overlay, _obs, memory = build_service()
        result = await service.talk_text("Publicité de Just player.fr.")

        assert result["ignored"] is True
        assert result["ignore_reason"] == "ambient_broadcast"
        assert result["answer"] == ""
        assert result["voice_pending"] is False
        assert ai.last_message == ""
        assert audio.calls == 0
        assert memory.remembered == []
        assert service.voice_task is None
        assert service.ignored_count == 1
        assert voice_input.ignored_count == 1

    asyncio.run(scenario())


def test_direct_request_about_ad_is_not_filtered() -> None:
    async def scenario() -> None:
        service, _voice_input, ai, _audio, _overlay, _obs, _memory = build_service()
        result = await service.talk_text("Tu peux me faire une publicité de JustPlayer.fr ?")

        assert result["ignored"] is False
        assert result["addressing_reason"] == "direct_address"
        assert ai.last_message == "Tu peux me faire une publicité de JustPlayer.fr ?"
        await service.voice_task

    asyncio.run(scenario())


def test_wake_word_opens_short_natural_followup_window() -> None:
    async def scenario() -> None:
        service, _voice_input, ai, _audio, _overlay, _obs, _memory = build_service()
        first = await service.talk_text("Mairaiy, regarde ça")
        assert first["ignored"] is False
        assert first["wake_word_detected"] is True
        await service.voice_task

        second = await service.talk_text("C'est mieux comme ça.")
        assert second["ignored"] is False
        assert second["addressing_reason"] == "conversation_followup"
        assert ai.last_message == "C'est mieux comme ça."
        await service.voice_task

    asyncio.run(scenario())


def test_ambient_ad_is_still_filtered_during_open_conversation() -> None:
    accepted, reason = _addressing_decision(
        "Promotion disponible sur exemple.fr",
        wake_detected=False,
        conversation_active=True,
    )
    assert accepted is False
    assert reason == "ambient_broadcast"


def test_diagnostic_describes_filtered_conversation() -> None:
    service, *_ = build_service()
    diagnostic = service.diagnostic()
    assert diagnostic["addressing"] == "filtered_conversation"
    assert diagnostic["wake_word"] == "Mairaiy"
    assert diagnostic["wake_word_required"] is False
    assert diagnostic["conversation_window_seconds"] >= 20


def test_private_prompt_requires_clarification_instead_of_invention() -> None:
    assert "phrase ambiguë" in _PRIVATE_VOICE_CONTEXT
    assert "clarification" in _PRIVATE_VOICE_CONTEXT
