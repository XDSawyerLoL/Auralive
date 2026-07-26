import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.database import Database
from app.main import normalize_twitch_poll
from app.services.twitch import TwitchClient


def run(coro):
    return asyncio.run(coro)


def make_settings(tmp_path: Path):
    return SimpleNamespace(
        twitch_client_id="client",
        twitch_client_secret="secret",
        twitch_redirect_uri="http://localhost/callback",
        twitch_bot_login="mairaiy",
        twitch_broadcaster_login="sansahd",
    )


def test_normalize_native_poll():
    result = normalize_twitch_poll({
        "id": "poll-1",
        "title": "Quel jeu ?",
        "status": "ACTIVE",
        "duration": 120,
        "choices": [
            {"id": "a", "title": "GTA V", "votes": 3},
            {"id": "b", "title": "WINDROSE", "votes": 2},
        ],
    })
    assert result is not None
    assert result["source"] == "twitch"
    assert result["total_votes"] == 5
    assert result["options"][1]["label"] == "WINDROSE"


def test_create_poll_uses_twitch_api(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "test.db")
        await db.initialize()
        client = TwitchClient(make_settings(tmp_path), db, lambda *_: None)
        client.broadcaster_user_id = "123"
        captured = {}

        async def fake_request(method, path, **kwargs):
            captured.update({"method": method, "path": path, **kwargs})
            return {"data": [{"id": "poll-1", "title": "Quel jeu ?", "choices": []}]}

        client.request = fake_request  # type: ignore[method-assign]
        poll = await client.create_poll("Quel jeu ?", ["GTA V", "WINDROSE"], 120)
        assert poll["id"] == "poll-1"
        assert captured["path"] == "/polls"
        assert captured["role"] == "broadcaster"
        assert captured["json_body"]["duration"] == 120
        assert captured["json_body"]["choices"] == [{"title": "GTA V"}, {"title": "WINDROSE"}]

    run(scenario())


def test_send_chat_surfaces_twitch_drop_reason(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "test.db")
        await db.initialize()
        client = TwitchClient(make_settings(tmp_path), db, lambda *_: None)
        client.bot_user_id = "bot-1"
        client.broadcaster_user_id = "channel-1"

        async def fake_request(*_args, **_kwargs):
            return {"data": [{"is_sent": False, "drop_reason": {"message": "Message refusé"}}]}

        client.request = fake_request  # type: ignore[method-assign]
        try:
            await client.send_chat("test")
        except RuntimeError as exc:
            assert "Message refusé" in str(exc)
        else:
            raise AssertionError("Une erreur devait être levée")

    run(scenario())


def test_eventsub_subscriptions_are_split_by_token(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "test.db")
        await db.initialize()
        client = TwitchClient(make_settings(tmp_path), db, lambda *_: None)
        client.bot_user_id = "bot-1"
        client.broadcaster_user_id = "channel-1"
        calls = []

        async def fake_request(method, path, **kwargs):
            calls.append({"method": method, "path": path, **kwargs})
            return {"data": [{"id": "sub"}]}

        client.request = fake_request  # type: ignore[method-assign]
        await client._subscribe_for_role("session-bot", "bot")
        assert len(calls) == 1
        assert calls[0]["role"] == "bot"
        assert calls[0]["json_body"]["type"] == "channel.chat.message"

        calls.clear()
        await client._subscribe_for_role("session-channel", "broadcaster")
        assert calls
        assert all(call["role"] == "broadcaster" for call in calls)
        assert all(call["json_body"]["type"] != "channel.chat.message" for call in calls)
        assert all(call["json_body"]["transport"]["session_id"] == "session-channel" for call in calls)

    run(scenario())
