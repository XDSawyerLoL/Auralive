import asyncio
from types import SimpleNamespace

from app.services.response_sync import install_response_sync


def run(coro):
    return asyncio.run(coro)


def test_ai_response_prepares_voice_before_chat():
    order = []

    class Overlay:
        async def emit(self, event, *, target=None):
            order.append(("voice", event.get("text"), target))

    aura = SimpleNamespace()
    aura.overlay = Overlay()

    async def say(message, reply_message_id=None):
        order.append(("chat", message, reply_message_id))
        return {"is_sent": True}

    async def answer_ai():
        result = await aura.say("Réponse synchronisée")
        assert result
        await aura.overlay.emit(
            {"type": "aura_message", "text": "Réponse synchronisée", "speak": True}
        )
        return True

    aura.say = say
    aura.answer_ai = answer_ai
    install_response_sync(aura)

    assert run(aura.answer_ai()) is True
    assert [item[0] for item in order] == ["voice", "chat"]
    assert aura.response_sync.diagnostic()["synced_count"] == 1


def test_unrelated_chat_message_is_not_deferred():
    order = []

    class Overlay:
        async def emit(self, event, *, target=None):
            order.append(("overlay", event.get("type")))

    aura = SimpleNamespace(overlay=Overlay())

    async def say(message, reply_message_id=None):
        order.append(("chat", message))
        return {"is_sent": True}

    async def answer_ai():
        return True

    aura.say = say
    aura.answer_ai = answer_ai
    install_response_sync(aura)

    run(aura.say("Annonce immédiate"))
    assert order == [("chat", "Annonce immédiate")]
