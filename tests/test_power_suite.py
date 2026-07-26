import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.database import Database
from app.modules.powerpack import PowerPack


def run(coro):
    return asyncio.run(coro)


class DummyOverlay:
    def __init__(self):
        self.events = []

    async def emit(self, event):
        self.events.append(event)


class DummyOrchestrator:
    def __init__(self):
        self.overlay = DummyOverlay()
        self.messages = []
        self.stream_online = True

    async def say(self, message, *_args):
        self.messages.append(message)


def make_settings(tmp_path: Path):
    return SimpleNamespace(media_dir=tmp_path / "media", youtube_api_key="")


def test_power_suite_initializes_and_saves_advanced_command(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "aura.db")
        await db.initialize()
        power = PowerPack(db, make_settings(tmp_path))
        await power.initialize()
        row = await power.save_command({
            "name": "!hype",
            "aliases": ["!go"],
            "trigger_type": "exact",
            "trigger_value": "!hype",
            "responses": ["{user} lance la vague"],
            "actions": [{"type": "counter", "slug": "wins", "delta": 1}],
            "cooldown_user": 10,
            "cooldown_global": 2,
            "min_role": "everyone",
            "min_level": 1,
            "min_points": 0,
            "cost": 0,
            "only_live": False,
            "game_contains": "",
            "enabled": True,
        })
        assert row["name"] == "!hype"
        assert row["aliases"] == ["!go"]
        assert row["actions"][0]["type"] == "counter"
    run(scenario())


def test_bet_inventory_and_streamathon(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "aura.db")
        await db.initialize()
        power = PowerPack(db, make_settings(tmp_path))
        await power.initialize()
        power.orchestrator = DummyOrchestrator()
        viewer = await db.upsert_viewer("r1", "rider", "Rider")
        await db.adjust_points("r1", 1000, "test")
        viewer = await db.get_viewer(user_id="r1")
        assert viewer
        bet = await power.create_bet("Victoire ?", ["Oui", "Non"], 10, 1000, 10)
        assert len(bet["options"]) == 2
        message = await power.place_bet(viewer, 1, 100)
        assert "100" in message
        await power.grant_item("r1", "coquillage", 3)
        inventory = await power.inventory("r1")
        assert any(row["slug"] == "coquillage" and row["quantity"] == 3 for row in inventory)
        streamathon = await power.start_streamathon("Test", 10, {"follow": 60, "sub": 300, "gift": 300, "bits100": 60})
        assert streamathon["remaining_seconds"] >= 599
    run(scenario())


def test_follow_guard_creates_security_alert(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "aura.db")
        await db.initialize()
        power = PowerPack(db, make_settings(tmp_path))
        await power.initialize()
        power.orchestrator = DummyOrchestrator()
        await db.set_setting("security.follow_guard.threshold", 3)
        await db.set_setting("security.follow_guard.window_seconds", 30)
        for name in ["a", "b", "c"]:
            await power._follow_guard({"user_name": name})
        events = await power.security_events()
        assert events and events[0]["event_type"] == "follow_burst"
        assert await db.get_setting("moderation.emergency_mode") is True
        assert power.orchestrator.overlay.events
    run(scenario())


def test_youtube_url_parser():
    assert PowerPack.youtube_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert PowerPack.youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert PowerPack.youtube_id("pas un lien") is None
