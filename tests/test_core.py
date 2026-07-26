import asyncio
from pathlib import Path

from app.database import Database
from app.modules.games import GamesModule
from app.modules.moderation import ModerationModule


def run(coro):
    return asyncio.run(coro)


def test_database_and_points(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "test.db")
        await db.initialize()
        viewer = await db.upsert_viewer("1", "kaito", "Kaito")
        assert viewer["points"] == 0
        balance = await db.adjust_points("1", 25, "test")
        assert balance == 25
    run(scenario())


def test_moderation_blocks_links(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "test.db")
        await db.initialize()
        moderation = ModerationModule(db)
        result = await moderation.evaluate("1", "allez sur https://spam.example", [], False)
        assert result.blocked is True
    run(scenario())


def test_fishing_returns_message(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "test.db")
        await db.initialize()
        viewer = await db.upsert_viewer("1", "kaito", "Kaito")
        games = GamesModule(db)
        message = await games.fish(viewer)
        assert "Kaito" in message
    run(scenario())

from app.modules.engagement import EngagementModule


def test_engagement_queue_and_giveaway(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "test.db")
        await db.initialize()
        viewer = await db.upsert_viewer("1", "kaito", "Kaito")
        engagement = EngagementModule(db)
        await engagement.create_giveaway("Test", "!concours", 0)
        message = await engagement.enter_giveaway(viewer)
        assert "rejoint" in message
        result = await engagement.draw_giveaway()
        assert result and result["winner"]["display_name"] == "Kaito"
        queue_message = await engagement.queue_join(viewer, "support")
        assert "position 1" in queue_message
        next_viewer = await engagement.queue_next()
        assert next_viewer and next_viewer["display_name"] == "Kaito"
    run(scenario())


def test_poll_vote(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "test.db")
        await db.initialize()
        viewer = await db.upsert_viewer("1", "kaito", "Kaito")
        engagement = EngagementModule(db)
        poll = await engagement.create_poll("Choix ?", ["A", "B"])
        assert len(poll["options"]) == 2
        message = await engagement.vote(viewer, 2)
        assert "enregistré" in message
        updated = await engagement.active_poll()
        assert updated and updated["total_votes"] == 1
    run(scenario())
