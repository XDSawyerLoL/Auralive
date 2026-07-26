import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.services.cohost import CohostService, _clean_line, _extract_text, _safe_list


def run(coro):
    return asyncio.run(coro)


class FakeAI:
    async def reply(self, *args, **kwargs):
        return "ok"


class FakeDB:
    pass


def make_service(tmp_path: Path) -> CohostService:
    aura = SimpleNamespace(
        ai=FakeAI(),
        twitch=SimpleNamespace(bot_user_id="bot-id"),
        obs=SimpleNamespace(),
        stream_online=True,
    )
    settings = SimpleNamespace(twitch_bot_login="mairaiy", obs_enabled=False, ai_mode="gemini", ai_api_key="key")
    service = CohostService(aura, FakeDB(), settings)
    service.profile_path = tmp_path / "channel_profile.json"
    return service


def test_helpers_keep_only_safe_compact_context():
    assert _clean_line("  bonjour\n le spot  ") == "bonjour le spot"
    assert _safe_list("un\ndeux\n") == ["un", "deux"]
    assert _extract_text({"candidates": [{"content": {"parts": [{"text": "Jeu visible"}]}}]}) == "Jeu visible"


def test_profile_is_normalized_and_saved(tmp_path: Path):
    service = make_service(tmp_path)
    profile = run(
        service.save_profile(
            {
                "owner": {"facts": "Sansa est un homme.\nCréateur d'Aura Live."},
                "channel": {"themes": ["jeu vidéo", "IA"], "recurring_games": "GTA Online\nLoL"},
                "assistant": {
                    "initiative_enabled": True,
                    "screen_awareness_enabled": True,
                    "initiative_min_interval_minutes": 1,
                    "max_initiatives_per_hour": 99,
                    "min_chat_messages": 1,
                    "screen_interval_seconds": 10,
                },
                "cta_campaigns": [{
                    "id": "justplayer",
                    "name": "JustPlayer",
                    "enabled": True,
                    "interval_minutes": 1,
                    "max_per_stream": 2,
                    "target": "https://justplayer.fr",
                }],
            }
        )
    )
    assert profile["owner"]["facts"] == ["Sansa est un homme.", "Créateur d'Aura Live."]
    assert profile["assistant"]["initiative_min_interval_minutes"] == 2
    assert profile["assistant"]["max_initiatives_per_hour"] == 10
    assert profile["assistant"]["screen_interval_seconds"] == 60
    assert profile["cta_campaigns"][0]["interval_minutes"] == 10
    assert service.profile_path.exists()


def test_context_prioritizes_live_game_and_verified_screen(tmp_path: Path):
    service = make_service(tmp_path)
    service.profile = {
        "owner": {"display_name": "SANSAHD", "facts": ["Sansa est un homme."]},
        "channel": {
            "description": "Jeu vidéo et IA.",
            "themes": ["jeu vidéo", "IA"],
            "recurring_games": ["GTA Online"],
        },
        "links": {"justplayer_url": "https://justplayer.fr", "discord_command": "!discord"},
    }
    service.live_context = {"title": "Session classée", "game_name": "League of Legends", "viewer_count": 12}
    service.obs_context = {"scene": "GAME"}
    service.last_screen_summary = "Une partie de League of Legends est visible."
    context = service.channel_context_text()
    assert "League of Legends" in context
    assert "Une partie de League of Legends est visible" in context
    assert "https://justplayer.fr" in context


def test_chat_observation_ignores_bot_and_commands(tmp_path: Path):
    service = make_service(tmp_path)
    run(service.observe_event("channel.chat.message", {
        "chatter_user_id": "bot-id",
        "chatter_user_login": "mairaiy",
        "chatter_user_name": "Mairaiy",
        "message": {"text": "message bot"},
    }))
    run(service.observe_event("channel.chat.message", {
        "chatter_user_id": "viewer-1",
        "chatter_user_login": "luna",
        "chatter_user_name": "Luna",
        "message": {"text": "!discord"},
    }))
    run(service.observe_event("channel.chat.message", {
        "chatter_user_id": "viewer-1",
        "chatter_user_login": "luna",
        "chatter_user_name": "Luna",
        "message": {"text": "Cette partie devient tendue"},
    }))
    assert list(service.recent_chat) == [{"name": "Luna", "text": "Cette partie devient tendue"}]
    assert service.messages_since_action == 1
