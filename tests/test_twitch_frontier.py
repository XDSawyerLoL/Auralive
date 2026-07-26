from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import twitch as twitch_base
from app.services.twitch_frontier import FrontierTwitchClient


class FakeDatabase:
    pass


@pytest.mark.asyncio
async def test_frontier_eventsub_keeps_bot_and_broadcaster_sessions_separate():
    settings = SimpleNamespace(
        twitch_client_id="client",
        twitch_client_secret="secret",
        twitch_redirect_uri="http://127.0.0.1/callback",
        twitch_channel="sansahd",
        twitch_bot_login="mairaiy",
    )

    async def handler(event_type, event):
        return None

    client = FrontierTwitchClient(settings, FakeDatabase(), handler)
    client.bot_user_id = "bot-id"
    client.broadcaster_user_id = "broadcaster-id"
    captured = []

    async def fake_request(method, path, *, role, params=None, json_body=None):
        captured.append((role, json_body["type"], json_body["version"], json_body["condition"]))
        return {"data": []}

    client.request = fake_request
    await client._subscribe_for_role("session-bot", "bot")
    bot_rows = list(captured)
    captured.clear()
    await client._subscribe_for_role("session-broadcaster", "broadcaster")
    broadcaster_rows = list(captured)

    assert bot_rows and all(row[0] == "bot" for row in bot_rows)
    assert broadcaster_rows and all(row[0] == "broadcaster" for row in broadcaster_rows)
    assert any(row[1] == "channel.chat.notification" for row in bot_rows)
    assert any(row[1] == "channel.suspicious_user.message" for row in bot_rows)
    assert any(row[1] == "channel.hype_train.begin" and row[2] == "2" for row in broadcaster_rows)
    assert any(row[1] == "channel.ad_break.begin" for row in broadcaster_rows)
    assert any(row[1] == "channel.charity_campaign.donate" for row in broadcaster_rows)
    assert all(row[3].get("user_id") != "broadcaster-id" for row in bot_rows if row[1].startswith("channel.chat."))


def test_frontier_adds_scopes_for_implemented_features():
    assert "moderator:manage:shield_mode" in twitch_base.BOT_SCOPES
    assert "moderator:manage:warnings" in twitch_base.BOT_SCOPES
    assert "moderator:read:suspicious_users" in twitch_base.BOT_SCOPES
    assert "channel:read:ads" in twitch_base.BROADCASTER_SCOPES
    assert "channel:read:charity" in twitch_base.BROADCASTER_SCOPES
    assert "channel:manage:vips" in twitch_base.BROADCASTER_SCOPES
