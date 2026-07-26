from types import SimpleNamespace

from app.services import twitch as twitch_service
from app.services.live_awareness import (
    _CHATTERS_SCOPE,
    _hash_distance,
    _json_object,
    install_live_awareness,
)


def test_visual_hash_distance_is_normalized():
    assert _hash_distance(0, 0) == 0
    assert _hash_distance(0, (1 << 144) - 1) == 1
    assert _hash_distance(None, 42) == 1


def test_vision_json_parser_ignores_markdown_fences():
    payload = _json_object('```json\n{"summary":"Victoire visible","importance":3,"reaction":"Bravo"}\n```')
    assert payload["summary"] == "Victoire visible"
    assert payload["importance"] == 3


def test_install_adds_chatters_scope_and_wraps_cohost_lifecycle():
    class Cohost:
        profile = {"assistant": {}}
        live_context = {}

        async def start(self):
            return None

        async def close(self):
            return None

        async def status(self):
            return {"started": True}

        async def _maybe_analyze_screen(self):
            return True

    aura = SimpleNamespace(stream_online=False)
    cohost = Cohost()
    service = install_live_awareness(aura, SimpleNamespace(), cohost, SimpleNamespace())
    assert service is aura.live_awareness
    assert _CHATTERS_SCOPE in twitch_service.BROADCASTER_SCOPES
