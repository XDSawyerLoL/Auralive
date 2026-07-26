from types import SimpleNamespace

from app.services.eventsub_compat import missing_scope_group, subscription_specs


def test_hype_train_uses_eventsub_version_two():
    client = SimpleNamespace(
        broadcaster_user_id="123",
        bot_user_id="456",
    )
    versions = {
        event_type: version
        for event_type, version, _ in subscription_specs(client, "broadcaster")
    }
    assert versions["channel.hype_train.begin"] == "2"
    assert versions["channel.hype_train.progress"] == "2"
    assert versions["channel.hype_train.end"] == "2"


def test_shoutout_requires_one_supported_moderator_scope():
    missing = missing_scope_group("channel.shoutout.receive", set())
    assert missing == (
        "moderator:read:shoutouts",
        "moderator:manage:shoutouts",
    )
    assert (
        missing_scope_group(
            "channel.shoutout.receive",
            {"moderator:read:shoutouts"},
        )
        is None
    )


def test_chat_subscription_keeps_bot_identity_condition():
    client = SimpleNamespace(
        broadcaster_user_id="123",
        bot_user_id="456",
    )
    event_type, version, condition = subscription_specs(client, "bot")[0]
    assert event_type == "channel.chat.message"
    assert version == "1"
    assert condition == {
        "broadcaster_user_id": "123",
        "user_id": "456",
    }
